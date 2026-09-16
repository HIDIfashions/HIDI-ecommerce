import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { isAdminRequest } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  }

  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "ADMIN_API_KEY is missing in apps/web/.env.local" }, { status: 500 });
  }

  const { orderNumber } = await context.params;
  try {
    const response = await fetch(`${API_URL}/admin/orders/${encodeURIComponent(orderNumber)}/delhivery/manifest`, {
      method: "POST",
      headers: { "x-admin-key": apiKey },
    });
    const body = await response.json().catch(() => ({ message: "Unable to create Delhivery shipment" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API" }, { status: 502 });
  }
}
