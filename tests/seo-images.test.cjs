const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const path = require("node:path");

async function load(name) {
  const source = readFileSync(path.join(__dirname, "../apps/web/lib", name), "utf8");
  return import("data:text/javascript;base64," + Buffer.from(stripTypeScriptTypes(source)).toString("base64"));
}

function webSource(relative) {
  return readFileSync(path.join(__dirname, "../apps/web", relative), "utf8");
}

test("indexing requires an explicitly opened production domain", async () => {
  const { isSearchIndexingEnabled: enabled } = await load("seo.ts");
  assert.equal(enabled({}), false);
  for (const host of ["thehidi.com", "www.thehidi.com", "hidiindia.com", "www.hidiindia.com"]) {
    const env = { SITE_URL: `https://${host}`, ALLOW_PUBLIC_DOMAIN: "true" };
    assert.equal(enabled(env), true);
    assert.equal(enabled({ ...env, DEPLOYMENT_STAGE: "validation" }), false);
    assert.equal(enabled({ ...env, VERCEL_ENV: "preview" }), false);
    assert.equal(enabled({ ...env, ALLOW_PUBLIC_DOMAIN: "false" }), false);
  }
  for (const url of ["https://thidigk.thehidi.com", "https://azure-preview.thehidi.com", "http://thehidi.com", "http://hidiindia.com", "https://hidiindia.com.evil.example", "https://thehidi.com.evil.example", "invalid"]) {
    assert.equal(enabled({ SITE_URL: url, ALLOW_PUBLIC_DOMAIN: "true" }), false);
  }
});

test("primary HIDI domain can force canonical URLs for SEO consolidation", async () => {
  const originalEnv = { ...process.env };
  try {
    process.env = {
      ...originalEnv,
      HIDI_PRIMARY_DOMAIN: "HIDIindia.com",
      SITE_URL: "https://thehidi.com",
      NEXT_PUBLIC_SITE_URL: "",
      VERCEL_PROJECT_PRODUCTION_URL: "",
      VERCEL_URL: "",
    };
    const { getSiteUrl, absoluteUrl } = await load("site-url.ts");
    assert.equal(getSiteUrl().toString(), "https://hidiindia.com/");
    assert.equal(absoluteUrl("/collections/all"), "https://hidiindia.com/collections/all");

    process.env.HIDI_PRIMARY_DOMAIN = "https://unknown.example/path";
    assert.equal(getSiteUrl().toString(), "https://thehidi.com/");
  } finally {
    process.env = originalEnv;
  }
});

test("product offers retain each variant's real price, currency, SKU and stock", async () => {
  const { productOffers } = await load("seo.ts");
  const offers = productOffers({ name: "Sample kurta", variants: [
    { sku: "SAMPLE-S", size: "S", color: "Green", pricePaise: 129999, available: 3 },
    { sku: "SAMPLE-M", size: "M", color: "Green", pricePaise: 139900, available: 0 },
  ] }, "https://www.thehidi.com/products/sample");
  assert.equal(offers.length, 2);
  assert.equal(offers[0]["@type"], "Offer");
  assert.equal(offers[0].price, "1299.99");
  assert.equal(offers[1].price, "1399.00");
  assert.equal(offers[0].priceCurrency, "INR");
  assert.equal(offers[1].sku, "SAMPLE-M");
  assert.match(offers[0].availability, /\/InStock$/);
  assert.match(offers[1].availability, /\/OutOfStock$/);
  assert.equal(offers[0].seller.name, "HIDI");
  assert.deepEqual(productOffers({ variants: [] }, "https://example.com"), []);
});

test("only known migrated media is normalized to the local Blob proxy", async () => {
  const { productImageSource: source, canOptimizeProductImage: optimize } = await load("product-image.ts");
  for (const host of ["www.thehidi.com", "hidiindia.com", "www.hidiindia.com", "thidigk.thehidi.com", "azure-preview.thehidi.com"]) {
    const local = source(`https://${host}/media/products/migrated/photo.png`);
    assert.equal(local, "/media/products/migrated/photo.png");
    assert.equal(optimize(local), true);
  }
  for (const value of ["https://untrusted.example/photo.png", "//untrusted.example/photo.png", "https://www.thehidi.com.evil.example/media/products/photo.png"]) {
    assert.equal(source(value), value);
    assert.equal(optimize(value), false);
  }
  assert.equal(optimize("https://media.thehidi.com/products/photo.webp"), true);
  assert.equal(optimize("https://example.supabase.co/storage/v1/object/public/photos/image.jpg"), true);
  assert.equal(optimize("/brand/hidi-logo-header.svg"), true);
});

test("HIDI India domain is covered by launch gates and image optimizer allowlists", () => {
  const middleware = webSource("middleware.ts");
  assert.match(middleware, /"hidiindia\.com"/);
  assert.match(middleware, /"www\.hidiindia\.com"/);
  assert.match(middleware, /ALLOW_PUBLIC_DOMAIN !== "true"/);
  assert.match(middleware, /HIDI_PRIMARY_DOMAIN/);
  assert.match(middleware, /NextResponse\.redirect\(url, 308\)/);

  const nextConfig = webSource("next.config.ts");
  assert.match(nextConfig, /hostname: "hidiindia\.com"/);
  assert.match(nextConfig, /hostname: "www\.hidiindia\.com"/);
});
