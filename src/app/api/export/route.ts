import { requireApiSession, serverError } from "@/lib/api";
import { listItems } from "@/lib/db";
import type { ItemKind } from "@/lib/types";

const KIND_LABEL: Record<ItemKind, string> = {
  book: "书籍",
  product: "物品",
  unidentified: "待识别",
};

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const authError = await requireApiSession();
  if (authError) return authError;

  try {
    const items = await listItems({ limit: 5_000 });
    const header = [
      "ID",
      "类型",
      "条码",
      "名称",
      "作者",
      "品牌",
      "出版社",
      "出版日期",
      "语言",
      "分类",
      "箱号",
      "箱名",
      "备注",
      "数据来源",
      "图片",
      "待处理",
      "录入时间",
    ];
    const rows = items.map((item) => [
      item.id,
      KIND_LABEL[item.kind],
      item.barcode,
      item.title,
      item.authors.join("; "),
      item.brand,
      item.publisher,
      item.publishedDate,
      item.language,
      item.category,
      item.boxCode ?? "",
      item.boxName ?? "",
      item.notes,
      item.source,
      item.imageUrl || item.coverUrl,
      item.needsReview ? "是" : "",
      item.createdAt,
    ]);
    const csv = `﻿${[header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")}`;
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dai-inventory-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
