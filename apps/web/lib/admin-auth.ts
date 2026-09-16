import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "hidi_admin_session";
const SESSION_LABEL = "hidi-admin-session-v1";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function dashboardSecret() {
  return process.env.ADMIN_DASHBOARD_KEY ?? "";
}

export function hasDashboardSecret() {
  return Boolean(dashboardSecret());
}

export function verifyDashboardKey(key: string) {
  const expected = dashboardSecret();
  return Boolean(expected && key && safeEqual(key, expected));
}

export function adminSessionToken() {
  const secret = dashboardSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(SESSION_LABEL).digest("hex");
}

export function isAdminRequest(request: NextRequest) {
  const supplied = request.cookies.get(ADMIN_COOKIE_NAME)?.value ?? "";
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
