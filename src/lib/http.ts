import "server-only";

export function secureUrl(value: unknown) {
  return typeof value === "string" ? value.replace(/^http:/, "https:") : "";
}

export async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
    headers: { "User-Agent": "DaiInventory/1.0" },
  });
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}
