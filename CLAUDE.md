# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A single-user, mobile-first inventory app for tracking physical items (books,
general products, and anything else) packed into storage boxes. Scan a barcode;
the app classifies it (ISBN vs. UPC/EAN) and resolves metadata from the matching
source, or falls back to manual entry / a photo when nothing is found. Every
physical item becomes one row against a box. Entirely in Chinese (UI strings,
error messages) — match that when adding user-facing text.

## Commands

```bash
npm run dev     # next dev
npm run lint    # eslint
npm run build   # next build — also used as the pre-deploy correctness check
```

There is no test suite. `npm run lint` and `npm run build` are the correctness gates.

## Environment

Requires `.env.local` (copy from `.env.example`):

```
DATABASE_URL=postgresql://...       # Neon Postgres, injected by Vercel Marketplace in prod
INVENTORY_PASSWORD=...              # >= 12 chars, single shared password (no user accounts)
SESSION_SECRET=...                  # >= 32 chars, HS256 signing key for the session JWT
BLOB_READ_WRITE_TOKEN=...           # Vercel Blob, injected once a Blob store is linked to the project
```

`GET /api/health` calls `ensureSchema()` and reports `{ok, database}` — use it to verify
DB connectivity after deploying or rotating `DATABASE_URL`.

## Architecture

**Auth model**: one shared password, no user accounts (`src/lib/auth.ts`). Login
(`POST /api/auth/login`) verifies the password with a timing-safe hash comparison and
sets a signed JWT (`jose`) in an httpOnly cookie (30-day expiry). There's no CSRF
token; instead every mutating route calls `rejectCrossOrigin()` (`src/lib/api.ts`),
which compares the `Origin` header against `Host`/`X-Forwarded-Host`. Every API route
also calls `requireApiSession()` first. When adding a new API route, both checks are
expected at the top, in that order (session, then origin) for GET vs mutating handlers
— see any existing route in `src/app/api/*` as the template.

**Data layer** (`src/lib/db.ts`): all DB access goes through `@neondatabase/serverless`'s
HTTP driver via a single lazily-created client. `ensureSchema()` runs
`CREATE TABLE IF NOT EXISTS` for all three tables, followed by explicit idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements for columns added after initial
launch — there is no separate migration system or migration files; schema changes are
made by editing `initializeSchema()` directly (new columns as an `ALTER TABLE ADD
COLUMN IF NOT EXISTS`, since `CREATE TABLE IF NOT EXISTS` never touches an
already-existing table). Every mutation also writes an append-only row to
`inventory_events` via `logEvent()` for audit history. Three tables:
- `inventory_boxes` — status is one of `open | sealed | archived`; only `open` boxes
  accept new/moved items (enforced in the API layer, not the DB). `category` is a
  free-text advisory tag, never validated against item contents — boxes are allowed
  to be mixed-content.
- `inventory_items` — one row per physical item (duplicate barcodes are expected and
  intentional, not deduped — supports multiple physical copies). `kind` is
  `"book" | "product" | "unidentified"` (no DB CHECK constraint, only enforced in app
  code). `barcode`/`title` stay `NOT NULL`; an item with no barcode or no known title
  uses the empty-string sentinel (same convention as the rest of this file, e.g. how
  `box_id` is nulled via `NULLIF($n,'')`), not a schema change. `image_url` (a
  user-captured photo in Vercel Blob) is distinct from `cover_url` (metadata fetched
  from an external source) — the UI prefers `image_url` when present. `needs_review`
  is set whenever the resolved title is empty; it's a plain flag today (no automated
  process reads it) reserved for a future LLM-annotation pass.
- `inventory_events` — audit log, not read by the UI, currently write-only.

**Barcode classification & lookup**: `src/lib/barcode-format.ts` is the one module
with no `"server-only"` guard — it holds `classifyBarcode()` (ISBN vs. UPC/EAN/GTIN
vs. unrecognized, by checksum) plus the underlying ISBN/GTIN validators, and is
imported directly by the client (`scanner-panel.tsx`) to gate scans before any network
call. `src/lib/isbn.ts` (server-only) tries three book sources in order — openBD
(Japanese books) → Google Books → Open Library — each independently try/caught so a
miss degrades to the next source. `src/lib/product.ts` (server-only) looks up UPC/EAN
products against Open Food Facts only; misses are expected and common for non-food
items (electronics, cables) and always resolve to `null`, never throw. `src/lib/
barcode.ts` ties the two together as `lookupBarcode()`. `POST /api/items` re-derives
the classification server-side from the raw barcode itself — a client-supplied `kind`
hint is never trusted for correctness. An unrecognized barcode shape and a
well-formed-but-not-found barcode are deliberately folded into the *same* 422
"not found" response — there's no separate "bad format" error, so a UPC miss reads as
a normal path, not a broken scan. A miss with no `manualMetadata` and no `imageUrl`
is a 400 (nothing to create); either one alone is enough to create an item, and the
item's `needsReview` flag is just "resolved title is empty," uniformly across every
path (book/product/manual/photo).

**Photo capture & storage**: `<input type="file" accept="image/*" capture="environment">`
is used for photo capture, not a canvas snapshot off the live `@zxing/browser` video
stream — the file input works even when the scanner isn't running at all, which
matters for the "no barcode, just photograph it" entry point. Uploads go straight to
Vercel Blob via the `@vercel/blob/client` `upload()`/`handleUpload()` client-upload
pattern (`src/app/api/blob/upload/route.ts` only issues a token — photo bytes never
transit through a Function body). Only the resulting Blob URL is ever sent to
`POST /api/items` as `imageUrl`; Postgres never stores image bytes.

**Frontend**: no client-side routing beyond `/` and `/login` — `src/app/page.tsx` is a
server component that redirects to `/login` if unauthenticated, otherwise renders the
single-page app `InventoryApp` (`src/components/inventory-app.tsx`: box list, item
list/search/filter, the item edit modal, box label printing/QR via the `qrcode`
package, CSV export trigger). `ScannerPanel` (`src/components/scanner-panel.tsx`)
wraps `@zxing/browser` for continuous camera barcode scanning, a manual-barcode text
form, the product-match confirm card, the unified "not found" manual-entry-or-photo
card, and the standalone "no barcode" photo entry point. There's no global state
library — `InventoryApp` holds all state and calls the JSON API routes directly with
`fetch`. Editing an item's metadata after creation (`PUT /api/items`) is the one place
existing data gets mutated outside of box status/fields — it exists specifically so
photo-only items can later gain a title and Open Food Facts data can be corrected.

**Security headers** are set centrally in `next.config.ts` (`headers()`), not per-route
— includes a `Permissions-Policy` that scopes camera access to same-origin (needed for
the scanner) while blocking mic/geolocation.
