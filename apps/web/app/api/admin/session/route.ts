import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  adminSessionToken,
  hasDashboardSecret,
  verifyDashboardKey,
} from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!hasDashboardSecret()) {
    return NextResponse.json(
      { message: "ADMIN_DASHBOARD_KEY is missing in apps/web/.env.local" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key.trim() : "";

  if (!verifyDashboardKey(key)) {
    return NextResponse.json({ message: "Incorrect admin key" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, adminSessionToken(), adminCookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    ...adminCookieOptions,
    maxAge: 0,
  });
  return response;
}
