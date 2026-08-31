export type BoxStatus = "open" | "sealed" | "archived";

export interface InventoryBox {
  id: string;
  code: string;
  name: string;
  location: string;
  notes: string;
  category: string;
  status: BoxStatus;
  itemCount: number;
  createdAt: string;
  sealedAt: string | null;
}

export type ItemKind = "book" | "product" | "unidentified";

export type MetadataSource =
  | "openbd"
  | "google-books"
  | "open-library"
  | "open-food-facts"
  | "manual"
  | "photo";

export interface ItemMetadata {
  barcode: string;
  title: string;
  authors: string[];
  brand: string;
  publisher: string;
  publishedDate: string;
  coverUrl: string;
  language: string;
  category: string;
  source: MetadataSource;
  raw?: Record<string, unknown>;
}

export interface InventoryItem {
  id: string;
  kind: ItemKind;
  barcode: string;
  title: string;
  authors: string[];
  brand: string;
  publisher: string;
  publishedDate: string;
  coverUrl: string;
  imageUrl: string;
  language: string;
  category: string;
  needsReview: boolean;
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
  metadata?: ItemMetadata;
}
