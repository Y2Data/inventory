import { requireApiSession, serverError } from "@/lib/api";
import { getSummary } from "@/lib/db";

export async function GET() {
  const authError = await requireApiSession();
  if (authError) return authError;
  try {
    return Response.json({ summary: await getSummary() });
  } catch (error) {
    return serverError(error);
  }
}
