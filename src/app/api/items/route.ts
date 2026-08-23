import { z } from "zod";

import {
  rejectCrossOrigin,
  requireApiSession,
  serverError,
} from "@/lib/api";
import {
  createBookItem,
  deleteItem,
  findDuplicateCount,
  listBoxes,
  listItems,
  moveItem,
} from "@/lib/db";
import { isValidIsbn, lookupIsbn, normalizeIsbn } from "@/lib/isbn";
import type { BookMetadata } from "@/lib/types";

const ManualMetadataSchema = z.object({
  title: z.string().min(1).max(500),
  authors: z.array(z.string().max(200)).max(30).default([]),
  publisher: z.string().max(300).default(""),
  publishedDate: z.string().max(100).default(""),
  coverUrl: z.string().max(2_000).default(""),
  language: z.string().max(30).default(""),
});

const CreateItemSchema = z.object({
  barcode: z.string().min(1).max(64),
  boxId: z.uuid().nullable().optional(),
  notes: z.string().max(2_000).optional(),
  allowDuplicate: z.boolean().optional(),
  manualMetadata: ManualMetadataSchema.optional(),
});

const MoveItemSchema = z.object({
  id: z.uuid(),
  boxId: z.uuid().nullable(),
});

const DeleteItemSchema = z.object({ id: z.uuid() });

export async function GET(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const items = await listItems({
      query: searchParams.get("q") ?? "",
      boxId: searchParams.get("boxId") ?? "",
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
        { error: "invalid_input", message: "书籍信息无效" },
        { status: 400 },
      );
    }

    const barcode = normalizeIsbn(parsed.data.barcode);
    if (!isValidIsbn(barcode)) {
      return Response.json(
        { error: "invalid_isbn", message: "这不是有效的 ISBN-10 或 ISBN-13" },
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

    let metadata: BookMetadata | null = null;
    if (parsed.data.manualMetadata) {
      metadata = {
        isbn: barcode,
        ...parsed.data.manualMetadata,
        source: "manual",
      };
    } else {
      metadata = await lookupIsbn(barcode);
    }

    if (!metadata) {
      return Response.json(
        {
          error: "metadata_not_found",
          message: "没有查到这本书，请手动补充书名",
        },
        { status: 422 },
      );
    }

    const existingCount = await findDuplicateCount(barcode);
    if (existingCount > 0 && !parsed.data.allowDuplicate) {
      return Response.json(
        {
          error: "duplicate",
          message: `库存里已经有 ${existingCount} 本相同 ISBN`,
          existingCount,
          metadata,
        },
        { status: 409 },
      );
    }

    const item = await createBookItem({
      metadata,
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
