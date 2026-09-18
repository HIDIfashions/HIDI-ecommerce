import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { isAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  }
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  if (!adminKey) return NextResponse.json({ message: "ADMIN_API_KEY is missing" }, { status: 500 });

  try {
    const response = await fetch(`${API_URL}/admin/review-followups/run`, {
      method: "POST",
      cache: "no-store",
      headers: { "x-admin-key": adminKey },
    });
    const body = await response.json().catch(() => ({ message: "Unable to run review follow-ups" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the HIDI API" }, { status: 502 });
  }
}
