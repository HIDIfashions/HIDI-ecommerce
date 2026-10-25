import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ orderNumber: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  const { orderNumber } = await context.params;
  const payload = await request.json().catch(() => null);
  if (payload?.confirmed !== true || !Number.isSafeInteger(payload.amountPaise) || payload.amountPaise <= 0) {
    return NextResponse.json({ message: "Confirm the exact COD amount collected" }, { status: 400 });
  }
  try {
    const response = await fetch(`${API_URL}/admin/orders/${encodeURIComponent(orderNumber)}/cod-collection`, {
      method: "POST", headers: { "content-type": "application/json", ...adminApiHeaders(request) },
      body: JSON.stringify({ confirmed: true, amountPaise: payload.amountPaise }),
    });
    const body = await response.json().catch(() => ({ message: "Unable to confirm COD collection" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API" }, { status: 502 });
  }
}
