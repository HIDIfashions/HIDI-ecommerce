import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const UPLOAD_FUNCTION = "hidi-admin-product-image-upload";

async function saveImageMetadata(apiKey: string, variantId: string, payload: Record<string, unknown>) {
  return fetch(`${API_URL}/admin/inventory/${encodeURIComponent(variantId)}/images`, {
    method: "POST",
    headers: { "content-type": "application/json", ...adminApiHeaders(request) },
    body: JSON.stringify(payload),
  });
}

async function createUploadTicket(apiKey: string, variantId: string, file: File) {
  const response = await fetch(
    `${API_URL}/admin/inventory/${encodeURIComponent(variantId)}/images/ticket`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...adminApiHeaders(request) },
      body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
      cache: "no-store",
    },
  );
  const body = await response.json().catch(() => ({ message: "Unable to authorize image upload" }));
  if (!response.ok || typeof body?.token !== "string") {
    throw new Error(typeof body?.message === "string" ? body.message : "Unable to authorize image upload");
  }
  return body.token as string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ variantId: string }> },
) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ variantId: string }> },
) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
}

