export type HidiEnvironment = "staging" | "production";

export const HIDI_ENVIRONMENT: HidiEnvironment = __DEV__ ? "staging" : "production";

export const HIDI_GATEWAY_BASE_URL =
  HIDI_ENVIRONMENT === "staging"
    ? "https://thidigk.thehidi.com/api/store"
    : "https://thehidi.com/api/store";

export const HIDI_REQUEST_TIMEOUT_MS = 15000;
