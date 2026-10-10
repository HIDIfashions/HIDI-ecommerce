import assert from "node:assert/strict";
import test from "node:test";
import { AdminProductsService } from "../apps/api/src/admin/products/admin-products.service.js";
import { AdminProductsController } from "../apps/api/src/admin/products/admin-products.controller.js";
import { parseDelete, parseDeleteCleanup, productMediaKeys } from "../apps/api/src/admin/products/product-input.js";
import { AdminInventoryService } from "../apps/api/src/admin/admin-inventory.service.js";

const timestamp = "2026-10-10T10:00:00.000Z";
const confirmation = () => ({ confirmName: "Olive Kurta", expectedUpdatedAt: timestamp });

function fixture(options: { status?: string; reserved?: number; reservations?: number; shared?: boolean; sharedAlias?: boolean; transactionFailure?: boolean } = {}) {
  let state: any = {
    product: { id: "product_1", name: "Olive Kurta", slug: "olive-kurta", status: options.status ?? "ACTIVE", updatedAt: new Date(timestamp), category: null, collections: [] },
    variants: [{ id: "variant_1", productId: "product_1", sku: "OLIVE-M", size: "M", color: "Olive", active: true, pricePaise: 249900, inventory: { onHand: 12, reserved: options.reserved ?? 0 } }],
    productImages: [{ id: "photo_1", productId: "product_1", url: "https://media.example.test/products/olive.jpg", position: 0 }],
    variantImages: [{ id: "photo_2", variantId: "variant_1", url: "https://media.example.test/products/olive.jpg", storagePath: "azure://product-media/products/olive.jpg", position: 0 }],
    foreignProductImages: [{ id: "foreign_1", productId: "product_2", url: options.shared ? "https://media.example.test/products/olive.jpg" : options.sharedAlias ? "/media/products/%6Flive.jpg" : "https://media.example.test/products/other.jpg" }],
    foreignVariantImages: [{ id: "foreign_2", variantId: "variant_2", url: `https://different-cdn.example.test/products/${options.shared || options.sharedAlias ? "olive" : "other"}.jpg`, storagePath: options.shared ? "azure://product-media/products/olive.jpg" : options.sharedAlias ? "azure://account/product-media/products/olive.jpg" : "azure://product-media/products/other.jpg" }],
    cartItems: [{ id: "cartitem_1", productId: "product_1" }, { id: "cartitem_2", productId: "product_2" }],
    orderItems: [{ id: "orderitem_1", productId: "product_1", productName: "Olive Kurta", sku: "OLIVE-M", quantity: 1, totalPaise: 249900 }],
    receipts: [{ id: "receipt_1", variantId: "variant_1", acceptedQuantity: 12 }],
    movements: [{ id: "movement_1", inventoryId: "inventory_1", delta: 12 }],
  };
  const calls: any[] = [];
  const record = (name: string, args: unknown) => calls.push({ name, args: structuredClone(args) });
  const detail = () => ({ ...structuredClone(state.product), images: structuredClone(state.productImages), variants: structuredClone(state.variants).map((variant: any) => ({ ...variant, images: structuredClone(state.variantImages.filter((image: any) => image.variantId === variant.id)) })) });
  const foreignMatches = (row: any, query: any) => query.where.id?.in ? query.where.id.in.includes(row.id) : query.where.OR
    ? query.where.OR.some((condition: any) => condition.url?.in?.includes(row.url) || condition.storagePath?.in?.includes(row.storagePath) || (condition.url?.contains && row.url?.includes(condition.url.contains)) || (condition.storagePath?.contains && row.storagePath?.includes(condition.storagePath.contains)))
    : query.where.url?.in ? query.where.url.in.includes(row.url) : true;
  const db: any = {
    product: {
      findUnique: async (args: any) => args.where.id === state.product.id ? detail() : null,
      findMany: async (args: any) => { record("product.findMany", args); return args.where.status?.not === state.product.status ? [] : [detail()]; },
      count: async (args: any) => args.where.status?.not === state.product.status ? 0 : 1,
      update: async (args: any) => { record("product.update", args); Object.assign(state.product, args.data); return detail(); },
    },
    productVariant: { updateMany: async (args: any) => { record("productVariant.updateMany", args); state.variants.forEach((row: any) => Object.assign(row, args.data)); return { count: state.variants.length }; } },
    cartItem: { deleteMany: async (args: any) => { record("cartItem.deleteMany", args); const previous = state.cartItems.length; state.cartItems = state.cartItems.filter((row: any) => row.productId !== args.where.productId); return { count: previous - state.cartItems.length }; } },
    inventoryReservation: { count: async (args: any) => { record("inventoryReservation.count", args); return options.reservations ?? 0; } },
    productImage: {
      findMany: async (args: any) => state.foreignProductImages.filter((row: any) => foreignMatches(row, args)),
      count: async (args: any) => state.foreignProductImages.filter((row: any) => foreignMatches(row, args)).length,
      deleteMany: async (args: any) => { record("productImage.deleteMany", args); const previous = state.productImages.length; state.productImages = state.productImages.filter((row: any) => !args.where.id.in.includes(row.id)); return { count: previous - state.productImages.length }; },
    },
    productVariantImage: {
      findMany: async (args: any) => state.foreignVariantImages.filter((row: any) => foreignMatches(row, args)),
      count: async (args: any) => state.foreignVariantImages.filter((row: any) => foreignMatches(row, args)).length,
      deleteMany: async (args: any) => { record("productVariantImage.deleteMany", args); const previous = state.variantImages.length; state.variantImages = state.variantImages.filter((row: any) => !args.where.id.in.includes(row.id)); return { count: previous - state.variantImages.length }; },
    },
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join("?"); record("lock", { sql, values });
      return sql.includes('FROM "Inventory"') ? [{ reserved: state.variants[0].inventory.reserved }] : [{ id: state.product.id }];
    },
  };
  db.$transaction = async (callback: any, args: any) => {
    record("transaction", args); const previous = structuredClone(state);
    try { const result = await callback(db); if (options.transactionFailure) throw new Error("Simulated commit failure"); return result; }
    catch (error) { state = previous; throw error; }
  };
  return { service: new AdminProductsService(db), calls, state: () => structuredClone(state) };
}

