import { z } from "zod";

import {
  rejectCrossOrigin,
  requireApiSession,
  serverError,
} from "@/lib/api";
import { classifyBarcode } from "@/lib/barcode-format";
import {
  createItem,
  deleteItem,
  findDuplicateCount,
  listBoxes,
  listItems,
  moveItem,
  updateItem,
} from "@/lib/db";
import { lookupIsbn } from "@/lib/isbn";
import { lookupProductBarcode } from "@/lib/product";
import type { ItemKind, ItemMetadata } from "@/lib/types";

const ManualMetadataSchema = z.object({
  title: z.string().max(500).default(""),
  authors: z.array(z.string().max(200)).max(30).default([]),
  brand: z.string().max(200).default(""),
  publisher: z.string().max(300).default(""),
  publishedDate: z.string().max(100).default(""),
  coverUrl: z.string().max(2_000).default(""),
  language: z.string().max(30).default(""),
  category: z.string().max(80).default(""),
});

const CreateItemSchema = z.object({
  barcode: z.string().max(64).optional().default(""),
  boxId: z.uuid().nullable().optional(),
  notes: z.string().max(2_000).optional(),
  allowDuplicate: z.boolean().optional(),
  manualMetadata: ManualMetadataSchema.optional(),
  imageUrl: z.string().max(2_000).optional(),
});

const MoveItemSchema = z.object({
  id: z.uuid(),
  boxId: z.uuid().nullable(),
});

const UpdateItemSchema = z.object({
  id: z.uuid(),
  title: z.string().max(500).optional(),
  authors: z.array(z.string().max(200)).max(30).optional(),
  brand: z.string().max(200).optional(),
  publisher: z.string().max(300).optional(),
  category: z.string().max(80).optional(),
  notes: z.string().max(2_000).optional(),
  imageUrl: z.string().max(2_000).optional(),
});

const DeleteItemSchema = z.object({ id: z.uuid() });

export async function GET(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const needsReviewParam = searchParams.get("needsReview");
    const items = await listItems({
      query: searchParams.get("q") ?? "",
      boxId: searchParams.get("boxId") ?? "",
      category: searchParams.get("category") ?? "",
      needsReview: needsReviewParam === "1" ? true : undefined,
      limit: Number(searchParams.get("limit") ?? 500),
    });
    return Response.json({ items });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  try {
    const parsed = CreateItemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_input", message: "物品信息无效" },
        { status: 400 },
      );
    }

    const rawBarcode = parsed.data.barcode.trim();
    const manual = parsed.data.manualMetadata;
    const hasContent = Boolean(rawBarcode || manual?.title.trim() || parsed.data.imageUrl);
    if (!hasContent) {
      return Response.json(
        { error: "invalid_input", message: "请提供条码、名称或照片之一" },
        { status: 400 },
      );
    }

    if (parsed.data.boxId) {
      const box = (await listBoxes()).find((entry) => entry.id === parsed.data.boxId);
      if (!box) {
        return Response.json(
          { error: "box_not_found", message: "目标箱子不存在" },
          { status: 404 },
        );
      }
      if (box.status !== "open") {
        return Response.json(
          { error: "box_sealed", message: "这个箱子已经封箱，请先重新打开" },
          { status: 409 },
        );
      }
    }

    let normalizedBarcode = "";
    let itemKind: ItemKind = "unidentified";
    if (rawBarcode) {
      const classified = classifyBarcode(rawBarcode);
      normalizedBarcode = classified.normalized;
      itemKind =
        classified.kind === "isbn"
          ? "book"
          : classified.kind === "product"
            ? "product"
            : "unidentified";
    }

    let metadata: ItemMetadata | null = null;
    if (manual) {
      metadata = {
        barcode: normalizedBarcode,
        title: manual.title,
        authors: manual.authors,
        brand: manual.brand,
        publisher: manual.publisher,
        publishedDate: manual.publishedDate,
        coverUrl: manual.coverUrl,
        language: manual.language,
        category: manual.category,
        source: "manual",
      };
    } else if (itemKind === "book") {
      metadata = await lookupIsbn(normalizedBarcode);
    } else if (itemKind === "product") {
      metadata = await lookupProductBarcode(normalizedBarcode);
    }

    if (!metadata) {
      if (!parsed.data.imageUrl) {
        return Response.json(
          {
            error: "metadata_not_found",
            message: "没有查到匹配信息，可以手动补充名称或拍照留存",
          },
          { status: 422 },
        );
      }
      metadata = {
        barcode: normalizedBarcode,
        title: "",
        authors: [],
        brand: "",
        publisher: "",
        publishedDate: "",
        coverUrl: "",
        language: "",
        category: "",
        source: "photo",
      };
    }

    const existingCount = await findDuplicateCount(normalizedBarcode);
    if (existingCount > 0 && !parsed.data.allowDuplicate) {
      return Response.json(
        {
          error: "duplicate",
          message: `库存里已经有 ${existingCount} 件相同条码`,
          existingCount,
          metadata,
        },
        { status: 409 },
      );
    }

    const item = await createItem({
      kind: itemKind,
      metadata,
      imageUrl: parsed.data.imageUrl,
      needsReview: metadata.title.trim() === "",
      boxId: parsed.data.boxId ?? null,
      notes: parsed.data.notes,
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  try {
    const parsed = MoveItemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_input", message: "移动信息无效" },
        { status: 400 },
      );
    }
    if (parsed.data.boxId) {
      const box = (await listBoxes()).find((entry) => entry.id === parsed.data.boxId);
      if (!box || box.status !== "open") {
        return Response.json(
          { error: "box_unavailable", message: "只能移动到一个打开的箱子" },
          { status: 409 },
        );
      }
    }
    const item = await moveItem(parsed.data.id, parsed.data.boxId);
    if (!item) {
      return Response.json(
        { error: "not_found", message: "没有找到这件库存" },
        { status: 404 },
      );
    }
    return Response.json({ item });
  } catch (error) {
    return serverError(error);
  }
}

export async function PUT(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  try {
    const parsed = UpdateItemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_input", message: "更新内容无效" },
        { status: 400 },
      );
    }
    const item = await updateItem(parsed.data);
    if (!item) {
      return Response.json(
        { error: "not_found", message: "没有找到这件库存" },
        { status: 404 },
      );
    }
    return Response.json({ item });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  try {
    const parsed = DeleteItemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_input", message: "库存 ID 无效" },
        { status: 400 },
      );
    }
    const deleted = await deleteItem(parsed.data.id);
    if (!deleted) {
      return Response.json(
        { error: "not_found", message: "没有找到这件库存" },
        { status: 404 },
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
