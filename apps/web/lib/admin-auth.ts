import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "hidi_admin_session";
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
  // Keep a single source of truth for admin access.
  // ADMIN_API_KEY must be identical in apps/web/.env.local and apps/api/.env.
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

export function isAdminRequest(request: NextRequest) {
  const supplied = normalize(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  const expected = adminSessionToken();
  return Boolean(expected && supplied && safeEqual(supplied, expected));
}

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 8,
};
