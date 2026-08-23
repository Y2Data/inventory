import { requireApiSession, serverError } from "@/lib/api";
import { isValidIsbn, lookupIsbn, normalizeIsbn } from "@/lib/isbn";

export async function GET(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;

  try {
    const isbn = normalizeIsbn(new URL(request.url).searchParams.get("isbn") ?? "");
    if (!isValidIsbn(isbn)) {
      return Response.json(
        { error: "invalid_isbn", message: "ISBN 无效" },
        { status: 400 },
      );
    }
    const metadata = await lookupIsbn(isbn);
    if (!metadata) {
      return Response.json(
        { error: "not_found", message: "没有查到这本书" },
        { status: 404 },
      );
    }
    return Response.json({ metadata });
  } catch (error) {
    return serverError(error);
  }
}
