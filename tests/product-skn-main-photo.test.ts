import assert from "node:assert/strict";
import test from "node:test";
import { AdminInventoryService } from "../apps/api/src/admin/admin-inventory.service.js";
import { DELETED_PRODUCT_SLUG_PREFIX } from "../apps/api/src/admin/products/product-input.js";

const url = "https://media.example.test/products/magenta-main.webp";
const storagePath = "azure://product-media/products/magenta-main.webp";
function fixture(options: { pendingDeletion?: boolean; deletedBeforeLock?: boolean; failUpdate?: boolean; failUpdateAfter?: number } = {}) {
  let sequence = 10;
  let positionWrites = 0;
  const variants = [
    { id: "magenta_m", productId: "product_1", color: "Magenta Pink", size: "M", sku: "MAGENTA-M" },
    { id: "magenta_l", productId: "product_1", color: "Magenta Pink", size: "L", sku: "MAGENTA-L" },
    { id: "blue_m", productId: "product_1", color: "Blue", size: "M", sku: "BLUE-M" },
  ];
  let images = [
    { id: "m_old_1", variantId: "magenta_m", url: "https://media.example.test/products/magenta-1.webp", position: 0, alt: "First", storagePath: null, createdAt: new Date(0) },
    { id: "m_old_2", variantId: "magenta_m", url: "https://media.example.test/products/magenta-2.webp", position: 4, alt: "Second", storagePath: null, createdAt: new Date(1) },
    { id: "l_old_1", variantId: "magenta_l", url: "https://media.example.test/products/magenta-1.webp", position: 1, alt: "First", storagePath: null, createdAt: new Date(0) },
    { id: "l_old_2", variantId: "magenta_l", url: "https://media.example.test/products/magenta-2.webp", position: 2, alt: "Second", storagePath: null, createdAt: new Date(1) },
    { id: "blue_photo", variantId: "blue_m", url: "https://media.example.test/products/blue.webp", position: 0, alt: "Blue", storagePath: null, createdAt: new Date(0) },
  ];
  const calls: Array<{ name: string; args: any }> = [];
  const record = (name: string, args: any) => calls.push({ name, args: structuredClone(args) });
  const gallery = (variantId: string) => images.filter(image => image.variantId === variantId).sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const db: any = {
    productVariant: {
      findUnique: async ({ where, select }: any) => {
        const variant = variants.find(row => row.id === where.id); if (!variant) return null;
        return { ...variant, product: { name: "Magenta Anarkali", status: "DRAFT", slug: "magenta-anarkali" }, ...(select.images ? { images: structuredClone(gallery(variant.id)) } : {}) };
      },
      findMany: async ({ where }: any) => variants.filter(row => row.productId === where.productId && row.color === where.color),
    },
    product: { findUnique: async () => ({ status: options.deletedBeforeLock ? "ARCHIVED" : "DRAFT", slug: options.deletedBeforeLock ? DELETED_PRODUCT_SLUG_PREFIX + "id" : "magenta-anarkali" }) },
    $queryRaw: async () => { record("lock", {}); return [{ id: "product_1" }]; },
    productImage: { findMany: async () => options.pendingDeletion ? [{ url: "/media/products/magenta-main.webp" }] : [] },
    productVariantImage: {
      count: async ({ where }: any) => images.filter(row => row.variantId === where.variantId).length,
      upsert: async (args: any) => {
        record("upsert", args); const { variantId, url } = args.where.variantId_url;
        let image = images.find(row => row.variantId === variantId && row.url === url);
        if (image) Object.assign(image, args.update);
        else { image = { id: `new_${sequence++}`, ...args.create, createdAt: new Date(2) }; images.push(image!); }
        return structuredClone(image);
      },
      findMany: async (args: any) => {
        if (args.where.variantId) { record("gallery", args); return structuredClone(gallery(args.where.variantId)); }
        return [];
      },
      update: async (args: any) => { record("position", args); if (options.failUpdate || (options.failUpdateAfter !== undefined && positionWrites++ >= options.failUpdateAfter)) throw new Error("Simulated position update failure"); const image = images.find(row => row.id === args.where.id)!; Object.assign(image, args.data); return structuredClone(image); },
    },
  };
  db.$transaction = async (fn: any, args: any) => {
    record("transaction", args); const previous = structuredClone(images);
    try { return await fn(db); } catch (error) { images = previous; throw error; }
  };
  return { service: new AdminInventoryService(db), calls, images: () => structuredClone(images), gallery: (variantId: string) => structuredClone(gallery(variantId)) };
}

