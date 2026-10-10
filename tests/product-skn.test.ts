import assert from "node:assert/strict";
import test from "node:test";
import { AdminProductsService } from "../apps/api/src/admin/products/admin-products.service.js";
import { ensureProductSkn, productIdForSkn, productSknMap, withProductSkn } from "../apps/api/src/admin/products/product-skn.js";
import { DELETED_PRODUCT_SLUG_PREFIX, isDeletedProduct } from "../apps/api/src/admin/products/product-input.js";

function parameters(values: readonly unknown[]): unknown[] {
  return values.flatMap(value => value && typeof value === "object" && "values" in value
    ? parameters((value as { values: unknown[] }).values) : [value]);
}
function mappingFixture(entries: Array<{ productId: string; skn: string }>) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const db: any = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join("?"); const params = parameters(values); queries.push({ sql, values: params });
      return entries.filter(row => sql.includes("WHERE [skn]") ? params.includes(row.skn) : params.includes(row.productId));
    },
  };
  return { db, queries };
}

const timestamp = new Date("2026-10-10T10:00:00.000Z");
const creation = {
  requestId: "00000000-0000-4000-8000-000000000001", name: "Magenta Anarkali", slug: "magenta-anarkali",
  colors: [{ name: "Magenta Pink", hex: "#d51b78" }], sizes: ["M", "L", "XL", "XXL"],
  pricePaise: 109500, mrpPaise: 149900, description: "Floral embroidered suit set", collectionIds: [],
};

function productFixture(options: { mappingFailure?: "schema" | "exhausted"; conflictOnce?: boolean } = {}) {
  let stored: any = null; let next = 12345; let conflict = options.conflictOnce ?? false;
  const mappings = new Map<string, string>(); const calls: Array<{ name: string; args: any }> = [];
  const record = (name: string, args: any) => calls.push({ name, args });
  const clone = () => structuredClone(stored);
  const db: any = {
    product: {
      findUnique: async ({ where }: any) => stored?.id === where.id ? clone() : null,
      create: async ({ data }: any) => {
        record("product.create", data);
        stored = { ...data, updatedAt: new Date(timestamp), category: null, images: [], collections: [],
          variants: data.variants.create.map((row: any, index: number) => ({ ...row, id: `variant_${index}`, productId: data.id, images: [], inventory: row.inventory.create })) };
        if (conflict) { conflict = false; throw Object.assign(new Error("duplicate committed create"), { code: "P2002" }); }
        return clone();
      },
      update: async ({ data }: any) => { record("product.update", data); const { collections, ...fields } = data; Object.assign(stored, fields); if (collections) stored.collections = collections.create.map((row: any) => ({ ...row })); return clone(); },
      findMany: async ({ where }: any) => { record("product.findMany", { where }); return stored && !isDeletedProduct(stored) && (!where.id || where.id === stored.id) ? [clone()] : []; },
      count: async ({ where }: any) => stored && !isDeletedProduct(stored) && (!where.id || where.id === stored.id) ? 1 : 0,
    },
    productVariant: {
      create: async ({ data }: any) => { record("productVariant.create", data); stored.variants.push({ ...data, id: `variant_${stored.variants.length}`, images: data.images.create, inventory: data.inventory.create }); },
      update: async ({ where, data }: any) => { record("productVariant.update", { where, data }); Object.assign(stored.variants.find((variant: any) => variant.id === where.id), data); },
    },
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join("?"); const params = parameters(values); record("query", { sql, values: params });
      if (sql.includes("[dbo].[HidiProductSKN]")) {
        if (options.mappingFailure === "schema") throw new Error("Invalid object name dbo.HidiProductSKN");
        if (sql.startsWith("INSERT")) {
          if (options.mappingFailure === "exhausted") throw new Error("11728: sequence has reached its maximum value");
          assert.ok(stored && params[0] === stored.id, "Only an existing product can receive a mapping");
          assert.equal(mappings.has(stored.id), false, "A reserved SKN cannot be replaced");
          const skn = String(next++); mappings.set(stored.id, skn); return [{ productId: stored.id, skn }];
        }
        return [...mappings].filter(([productId, skn]) => sql.includes("WHERE [skn]") ? params.includes(skn) : params.includes(productId)).map(([productId, skn]) => ({ productId, skn }));
      }
      return stored && params.includes(stored.id) ? [{ id: stored.id }] : [];
    },
  };
  let queue = Promise.resolve();
  db.$transaction = async (fn: any, options: any) => {
    let unlock!: () => void; const preceding = queue; queue = new Promise<void>(resolve => { unlock = resolve; }); await preceding;
    record("transaction", options);
    const previous = structuredClone(stored); const previousMappings = new Map(mappings);
    const tx = { ...db }; delete tx.$transaction;
    try { return await fn(tx); }
    catch (error: any) {
      // P2002 fixture represents a concurrent transaction which already committed.
      if (error.code !== "P2002") { stored = previous; mappings.clear(); for (const [productId, skn] of previousMappings) mappings.set(productId, skn); }
      throw error;
    }
    finally { unlock(); }
  };
  return { service: new AdminProductsService(db), db, calls, state: clone, mappings, setStored: (value: any) => { stored = value; } };
}

