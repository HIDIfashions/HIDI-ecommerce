import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "hidi_admin_session";
export const ADMIN_ACCESS_COOKIE_NAME = "hidi_admin_access";
export const ADMIN_REFRESH_COOKIE_NAME = "hidi_admin_refresh";
const SESSION_LABEL = "hidi-admin-session-v2";

function normalize(value?: string | null) {
  return (value ?? "").trim();
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function dashboardSecret() {
  // Legacy break-glass access only. Production RBAC uses a verified Supabase
  // admin access token stored in an HttpOnly cookie.
  return normalize(process.env.ADMIN_API_KEY);
}

export function hasDashboardSecret() {
  return Boolean(dashboardSecret());
}

export function verifyDashboardKey(key: string) {
  const expected = dashboardSecret();
  const supplied = normalize(key);
  return Boolean(expected && supplied && safeEqual(supplied, expected));
}

export function adminSessionToken() {
  const secret = dashboardSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(SESSION_LABEL).digest("hex");
}

export function adminAccessToken(request: NextRequest) {
  return normalize(request.cookies.get(ADMIN_ACCESS_COOKIE_NAME)?.value);
}

export function adminRefreshToken(request: NextRequest) {
  return normalize(request.cookies.get(ADMIN_REFRESH_COOKIE_NAME)?.value);
}

export function isLegacyAdminRequest(request: NextRequest) {
  const supplied = normalize(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  const expected = adminSessionToken();
  return Boolean(expected && supplied && safeEqual(supplied, expected));
}

export function isAdminRequest(request: NextRequest) {
  return Boolean(adminAccessToken(request) || isLegacyAdminRequest(request));
}

export function adminApiHeaders(request: NextRequest): Record<string, string> {
  const accessToken = adminAccessToken(request);
  if (accessToken) return { Authorization: `Bearer ${accessToken}` };

  if (isLegacyAdminRequest(request)) {
    const apiKey = dashboardSecret();
    return apiKey ? { "x-admin-key": apiKey } : {};
  }

  return {};
}

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 8,
};

export function adminAccessCookieOptions(expiresInSeconds?: number) {
  const requested = Number(expiresInSeconds ?? 3600);
  const maxAge = Number.isFinite(requested)
    ? Math.max(60, Math.min(Math.floor(requested) - 30, 60 * 60 * 8))
    : 60 * 60;
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}


export const adminRefreshCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
