import "server-only";

import { classifyBarcode, type BarcodeKind } from "@/lib/barcode-format";
import { lookupIsbn } from "@/lib/isbn";
import { lookupProductBarcode } from "@/lib/product";
import type { ItemMetadata } from "@/lib/types";

export async function lookupBarcode(raw: string): Promise<{
  kind: BarcodeKind;
  normalized: string;
  metadata: ItemMetadata | null;
}> {
  const { kind, normalized } = classifyBarcode(raw);

  if (kind === "unknown") {
    return { kind, normalized, metadata: null };
  }

  const metadata =
    kind === "isbn" ? await lookupIsbn(normalized) : await lookupProductBarcode(normalized);

  return { kind, normalized, metadata };
}