test("existing SKN map reads are parameterized, deduplicated, chunked and do not consume more numbers", async () => {
  const entries = Array.from({ length: 1001 }, (_, index) => ({ productId: `product_${index}`, skn: String(10000 + index) }));
  const { db, queries } = mappingFixture(entries);
  const mapping = await productSknMap(db, [...entries.map(row => row.productId), "product_0"]);
  assert.equal(mapping.size, 1001); assert.equal(queries.length, 2);
  assert.equal(queries[0].values.length, 1000); assert.equal(queries[1].values.length, 1);
  assert.ok(queries.every(query => !/INSERT|UPDATE|DELETE|NEXT VALUE/i.test(query.sql)));
  const hostile = "product_1'); DELETE FROM Product; --";
  const hostileDb = mappingFixture([{ productId: hostile, skn: "12345" }]);
  assert.equal((await productSknMap(hostileDb.db, [hostile])).get(hostile), "12345");
  assert.ok(!hostileDb.queries[0].sql.includes(hostile)); assert.deepEqual(hostileDb.queries[0].values, [hostile]);
  assert.equal((await productSknMap(db, [])).size, 0); assert.equal(queries.length, 2);
});

test("duplicate or malformed identities and missing schema fail instead of producing a nullable SKN", async () => {
  for (const rows of [[{ productId: "p", skn: "9999" }], [{ productId: "p", skn: "01234" }], [{ productId: "p", skn: "12345" }, { productId: "p", skn: "12346" }]]) {
    await assert.rejects(() => withProductSkn(mappingFixture(rows).db, { id: "p", name: "Product" }), /SKN mapping is not ready/);
  }
  const db: any = { $queryRaw: async () => { throw new Error("Invalid object name dbo.HidiProductSKN"); } };
  await assert.rejects(() => productSknMap(db, ["p"]), /SKN mapping is not ready/);
});

test("five-digit lookup uses an exact identity and rejects invalid ranges without SQL", async () => {
  const { db, queries } = mappingFixture([{ productId: "p", skn: "12345" }]);
  assert.equal(await productIdForSkn(db, "12345"), "p"); assert.equal(await productIdForSkn(db, "99999"), null);
  for (const value of ["01234", "1234", "123456", "12345 OR 1=1"]) assert.equal(await productIdForSkn(db, value), null);
  assert.equal(queries.length, 2); assert.deepEqual(queries[0].values, ["12345"]);
});

test("new product and all four sizes share one SKN and identical creation retries keep it", async () => {
  const f = productFixture(); const first = await f.service.create(creation); const second = await f.service.create(creation);
  assert.equal(first.skn, "12345"); assert.equal(second.skn, first.skn); assert.equal(first.id, second.id);
  assert.equal(first.variants.length, 4); assert.equal(new Set(first.variants.map(variant => variant.sku)).size, 4);
  assert.equal(f.calls.filter(call => call.name === "product.create").length, 1); assert.equal(f.mappings.size, 1);
  assert.ok(first.variants.every(variant => variant.inventory?.onHand === 0));
  await assert.rejects(() => f.service.create({ ...creation, description: "Changed request" }), /already created a product/);
  assert.equal(f.mappings.get(first.id), first.skn);
});

test("a duplicate create committed by another request replays the same SKN", async () => {
  const f = productFixture({ conflictOnce: true });
  const result = await f.service.create(creation);
  assert.equal(result.skn, "12345"); assert.equal(f.calls.filter(call => call.name === "product.create").length, 1);
});

test("metadata, additional sizes, variant prices and publishing status keep the existing SKN", async () => {
  const f = productFixture(); let product = await f.service.create(creation);
  product = await f.service.edit(product.id, { name: "Updated Magenta Anarkali", categoryId: null, shortDescription: null, description: "Updated details", fabric: "Cotton", care: null, collectionIds: [], expectedUpdatedAt: product.updatedAt.toISOString() });
  assert.equal(product.skn, "12345");
  product = await f.service.addVariants(product.id, { colors: creation.colors, sizes: ["S"], pricePaise: creation.pricePaise, mrpPaise: creation.mrpPaise, expectedUpdatedAt: product.updatedAt.toISOString() });
  assert.equal(product.skn, "12345"); assert.equal(product.variants.length, 5);
  product = await f.service.editVariant(product.id, product.variants[0].id, { pricePaise: 119500, mrpPaise: creation.mrpPaise, active: true, expectedUpdatedAt: product.updatedAt.toISOString() });
  assert.equal(product.skn, "12345");
  product = await f.service.setStatus(product.id, { status: "ARCHIVED", expectedUpdatedAt: product.updatedAt.toISOString() });
  assert.equal(product.skn, "12345");
  const repeated = await f.service.setStatus(product.id, { status: "ARCHIVED", expectedUpdatedAt: product.updatedAt.toISOString() });
  assert.equal(repeated.skn, "12345"); assert.equal((await f.service.get(product.id)).skn, "12345");
  assert.equal(f.mappings.size, 1); assert.ok(f.state().variants.every((variant: any) => variant.inventory.onHand === 0));
});

