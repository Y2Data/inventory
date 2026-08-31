import "server-only";

import type { ItemMetadata } from "@/lib/types";
import { fetchJson, secureUrl } from "@/lib/http";

function cleanCategoryTag(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/^[a-z]{2}:/, "").trim();
}

export async function lookupProductBarcode(barcode: string): Promise<ItemMetadata | null> {
  try {
    const data = (await fetchJson(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    )) as Record<string, unknown> | null;
    if (data?.status !== 1) return null;

    const product = data.product as Record<string, unknown> | undefined;
    if (!product) return null;

    const title = typeof product.product_name === "string" ? product.product_name.trim() : "";
    if (!title) return null;

    const brand = typeof product.brands === "string" ? product.brands.split(",")[0].trim() : "";
    const categoryTags = product.categories_tags as unknown;
    const category = Array.isArray(categoryTags) ? cleanCategoryTag(categoryTags[0]) : "";

    return {
      barcode,
      title,
      authors: [],
      brand,
      publisher: "",
      publishedDate: "",
      coverUrl: secureUrl(product.image_front_url ?? product.image_url),
      language: "",
      category,
      source: "open-food-facts",
      raw: product,
    };
  } catch {
    return null;
  }
}
