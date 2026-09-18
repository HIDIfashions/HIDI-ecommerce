import { getAccessToken, getStoredSession } from "@/lib/supabase-auth";

import { BROWSER_API_URL } from "@/lib/browser-api";
const API = BROWSER_API_URL;
export const RETENTION_CONSENT_VERSION = "hidi-retention-v1" as const;
export const RETENTION_PREFERENCES_EVENT = "hidi-retention-preferences-updated";
export const retentionEnabled = process.env.NEXT_PUBLIC_RETENTION_ENABLED === "true";

export type RetentionPreferences = {
  enabled: boolean;
  sendingEnabled: false;
  consentVersion: typeof RETENTION_CONSENT_VERSION;
  whatsappOptIn: boolean;
  personalizationOptIn: boolean;
  phoneVerified: boolean;
  maskedPhone: string | null;
};

export type RetentionChoices = Pick<RetentionPreferences, "whatsappOptIn" | "personalizationOptIn">;

export function retentionAccountId(): string | null {
  try { return getStoredSession()?.user?.id ?? null; } catch { return null; }
}

function assertAccount(expectedUserId: string) {
  if (!retentionEnabled || retentionAccountId() !== expectedUserId) {
    throw new Error("Your sign-in changed. Please reload your preferences.");
  }
}

async function requestRetention(
  path: string,
  expectedUserId: string,
  signal: AbortSignal,
  body?: unknown,
  method = "GET",
) {
  assertAccount(expectedUserId);
  if (signal.aborted) throw new Error("Request cancelled");
  const token = await getAccessToken();
  assertAccount(expectedUserId);
  if (!token) throw new Error("Please sign in again to manage your preferences.");
  if (signal.aborted) throw new Error("Request cancelled");
  const response = await fetch(`${API}/retention/${path}`, {
    method,
    signal,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  assertAccount(expectedUserId);
  if (!response.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : "We couldn’t save or load your preferences. Please try again.");
  }
  return data;
}

function parsePreferences(data: unknown): RetentionPreferences {
  const value = data as Partial<RetentionPreferences> | null;
  if (!value || value.consentVersion !== RETENTION_CONSENT_VERSION ||
      typeof value.enabled !== "boolean" || value.sendingEnabled !== false ||
      typeof value.whatsappOptIn !== "boolean" || typeof value.personalizationOptIn !== "boolean" ||
      typeof value.phoneVerified !== "boolean" ||
      !(value.maskedPhone === null || typeof value.maskedPhone === "string")) {
    throw new Error("Preferences are temporarily unavailable. Please try again later.");
  }
  return value as RetentionPreferences;
}

export async function getRetentionPreferences(userId: string, signal: AbortSignal) {
  return parsePreferences(await requestRetention("preferences", userId, signal));
}

export async function updateRetentionPreferences(userId: string, choices: RetentionChoices, signal: AbortSignal) {
  const preferences = parsePreferences(await requestRetention("preferences", userId, signal, {
    ...choices, consentVersion: RETENTION_CONSENT_VERSION,
  }, "PATCH"));
  // In-memory notification only: no browsing history or identifiers are persisted.
  window.dispatchEvent(new CustomEvent(RETENTION_PREFERENCES_EVENT, { detail: { userId } }));
  return preferences;
}

export async function recordRetentionEvent(userId: string, event: {
  productId: string;
  variantId?: string;
  kind: "DETAIL_VIEW" | "SIZE_SELECT";
}, signal: AbortSignal) {
  await requestRetention("events", userId, signal, event, "POST");
}
