import { z } from "zod";

import {
  rejectCrossOrigin,
  requireApiSession,
  serverError,
} from "@/lib/api";
import { createBox, listBoxes, updateBox } from "@/lib/db";

const CreateBoxSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().max(120).optional(),
  location: z.string().max(160).optional(),
  notes: z.string().max(2_000).optional(),
  category: z.string().max(80).optional(),
});

const UpdateBoxSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1).max(40).optional(),
  status: z.enum(["open", "sealed", "archived"]).optional(),
  name: z.string().max(120).optional(),
  location: z.string().max(160).optional(),
  notes: z.string().max(2_000).optional(),
  category: z.string().max(80).optional(),
});

function normalizeBoxCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "");
}

export async function GET() {
  const authError = await requireApiSession();
  if (authError) return authError;
  try {
    return Response.json({ boxes: await listBoxes() });
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
    const parsed = CreateBoxSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_input", message: "箱子信息不完整" },
        { status: 400 },
      );
    }
    const code = normalizeBoxCode(parsed.data.code);
    if (!code) {
      return Response.json(
        { error: "invalid_code", message: "箱号只能使用字母、数字、横线或下划线" },
        { status: 400 },
      );
    }
    const box = await createBox({ ...parsed.data, code });
    return Response.json({ box }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return Response.json(
        { error: "duplicate_code", message: "这个箱号已经存在" },
        { status: 409 },
      );
    }
    return serverError(error);
  }
}

export async function PATCH(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  try {
    const parsed = UpdateBoxSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_input", message: "更新内容无效" },
        { status: 400 },
      );
    }
    const code = parsed.data.code
      ? normalizeBoxCode(parsed.data.code)
      : undefined;
    if (parsed.data.code !== undefined && !code) {
      return Response.json(
        { error: "invalid_code", message: "箱号只能使用字母、数字、横线或下划线" },
        { status: 400 },
      );
    }
    const box = await updateBox({ ...parsed.data, code });
    if (!box) {
      return Response.json(
        { error: "not_found", message: "没有找到这个箱子" },
        { status: 404 },
      );
    }
    return Response.json({ box });
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return Response.json(
        { error: "duplicate_code", message: "这个箱号已经存在" },
        { status: 409 },
      );
    }
    return serverError(error);
  }
}
