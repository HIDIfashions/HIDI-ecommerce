import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  }


  const { orderNumber } = await context.params;
  try {
    const response = await fetch(`${API_URL}/admin/orders/${encodeURIComponent(orderNumber)}/delhivery/serviceability`, {
      cache: "no-store",
      headers: adminApiHeaders(request),
    });
    const body = await response.json().catch(() => ({ message: "Unable to check Delhivery serviceability" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API" }, { status: 502 });
  }
}
