import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { isAdminRequest } from "@/lib/admin-auth";

function adminKey() { return process.env.ADMIN_API_KEY?.trim() || ""; }
function blocked(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  if (!adminKey()) return NextResponse.json({ message: "ADMIN_API_KEY is missing in apps/web/.env.local" }, { status: 500 });
  return null;
}

export async function GET(request: NextRequest) {
  const stop = blocked(request);
  if (stop) return stop;
  const vendorId = request.nextUrl.searchParams.get("vendorId")?.trim() ?? "";
  const vendorStyleCode = request.nextUrl.searchParams.get("vendorStyleCode")?.trim() ?? "";
  if (!vendorId || !vendorStyleCode) return NextResponse.json({ message: "Vendor and vendor material code are required" }, { status: 400 });
  try {
    const params = new URLSearchParams({ vendorId, vendorStyleCode });
    const response = await fetch(`${API_URL}/admin/procurement/material?${params}`, {
      cache: "no-store",
      headers: { "x-admin-key": adminKey() },
    });
    const body = await response.json().catch(() => ({ message: "Unable to resolve material" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API on port 4000" }, { status: 502 });
  }
}
