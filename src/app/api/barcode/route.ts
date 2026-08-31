import { requireApiSession, serverError } from "@/lib/api";
import { lookupBarcode } from "@/lib/barcode";

export async function GET(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;

  try {
    const code = new URL(request.url).searchParams.get("code") ?? "";
    const { kind, metadata } = await lookupBarcode(code);
    if (kind === "unknown" || !metadata) {
      return Response.json(
        { error: "not_found", message: "没有查到匹配信息" },
        { status: 404 },
      );
    }
    return Response.json({ kind, metadata });
  } catch (error) {
    return serverError(error);
  }
}
