/** Read-only audit of published HIDI catalogue media before derivative backfill. */
import { productMediaKey } from "../../apps/web/lib/product-image-derivatives.mjs";

const catalogUrl = process.env.HIDI_DERIVATIVE_CATALOG_URL || "https://hidiindia.com/api/store/products";
const maxChecks = process.env.HIDI_DERIVATIVE_AUDIT_LIMIT ? Number(process.env.HIDI_DERIVATIVE_AUDIT_LIMIT) : 400;
if (!Number.isSafeInteger(maxChecks) || maxChecks < 0 || maxChecks > 2000) throw new Error("Invalid HIDI_DERIVATIVE_AUDIT_LIMIT");

const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(30000), redirect: "error" });
if (!response.ok) throw new Error(`Unable to read published catalogue: HTTP ${response.status}`);
const products = await response.json();
if (!Array.isArray(products)) throw new Error("Published catalogue did not return an array");

const images = new Map();
for (const product of products) {
  const rows = [
    ...(Array.isArray(product?.images) ? product.images : []),
    ...(Array.isArray(product?.variants) ? product.variants.flatMap(variant => Array.isArray(variant?.images) ? variant.images : []) : []),
  ];
  for (const image of rows) {
    const url = typeof image?.url === "string" ? image.url : "";
    if (!url || images.has(url)) continue;
    images.set(url, {
      url,
      productId: product?.id ?? null,
      slug: product?.slug ?? null,
      productName: product?.name ?? null,
      azureKey: productMediaKey(url),
    });
  }
}

function classify(url, azureKey) {
  if (azureKey) return "azure-derivable";
  try {
    const parsed = new URL(url, "https://hidiindia.com");
    if (parsed.hostname.endsWith(".supabase.co")) return "supabase";
    if (parsed.origin === "https://hidiindia.com" && parsed.pathname.startsWith("/media/")) return "hidi-media-unsupported-path";
    return parsed.protocol === "https:" ? "external-https" : "unsupported";
  } catch {
    return "invalid";
  }
}

const entries = [...images.values()].map(item => ({ ...item, kind: classify(item.url, item.azureKey) }));
const counts = entries.reduce((all, item) => {
  all[item.kind] = (all[item.kind] || 0) + 1;
  return all;
}, {});

const derivable = entries.filter(item => item.azureKey).slice(0, maxChecks);
const checks = [];
let cursor = 0;
const workers = Array.from({ length: Math.min(4, derivable.length || 1) }, async () => {
  while (cursor < derivable.length) {
    const index = cursor++;
    const item = derivable[index];
    const publicUrl = new URL("/media/" + item.azureKey, "https://hidiindia.com");
    const result = { key: item.azureKey, slug: item.slug, ok: false, status: 0, type: null, declaredBytes: null };
    try {
      const source = await fetch(publicUrl, {
        method: "GET",
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      result.status = source.status;
      result.type = (source.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() || null;
      const declared = source.headers.get("content-length");
      result.declaredBytes = declared && /^\d+$/.test(declared) ? Number(declared) : null;
      result.ok = source.ok && Boolean(result.type?.startsWith("image/")) && (result.declaredBytes === null || result.declaredBytes > 0);
      await source.body?.cancel().catch(() => {});
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    checks[index] = result;
  }
});
await Promise.all(workers);

const failed = checks.filter(item => !item.ok);
const report = {
  readOnly: true,
  productionChanged: false,
  catalogUrl,
  publishedProducts: products.length,
  uniqueImageUrls: entries.length,
  counts,
  checkedAzureOriginals: checks.length,
  accessibleAzureOriginals: checks.length - failed.length,
  failedAzureOriginals: failed.length,
  unsupportedExamples: entries.filter(item => !item.azureKey).slice(0, 25).map(item => ({ kind: item.kind, url: item.url, slug: item.slug })),
  failedOriginals: failed,
};

console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
