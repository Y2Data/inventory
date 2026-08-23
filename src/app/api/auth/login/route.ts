import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

import { rejectCrossOrigin, serverError } from "@/lib/api";
import { setSessionCookie, verifyPassword } from "@/lib/auth";

const LoginSchema = z.object({
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  try {
    const parsed = LoginSchema.safeParse(await request.json());
    if (!parsed.success || !verifyPassword(parsed.data.password)) {
      await delay(750);
      return Response.json(
        { error: "invalid_credentials", message: "密码不正确" },
        { status: 401 },
      );
    }

    await setSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
