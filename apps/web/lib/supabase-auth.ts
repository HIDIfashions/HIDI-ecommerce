const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const STORAGE_KEY = "hidi_supabase_session";

type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string | null };
};

function configured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function headers(accessToken?: string) {
  if (!SUPABASE_KEY) throw new Error("Customer sign-in is not configured");
  return {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export function authConfigured() {
  return configured();
}

export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredSession; } catch { return null; }
}

function saveSession(payload: any): StoredSession {
  const session: StoredSession = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(payload.expires_in ?? 3600) - 30,
    user: payload.user,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("hidi-auth-updated"));
  return session;
}

export async function sendEmailOtp(email: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Customer sign-in is not configured");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email: email.trim().toLowerCase(), create_user: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.msg ?? data?.message ?? "Unable to send the sign-in code");
}

export async function verifyEmailOtp(email: string, token: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Customer sign-in is not configured");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ type: "email", email: email.trim().toLowerCase(), token: token.trim() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.msg ?? data?.message ?? "That code is invalid or has expired");
  return saveSession(data);
}

async function refreshSession(session: StoredSession) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) {
    clearStoredSession();
    return null;
  }
  return saveSession(await response.json());
}

export async function getAccessToken() {
  const session = getStoredSession();
  if (!session) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000)) return session.access_token;
  const refreshed = await refreshSession(session);
  return refreshed?.access_token ?? null;
}

export async function signOut() {
  const token = await getAccessToken();
  if (token && SUPABASE_URL) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: headers(token),
    }).catch(() => undefined);
  }
  clearStoredSession();
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("hidi-auth-updated"));
}
