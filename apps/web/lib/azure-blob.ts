import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

let service: BlobServiceClient | undefined;
export function productMediaContainer() {
  const account = process.env.AZURE_STORAGE_ACCOUNT?.trim() ?? "";
  if (!/^[a-z0-9]{3,24}$/.test(account)) throw new Error("AZURE_STORAGE_ACCOUNT is not configured");
  service ??= new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential());
  return service.getContainerClient("product-media");
}

export async function uploadProductImage(key: string, bytes: Buffer, contentType: string) {
  if (!key.startsWith("products/") || key.includes("..")) throw new Error("Invalid product image key");
  const base = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base || !base.startsWith("https://")) throw new Error("MEDIA_PUBLIC_BASE_URL must be an HTTPS media origin");
  const blob = productMediaContainer().getBlockBlobClient(key);
  try {
    await blob.uploadData(bytes, {
      conditions: { ifNoneMatch: "*" },
      blobHTTPHeaders: { blobContentType: contentType, blobCacheControl: "public, max-age=31536000, immutable" },
    });
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (!/^products\/variants\/[a-z0-9_-]+\/batch-[a-f0-9]{64}\.(?:jpg|png|webp|avif)$/.test(key) || ![409, 412].includes(status ?? 0)) throw error;
    const saved = await blob.getProperties();
    if (saved.contentLength !== bytes.length || saved.contentType !== contentType || !(await blob.downloadToBuffer(0, bytes.length)).equals(bytes)) {
      throw new Error("Saved batch image differs from this upload");
    }
  }
  return { url: `${base}/${key}`, storagePath: `azure://product-media/${key}` };
}

import { uploadDiskPhotoToBlob } from "./photo-azure-stream.mjs";
import type { DiskPhoto } from "./photo-upload-stream.mjs";
import { persistProductDerivatives } from "./product-image-derivative-store.mjs";

export async function uploadProductImageFile(key: string, photo: DiskPhoto, contentType: string) {
  if (!key.startsWith("products/") || key.includes("..")) throw new Error("Invalid product image key");
  const base = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base || !base.startsWith("https://")) throw new Error("MEDIA_PUBLIC_BASE_URL must be an HTTPS media origin");
  const blob = productMediaContainer().getBlockBlobClient(key);
  await uploadDiskPhotoToBlob(blob, photo, contentType);
  return { url: `${base}/${key}`, storagePath: `azure://product-media/${key}` };
}


/**
 * Persist the common storefront sizes beside the immutable Azure original.
 * Metadata is attached only after all derivatives exist, so a successful
 * admin upload never points shoppers at a half-prepared new photo.
 */
export async function ensureProductImageDerivatives(key: string, photo: DiskPhoto) {
  return persistProductDerivatives(productMediaContainer(), key, photo);
}
