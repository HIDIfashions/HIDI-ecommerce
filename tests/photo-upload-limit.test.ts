import assert from "node:assert/strict";
import { test } from "node:test";
import { AdminInventoryService } from "../apps/api/src/admin/admin-inventory.service.js";
const MAX = 40 * 1024 * 1024;
function fixture() {
  const writes: any[] = [];
  const db: any = {
    productVariant: { findUnique: async () => ({ id: "fixture_variant", productId: "fixture_product", product: { status: "ACTIVE", slug: "fixture" } }) },
    product: { findUnique: async () => ({ status: "ACTIVE", slug: "fixture" }) },
    $queryRaw: async () => [{ id: "fixture_product" }],
    adminMediaUploadTicket: { deleteMany: async () => ({}), create: async (args: any) => { writes.push(args.data); } },
  };
  db.$transaction = async (fn: any) => fn(db);
  return { service: new AdminInventoryService(db), writes };
}
test("photo tickets accept 5, 8, 10, 12, 30 and exactly 40 MiB for all retained formats", async () => {
  const { service, writes } = fixture();
  for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
    for (const sizeBytes of [5, 8, 10, 12, 30, 40].map(n => n * 1024 * 1024)) {
      const result = await service.createVariantImageUploadTicket("fixture_variant", { mimeType, sizeBytes });
      assert.equal(typeof result.token, "string");
      assert.equal(writes.at(-1).maxBytes, sizeBytes);
      assert.equal(writes.at(-1).mimeType, mimeType);
    }
  }
  assert.equal(writes.length, 24);
});
test("oversize, empty and malformed sizes are denied before any upload ticket write", async () => {
  const { service, writes } = fixture();
  for (const sizeBytes of [MAX + 1, 41 * 1024 * 1024, 0, -1, NaN, Infinity, 1.5]) {
    await assert.rejects(() => service.createVariantImageUploadTicket("fixture_variant", { mimeType: "image/jpeg", sizeBytes }), /no larger than 40 MiB/);
  }
  assert.equal(writes.length, 0);
});
test("larger uploads keep the existing format restriction", async () => {
  const { service, writes } = fixture();
  for (const mimeType of ["image/gif", "application/pdf", "image/svg+xml", ""]) {
    await assert.rejects(() => service.createVariantImageUploadTicket("fixture_variant", { mimeType, sizeBytes: MAX }), /JPEG, PNG, WebP or AVIF/);
  }
  assert.equal(writes.length, 0);
});

