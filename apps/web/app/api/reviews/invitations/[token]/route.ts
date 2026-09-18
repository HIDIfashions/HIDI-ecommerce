import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  try {
    const response = await fetch(`${API_URL}/reviews/invitations/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({ message: "Unable to load review invitation" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach HIDI" }, { status: 502 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    const response = await fetch(`${API_URL}/reviews/invitations/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({ message: "Unable to submit review" }));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach HIDI" }, { status: 502 });
  }
}
