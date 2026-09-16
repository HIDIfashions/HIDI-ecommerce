import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";

function authorized(request: NextRequest) {
  const expected = process.env.ADMIN_DASHBOARD_KEY;
  const supplied = request.headers.get("x-hidi-admin");
  return Boolean(expected && supplied && supplied === expected);
}

export async function GET(request: NextRequest) {
  if (!process.env.ADMIN_DASHBOARD_KEY) {
    return NextResponse.json(
      { message: "ADMIN_DASHBOARD_KEY is missing in apps/web/.env.local" },
      { status: 500 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json({ message: "Dashboard admin key is incorrect" }, { status: 401 });
  }

  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { message: "ADMIN_API_KEY is missing in apps/web/.env.local" },
      { status: 500 },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(`${API_URL}/admin/orders`);
  const q = incoming.searchParams.get("q");
  const status = incoming.searchParams.get("status");
  if (q) target.searchParams.set("q", q);
  if (status) target.searchParams.set("status", status);

  try {
    const response = await fetch(target, {
      cache: "no-store",
      headers: { "x-admin-key": apiKey },
    });

    const body = await response.json().catch(() => ({ message: "Unable to load orders" }));

    if (response.status === 401) {
      return NextResponse.json(
        {
          message:
            "Backend admin key mismatch. ADMIN_API_KEY in apps/web/.env.local must exactly match ADMIN_API_KEY in apps/api/.env, then restart both servers.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach the HIDI API. Make sure the API server on port 4000 is running." },
      { status: 502 },
    );
  }
}
