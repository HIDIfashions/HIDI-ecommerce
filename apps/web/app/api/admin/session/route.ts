import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
  adminAccessCookieOptions,
  adminApiHeaders,
  adminCookieOptions,
  adminSessionToken,
  hasDashboardSecret,
  isAdminRequest,
  verifyDashboardKey,
} from "@/lib/admin-auth";

async function verifyAdmin(headers: Record<string, string>) {
  try {
    const response = await fetch(`${API_URL}/admin/me`, {
      cache: "no-store",
      headers,
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } catch {
    return {
      response: new Response(null, { status: 502 }),
      body: { message: "Unable to reach the HIDI API." },
    };
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session required" }, { status: 401 });
  }

  const headers = adminApiHeaders(request);
  const { response, body } = await verifyAdmin(headers);
  return NextResponse.json(body, { status: response.status });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const accessToken = typeof body?.accessToken === "string" ? body.accessToken.trim() : "";
  if (accessToken) {
    const { response: verifyResponse, body: verifyBody } = await verifyAdmin({
      Authorization: `Bearer ${accessToken}`,
    });
    if (!verifyResponse.ok) {
      return NextResponse.json(
        { message: verifyBody?.message ?? "This account is not authorized for HIDI Admin" },
        { status: verifyResponse.status },
      );
    }

    const response = NextResponse.json({ ok: true, ...verifyBody });
    response.cookies.set(
      ADMIN_ACCESS_COOKIE_NAME,
      accessToken,
      adminAccessCookieOptions(body?.expiresIn),
    );
    response.cookies.set(ADMIN_COOKIE_NAME, "", { ...adminCookieOptions, maxAge: 0 });
    return response;
  }

  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!hasDashboardSecret()) {
    return NextResponse.json(
      { message: "Admin staff sign-in is required. Legacy admin key is not configured." },
      { status: 401 },
    );
  }
  if (!verifyDashboardKey(key)) {
    return NextResponse.json({ message: "Incorrect admin key" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, legacy: true });
  response.cookies.set(ADMIN_COOKIE_NAME, adminSessionToken(), adminCookieOptions);
  response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, "", {
    ...adminAccessCookieOptions(),
    maxAge: 0,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    ...adminCookieOptions,
    maxAge: 0,
  });
  response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, "", {
    ...adminAccessCookieOptions(),
    maxAge: 0,
  });
  return response;
}
