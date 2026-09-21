import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  }

  const { orderNumber } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!payload?.status) {
    return NextResponse.json({ message: "Status is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/admin/orders/${encodeURIComponent(orderNumber)}/status`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...adminApiHeaders(request),
      },
      body: JSON.stringify({ status: payload.status }),
    });

    const body = await response.json().catch(() => ({ message: "Unable to update order" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach the HIDI API. Make sure the API server on port 4000 is running." },
      { status: 502 },
    );
  }
}
