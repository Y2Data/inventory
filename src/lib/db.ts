import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

import type {
  BoxStatus,
  InventoryBox,
  InventoryItem,
  InventorySummary,
  ItemKind,
  ItemMetadata,
} from "@/lib/types";

type SqlClient = NeonQueryFunction<false, false>;

let client: SqlClient | null = null;
let schemaPromise: Promise<void> | null = null;

function getClient(): SqlClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  client ??= neon(connectionString);
  return client;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = initializeSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function initializeSchema() {
  const sql = getClient();

  await sql`
    CREATE TABLE IF NOT EXISTS inventory_boxes (
      id UUID PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'sealed', 'archived')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sealed_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id UUID PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'book',
      barcode TEXT NOT NULL,
      title TEXT NOT NULL,
      authors JSONB NOT NULL DEFAULT '[]'::jsonb,
      publisher TEXT NOT NULL DEFAULT '',
      published_date TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT '',
      box_id UUID REFERENCES inventory_boxes(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS inventory_events (
      id UUID PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id UUID,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE inventory_boxes ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT ''`;

  await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`
    CREATE INDEX IF NOT EXISTS inventory_items_barcode_idx
      ON inventory_items (barcode)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS inventory_items_box_id_idx
      ON inventory_items (box_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS inventory_items_created_at_idx
      ON inventory_items (created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS inventory_items_category_idx
      ON inventory_items (category)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS inventory_items_needs_review_idx
      ON inventory_items (needs_review) WHERE needs_review
  `;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asAuthors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(asString).filter(Boolean) : [];
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

function asItemKind(value: unknown): ItemKind {
  const kind = asString(value);
  return kind === "product" || kind === "unidentified" ? kind : "book";
}

function mapBox(row: Record<string, unknown>): InventoryBox {
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    location: asString(row.location),
    notes: asString(row.notes),
    category: asString(row.category),
    status: asString(row.status) as BoxStatus,
    itemCount: Number(row.item_count ?? 0),
    createdAt: new Date(asString(row.created_at)).toISOString(),
    sealedAt: row.sealed_at ? new Date(asString(row.sealed_at)).toISOString() : null,
  };
}

function mapItem(row: Record<string, unknown>): InventoryItem {
  return {
    id: asString(row.id),
    kind: asItemKind(row.kind),
    barcode: asString(row.barcode),
    title: asString(row.title),
    authors: asAuthors(row.authors),
    brand: asString(row.brand),
    publisher: asString(row.publisher),
    publishedDate: asString(row.published_date),
    coverUrl: asString(row.cover_url),
    imageUrl: asString(row.image_url),
    language: asString(row.language),
    category: asString(row.category),
    needsReview: Boolean(row.needs_review),
    boxId: row.box_id ? asString(row.box_id) : null,
    boxCode: row.box_code ? asString(row.box_code) : null,
    boxName: row.box_name ? asString(row.box_name) : null,
    notes: asString(row.notes),
    source: asString(row.source),
    createdAt: new Date(asString(row.created_at)).toISOString(),
    updatedAt: new Date(asString(row.updated_at)).toISOString(),
  };
}

export async function listBoxes(): Promise<InventoryBox[]> {
  await ensureSchema();
  const rows = await getClient()`
    SELECT
      b.*,
      COUNT(i.id)::int AS item_count
    FROM inventory_boxes b
    LEFT JOIN inventory_items i ON i.box_id = b.id
    GROUP BY b.id
    ORDER BY
      CASE b.status WHEN 'open' THEN 0 WHEN 'sealed' THEN 1 ELSE 2 END,
      b.created_at DESC
  `;
  return rows.map((row) => mapBox(row as Record<string, unknown>));
}

export async function createBox(input: {
  code: string;
  name?: string;
  location?: string;
  notes?: string;
  category?: string;
}): Promise<InventoryBox> {
  await ensureSchema();
  const id = randomUUID();
  const sql = getClient();
  const rows = await sql`
    INSERT INTO inventory_boxes (id, code, name, location, notes, category)
    VALUES (
      ${id},
      ${input.code},
      ${input.name ?? ""},
      ${input.location ?? ""},
      ${input.notes ?? ""},
      ${input.category ?? ""}
    )
    RETURNING *, 0::int AS item_count
  `;
  await logEvent("box.created", "box", id, { code: input.code });
  return mapBox(rows[0] as Record<string, unknown>);
}