test("catalogue results include SKN and exact five-digit search retains status/deletion restrictions", async () => {
  const f = productFixture(); const product = await f.service.create(creation);
  const list = await f.service.list("12345", "DRAFT"); assert.equal(list.total, 1); assert.equal(list.items[0].skn, "12345");
  const query = f.calls.filter(call => call.name === "product.findMany").at(-1)!.args.where;
  assert.equal(query.id, product.id); assert.equal(query.status, "DRAFT"); assert.ok(query.NOT); assert.equal(query.OR, undefined);
  assert.deepEqual((await f.service.list("54321", "ALL")).items, []);
  const normal = await f.service.list("Magenta", "ALL"); assert.equal(normal.items[0].skn, "12345");
  assert.ok(f.calls.filter(call => call.name === "product.findMany").at(-1)!.args.where.OR.length);
  f.setStored({ ...f.state(), status: "ARCHIVED", slug: DELETED_PRODUCT_SLUG_PREFIX + "id" });
  assert.equal((await f.service.list("12345", "ALL")).total, 0);
  await assert.rejects(() => f.service.get(product.id), { name: "NotFoundException" });
  assert.equal(f.mappings.get(product.id), "12345");
});

test("mapping schema failure rolls back the product and cannot report a successful import", async () => {
  const f = productFixture({ mappingFailure: "schema" });
  await assert.rejects(() => f.service.create(creation), /SKN mapping is not ready/);
  assert.equal(f.state(), null); assert.equal(f.mappings.size, 0);
});

test("sequence exhaustion fails clearly and rolls back the product without reserving a malformed number", async () => {
  const f = productFixture({ mappingFailure: "exhausted" });
  await assert.rejects(() => f.service.create(creation), /five-digit product SKN range is exhausted/);
  assert.equal(f.state(), null); assert.equal(f.mappings.size, 0);
});

test("legacy product reads reserve a missing SKN atomically without changing product, variants or stock", async () => {
  const source = productFixture(); const product = await source.service.create(creation);
  const f = productFixture(); f.setStored(source.state()); const before = f.state();
  const [first, second] = await Promise.all([f.service.get(product.id), f.service.get(product.id)]);
  assert.equal(first.skn, "12345"); assert.equal(second.skn, first.skn); assert.equal(f.mappings.size, 1);
  assert.deepEqual(f.state(), before);
  const inserts = f.calls.filter(call => call.name === "query" && call.args.sql.startsWith("INSERT"));
  assert.equal(inserts.length, 1); assert.ok(inserts[0].args.sql.includes("OUTPUT INSERTED.[productId], INSERTED.[skn]"));
  assert.ok(!inserts[0].args.sql.includes("NEXT VALUE") && !inserts[0].args.sql.includes("[skn])"), "SQL default owns sequence allocation");
  assert.ok(f.calls.filter(call => call.name === "transaction").every(call => call.args.isolationLevel === "Serializable"));
  assert.ok(!f.calls.some(call => call.name === "product.create" || call.name === "product.update" || call.name === "productVariant.update"));
});

test("allocation validates a real Product before writing and reuses a provided transaction", async () => {
  const empty = productFixture();
  await assert.rejects(() => ensureProductSkn(empty.db, "missing_product"), { name: "NotFoundException" });
  assert.equal(empty.mappings.size, 0); assert.ok(!empty.calls.some(call => call.name === "query" && call.args.sql.startsWith("INSERT")));
  const f = productFixture(); const product = await f.service.create(creation);
  const beforeTransactions = f.calls.filter(call => call.name === "transaction").length;
  const tx = { ...f.db }; delete tx.$transaction;
  assert.equal(await ensureProductSkn(tx, product.id), product.skn);
  assert.equal(f.calls.filter(call => call.name === "transaction").length, beforeTransactions);
  assert.equal(f.calls.filter(call => call.name === "query" && call.args.sql.startsWith("INSERT")).length, 1);
});

test("SQL sequence exhaustion remains clear when Prisma wraps the database code", async () => {
  for (const details of [{ meta: { code: "11728" } }, { cause: { originalCode: "11728" } }]) {
    const db: any = {
      $queryRaw: async (parts: TemplateStringsArray) => {
        const sql = parts.join("?");
        if (sql.startsWith("INSERT")) throw Object.assign(new Error("Raw query failed"), { code: "P2010", ...details });
        return sql.includes("[dbo].[Product]") ? [{ id: "product_1" }] : [];
      },
    };
    await assert.rejects(() => ensureProductSkn(db, "product_1"), /five-digit product SKN range is exhausted/);
  }
});
