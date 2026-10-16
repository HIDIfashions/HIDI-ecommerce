import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ staffId: string }> },
) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  const { staffId } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ message: "Staff changes are required" }, { status: 400 });

  try {
    const response = await fetch(`${API_URL}/admin/staff/${encodeURIComponent(staffId)}`, {
      method: "PATCH",
      cache: "no-store",
      headers: { "content-type": "application/json", ...adminApiHeaders(request) },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({ message: "Unable to update admin staff" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API" }, { status: 502 });
  }
}