export async function updateBox(input: {
  id: string;
  code?: string;
  status?: BoxStatus;
  name?: string;
  location?: string;
  notes?: string;
  category?: string;
}): Promise<InventoryBox | null> {
  await ensureSchema();
  const rows = await getClient().query(
    `
      UPDATE inventory_boxes
      SET
        status = COALESCE($2, status),
        code = COALESCE($3, code),
        name = COALESCE($4, name),
        location = COALESCE($5, location),
        notes = COALESCE($6, notes),
        category = COALESCE($7, category),
        sealed_at = CASE
          WHEN $2 = 'sealed' THEN COALESCE(sealed_at, NOW())
          WHEN $2 = 'open' THEN NULL
          ELSE sealed_at
        END,
        updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *, (
        SELECT COUNT(*)::int FROM inventory_items WHERE box_id = inventory_boxes.id
      ) AS item_count
    `,
    [
      input.id,
      input.status ?? null,
      input.code ?? null,
      input.name ?? null,
      input.location ?? null,
      input.notes ?? null,
      input.category ?? null,
    ],
  );
  if (!rows[0]) return null;
  await logEvent("box.updated", "box", input.id, input);
  return mapBox(rows[0] as Record<string, unknown>);
}

export async function listItems(input: {
  query?: string;
  boxId?: string;
  category?: string;
  needsReview?: boolean;
  limit?: number;
} = {}): Promise<InventoryItem[]> {
  await ensureSchema();
  const query = input.query?.trim() ?? "";
  const boxId = input.boxId?.trim() ?? "";
  const category = input.category?.trim() ?? "";
  const requestedLimit = Number.isFinite(input.limit) ? Number(input.limit) : 500;
  const limit = Math.min(Math.max(requestedLimit, 1), 5_000);
  const rows = await getClient().query(
    `
      SELECT
        i.*,
        b.code AS box_code,
        b.name AS box_name
      FROM inventory_items i
      LEFT JOIN inventory_boxes b ON b.id = i.box_id
      WHERE
        ($1 = '' OR
          i.title ILIKE '%' || $1 || '%' OR
          i.barcode ILIKE '%' || $1 || '%' OR
          i.publisher ILIKE '%' || $1 || '%' OR
          i.brand ILIKE '%' || $1 || '%' OR
          i.authors::text ILIKE '%' || $1 || '%')
        AND (NULLIF($2, '') IS NULL OR i.box_id = NULLIF($2, '')::uuid)
        AND ($3 = '' OR i.category = $3)
        AND ($4::boolean IS NULL OR i.needs_review = $4::boolean)
      ORDER BY i.created_at DESC
      LIMIT $5
    `,
    [query, boxId, category, input.needsReview ?? null, limit],
  );
  return rows.map((row) => mapItem(row as Record<string, unknown>));
}

