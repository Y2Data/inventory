export type BoxStatus = "open" | "sealed" | "archived";

export interface InventoryBox {
  id: string;
  code: string;
  name: string;
  location: string;
  notes: string;
  status: BoxStatus;
  itemCount: number;
  createdAt: string;
  sealedAt: string | null;
}

export interface BookMetadata {
  isbn: string;
  title: string;
  authors: string[];
  publisher: string;
  publishedDate: string;
  coverUrl: string;
  language: string;
  source: "openbd" | "google-books" | "open-library" | "manual";
  raw?: Record<string, unknown>;
}

export interface InventoryItem {
  id: string;
  kind: "book";
  barcode: string;
  title: string;
  authors: string[];
  publisher: string;
  publishedDate: string;
  coverUrl: string;
  language: string;
  boxId: string | null;
  boxCode: string | null;
  boxName: string | null;
  notes: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventorySummary {
  totalItems: number;
  totalBoxes: number;
  openBoxes: number;
  sealedBoxes: number;
  unassignedItems: number;
  addedToday: number;
}

export interface ApiError {
  error: string;
  message?: string;
  existingCount?: number;
  metadata?: BookMetadata;
}
