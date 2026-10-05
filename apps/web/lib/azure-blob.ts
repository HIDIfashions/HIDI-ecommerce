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
  await blob.uploadData(bytes, {
    conditions: { ifNoneMatch: "*" },
    blobHTTPHeaders: { blobContentType: contentType, blobCacheControl: "public, max-age=31536000, immutable" },
  });
  return { url: `${base}/${key}`, storagePath: `azure://product-media/${key}` };
}
