import { ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    return Response.json({ ok: true, database: "connected" });
  } catch {
    return Response.json(
      { ok: false, database: "unavailable" },
      { status: 503 },
    );
  }
}
