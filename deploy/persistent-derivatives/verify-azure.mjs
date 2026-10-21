/** Read-only production verification for persistent product-image derivatives. */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  PRODUCT_DERIVATIVE_WIDTHS,
  productDerivativeKey,
  productMediaKey,
} from "../../apps/web/lib/product-image-derivatives.mjs";

const require = createRequire(resolve("apps/web/package.json"));
const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");

const account = process.env.AZURE_STORAGE_ACCOUNT?.trim() ?? "";
if (!/^[a-z0-9]{3,24}$/.test(account)) throw new Error("AZURE_STORAGE_ACCOUNT is not configured");
const catalogUrl = process.env.HIDI_DERIVATIVE_CATALOG_URL || "https://hidiindia.com/api/store/products";
const sampleLimit = process.env.HIDI_DERIVATIVE_VERIFY_LIMIT ? Number(process.env.HIDI_DERIVATIVE_VERIFY_LIMIT) : Infinity;
if ((!Number.isFinite(sampleLimit) && sampleLimit !== Infinity) || sampleLimit < 0) throw new Error("Invalid HIDI_DERIVATIVE_VERIFY_LIMIT");

const catalogResponse = await fetch(catalogUrl, { signal: AbortSignal.timeout(30000), redirect: "error" });
if (!catalogResponse.ok) throw new Error(`Unable to read published catalogue: HTTP ${catalogResponse.status}`);
const products = await catalogResponse.json();
if (!Array.isArray(products)) throw new Error("Published catalogue did not return an array");

const keys = new Set();
for (const product of products) {
  const images = [
    ...(Array.isArray(product?.images) ? product.images : []),
    ...(Array.isArray(product?.variants) ? product.variants.flatMap(variant => Array.isArray(variant?.images) ? variant.images : []) : []),
  ];
  for (const image of images) {
    const key = productMediaKey(image?.url);
    if (key) keys.add(key);
  }
}

const selected = [...keys].slice(0, Number.isFinite(sampleLimit) ? sampleLimit : undefined);
const container = new BlobServiceClient(
  `https://${account}.blob.core.windows.net`,
  new DefaultAzureCredential(),
).getContainerClient("product-media");

const results = [];
for (const key of selected) {
  const item = { key, original: null, derivatives: [], status: "READY" };
  try {
    const original = await container.getBlobClient(key).getProperties({ abortSignal: AbortSignal.timeout(15000) });
    item.original = {
      bytes: original.contentLength ?? null,
      type: original.contentType ?? null,
      sourceHash: original.metadata?.hidi_source_sha256 ?? null,
    };
    const derivativeHashes = new Set();
    for (const width of PRODUCT_DERIVATIVE_WIDTHS) {
      const derivativeKey = productDerivativeKey(key, width);
      if (!derivativeKey) throw new Error("Unable to derive expected key");
      const props = await container.getBlobClient(derivativeKey).getProperties({ abortSignal: AbortSignal.timeout(15000) });
      const sourceHash = props.metadata?.hidi_source_sha256 ?? null;
      if (sourceHash) derivativeHashes.add(sourceHash);
      if (props.contentType !== "image/webp" || !props.contentLength || props.contentLength > 10 * 1024 * 1024) {
        throw new Error(`Invalid ${width}px derivative properties`);
      }
      if (props.metadata?.hidi_derivative_width !== String(width) || props.metadata?.hidi_derivative_version !== "v1") {
        throw new Error(`Invalid ${width}px derivative metadata`);
      }
      item.derivatives.push({ width, bytes: props.contentLength, sourceHash });
    }
    if (derivativeHashes.size !== 1) throw new Error("Derivative source hashes disagree");
    if (item.original.sourceHash && !derivativeHashes.has(item.original.sourceHash)) throw new Error("Derivative hash does not match original metadata");
  } catch (error) {
    item.status = "FAILED";
    item.error = error instanceof Error ? error.message : String(error);
  }
  results.push(item);
  console.log(item.status, key);
}

const failed = results.filter(item => item.status !== "READY");
const report = {
  readOnly: true,
  productionChanged: false,
  catalogUrl,
  publishedProducts: products.length,
  azureOriginals: keys.size,
  verified: results.length,
  ready: results.length - failed.length,
  failed: failed.length,
  widths: PRODUCT_DERIVATIVE_WIDTHS,
  results,
};
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
