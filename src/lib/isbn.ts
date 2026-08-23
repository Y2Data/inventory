import "server-only";

import type { BookMetadata } from "@/lib/types";

export function normalizeIsbn(value: string) {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function isValidIsbn(value: string) {
  const isbn = normalizeIsbn(value);
  if (isbn.length === 13) {
    if (!isbn.startsWith("978") && !isbn.startsWith("979")) return false;
    const sum = isbn
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  if (isbn.length === 10) {
    if (!/^\d{9}[\dX]$/.test(isbn)) return false;
    const sum = isbn.split("").reduce((total, digit, index) => {
      const number = digit === "X" ? 10 : Number(digit);
      return total + number * (10 - index);
    }, 0);
    return sum % 11 === 0;
  }
  return false;
}

function secureUrl(value: unknown) {
  return typeof value === "string" ? value.replace(/^http:/, "https:") : "";
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
    headers: { "User-Agent": "DaiInventory/1.0" },
  });
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}

async function lookupOpenBd(isbn: string): Promise<BookMetadata | null> {
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
      isbn,
      title: String(summary.title),
      authors: author
        .split(/[;,／]/)
        .map((part) => part.trim())
        .filter(Boolean),
      publisher: typeof summary.publisher === "string" ? summary.publisher : "",
      publishedDate: typeof summary.pubdate === "string" ? summary.pubdate : "",
      coverUrl: secureUrl(summary.cover),
      language: "ja",
      source: "openbd",
      raw: entry,
    };
  } catch {
    return null;
  }
}

async function lookupGoogleBooks(isbn: string): Promise<BookMetadata | null> {
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
      isbn,
      title: String(volume.title),
      authors,
      publisher: typeof volume.publisher === "string" ? volume.publisher : "",
      publishedDate:
        typeof volume.publishedDate === "string" ? volume.publishedDate : "",
      coverUrl: secureUrl(imageLinks?.thumbnail ?? imageLinks?.smallThumbnail),
      language: typeof volume.language === "string" ? volume.language : "",
      source: "google-books",
      raw: volume,
    };
  } catch {
    return null;
  }
}

async function lookupOpenLibrary(isbn: string): Promise<BookMetadata | null> {
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
      isbn,
      title: String(book.title),
      authors,
      publisher: publishers[0] ?? "",
      publishedDate: typeof book.publish_date === "string" ? book.publish_date : "",
      coverUrl: secureUrl(cover?.medium ?? cover?.large ?? cover?.small),
      language: "",
      source: "open-library",
      raw: book,
    };
  } catch {
    return null;
  }
}

export async function lookupIsbn(value: string): Promise<BookMetadata | null> {
  const isbn = normalizeIsbn(value);
  if (!isValidIsbn(isbn)) return null;

  return (
    (await lookupOpenBd(isbn)) ??
    (await lookupGoogleBooks(isbn)) ??
    (await lookupOpenLibrary(isbn))
  );
}