test("deletion validates an explicit name and version and cleanup rejects unbounded or unknown input", () => {
  assert.equal(parseDelete(confirmation()).confirmName, "Olive Kurta");
  for (const payload of [{}, { ...confirmation(), force: true }, { ...confirmation(), expectedUpdatedAt: "bad" }, { ...confirmation(), confirmName: 1 }]) assert.throws(() => parseDelete(payload));
  assert.deepEqual(parseDeleteCleanup({ productImageIds: ["photo_1", "photo_1"] }), { productImageIds: ["photo_1"], variantImageIds: [] });
  for (const payload of [{}, { productImageIds: "photo_1" }, { variantImageIds: Array(201).fill("photo_1") }, { productImageIds: ["../photo"] }, { productImageIds: ["photo_1"], force: true }]) assert.throws(() => parseDeleteCleanup(payload));
});

test("delete removes a catalogue product and its bag items while preserving all stock and order history", async () => {
  const f = fixture(); const before = f.state();
  const result = await f.service.beginDeletion("product_1", confirmation());
  assert.equal(result.status, "DELETED"); assert.equal(result.historyPreserved, true); assert.equal(result.repeated, false);
  assert.equal(f.state().variants[0].active, false); assert.equal(f.state().product.status, "DELETED");
  assert.deepEqual(f.state().cartItems, [{ id: "cartitem_2", productId: "product_2" }]);
  for (const key of ["orderItems", "receipts", "movements", "productImages", "variantImages"]) assert.deepEqual(f.state()[key], before[key]);
  assert.deepEqual(f.state().variants[0].inventory, before.variants[0].inventory);
  assert.equal(result.media.length, 2); assert.ok(result.media.every(row => row.shared === false));
  assert.equal(f.calls[0].args.isolationLevel, "Serializable");
  assert.ok(f.calls.findIndex(row => row.name === "lock" && row.args.sql.includes('FROM "Inventory"')) < f.calls.findIndex(row => row.name === "productVariant.updateMany"));
});

test("wrong name, stale version, missing product, reserved inventory and active checkout all leave state unchanged", async () => {
  for (const options of [{ reserved: 1 }, { reservations: 1 }, {}]) {
    const f = fixture(options); const before = f.state();
    const input = options.reserved || options.reservations ? confirmation() : { ...confirmation(), expectedUpdatedAt: "2026-10-09T10:00:00.000Z" };
    await assert.rejects(() => f.service.beginDeletion("product_1", input), { name: "ConflictException" }); assert.deepEqual(f.state(), before);
  }
  const f = fixture(); const before = f.state();
  await assert.rejects(() => f.service.beginDeletion("product_1", { ...confirmation(), confirmName: "Different Product" }), { name: "BadRequestException" });
  await assert.rejects(() => f.service.beginDeletion("missing", confirmation()), { name: "NotFoundException" }); assert.deepEqual(f.state(), before);
});

