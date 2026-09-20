import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

function adminKeyResponse() {
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  const auth = adminKeyResponse();
  if ("response" in auth) return auth.response;
  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ message: "Stock receipt details are required" }, { status: 400 });

  try {
    const response = await fetch(`${API_URL}/admin/inventory/receipts`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": auth.apiKey, "x-admin-name": "HIDI Admin" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({ message: "Unable to save stock receipt" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API on port 4000" }, { status: 502 });
  }
}
