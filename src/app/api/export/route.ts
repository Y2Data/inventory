import { requireApiSession, serverError } from "@/lib/api";
import { listItems } from "@/lib/db";

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
      "ISBN",
      "书名",
      "作者",
      "出版社",
      "出版日期",
      "语言",
      "箱号",
      "箱名",
      "备注",
      "数据来源",
      "录入时间",
    ];
    const rows = items.map((item) => [
      item.id,
      "书籍",
      item.barcode,
      item.title,
      item.authors.join("; "),
      item.publisher,
      item.publishedDate,
      item.language,
      item.boxCode ?? "",
      item.boxName ?? "",
      item.notes,
      item.source,
      item.createdAt,
    ]);
    const csv = `\uFEFF${[header, ...rows]
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
