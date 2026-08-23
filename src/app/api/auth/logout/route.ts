import { rejectCrossOrigin } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  await clearSessionCookie();
  return Response.json({ ok: true });
}
