import * as Keychain from "react-native-keychain";
import { publicRuntime, customerAuthConfigured } from "../config/publicRuntime";

const SERVICE = "com.thehidi.app.customer-session";

// HIDI launch auth uses WhatsApp OTP. Supabase verifies phone OTPs with type "sms"
// even when delivery was requested through the WhatsApp channel.
export const PHONE_OTP_CHANNEL = "whatsapp" as const;

export type HidiAuthUser = {
  id: string;
  phone?: string | null;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

export type HidiSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: HidiAuthUser;
};

type SupabaseAuthPayload = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user: HidiAuthUser;
};

function authHeaders(accessToken?: string) {
  if (!customerAuthConfigured()) throw new Error("Customer sign-in is not configured for this build.");
  return {
    apikey: publicRuntime.supabasePublishableKey,
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}),
  };
}

export function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) throw new Error("Enter a valid 10-digit Indian mobile number.");
  return "+91" + local;
}

export function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.slice(-10);
  return local.length === 10 ? "+91 ••••••" + local.slice(-4) : value;
}

async function saveSession(payload: SupabaseAuthPayload): Promise<HidiSession> {
  const now = Math.floor(Date.now() / 1000);
  const session: HidiSession = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at ?? now + Number(payload.expires_in ?? 3600) - 30,
    user: payload.user,
  };
  await Keychain.setGenericPassword(session.user.id, JSON.stringify(session), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return session;
}

export async function loadSession(): Promise<HidiSession | null> {
  const credentials = await Keychain.getGenericPassword({ service: SERVICE }).catch(() => false);
  if (!credentials || typeof credentials !== "object") return null;
  try {
    return JSON.parse(credentials.password) as HidiSession;
  } catch {
    await clearSession();
    return null;
  }
}

export async function clearSession() {
  await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => false);
}

async function refreshSession(session: HidiSession): Promise<HidiSession | null> {
  if (!customerAuthConfigured()) return null;
  const response = await fetch(publicRuntime.supabaseUrl + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  }).catch(() => null);
  if (!response?.ok) {
    await clearSession();
    return null;
  }
  return saveSession(await response.json() as SupabaseAuthPayload);
}

export async function validSession(): Promise<HidiSession | null> {
  const session = await loadSession();
  if (!session) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000)) return session;
  return refreshSession(session);
}

export async function sendPhoneOtp(rawPhone: string) {
  const phone = normalizeIndianPhone(rawPhone);
  const response = await fetch(publicRuntime.supabaseUrl + "/auth/v1/otp", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ phone, create_user: true, channel: PHONE_OTP_CHANNEL }),
  }).catch(() => null);

  if (!response) throw new Error("Unable to reach WhatsApp verification. Check your connection and try again.");
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = String(payload.msg ?? payload.message ?? "Unable to send the WhatsApp verification code.");
    const retryAfter = Number(response.headers.get("retry-after") ?? 0);
    const error = new Error(message) as Error & { status?: number; retryAfterSeconds?: number };
    error.status = response.status;
    error.retryAfterSeconds = Number.isFinite(retryAfter) ? retryAfter : 0;
    throw error;
  }
  return { phone, resendAfterSeconds: Number(response.headers.get("retry-after") ?? 60) || 60 };
}

export async function verifyPhoneOtp(phone: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code.");
  const response = await fetch(publicRuntime.supabaseUrl + "/auth/v1/verify", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ type: "sms", phone: normalizeIndianPhone(phone), token: code }),
  }).catch(() => null);
  if (!response) throw new Error("Unable to verify right now. Check your connection and try again.");
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(String(payload.msg ?? payload.message ?? "That code is invalid or has expired.")) as Error & { status?: number; retryAfterSeconds?: number };
    error.status = response.status;
    const retryAfter = Number(response.headers.get("retry-after") ?? 0);
    error.retryAfterSeconds = Number.isFinite(retryAfter) ? retryAfter : 0;
    throw error;
  }
  return saveSession(payload as unknown as SupabaseAuthPayload);
}

export async function updateProfile(input: { preferredName: string; email?: string }) {
  const session = await validSession();
  if (!session) throw new Error("Your sign-in session has expired.");
  const body: Record<string, unknown> = {
    data: { ...(session.user.user_metadata ?? {}), first_name: input.preferredName.trim() },
  };
  if (input.email?.trim()) body.email = input.email.trim().toLowerCase();
  const response = await fetch(publicRuntime.supabaseUrl + "/auth/v1/user", {
    method: "PUT",
    headers: authHeaders(session.access_token),
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!response) throw new Error("Unable to save your profile right now.");
  const payload = await response.json().catch(() => ({})) as HidiAuthUser & { message?: string; msg?: string };
  if (!response.ok) throw new Error(payload.message ?? payload.msg ?? "Unable to save your profile.");
  session.user = payload;
  await Keychain.setGenericPassword(session.user.id, JSON.stringify(session), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return session;
}
