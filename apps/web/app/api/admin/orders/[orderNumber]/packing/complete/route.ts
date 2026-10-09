import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  }

  const { orderNumber } = await context.params;
  const payload = await request.json().catch(() => null);
  try {
    const response = await fetch(
      `${API_URL}/admin/orders/${encodeURIComponent(orderNumber)}/packing/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...adminApiHeaders(request) },
        body: JSON.stringify({ scannedBarcodes: payload?.scannedBarcodes }),
      },
    );
    const body = await response.json().catch(() => ({ message: "Unable to complete packing" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API" }, { status: 502 });
  }
}
