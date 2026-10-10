import assert from "node:assert/strict";
import { test } from "node:test";
import { ProductsService } from "../apps/api/src/products/products.service.js";

type Row = Record<string, any>;

// Evaluate the real Prisma predicate against fixtures, rather than returning
// products that would make a broken query appear to pass.
function matches(row: any, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Row[]).some(condition => matches(row, condition));
    if (key === "AND") return (value as Row[]).every(condition => matches(row, condition));
    if (key === "NOT") return !matches(row, value as Row);
    const actual = row?.[key];
    if (value !== null && typeof value === "object") {
      if ("in" in value) return (value.in as unknown[]).includes(actual);
      if ("is" in value) return actual != null && matches(actual, value.is);
      if ("some" in value) return Array.isArray(actual) && actual.some(item => matches(item, value.some));
      return actual != null && matches(actual, value);
    }
    return actual === value;
  });
}

function collection(slug: string, active = true) {
  return { collection: { id: "collection-" + slug, name: slug, slug, active }, position: 0 };
}

function product(id: string, categorySlug: string | null, collectionSlugs: string[] = [], overrides: Row = {}): Row {
  return {
    id, slug: id, name: id, status: "ACTIVE", featuredRank: 1,
    createdAt: new Date("2026-10-10T00:00:00Z"), fabric: "Cotton",
    category: categorySlug ? { id: "category-" + categorySlug, name: categorySlug, slug: categorySlug, active: true } : null,
    collections: collectionSlugs.map(slug => collection(slug)),
    images: [{ id: "image-" + id, url: "https://media.fixture.test/" + id + ".webp", alt: id, position: 0 }],
    variants: ["M", "L", "XL", "XXL"].map(size => ({
      id: id + "-" + size, sku: "HIDI-" + id + "-" + size, size, color: "Magenta", active: true,
      mrpPaise: 149900, pricePaise: 109500,
      inventory: { onHand: 10, reserved: 2, safetyStock: 1 }, images: [],
    })),
    ...overrides,
  };
}

function fixture(rows: Row[]) {
  const queries: Row[] = [], reviews: Row[] = [];
  const db: any = {
    product: { findMany: async (query: Row) => {
      queries.push(structuredClone(query));
      const selected = rows.filter(row => matches(row, query.where))
        .sort((a, b) => a.featuredRank - b.featuredRank || b.createdAt.getTime() - a.createdAt.getTime());
      return structuredClone(query.take ? selected.slice(0, query.take) : selected);
    } },
    productReview: { groupBy: async (query: Row) => { reviews.push(structuredClone(query)); return []; } },
  };
  return { service: new ProductsService(db), queries, reviews };
}

const groups = [
  { category: "casual-wear", legacy: "everyday" },
  { category: "work-wear", legacy: "work-edit" },
  { category: "occasional-wear", legacy: "occasion" },
];

for (const { category, legacy } of groups) {
  test(`${category} and ${legacy} show primary-category products and retained legacy collection members`, async () => {
    const rows = [
      product("primary", category),
      product("legacy", "ethnic-wear", [legacy]),
      product("tagged-primary", category, ["ananyas-pick"]),
      product("other-wear", "unrelated-wear", ["unrelated-edit"]),
      product("draft", category, [legacy], { status: "DRAFT" }),
      product("archived", category, [legacy], { status: "ARCHIVED" }),
      product("deleted", category, [legacy], { status: "DELETED" }),
      product("tombstone", category, [legacy], { status: "ARCHIVED", slug: "hidi-internal-deleted-1234" }),
      product("inactive-category", category, [], { category: { slug: category, active: false } }),
      product("inactive-collection", null, [], { collections: [collection(legacy, false)] }),
    ];
    for (const alias of [category, legacy, " " + legacy.toUpperCase() + " "]) {
      const f = fixture(rows), result = await f.service.listPublished(alias);
      assert.deepEqual(result.map(row => row.id).sort(), ["legacy", "primary", "tagged-primary"]);
      assert.equal(f.queries[0].where.status, "ACTIVE");
      assert.equal(f.queries[0].where.OR.length, 2);
      assert.equal(f.queries[0].where.OR[0].category.is.active, true);
      assert.equal(f.queries[0].where.OR[1].collections.some.collection.active, true);
      assert.deepEqual(f.queries[0].orderBy, [{ featuredRank: "asc" }, { createdAt: "desc" }]);
    }
  });
}

