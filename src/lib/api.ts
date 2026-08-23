import "server-only";

import { hasValidSession } from "@/lib/auth";

export async function requireApiSession() {
  if (!(await hasValidSession())) {
    return Response.json(
      { error: "unauthorized", message: "请重新登录" },
      { status: 401 },
    );
  }
  return null;
}

export function rejectCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  try {
    if (!host || new URL(origin).host !== host) {
      return Response.json(
        { error: "invalid_origin", message: "请求来源无效" },
        { status: 403 },
      );
    }
  } catch {
    return Response.json(
      { error: "invalid_origin", message: "请求来源无效" },
      { status: 403 },
    );
  }
  return null;
}

export function serverError(error: unknown) {
  console.error("Inventory server error", error);
  const message = error instanceof Error ? error.message : "Unknown error";
  const isConfigurationError =
    message.includes("DATABASE_URL") ||
    message.includes("SESSION_SECRET") ||
    message.includes("INVENTORY_PASSWORD");

  return Response.json(
    {
      error: isConfigurationError ? "not_configured" : "server_error",
      message: isConfigurationError
        ? "服务尚未完成配置"
        : "服务器暂时无法处理请求",
    },
    { status: isConfigurationError ? 503 : 500 },
  );
}
