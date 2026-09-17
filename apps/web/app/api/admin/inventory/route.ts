import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { isAdminRequest } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  }

  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { message: "ADMIN_API_KEY is missing in apps/web/.env.local" },
      { status: 500 },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(`${API_URL}/admin/inventory`);
  const q = incoming.searchParams.get("q");
  const status = incoming.searchParams.get("status");
  if (q) target.searchParams.set("q", q);
  if (status) target.searchParams.set("status", status);

  try {
    const response = await fetch(target, {
      cache: "no-store",
      headers: { "x-admin-key": apiKey },
    });
    const body = await response.json().catch(() => ({ message: "Unable to load inventory" }));

    if (response.status === 401) {
      return NextResponse.json(
        { message: "Backend admin key mismatch. Use the same ADMIN_API_KEY for the web and API, then restart both servers." },
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
