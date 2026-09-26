import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ variantId: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  }


  const { variantId } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ message: "Inventory adjustment is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/admin/inventory/${encodeURIComponent(variantId)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...adminApiHeaders(request), "x-admin-name": "HIDI Admin",
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({ message: "Unable to update inventory" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach the HIDI API. Make sure the API server on port 4000 is running." },
      { status: 502 },
    );
  }
}
