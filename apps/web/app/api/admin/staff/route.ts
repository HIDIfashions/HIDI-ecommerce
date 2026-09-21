import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  try {
    const response = await fetch(`${API_URL}/admin/staff`, {
      cache: "no-store",
      headers: adminApiHeaders(request),
    });
    const body = await response.json().catch(() => ({ message: "Unable to load admin staff" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ message: "Staff details are required" }, { status: 400 });

  try {
    const response = await fetch(`${API_URL}/admin/staff`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...adminApiHeaders(request) },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({ message: "Unable to create admin staff" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API" }, { status: 502 });
  }
}
