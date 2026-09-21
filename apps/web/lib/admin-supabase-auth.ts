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
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid admin email address");
  return email;
}

export async function sendAdminEmailOtp(emailValue: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Admin sign-in is not configured");
  const email = normalizeAdminEmail(emailValue);
  const response = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, create_user: true }),
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
  if (!/^\d{6,10}$/.test(token)) throw new Error("Enter the verification code from your email");

  const response = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ type: "email", email, token }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error(body?.msg ?? body?.message ?? "That admin code is invalid or has expired");
  }

  const sessionResponse = await fetch("/api/admin/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn: body.expires_in,
    }),
  });
  const sessionBody = await sessionResponse.json().catch(() => ({}));
  if (!sessionResponse.ok) {
    throw new Error(sessionBody?.message ?? "This account is not authorized for HIDI Admin");
  }
  return sessionBody;
}
