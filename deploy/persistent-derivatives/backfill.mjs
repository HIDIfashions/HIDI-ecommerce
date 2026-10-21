/** Backfill persistent Azure derivatives for already-published HIDI product photos.
 * Read-only by default. Set HIDI_DERIVATIVE_BACKFILL_WRITE=YES only after review.
 */
import { productMediaContainer } from "../../apps/web/lib/azure-blob.ts";
import { productMediaKey, PRODUCT_DERIVATIVE_WIDTHS } from "../../apps/web/lib/product-image-derivatives.mjs";
import { createAndUploadProductDerivatives } from "../../apps/web/lib/photo-derivatives.mjs";
import { downloadPhotoToDisk } from "../collection-speed/photo-disk.mjs";

const catalogUrl = process.env.HIDI_DERIVATIVE_CATALOG_URL || "https://hidiindia.com/api/store/products";
const write = process.env.HIDI_DERIVATIVE_BACKFILL_WRITE === "YES";
const limit = process.env.HIDI_DERIVATIVE_BACKFILL_LIMIT ? Number(process.env.HIDI_DERIVATIVE_BACKFILL_LIMIT) : Infinity;
if (!Number.isFinite(limit) && limit !== Infinity) throw new Error("Invalid HIDI_DERIVATIVE_BACKFILL_LIMIT");

const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(30000), redirect: "error" });
if (!response.ok) throw new Error(`Unable to read published catalogue: HTTP ${response.status}`);
const products = await response.json();
if (!Array.isArray(products)) throw new Error("Published catalogue did not return an array");

const sources = new Map();
for (const product of products) {
  const images = [
    ...(Array.isArray(product?.images) ? product.images : []),
    ...(Array.isArray(product?.variants) ? product.variants.flatMap(variant => Array.isArray(variant?.images) ? variant.images : []) : []),
  ];
  for (const image of images) {
    const key = productMediaKey(image?.url);
    if (key && !sources.has(key)) sources.set(key, image.url);
  }
}

const selected = [...sources.keys()].slice(0, Number.isFinite(limit) ? Math.max(0, limit) : undefined);
console.log(JSON.stringify({
  mode: write ? "WRITE" : "DRY_RUN",
  catalogUrl,
  publishedProducts: products.length,
  azureOriginals: sources.size,
  selected: selected.length,
  widths: PRODUCT_DERIVATIVE_WIDTHS,
}, null, 2));

if (!write) {
  for (const key of selected.slice(0, 50)) console.log("PLAN", key);
  if (selected.length > 50) console.log(`... ${selected.length - 50} more`);
  process.exit(0);
}

if (process.env.MEDIA_STORAGE_PROVIDER !== "azure") {
  throw new Error("Backfill write requires MEDIA_STORAGE_PROVIDER=azure");
}

const container = productMediaContainer();
const results = [];
for (const key of selected) {
  const sourceUrl = new URL(`/media/${key}`, "https://hidiindia.com");
  const signal = AbortSignal.timeout(600000);
  const sourceResponse = await fetch(sourceUrl, { signal, redirect: "error" });
  const photo = await downloadPhotoToDisk(sourceResponse, { signal });
  try {
    const derivatives = await createAndUploadProductDerivatives(container, key, photo, { signal });
    results.push({ key, status: "READY", derivatives: derivatives.map(item => ({ width: item.width, bytes: item.bytes, created: item.created })) });
    console.log("READY", key);
  } catch (error) {
    results.push({ key, status: "FAILED", error: error instanceof Error ? error.message : String(error) });
    console.error("FAILED", key, error);
  } finally {
    await photo.cleanup();
  }
}

const failed = results.filter(item => item.status === "FAILED");
console.log(JSON.stringify({ processed: results.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
