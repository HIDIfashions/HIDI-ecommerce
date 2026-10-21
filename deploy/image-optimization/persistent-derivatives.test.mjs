import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  PRODUCT_DERIVATIVE_WIDTHS,
  productMediaKey,
  productDerivativeKey,
  productDerivativeUrl,
  productDerivativeSrcSet,
  preferredProductDerivative,
} from "../../apps/web/lib/product-image-derivatives.mjs";
import { createAndUploadProductDerivatives } from "../../apps/web/lib/photo-derivatives.mjs";

const require = createRequire(import.meta.url);
const sharp = require(process.env.HIDI_TEST_SHARP || "sharp");

test("maps HIDI Azure media URLs to deterministic derivative keys", () => {
  const source = "https://hidiindia.com/media/products/variants/abc_123/photo.test.jpg";
  assert.equal(productMediaKey(source), "products/variants/abc_123/photo.test.jpg");
  assert.equal(
    productDerivativeKey("products/variants/abc_123/photo.test.jpg", 640),
    "products/_derivatives/v1/variants/abc_123/photo.test/w640.webp",
  );
  assert.equal(
    productDerivativeUrl(source, 640),
    "/media/products/_derivatives/v1/variants/abc_123/photo.test/w640.webp",
  );
  assert.equal(
    productDerivativeUrl("https://media.thehidi.com/products/variants/abc_123/photo.jpg", 1080),
    "https://media.thehidi.com/products/_derivatives/v1/variants/abc_123/photo/w1080.webp",
  );
});

test("strips the legacy display proxy marker before deriving paths", () => {
  assert.equal(
    productMediaKey("/media/products/_display_v2/variants/abc/photo.jpg?hidi_image=3"),
    "products/variants/abc/photo.jpg",
  );
});

test("rejects unsupported and traversal media paths", () => {
  for (const source of [
    "https://example.com/media/products/variants/a/x.jpg",
    "/media/products/../private/x.jpg",
    "/media/products/_derivatives/v1/variants/a/x/w640.webp",
    "javascript:alert(1)",
  ]) assert.equal(productMediaKey(source), null);
  assert.equal(productDerivativeKey("products/variants/a/x.jpg", 777), null);
});

test("builds responsive srcset only from approved widths", () => {
  const source = "/media/products/variants/abc/photo.jpg";
  const set = productDerivativeSrcSet(source, [384, 640, 1080]);
  assert.match(set, /w384\.webp 384w/);
  assert.match(set, /w640\.webp 640w/);
  assert.match(set, /w1080\.webp 1080w/);
  assert.equal(preferredProductDerivative(source, 1000), "/media/products/_derivatives/v1/variants/abc/photo/w1080.webp");
  assert.deepEqual(PRODUCT_DERIVATIVE_WIDTHS, [384, 640, 828, 1080, 1200, 1920]);
});

test("creates bounded WebP derivatives and persists immutable metadata", async t => {
  const directory = await mkdtemp(join(tmpdir(), "hidi-derivative-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = await sharp({
    create: { width: 1200, height: 1800, channels: 3, background: { r: 120, g: 90, b: 70 } },
  }).jpeg({ quality: 90 }).toBuffer();
  const path = join(directory, "source.jpg");
  await writeFile(path, source);
  const photo = {
    path,
    size: source.length,
    sha256: createHash("sha256").update(source).digest("hex"),
  };

  const saved = new Map();
  const container = {
    getBlockBlobClient(key) {
      return {
        async uploadData(bytes, options) {
          assert.equal(options.blobHTTPHeaders.blobContentType, "image/webp");
          assert.equal(options.blobHTTPHeaders.blobCacheControl, "public, max-age=31536000, immutable");
          assert.equal(options.metadata.hidi_source_sha256, photo.sha256);
          saved.set(key, Buffer.from(bytes));
        },
      };
    },
  };

  const results = await createAndUploadProductDerivatives(
    container,
    "products/variants/abc/source.jpg",
    photo,
    { widths: [384, 640], processor: sharp },
  );

  assert.equal(results.length, 2);
  assert.equal(saved.size, 2);
  for (const result of results) {
    const bytes = saved.get(result.key);
    assert.ok(bytes);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.ok(metadata.width <= result.width);
    assert.ok(bytes.length < source.length);
    assert.equal(result.created, true);
  }
});

test("rejects an invalid derivative request before writing", async () => {
  await assert.rejects(
    () => createAndUploadProductDerivatives(
      { getBlockBlobClient() { throw new Error("must not write"); } },
      "products/variants/abc/source.jpg",
      { path: "/tmp/none", sha256: "a".repeat(64) },
      { widths: [777], processor: sharp },
    ),
    /Invalid product derivative widths/,
  );
});
