import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { isAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function key() {
  return process.env.ADMIN_API_KEY?.trim();
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  }
  const adminKey = key();
  if (!adminKey) return NextResponse.json({ message: "ADMIN_API_KEY is missing" }, { status: 500 });

  try {
    const response = await fetch(`${API_URL}/admin/review-followups`, {
      cache: "no-store",
      headers: { "x-admin-key": adminKey },
    });
    const body = await response.json().catch(() => ({ message: "Unable to load review follow-ups" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API" }, { status: 502 });
  }
}