test("new main photo becomes first and compacts the existing gallery while retaining other sizes/colours", async () => {
  const f = fixture(); const before = f.images();
  const result = await f.service.addVariantImage("magenta_m", { url, storagePath, isMain: true });
  assert.deepEqual(result!.images.map(image => image.url), [url, before[0].url, before[1].url]);
  assert.deepEqual(result!.images.map(image => image.position), [0, 1, 2]);
  assert.deepEqual(f.images().filter(row => row.variantId !== "magenta_m"), before.filter(row => row.variantId !== "magenta_m"));
  assert.equal(f.calls.find(call => call.name === "transaction")!.args.isolationLevel, "Serializable");
  assert.ok(f.calls.findIndex(call => call.name === "lock") < f.calls.findIndex(call => call.name === "upsert"));
});

test("main replay retains one attachment and stable gallery without redundant position writes", async () => {
  const f = fixture(); await f.service.addVariantImage("magenta_m", { url, storagePath, isMain: true });
  const before = f.images(); const updates = f.calls.filter(call => call.name === "position").length;
  await f.service.addVariantImage("magenta_m", { url, storagePath, isMain: true });
  assert.deepEqual(f.images(), before); assert.equal(f.calls.filter(call => call.name === "position").length, updates);
  assert.equal(f.gallery("magenta_m").filter(row => row.url === url).length, 1);
});

test("all-size main photo shares one uploaded URL and promotes it separately in each matched colour gallery", async () => {
  const f = fixture(); const blue = f.gallery("blue_m");
  await f.service.addVariantImage("magenta_m", { url, storagePath, applyToColor: true, isMain: true });
  for (const variantId of ["magenta_m", "magenta_l"]) {
    const gallery = f.gallery(variantId); assert.equal(gallery[0].url, url); assert.equal(gallery[0].storagePath, storagePath);
    assert.deepEqual(gallery.map(row => row.position), [0, 1, 2]);
    assert.match(gallery[0].alt, /Magenta Pink/);
  }
  assert.deepEqual(f.gallery("blue_m"), blue); assert.equal(f.calls.filter(call => call.name === "upsert").length, 2);
});

test("promoting an existing photo preserves all remaining photos in their prior order", async () => {
  const f = fixture(); const previous = f.gallery("magenta_m");
  await f.service.addVariantImage("magenta_m", { url: previous[1].url, isMain: true });
  assert.deepEqual(f.gallery("magenta_m").map(row => row.id), [previous[1].id, previous[0].id]);
  assert.deepEqual(f.gallery("magenta_m").map(row => row.position), [0, 1]);
});

test("ordinary attachment retains the existing append/replay behaviour without reordering", async () => {
  for (const isMain of [undefined, false]) {
    const f = fixture(); const previous = f.gallery("magenta_m");
    await f.service.addVariantImage("magenta_m", { url, isMain });
    assert.deepEqual(f.gallery("magenta_m").filter(row => row.id.startsWith("m_old")), previous);
    assert.equal(f.images().find(row => row.url === url)!.position, 2);
    assert.equal(f.calls.filter(call => call.name === "position" || call.name === "gallery").length, 0);
  }
});

test("malformed main flags fail before database operations", async () => {
  for (const isMain of [null, "true", "false", 1, 0, {}, []]) {
    const f = fixture(); const before = f.images();
    await assert.rejects(() => f.service.addVariantImage("magenta_m", { url, isMain } as any), /Main photo must be true or false/);
    assert.deepEqual(f.images(), before); assert.deepEqual(f.calls, []);
  }
});

test("pending deletion, concurrent tombstone and failed position update leave all galleries unchanged", async () => {
  for (const options of [{ pendingDeletion: true }, { deletedBeforeLock: true }, { failUpdate: true }]) {
    const f = fixture(options); const before = f.images();
    await assert.rejects(() => f.service.addVariantImage("magenta_m", { url, storagePath, applyToColor: true, isMain: true }), /deletion cleanup|deleted product|position update failure/);
    assert.deepEqual(f.images(), before);
    if (!options.failUpdate) assert.equal(f.calls.filter(call => call.name === "upsert" || call.name === "position").length, 0);
  }
});

test("a failure on the second size rolls back already promoted photos from the first size", async () => {
  const f = fixture({ failUpdateAfter: 3 }); const before = f.images();
  await assert.rejects(() => f.service.addVariantImage("magenta_m", { url, storagePath, applyToColor: true, isMain: true }), /position update failure/);
  assert.equal(f.calls.filter(call => call.name === "upsert").length, 2);
  assert.equal(f.calls.filter(call => call.name === "position").length, 4);
  assert.deepEqual(f.images(), before);
});
