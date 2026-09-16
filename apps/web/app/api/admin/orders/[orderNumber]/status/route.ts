import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";

function authorized(request: NextRequest) {
  const expected = process.env.ADMIN_DASHBOARD_KEY;
  const supplied = request.headers.get("x-hidi-admin");
  return Boolean(expected && supplied && supplied === expected);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  if (!authorized(request)) {
    return NextResponse.json({ message: "Admin access required" }, { status: 401 });
  }

  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "Admin API is not configured" }, { status: 500 });
  }

  const { orderNumber } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!payload?.status) {
    return NextResponse.json({ message: "Status is required" }, { status: 400 });
  }

  const response = await fetch(`${API_URL}/admin/orders/${encodeURIComponent(orderNumber)}/status`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-admin-key": apiKey,
    },
    body: JSON.stringify({ status: payload.status }),
  });

  const body = await response.json().catch(() => ({ message: "Unable to update order" }));
  return NextResponse.json(body, { status: response.status });
}
