import { ensureProductImageDerivatives, uploadProductImageFile } from "@/lib/azure-blob";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";

import { readStreamedPhotoForm, acquirePhotoUploadSlot, PhotoUploadError, type DiskPhoto, type StreamedPhotoForm } from "@/lib/photo-upload-stream.mjs";
import { createReadStream } from "node:fs";
import { middleware as uploadDomainPolicy } from "@/middleware";
import { authorizePhotoUpload } from "@/lib/photo-upload-authorize.mjs";

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
// No fixed per-photo byte cap. Streamed ingestion checks available storage.
const DEFAULT_R2_BUCKET = "hidi-product-media-prod";

type R2UploadResult = {
  url: string;
  storagePath: string;
};

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

async function saveImageMetadata(request: NextRequest, variantId: string, payload: Record<string, unknown>) {
  return fetch(`${API_URL}/admin/inventory/${encodeURIComponent(variantId)}/images`, {
    method: "POST",
    headers: { "content-type": "application/json", ...adminApiHeaders(request) },
    body: JSON.stringify(payload),
  });
}

async function createUploadTicket(request: NextRequest, variantId: string, file: DiskPhoto) {
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

function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET?.trim() || DEFAULT_R2_BUCKET;
  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL?.trim() ?? "").replace(/\/$/, "");

  const missing = [
    ["R2_ACCOUNT_ID", accountId],
    ["R2_ACCESS_KEY_ID", accessKeyId],
    ["R2_SECRET_ACCESS_KEY", secretAccessKey],
    ["R2_PUBLIC_BASE_URL", publicBaseUrl],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Cloudflare R2 is missing ${missing.join(", ")} in the web server configuration`);
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function sha256Hex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function amzTimestamp(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function imageExtension(mimeType: string) {
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  } as Record<string, string>)[mimeType] ?? "jpg";
}

function objectKey(variantId: string, mimeType: string, uploadKey?: string) {
  const cleanVariant = variantId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "variant";
  return `products/variants/${cleanVariant}/${uploadKey ? `batch-${uploadKey}` : `${Date.now()}-${randomUUID()}`}.${imageExtension(mimeType)}`;
}

function signingKey(secretAccessKey: string, dateStamp: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function encodeS3Path(bucket: string, key: string) {
  return `/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function uploadToR2(variantId: string, file: DiskPhoto): Promise<R2UploadResult> {
  const config = getR2Config();
  const key = objectKey(variantId, file.type);
  const body = createReadStream(file.path);
  const payloadHash = file.sha256;
  const now = new Date();
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = encodeS3Path(config.bucket, key);
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `content-type:${file.type}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(signingKey(config.secretAccessKey, dateStamp), stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const upload = await fetch(`https://${host}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": file.type,
      "Content-Length": String(file.size),
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
    },
    body: body as unknown as BodyInit,
    signal: AbortSignal.timeout(600_000),
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!upload.ok) {
    const message = await upload.text().catch(() => "");
    throw new Error(message || `Cloudflare R2 rejected the image upload with HTTP ${upload.status}`);
  }

  return {
    url: `${config.publicBaseUrl}/${key}`,
    storagePath: `r2://${config.bucket}/${key}`,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ variantId: string }> },
) {
  const domainPolicy = uploadDomainPolicy(request);
  if (domainPolicy.status !== 200) return domainPolicy;
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Admin session expired" }, { status: 401 });
  const { variantId } = await context.params;
  let releasePhotoUpload: (() => void) | undefined;
  let photoForm: StreamedPhotoForm | undefined;

  try {
    await authorizePhotoUpload(request, API_URL, adminApiHeaders(request));
    if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
      const payload = await request.json().catch(() => null);
      if (!payload) return NextResponse.json({ message: "Photo or image URL is required" }, { status: 400 });
      const response = await saveImageMetadata(request, variantId, payload);
      const body = await response.json().catch(() => ({ message: "Unable to attach SKU photo" }));
      return NextResponse.json(body, { status: response.status });
    }

    releasePhotoUpload = acquirePhotoUploadSlot();
    const form = await readStreamedPhotoForm(request);
    photoForm = form;
    const file = form.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ message: "Choose an image file" }, { status: 400 });
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ message: "Use a JPEG, PNG, WebP or AVIF image" }, { status: 400 });
    }
    if (!Number.isSafeInteger(file.size) || file.size < 1) {
      return NextResponse.json({ message: "Choose a valid non-empty photo" }, { status: 400 });
    }

    let uploadKey: string | undefined;
    const imageSku = String(form.get("imageSku") ?? "");
    if (imageSku) {
      const photoNumber = String(form.get("photoNumber") ?? "");
      if (!/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/.test(imageSku) || imageSku.length > 64 || !/^[1-9]\d{0,3}$/.test(photoNumber)) return NextResponse.json({ message: "Invalid Image SKU or photo number" }, { status: 400 });
      if (process.env.MEDIA_STORAGE_PROVIDER !== "azure") return NextResponse.json({ message: "Image SKU uploads require the configured Azure photo storage" }, { status: 503 });
      uploadKey = sha256Hex([imageSku, photoNumber, file.type, file.sha256].join("\u0000"));
    }
    await createUploadTicket(request, variantId, file);
    let uploaded: R2UploadResult;
    if (process.env.MEDIA_STORAGE_PROVIDER === "azure") {
      const key = objectKey(variantId, file.type, uploadKey);
      uploaded = await uploadProductImageFile(key, file, file.type);
      try {
        await ensureProductImageDerivatives(key, file);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown processing error";
        throw new Error(`Photo original was stored, but shopper-ready images could not be prepared: ${detail}. Retry the upload; the original is immutable and safe.`);
      }
    } else {
      uploaded = await uploadToR2(variantId, file);
    }

    const response = await saveImageMetadata(request, variantId, {
      url: uploaded.url,
      storagePath: uploaded.storagePath,
      alt: String(form.get("alt") ?? ""),
      applyToColor: String(form.get("applyToColor") ?? "false") === "true",
      isMain: String(form.get("isMain") ?? "false") === "true",
    });
    const body = await response.json().catch(() => ({ message: "Photo uploaded, but it could not be attached to the SKU" }));
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to upload SKU photo" },
      { status: error instanceof PhotoUploadError ? error.status : 502 },
    );
  } finally {
    try { await photoForm?.cleanup(); } finally { releasePhotoUpload?.(); }
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ variantId: string }> },
) {
  const domainPolicy = uploadDomainPolicy(request);
  if (domainPolicy.status !== 200) return domainPolicy;
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