test("storage failure leaves a durable queue and same deletion retries safely with the original version", async () => {
  const f = fixture(); const first = await f.service.beginDeletion("product_1", confirmation());
  const after = f.state(); const again = await f.service.beginDeletion("product_1", confirmation());
  assert.equal(again.repeated, true); assert.deepEqual(again.media, first.media); assert.deepEqual(f.state(), after);
  const pending = await f.service.getDeletion("product_1"); assert.equal(pending.pendingMediaCount, 2); assert.equal(pending.complete, false);
  await assert.rejects(() => f.service.get("product_1"), { name: "NotFoundException" });
});

test("shared product-level URLs and variant-level storage paths are preserved across products", async () => {
  const f = fixture({ shared: true }); const result = await f.service.beginDeletion("product_1", confirmation());
  assert.ok(result.media.every(row => row.shared));
  assert.equal(f.state().foreignProductImages.length, 1); assert.equal(f.state().foreignVariantImages.length, 1);
});

test("shared media aliases protect the same object across /media, public HTTPS and both Azure storage-path forms", async () => {
  const f = fixture({ sharedAlias: true }); const result = await f.service.beginDeletion("product_1", confirmation());
  assert.ok(result.media.every(row => row.shared));
  assert.deepEqual(productMediaKeys("/media/products/olive.jpg"), ["products/olive.jpg"]);
  assert.deepEqual(productMediaKeys("https://store.blob.core.windows.net/product-media/products/olive.jpg", "azure://account/product-media/products/olive.jpg"), ["products/olive.jpg"]);
  assert.deepEqual(productMediaKeys("https://evil.test/not-products.jpg", "azure://product-media/brand/hero/media/a.mp4"), []);
});

test("normal photo upload, attachment and removal cannot bypass a product tombstone", async () => {
  const deniedDb: any = {
    productVariant: { findUnique: async () => ({ id: "variant_1", productId: "product_1", color: "Olive", size: "M", product: { name: "Olive Kurta", status: "DELETED" } }) },
    productVariantImage: { findFirst: async () => ({ id: "photo_2", url: "https://media.example.test/products/olive.jpg", storagePath: "azure://product-media/products/olive.jpg", variant: { id: "variant_1", productId: "product_1", product: { status: "DELETED" } } }) },
    $transaction: async () => { assert.fail("Deleted photos must fail before any mutation transaction"); },
  };
  const service = new AdminInventoryService(deniedDb);
  await assert.rejects(() => service.createVariantImageUploadTicket("variant_1", { mimeType: "image/jpeg", sizeBytes: 10 }), { name: "ConflictException" });
  await assert.rejects(() => service.addVariantImage("variant_1", { url: "https://media.example.test/products/new.jpg" }), { name: "ConflictException" });
  await assert.rejects(() => service.removeVariantImage("variant_1", "photo_2"), { name: "ConflictException" });
});

test("a fresh product cannot attach a photo still queued by a deleted product, including public URL aliases", async () => {
  const state = { writes: 0, transactionLevel: "", locks: 0 };
  const db: any = {
    productVariant: {
      findUnique: async () => ({ id: "variant_2", productId: "product_2", color: "Olive", size: "M", product: { name: "New Kurta", status: "ACTIVE" } }),
    },
    product: { findUnique: async () => ({ status: "ACTIVE" }) },
    $queryRaw: async () => { state.locks++; return [{ id: "product_2" }]; },
    productImage: { findMany: async () => [{ url: "/media/products/olive.jpg" }] },
    productVariantImage: { findMany: async () => [], count: async () => 0, upsert: async () => { state.writes++; } },
  };
  db.$transaction = async (fn: any, options: any) => { state.transactionLevel = options.isolationLevel; return fn(db); };
  const service = new AdminInventoryService(db);
  await assert.rejects(() => service.addVariantImage("variant_2", { url: "https://public.example.test/products/olive.jpg", storagePath: "azure://product-media/products/olive.jpg" }), { name: "ConflictException" });
  assert.equal(state.writes, 0); assert.equal(state.locks, 1); assert.equal(state.transactionLevel, "Serializable");
});

