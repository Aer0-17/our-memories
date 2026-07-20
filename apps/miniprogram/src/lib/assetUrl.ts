export function resolveAssetUrl(value: string | null | undefined, apiBaseUrl: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "";
  if (/^(?:https?:|data:|wxfile:|blob:|\/\/)/i.test(trimmed)) return trimmed;

  const origin = apiBaseUrl.replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");
  return `${origin}/${trimmed.replace(/^\/+/, "")}`;
}