export async function findDuplicateCount(barcode: string) {
  if (!barcode) return 0;
  await ensureSchema();
  const rows = await getClient()`
    SELECT COUNT(*)::int AS count
    FROM inventory_items
    WHERE barcode = ${barcode}
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function createItem(input: {
  kind: ItemKind;
  metadata: ItemMetadata;
  imageUrl?: string;
  needsReview: boolean;
  boxId: string | null;
  notes?: string;
}): Promise<InventoryItem> {
  await ensureSchema();
  const id = randomUUID();
  const sql = getClient();
  const metadataJson = JSON.stringify(input.metadata.raw ?? {});
  const authorsJson = JSON.stringify(input.metadata.authors);
  const rows = await sql.query(
    `
      WITH inserted AS (
        INSERT INTO inventory_items (
          id, kind, barcode, title, authors, brand, publisher, published_date,
          cover_url, image_url, language, category, needs_review, box_id, notes, source, metadata
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8,
          $9, $10, $11, $12, $13, NULLIF($14, '')::uuid, $15, $16, $17::jsonb
        )
        RETURNING *
      )
      SELECT inserted.*, b.code AS box_code, b.name AS box_name
      FROM inserted
      LEFT JOIN inventory_boxes b ON b.id = inserted.box_id
    `,
    [
      id,
      input.kind,
      input.metadata.barcode,
      input.metadata.title,
      authorsJson,
      input.metadata.brand,
      input.metadata.publisher,
      input.metadata.publishedDate,
      input.metadata.coverUrl,
      input.imageUrl ?? "",
      input.metadata.language,
      input.metadata.category,
      input.needsReview,
      input.boxId ?? "",
      input.notes ?? "",
      input.metadata.source,
      metadataJson,
    ],
  );
  await logEvent("item.created", "item", id, {
    barcode: input.metadata.barcode,
    kind: input.kind,
    boxId: input.boxId,
  });
  return mapItem(rows[0] as Record<string, unknown>);
}

export async function updateItem(input: {
  id: string;
  title?: string;
  authors?: string[];
  brand?: string;
  publisher?: string;
  category?: string;
  notes?: string;
  imageUrl?: string;
}): Promise<InventoryItem | null> {
  await ensureSchema();
  const authorsJson = input.authors ? JSON.stringify(input.authors) : null;
  const rows = await getClient().query(
    `
      WITH updated AS (
        UPDATE inventory_items
        SET
          title = COALESCE($2, title),
          authors = COALESCE($3::jsonb, authors),
          brand = COALESCE($4, brand),
          publisher = COALESCE($5, publisher),
          category = COALESCE($6, category),
          notes = COALESCE($7, notes),
          image_url = COALESCE($8, image_url),
          needs_review = CASE
            WHEN $2 IS NOT NULL THEN (TRIM($2) = '')
            ELSE needs_review
          END,
          updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING *
      )
      SELECT updated.*, b.code AS box_code, b.name AS box_name
      FROM updated
      LEFT JOIN inventory_boxes b ON b.id = updated.box_id
    `,
    [
      input.id,
      input.title ?? null,
      authorsJson,
      input.brand ?? null,
      input.publisher ?? null,
      input.category ?? null,
      input.notes ?? null,
      input.imageUrl ?? null,
    ],
  );
  if (!rows[0]) return null;
  await logEvent("item.updated", "item", input.id, input);
  return mapItem(rows[0] as Record<string, unknown>);
}

export async function moveItem(id: string, boxId: string | null) {
  await ensureSchema();
  const rows = await getClient().query(
    `
      WITH updated AS (
        UPDATE inventory_items
        SET box_id = NULLIF($2, '')::uuid, updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING *
      )
      SELECT updated.*, b.code AS box_code, b.name AS box_name
      FROM updated
      LEFT JOIN inventory_boxes b ON b.id = updated.box_id
    `,
    [id, boxId ?? ""],
  );
  if (!rows[0]) return null;
  await logEvent("item.moved", "item", id, { boxId });
  return mapItem(rows[0] as Record<string, unknown>);
}

export async function deleteItem(id: string) {
  await ensureSchema();
  const rows = await getClient()`
    DELETE FROM inventory_items
    WHERE id = ${id}::uuid
    RETURNING id, barcode, title
  `;
  if (!rows[0]) return false;
  await logEvent("item.deleted", "item", id, {
    barcode: rows[0].barcode,
    title: rows[0].title,
  });
  return true;
}

export async function getSummary(): Promise<InventorySummary> {
  await ensureSchema();
  const rows = await getClient()`
    SELECT
      (SELECT COUNT(*)::int FROM inventory_items) AS total_items,
      (SELECT COUNT(*)::int FROM inventory_boxes) AS total_boxes,
      (SELECT COUNT(*)::int FROM inventory_boxes WHERE status = 'open') AS open_boxes,
      (SELECT COUNT(*)::int FROM inventory_boxes WHERE status = 'sealed') AS sealed_boxes,
      (SELECT COUNT(*)::int FROM inventory_items WHERE box_id IS NULL) AS unassigned_items,
      (SELECT COUNT(*)::int FROM inventory_items
        WHERE created_at >= CURRENT_DATE) AS added_today
  `;
  const row = rows[0] as Record<string, unknown>;
  return {
    totalItems: Number(row.total_items ?? 0),
    totalBoxes: Number(row.total_boxes ?? 0),
    openBoxes: Number(row.open_boxes ?? 0),
    sealedBoxes: Number(row.sealed_boxes ?? 0),
    unassignedItems: Number(row.unassigned_items ?? 0),
    addedToday: Number(row.added_today ?? 0),
  };
}

async function logEvent(
  eventType: string,
  entityType: string,
  entityId: string,
  details: unknown,
) {
  const sql = getClient();
  await sql.query(
    `
      INSERT INTO inventory_events (id, event_type, entity_type, entity_id, details)
      VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)
    `,
    [randomUUID(), eventType, entityType, entityId, JSON.stringify(details ?? {})],
  );
}