test("normal draft product photo attachments still work and recheck deletion inside the write transaction", async () => {
  const writes: any[] = []; let status = "DRAFT";
  const db: any = {
    productVariant: { findUnique: async () => ({ id: "variant_2", productId: "product_2", color: "Olive", size: "M", product: { name: "New Kurta", status: "DRAFT" } }) },
    product: { findUnique: async () => ({ status }) },
    $queryRaw: async () => [{ id: "product_2" }],
    productImage: { findMany: async () => [] },
    productVariantImage: { findMany: async () => [], count: async () => 0, upsert: async (args: any) => { writes.push(args); } },
  };
  db.$transaction = async (fn: any) => fn(db);
  const service = new AdminInventoryService(db);
  await service.addVariantImage("variant_2", { url: "https://media.example.test/products/new.jpg" });
  assert.equal(writes.length, 1); assert.equal(writes[0].create.variantId, "variant_2");
  status = "DELETED";
  await assert.rejects(() => service.addVariantImage("variant_2", { url: "https://media.example.test/products/later.jpg" }), { name: "ConflictException" });
  assert.equal(writes.length, 1);
});

test("cleanup confirms only completed rows, survives partial cleanup and missing-ID replays, and keeps history", async () => {
  const f = fixture(); const before = f.state(); await f.service.beginDeletion("product_1", confirmation());
  const partial = await f.service.finishDeletionCleanup("product_1", { productImageIds: ["photo_1"] });
  assert.equal(partial.pendingMediaCount, 1); assert.equal(partial.complete, false);
  const replay = await f.service.finishDeletionCleanup("product_1", { productImageIds: ["photo_1"] }); assert.equal(replay.removedMetadataCount, 0); assert.equal(replay.pendingMediaCount, 1);
  const complete = await f.service.finishDeletionCleanup("product_1", { variantImageIds: ["photo_2"] });
  assert.equal(complete.complete, true); assert.equal(complete.pendingMediaCount, 0);
  assert.equal((await f.service.getDeletion("product_1")).complete, true);
  for (const key of ["orderItems", "receipts", "movements"]) assert.deepEqual(f.state()[key], before[key]);
});

test("cleanup denies another product's images and nondeleted products without changing metadata", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.finishDeletionCleanup("product_1", { productImageIds: ["photo_1"] }), { name: "ConflictException" });
  await f.service.beginDeletion("product_1", confirmation()); const before = f.state();
  for (const payload of [{ productImageIds: ["foreign_1"] }, { variantImageIds: ["foreign_2"] }, { productImageIds: ["photo_1", "foreign_1"] }]) {
    await assert.rejects(() => f.service.finishDeletionCleanup("product_1", payload), { name: "BadRequestException" }); assert.deepEqual(f.state(), before);
  }
});

test("commit failure rolls deletion back and deleted catalogue entries cannot be republished", async () => {
  const failed = fixture({ transactionFailure: true }); const before = failed.state();
  await assert.rejects(() => failed.service.beginDeletion("product_1", confirmation()), /Simulated commit failure/); assert.deepEqual(failed.state(), before);
  const f = fixture(); const result = await f.service.beginDeletion("product_1", confirmation());
  await assert.rejects(() => f.service.setStatus("product_1", { status: "ACTIVE", expectedUpdatedAt: result.updatedAt.toISOString() }), { name: "ConflictException" });
  const list = await f.service.list(undefined, "ALL"); assert.equal(list.total, 0); assert.deepEqual(list.items, []);
});

test("delete, retry read and cleanup are guarded catalogue-write endpoints", () => {
  for (const method of ["remove", "deletion", "cleanup"] as const) assert.deepEqual(Reflect.getMetadata("hidi:admin-permissions", AdminProductsController.prototype[method]), ["catalog:write"]);
  assert.ok(Reflect.getMetadata("__guards__", AdminProductsController)?.length);
});

test("replaying the original create request cannot report a tombstone as a newly created draft", async () => {
  const db: any = {
    product: { findUnique: async () => ({ id: "pm_00000000000040008000000000000000", status: "DELETED" }) },
    $transaction: async () => { assert.fail("A deleted product replay must never create or mutate a draft"); },
  };
  const service = new AdminProductsService(db);
  await assert.rejects(() => service.create({
    requestId: "00000000-0000-4000-8000-000000000000", name: "Olive Kurta", colors: [{ name: "Olive" }], sizes: ["M"], pricePaise: 249900, mrpPaise: 249900,
  }), { name: "ConflictException" });
});
