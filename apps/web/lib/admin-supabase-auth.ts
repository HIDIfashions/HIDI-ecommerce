const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function configured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function headers() {
  if (!SUPABASE_KEY) throw new Error("Admin sign-in is not configured");
  return {
    apikey: SUPABASE_KEY,
    "content-type": "application/json",
  };
}

export function adminAuthConfigured() {
  return configured();
}

export function normalizeAdminEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid admin email address");
  return email;
}

export async function sendAdminEmailOtp(emailValue: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Admin sign-in is not configured");
  const email = normalizeAdminEmail(emailValue);
  const response = await fetch("/api/store/auth/admin/otp/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ email }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.msg ?? body?.message ?? "Unable to send the admin sign-in code");
  }
  return email;
}

export async function verifyAdminEmailOtp(emailValue: string, tokenValue: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Admin sign-in is not configured");
  const email = normalizeAdminEmail(emailValue);
  const token = tokenValue.trim();
  if (!/^\d{8}$/.test(token)) throw new Error("Enter the 8-digit sign-in code");

  const sessionResponse = await fetch('/api/admin/session', {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({email,token}),
  });
  const sessionBody = await sessionResponse.json().catch(() => ({}));
  if (!sessionResponse.ok) {
    throw new Error(sessionBody?.message ?? "This account is not authorized for HIDI Admin");
  }
  return sessionBody;
}
