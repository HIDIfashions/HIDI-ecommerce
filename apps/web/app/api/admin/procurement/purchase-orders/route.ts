import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { isAdminRequest } from "@/lib/admin-auth";

function adminKey() { return process.env.ADMIN_API_KEY?.trim() || ""; }
function blocked(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  if (!adminKey()) return NextResponse.json({ message: "ADMIN_API_KEY is missing in apps/web/.env.local" }, { status: 500 });
  return null;
}

export async function POST(request: NextRequest) {
  const stop = blocked(request);
  if (stop) return stop;
  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ message: "Purchase order details are required" }, { status: 400 });
  try {
    const response = await fetch(`${API_URL}/admin/procurement/purchase-orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey() },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({ message: "Unable to create purchase order" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API on port 4000" }, { status: 502 });
  }
}
