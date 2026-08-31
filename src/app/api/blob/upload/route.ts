import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { rejectCrossOrigin, requireApiSession, serverError } from "@/lib/api";

export async function POST(request: Request) {
  const authError = await requireApiSession();
  if (authError) return authError;
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
        maximumSizeInBytes: 15 * 1024 * 1024,
        addRandomSuffix: true,
      }),
    });
    return Response.json(result);
  } catch (error) {
    return serverError(error);
  }
}
