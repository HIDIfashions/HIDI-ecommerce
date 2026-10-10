import { unzipEntries } from "@/lib/hidi-spreadsheet";
import type { InventoryRowLite } from "@/lib/hidi-bulk-import";
import { skuKey } from "@/lib/hidi-bulk-import";

export type PhotoCandidate = { file: File; sourceName: string; sku: string | null; variantId: string | null; error: string | null };
const IMAGE_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };
const MAX_FILE = 12 * 1024 * 1024;
const MAX_PHOTOS = 1000;

function basename(value: string) { return value.replace(/\\/g, "/").split("/").pop() ?? value; }
function extension(value: string) { return basename(value).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ""; }
function stem(value: string) { return basename(value).replace(/\.[^.]+$/, ""); }
function matchSku(name: string, variants: InventoryRowLite[]) {
  const value = skuKey(stem(name));
  const sorted = [...variants].sort((a, b) => b.sku.length - a.sku.length);
  return sorted.find(row => {
    const sku = skuKey(row.sku);
    return value === sku || value.startsWith(`${sku}_`) || value.startsWith(`${sku}__`);
  }) ?? null;
}
function candidate(file: File, sourceName: string, variants: InventoryRowLite[]): PhotoCandidate {
  const ext = extension(sourceName); const matched = matchSku(sourceName, variants);
  let error: string | null = null;
  if (!IMAGE_TYPES[ext]) error = "Unsupported image type.";
  else if (file.size < 1) error = "Image is empty.";
  else if (file.size > MAX_FILE) error = "Image exceeds 12 MB.";
  else if (!matched) error = "Filename does not begin with a known SKU followed by _.";
  return { file, sourceName, sku: matched?.sku ?? null, variantId: matched?.variantId ?? null, error };
}

export async function photoCandidatesFromFiles(files: File[], variants: InventoryRowLite[]) {
  if (files.length > MAX_PHOTOS) throw new Error(`Select at most ${MAX_PHOTOS.toLocaleString("en-IN")} photos per batch.`);
  return files.map(file => candidate(file, file.name, variants));
}

export async function photoCandidatesFromZip(file: File, variants: InventoryRowLite[]) {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Choose a .zip file.");
  if (file.size > 250 * 1024 * 1024) throw new Error("ZIP is larger than 250 MB. Split it into smaller batches.");
  const entries = await unzipEntries(await file.arrayBuffer(), 2200, 600 * 1024 * 1024);
  const images: PhotoCandidate[] = [];
  for (const [name, data] of entries) {
    const ext = extension(name); if (!IMAGE_TYPES[ext]) continue;
    const bytes = new Uint8Array(data.byteLength); bytes.set(data); const f = new File([bytes.buffer], basename(name), { type: IMAGE_TYPES[ext] }); images.push(candidate(f, name, variants));
  }
  if (!images.length) throw new Error("No JPG, PNG, WebP or AVIF images were found in the ZIP.");
  if (images.length > MAX_PHOTOS) throw new Error(`ZIP contains ${images.length} images. Split it into batches of at most ${MAX_PHOTOS}.`);
  return images;
}

export async function uploadPhotoCandidate(item: PhotoCandidate, applyToColor: boolean) {
  if (!item.variantId || item.error) throw new Error(item.error ?? "Photo is not matched to a SKU.");
  const form = new FormData(); form.set("file", item.file); form.set("applyToColor", String(applyToColor));
  const response = await fetch(`/api/admin/inventory/${encodeURIComponent(item.variantId)}/images`, { method: "POST", body: form, credentials: "same-origin" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : `Unable to upload ${item.sourceName}.`);
  return body;
}
