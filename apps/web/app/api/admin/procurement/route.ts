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

export async function GET(request: NextRequest) {
  const blocked = unauthorized(request);
  if (blocked) return blocked;
  try {
    const response = await fetch(`${API_URL}/admin/procurement`, {
      cache: "no-store",
      headers: { "x-admin-key": adminKey() },
    });
    const body = await response.json().catch(() => ({ message: "Unable to load procurement" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API on port 4000" }, { status: 502 });
  }
}
