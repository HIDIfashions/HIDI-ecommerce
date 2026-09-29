export type HidiEnvironment = "staging" | "production";

export const HIDI_ENVIRONMENT: HidiEnvironment = __DEV__ ? "staging" : "production";

export const HIDI_PUBLIC_ORIGIN =
  HIDI_ENVIRONMENT === "staging"
    ? "https://thidigk.thehidi.com"
    : "https://thehidi.com";

export const HIDI_GATEWAY_BASE_URL = HIDI_PUBLIC_ORIGIN + "/api/store";

export const HIDI_REQUEST_TIMEOUT_MS = 15000;

export function resolveHidiMediaUrl(value?: string | null) {
  const url = value?.trim();
  if (!url) return "";
  if (url.startsWith("/")) return HIDI_PUBLIC_ORIGIN + url;
  if (url.startsWith("https://")) return url;
  return "";
}
