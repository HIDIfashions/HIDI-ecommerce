import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  }

  const { requestId } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!payload?.action) {
    return NextResponse.json({ message: "Return action is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/admin/returns/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...adminApiHeaders(request),
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({ message: "Unable to update return request" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach the HIDI API. Make sure the API server on port 4000 is running." },
      { status: 502 },
    );
  }
}
