import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

type Context = { params: Promise<{ orderNumber: string; action?: string[] }> };
async function proxy(request: NextRequest, context: Context) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  const { orderNumber, action = [] } = await context.params;
  if (action.length && (request.method !== "POST" || action.length !== 2 || action[1] !== "decision")) {
    return NextResponse.json({ message: "Unknown support action" }, { status: 404 });
  }
  let payload: unknown;
  if (request.method === "POST") {
    payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }
  try {
    const suffix = action.length ? `/${action.map(encodeURIComponent).join("/")}` : "";
    const response = await fetch(`${API_URL}/admin/orders/${encodeURIComponent(orderNumber)}/support${suffix}`, {
      method: request.method, cache: "no-store",
      headers: { ...adminApiHeaders(request), "content-type": "application/json" },
      ...(request.method === "POST" ? { body: JSON.stringify(payload) } : {}),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API" }, { status: 502 });
  }
}
export const GET = proxy;
export const POST = proxy;
