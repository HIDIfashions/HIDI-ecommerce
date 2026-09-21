import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const UPLOAD_FUNCTION = "hidi-admin-product-image-upload";

async function saveImageMetadata(request: NextRequest, variantId: string, payload: Record<string, unknown>) {
  return fetch(`${API_URL}/admin/inventory/${encodeURIComponent(variantId)}/images`, {
    method: "POST",
    headers: { "content-type": "application/json", ...adminApiHeaders(request) },
    body: JSON.stringify(payload),
  });
}

async function createUploadTicket(request: NextRequest, variantId: string, file: File) {
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
  const { variantId } = await context.params;

  try {
    if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
      const payload = await request.json().catch(() => null);
      if (!payload) return NextResponse.json({ message: "Photo or image URL is required" }, { status: 400 });
      const response = await saveImageMetadata(request, variantId, payload);
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
    if (!supabaseUrl) {
      return NextResponse.json(
        { message: "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is missing from the web server configuration" },
        { status: 500 },
      );
    }

    const token = await createUploadTicket(request, variantId, file);
    const uploadForm = new FormData();
    uploadForm.set("token", token);
    uploadForm.set("variantId", variantId);
    uploadForm.set("file", file);

    const upload = await fetch(`${supabaseUrl}/functions/v1/${UPLOAD_FUNCTION}`, {
      method: "POST",
      body: uploadForm,
      signal: AbortSignal.timeout(90_000),
    });
    const uploaded = await upload.json().catch(() => null);
    if (!upload.ok || !uploaded?.url || !uploaded?.storagePath) {
      return NextResponse.json(
        { message: uploaded?.message ?? "Supabase Storage rejected the image upload" },
        { status: upload.status >= 400 && upload.status < 500 ? upload.status : 502 },
      );
    }

    const response = await saveImageMetadata(request, variantId, {
      url: uploaded.url,
      storagePath: uploaded.storagePath,
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ variantId: string }> },
) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });

  const { variantId } = await context.params;
  const imageId = request.nextUrl.searchParams.get("imageId")?.trim() ?? "";
  const applyToColor = request.nextUrl.searchParams.get("applyToColor") === "true";
  if (!imageId) return NextResponse.json({ message: "Choose a photo to remove" }, { status: 400 });

  try {
    const response = await fetch(
      `${API_URL}/admin/inventory/${encodeURIComponent(variantId)}/images/${encodeURIComponent(imageId)}?applyToColor=${applyToColor}`,
      {
        method: "DELETE",
        headers: adminApiHeaders(request),
        cache: "no-store",
      },
    );
    const body = await response.json().catch(() => ({ message: "Unable to remove SKU photo" }));
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to remove SKU photo" },
      { status: 502 },
    );
  }
}