test("Ananya's Pick includes selected Casual, Work and Occasional products irrespective of main category", async () => {
  const tagged = groups.map(({ category }) => product("tagged-" + category, category, ["ananyas-pick"]));
  const untagged = groups.map(({ category }) => product("untagged-" + category, category));
  const rows = [
    ...tagged, ...untagged,
    product("tagged-legacy", "ethnic-wear", ["work-edit", "ananyas-pick"]),
    product("tagged-no-category", null, ["ananyas-pick"]),
    product("inactive-tag", "casual-wear", [], { collections: [collection("ananyas-pick", false)] }),
    ...["DRAFT", "ARCHIVED", "DELETED"].map(status => product("hidden-" + status, "work-wear", ["ananyas-pick"], { status })),
    product("deleted-tombstone", "casual-wear", ["ananyas-pick"], { status: "ARCHIVED", slug: "hidi-internal-deleted-1234" }),
  ];
  const before = structuredClone(rows), f = fixture(rows), result = await f.service.listPublished("ananyas-pick");
  assert.deepEqual(result.map(row => row.id).sort(), [...tagged.map(row => row.id), "tagged-legacy", "tagged-no-category"].sort());
  assert.equal(f.queries[0].where.status, "ACTIVE");
  assert.equal(f.queries[0].where.OR, undefined, "Ananya must not be restricted to one wear category");
  assert.deepEqual(f.queries[0].where.collections, { some: { collection: { slug: "ananyas-pick", active: true } } });
  assert.deepEqual(rows, before, "Browsing a collection must not change category, tags, SKU, price, stock or images");
  const magenta = result.find(row => row.id === "tagged-casual-wear")!;
  assert.equal(magenta.category?.slug, "casual-wear");
  assert.equal(magenta.variants.length, 4);
  assert.ok(magenta.variants.every(row => row.available === 7 && row.pricePaise === 109500 && row.mrpPaise === 149900));
  assert.equal(magenta.images[0].url, "https://media.fixture.test/tagged-casual-wear.webp");
  assert.ok(f.reviews[0].where.published);
});

test("legacy and primary-slug collection records retain their products without duplicated cards", async () => {
  for (const { category, legacy } of groups) {
    const f = fixture([
      product("legacy-slug", null, [legacy]),
      product("primary-slug", null, [category]),
      product("both", category, [category, legacy]),
    ]);
    const result = await f.service.listPublished(category);
    assert.deepEqual(result.map(row => row.id).sort(), ["both", "legacy-slug", "primary-slug"]);
    assert.equal(new Set(result.map(row => row.id)).size, result.length);
  }
});

test("unfiltered and unknown collection views retain publication gates and never fall back to all products", async () => {
  const rows = [product("published", "casual-wear"), product("legacy-new", null, ["new-arrivals"]),
    ...["DRAFT", "ARCHIVED", "DELETED"].map(status => product(status, "casual-wear", ["ananyas-pick"], { status }))];
  const all = fixture(rows);
  assert.deepEqual((await all.service.listPublished()).map(row => row.id).sort(), ["legacy-new", "published"]);
  assert.deepEqual(all.queries[0].where, { status: "ACTIVE" });
  const arrivals = fixture(rows);
  assert.deepEqual((await arrivals.service.listPublished("new-arrivals")).map(row => row.id), ["legacy-new"]);
  const missing = fixture(rows);
  assert.deepEqual(await missing.service.listPublished("does-not-exist"), []);
  assert.equal(missing.queries[0].where.status, "ACTIVE");
  assert.equal(missing.reviews.length, 0, "An empty view should not load unrelated reviews");
});

test("collection changes preserve bounded featured ordering and only request reviews for returned products", async () => {
  const rows = Array.from({ length: 30 }, (_, i) => product("product-" + String(i).padStart(2, "0"), "work-wear", ["ananyas-pick"], { featuredRank: 30 - i }));
  const f = fixture(rows), result = await f.service.listPublished("ananyas-pick", 100);
  assert.equal(result.length, 24);
  assert.equal(f.queries[0].take, 24);
  assert.equal(result[0].id, "product-29");
  assert.deepEqual(f.reviews[0].where.productId.in, result.map(row => row.id));
  const single = fixture(rows);
  assert.equal((await single.service.listPublished("work-edit", 0)).length, 1);
  assert.equal(single.queries[0].take, 1);
});
