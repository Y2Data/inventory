import "server-only";

import type { ItemMetadata } from "@/lib/types";
import { fetchJson, secureUrl } from "@/lib/http";

export { normalizeIsbn, isValidIsbn } from "@/lib/barcode-format";
import { normalizeIsbn, isValidIsbn } from "@/lib/barcode-format";

async function lookupOpenBd(isbn: string): Promise<ItemMetadata | null> {
  try {
    const data = (await fetchJson(
      `https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`,
    )) as Array<Record<string, unknown> | null> | null;
    const entry = data?.[0];
    if (!entry) return null;
    const summary = entry.summary as Record<string, unknown> | undefined;
    if (!summary?.title) return null;

    const author = typeof summary.author === "string" ? summary.author : "";
    return {
      barcode: isbn,
      title: String(summary.title),
      authors: author
        .split(/[;,／]/)
        .map((part) => part.trim())
        .filter(Boolean),
      brand: "",
      publisher: typeof summary.publisher === "string" ? summary.publisher : "",
      publishedDate: typeof summary.pubdate === "string" ? summary.pubdate : "",
      coverUrl: secureUrl(summary.cover),
      language: "ja",
      category: "",
      source: "openbd",
      raw: entry,
    };
  } catch {
    return null;
  }
}

async function lookupGoogleBooks(isbn: string): Promise<ItemMetadata | null> {
  try {
    const data = (await fetchJson(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`,
    )) as Record<string, unknown> | null;
    const items = data?.items as Array<Record<string, unknown>> | undefined;
    const volume = items?.[0]?.volumeInfo as Record<string, unknown> | undefined;
    if (!volume?.title) return null;
    const imageLinks = volume.imageLinks as Record<string, unknown> | undefined;
    const authors = Array.isArray(volume.authors)
      ? volume.authors.map(String).filter(Boolean)
      : [];
    return {
      barcode: isbn,
      title: String(volume.title),
      authors,
      brand: "",
      publisher: typeof volume.publisher === "string" ? volume.publisher : "",
      publishedDate:
        typeof volume.publishedDate === "string" ? volume.publishedDate : "",
      coverUrl: secureUrl(imageLinks?.thumbnail ?? imageLinks?.smallThumbnail),
      language: typeof volume.language === "string" ? volume.language : "",
      category: "",
      source: "google-books",
      raw: volume,
    };
  } catch {
    return null;
  }
}

async function lookupOpenLibrary(isbn: string): Promise<ItemMetadata | null> {
  try {
    const key = `ISBN:${isbn}`;
    const data = (await fetchJson(
      `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&jscmd=data&format=json`,
    )) as Record<string, Record<string, unknown>> | null;
    const book = data?.[key];
    if (!book?.title) return null;
    const authors = Array.isArray(book.authors)
      ? book.authors
          .map((author) =>
            typeof author === "object" && author
              ? String((author as Record<string, unknown>).name ?? "")
              : "",
          )
          .filter(Boolean)
      : [];
    const publishers = Array.isArray(book.publishers)
      ? book.publishers
          .map((publisher) =>
            typeof publisher === "object" && publisher
              ? String((publisher as Record<string, unknown>).name ?? "")
              : "",
          )
          .filter(Boolean)
      : [];
    const cover = book.cover as Record<string, unknown> | undefined;
    return {
      barcode: isbn,
      title: String(book.title),
      authors,
      brand: "",
      publisher: publishers[0] ?? "",
      publishedDate: typeof book.publish_date === "string" ? book.publish_date : "",
      coverUrl: secureUrl(cover?.medium ?? cover?.large ?? cover?.small),
      language: "",
      category: "",
      source: "open-library",
      raw: book,
    };
  } catch {
    return null;
  }
}

export async function lookupIsbn(value: string): Promise<ItemMetadata | null> {
  const isbn = normalizeIsbn(value);
  if (!isValidIsbn(isbn)) return null;

  return (
    (await lookupOpenBd(isbn)) ??
    (await lookupGoogleBooks(isbn)) ??
    (await lookupOpenLibrary(isbn))
  );
}
