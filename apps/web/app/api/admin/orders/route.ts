import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";

function authorized(request: NextRequest) {
  const expected = process.env.ADMIN_DASHBOARD_KEY;
  const supplied = request.headers.get("x-hidi-admin");
  return Boolean(expected && supplied && supplied === expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ message: "Admin access required" }, { status: 401 });
  }

  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "Admin API is not configured" }, { status: 500 });
  }

  const incoming = new URL(request.url);
  const target = new URL(`${API_URL}/admin/orders`);
  const q = incoming.searchParams.get("q");
  const status = incoming.searchParams.get("status");
  if (q) target.searchParams.set("q", q);
  if (status) target.searchParams.set("status", status);

  const response = await fetch(target, {
    cache: "no-store",
    headers: { "x-admin-key": apiKey },
  });

  const body = await response.json().catch(() => ({ message: "Unable to load orders" }));
  return NextResponse.json(body, { status: response.status });
}
