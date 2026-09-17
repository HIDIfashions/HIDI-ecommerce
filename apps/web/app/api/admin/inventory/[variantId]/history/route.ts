import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { isAdminRequest } from "@/lib/admin-auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ variantId: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  }

  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "ADMIN_API_KEY is missing in apps/web/.env.local" }, { status: 500 });
  }

  const { variantId } = await context.params;
  try {
    const response = await fetch(`${API_URL}/admin/inventory/${encodeURIComponent(variantId)}/history`, {
      cache: "no-store",
      headers: { "x-admin-key": apiKey },
    });
    const body = await response.json().catch(() => ({ message: "Unable to load stock history" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach the HIDI API. Make sure the API server on port 4000 is running." },
      { status: 502 },
    );
  }
}
