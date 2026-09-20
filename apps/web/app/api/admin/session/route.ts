import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
  ADMIN_REFRESH_COOKIE_NAME,
  adminAccessCookieOptions,
  adminApiHeaders,
  adminCookieOptions,
  adminRefreshCookieOptions,
  adminRefreshToken,
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

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  return { url, key };
}

function clearAdminCookies(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE_NAME, "", { ...adminCookieOptions, maxAge: 0 });
  response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, "", { ...adminAccessCookieOptions(), maxAge: 0 });
  response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, "", { ...adminRefreshCookieOptions, maxAge: 0 });
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
    const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken.trim() : "";
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
    if (refreshToken) {
      response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, refreshToken, adminRefreshCookieOptions);
    }
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
  response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, "", {
    ...adminRefreshCookieOptions,
    maxAge: 0,
  });
  return response;
}

export async function PUT(request: NextRequest) {
  const refreshToken = adminRefreshToken(request);
  if (!refreshToken) {
    const response = NextResponse.json({ message: "Admin session expired" }, { status: 401 });
    clearAdminCookies(response);
    return response;
  }

  const { url, key } = supabaseConfig();
  if (!url || !key) {
    return NextResponse.json({ message: "Admin authentication is not configured" }, { status: 503 });
  }

  try {
    const tokenResponse = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: key,
        "content-type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    const tokenBody = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || typeof tokenBody?.access_token !== "string") {
      const response = NextResponse.json({ message: "Admin session expired" }, { status: 401 });
      clearAdminCookies(response);
      return response;
    }

    const { response: verifyResponse, body: verifyBody } = await verifyAdmin({
      Authorization: `Bearer ${tokenBody.access_token}`,
    });
    if (!verifyResponse.ok) {
      const response = NextResponse.json(
        { message: verifyBody?.message ?? "Admin access is no longer authorized" },
        { status: verifyResponse.status },
      );
      clearAdminCookies(response);
      return response;
    }

    const response = NextResponse.json({ ok: true, ...verifyBody });
    response.cookies.set(
      ADMIN_ACCESS_COOKIE_NAME,
      tokenBody.access_token,
      adminAccessCookieOptions(tokenBody.expires_in),
    );
    if (typeof tokenBody.refresh_token === "string" && tokenBody.refresh_token) {
      response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, tokenBody.refresh_token, adminRefreshCookieOptions);
    }
    return response;
  } catch {
    return NextResponse.json({ message: "Unable to refresh admin session" }, { status: 502 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAdminCookies(response);
  return response;
}
