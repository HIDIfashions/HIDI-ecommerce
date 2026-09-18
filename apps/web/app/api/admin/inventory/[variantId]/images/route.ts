import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { isAdminRequest } from "@/lib/admin-auth";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function safePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function saveImageMetadata(apiKey: string, variantId: string, payload: Record<string, unknown>) {
  return fetch(`${API_URL}/admin/inventory/${encodeURIComponent(variantId)}/images`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-key": apiKey },
    body: JSON.stringify(payload),
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ variantId: string }> },
) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) return NextResponse.json({ message: "ADMIN_API_KEY is missing in apps/web/.env.local" }, { status: 500 });
  const { variantId } = await context.params;

  try {
    if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
      const payload = await request.json().catch(() => null);
      if (!payload) return NextResponse.json({ message: "Photo or image URL is required" }, { status: 400 });
      const response = await saveImageMetadata(apiKey, variantId, payload);
      const body = await response.json().catch(() => ({ message: "Unable to attach SKU photo" }));
      return NextResponse.json(body, { status: response.status });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ message: "Choose an image file" }, { status: 400 });
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ message: "Use a JPEG, PNG, WebP or AVIF image" }, { status: 400 });
    }
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ message: "Image must be smaller than 8 MB" }, { status: 400 });
    }

    const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
    const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET?.trim() || "hidi-products";
    if (!supabaseUrl || !secretKey) {
      return NextResponse.json(
        { message: "Configure SUPABASE_URL and the server-only SUPABASE_SECRET_KEY to upload SKU photos" },
        { status: 500 },
      );
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(bucket)) {
      return NextResponse.json({ message: "SUPABASE_PRODUCT_IMAGES_BUCKET contains unsupported characters" }, { status: 500 });
    }

    const original = safePart(file.name) || "product-image";
    const extension = original.includes(".") ? original.split(".").pop() : file.type.split("/").pop();
    const objectPath = `variants/${safePart(variantId)}/${Date.now()}-${randomUUID()}.${extension}`;
    const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
    const upload = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
      method: "POST",
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        "content-type": file.type,
        "x-upsert": "false",
      },
      body: await file.arrayBuffer(),
    });
    if (!upload.ok) {
      const details = await upload.json().catch(() => null);
      return NextResponse.json(
        { message: details?.message ?? details?.error ?? "Supabase Storage rejected the image upload" },
        { status: upload.status >= 400 && upload.status < 500 ? upload.status : 502 },
      );
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
    const response = await saveImageMetadata(apiKey, variantId, {
      url: publicUrl,
      storagePath: objectPath,
      alt: String(form.get("alt") ?? ""),
      applyToColor: String(form.get("applyToColor") ?? "false") === "true",
    });
    const body = await response.json().catch(() => ({ message: "Photo uploaded, but it could not be attached to the SKU" }));
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to upload SKU photo" },
      { status: 502 },
    );
  }
}
