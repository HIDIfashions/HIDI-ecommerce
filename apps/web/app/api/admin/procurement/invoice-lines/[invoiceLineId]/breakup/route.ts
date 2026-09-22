import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { isAdminRequest } from "@/lib/admin-auth";

function adminKey() {
  return process.env.ADMIN_API_KEY?.trim() || "";
}

function unauthorized(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  if (!adminKey()) return NextResponse.json({ message: "ADMIN_API_KEY is missing in apps/web/.env.local" }, { status: 500 });
  return null;
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ invoiceLineId: string }> },
) {
  const blocked = unauthorized(request);
  if (blocked) return blocked;
  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ message: "Size breakup is required" }, { status: 400 });
  const { invoiceLineId } = await context.params;
  try {
    const response = await fetch(
      `${API_URL}/admin/procurement/invoice-lines/${encodeURIComponent(invoiceLineId)}/breakup`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-admin-key": adminKey() },
        body: JSON.stringify(payload),
      },
    );
    const body = await response.json().catch(() => ({ message: "Unable to save invoice size breakup" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API on port 4000" }, { status: 502 });
  }
}
