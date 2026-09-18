// Run from the repository root: node --test tests/storefront-qa.test.cjs
// Offline SSR/parsed-DOM and CSS contract checks. These are NOT browser E2E tests.
// Next Link/Image are adapter stubs; actual React rendering and component code run.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const webRoot = path.resolve(__dirname, "../apps/web");
const webRequire = createRequire(path.join(webRoot, "package.json"));
const nextRequire = createRequire(webRequire.resolve("next/package.json"));
const React = webRequire("react");
const { renderToStaticMarkup } = webRequire("react-dom/server");
const ts = webRequire("typescript");
const { parse } = nextRequire("next/dist/compiled/node-html-parser");
const postcss = nextRequire("postcss");

const source = (relative) => fs.readFileSync(path.join(webRoot, relative), "utf8");
const interop = (value) => ({ __esModule: true, default: value });

function harness({ products = [], whatsappNumber = "" } = {}) {
  const cache = new Map();
  const imports = {
    react: React,
    "react/jsx-runtime": webRequire("react/jsx-runtime"),
    "lucide-react": webRequire("lucide-react"),
    "next/link": interop(({ children, ...props }) => React.createElement("a", props, children)),
    "next/image": interop(({ fill, priority, ...props }) => React.createElement("img", props)),
    "@/components/product-card": {
      // The homepage catalogue is isolated from card media/network/effects.
      ProductCard: ({ product }) => React.createElement("article", { "data-qa-product": product.slug }, product.name),
    },
    "@/lib/api": {
      getProducts: async () => products,
      formatPaise: (value) => new Intl.NumberFormat("en-IN", {
        style: "currency", currency: "INR", maximumFractionDigits: 0,
      }).format(value / 100),
    },
  };

  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const module = { exports: {} };
    cache.set(relative, module.exports);
    const compiled = ts.transpileModule(source(relative), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
      },
    }).outputText;
    function resolveImport(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      const target = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      if (name.endsWith(".module.css")) {
        const css = postcss.parse(source(target));
        const classes = {};
        css.walkRules((rule) => {
          for (const match of rule.selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) classes[match[1]] = match[1];
        });
        return interop(classes);
      }
      if (name.startsWith("@/") || name.startsWith(".")) {
        const found = [target, target + ".tsx", target + ".ts"]
          .find((candidate) => fs.existsSync(path.join(webRoot, candidate)));
        if (found) return load(found);
      }
      throw new Error(`Unexpected dependency in offline storefront QA: ${name}`);
    }
    vm.runInNewContext(compiled, {
      module, exports: module.exports, require: resolveImport,
      process: { env: { NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER: whatsappNumber } },
      URL, URLSearchParams, AbortController,
      fetch() { throw new Error("Network calls are forbidden in storefront SSR QA"); },
    }, { filename: relative });
    return module.exports;
  }

  return {
    async homepage() {
      return parse(renderToStaticMarkup(await load("app/page.tsx").default()));
    },
    reviews(data) {
      return parse(renderToStaticMarkup(React.createElement(load("components/product-reviews.tsx").ProductReviews, { data })));
    },
    contact(product) {
      return parse(renderToStaticMarkup(React.createElement(load("components/product-contact-actions.tsx").ProductContactActions, { product })));
    },
  };
}

function product(index, overrides = {}) {
  return {
    id: `p${index}`, slug: `style-${index}`, name: `HIDI style ${index}`,
    minPricePaise: 149900, maxPricePaise: 149900, inStock: true,
    images: [{ id: `image-${index}`, url: `/qa/style-${index}.jpg`, alt: `Garment ${index}`, position: 0 }],
    collections: [],
    variants: [
      { id: `v${index}-m`, sku: `QA-${index}-M`, color: "Sage", size: "M", pricePaise: 149900, mrpPaise: 179900, available: 4 },
      { id: `v${index}-l`, sku: `QA-${index}-L`, color: "Sage", size: "L", pricePaise: 149900, mrpPaise: 179900, available: 0 },
    ],
    ...overrides,
  };
}

const catalogue = Array.from({ length: 10 }, (_, index) => product(index));
const emptyReviews = { averageRating: 0, reviewCount: 0, reviews: [] };
const review = {
  id: "review-1", rating: 4, title: "A comfortable fit", body: "Lovely fabric for a workday.",
  reviewerName: "QA Customer", verifiedPurchase: true, createdAt: "2026-09-01T00:00:00Z",
};

function byId(root, id) {
  return root.querySelectorAll("[id]").find((element) => element.getAttribute("id") === id);
}

function assertReferencesResolve(root) {
  const ids = root.querySelectorAll("[id]").map((element) => element.getAttribute("id"));
  assert.equal(new Set(ids).size, ids.length, "IDs must be unique in the rendered fragment");
  for (const attribute of ["aria-labelledby", "aria-describedby", "aria-controls", "for"]) {
    for (const element of root.querySelectorAll(`[${attribute}]`)) {
      for (const id of element.getAttribute(attribute).split(/\s+/)) {
        assert.ok(byId(root, id), `${attribute} references missing element ${id}`);
      }
    }
  }
}

function cssRule(relative, selector, media = null) {
  let declarations = null;
  postcss.parse(source(relative)).walkRules((rule) => {
    if (!rule.selector.split(",").map((value) => value.trim()).includes(selector)) return;
    let ancestor = rule.parent;
    while (ancestor && !(ancestor.type === "atrule" && ancestor.name === "media")) ancestor = ancestor.parent;
    if ((ancestor?.params ?? null) !== media) return;
    declarations ??= {};
    rule.walkDecls((declaration) => { declarations[declaration.prop] = declaration.value; });
  });
  assert.ok(declarations, `Missing CSS rule ${selector} in ${relative} (${media ?? "base"})`);
  return declarations;
}

test("homepage brand standard shows four distinct garments, not a single-product feature", async () => {
  const root = await harness({ products: catalogue }).homepage();
  const block = root.querySelector('[aria-labelledby="hidi-standard-heading"]');
  assert.ok(block);
  const cards = block.querySelectorAll(".closeUpStyle");
  assert.equal(cards.length, 4);
  assert.equal(new Set(cards.map((card) => card.getAttribute("href"))).size, 4);
  assert.equal(new Set(cards.map((card) => card.querySelector("img").getAttribute("src"))).size, 4);
  assert.equal(block.querySelector(".closeUpMain"), null);
  assert.equal(block.querySelector(".closeUpCta").getAttribute("href"), "/collections/new-arrivals");
  assert.equal(root.querySelectorAll("[data-qa-product]").length, 8, "homepage catalogue remains bounded");
  assertReferencesResolve(root);
});

test("homepage collage skips duplicate product identities and image URLs", async () => {
  const products = [product(0), product(1, { slug: "style-0" }), product(2, { images: product(0).images }), ...catalogue.slice(3)];
  const root = await harness({ products }).homepage();
  const links = root.querySelectorAll(".closeUpStyle");
  assert.deepEqual(links.map((link) => link.getAttribute("href")), ["/products/style-0", "/products/style-3", "/products/style-4", "/products/style-5"]);
});

test("homepage can select valid imagery beyond the first eight catalogue entries", async () => {
  const products = [...catalogue.slice(0, 8).map((item) => ({ ...item, images: [] })), product(8), product(9)];
  const root = await harness({ products }).homepage();
  assert.equal(root.querySelectorAll(".closeUpStyle").length, 2);
  assert.equal(root.querySelector(".closeUpGallery").getAttribute("data-count"), "2");
});

for (const [label, products] of [["empty", []], ["single garment", [product(0)]], ["duplicate imagery", [product(0), product(1, { images: product(0).images })]]]) {
  test(`homepage keeps the brand message but suppresses the collage for ${label}`, async () => {
    const root = await harness({ products }).homepage();
    assert.ok(root.querySelector("#hidi-standard-heading"));
    assert.ok(root.querySelector(".closeUpTextOnly"));
    assert.equal(root.querySelector(".closeUpGallery"), null);
    assert.equal(root.querySelector(".closeUpCta").getAttribute("href"), "/collections/new-arrivals");
  });
}

test("homepage falls back to meaningful product alt text and encodes the product route", async () => {
  const unusual = product(0, { slug: "sage / embroidered", images: [{ url: "/qa/unique.jpg", alt: "", id: "alt-test", position: 0 }] });
  const root = await harness({ products: [unusual, product(1)] }).homepage();
  const card = root.querySelector(".closeUpStyle");
  assert.equal(card.getAttribute("href"), "/products/sage%20%2F%20embroidered");
  assert.equal(card.querySelector("img").getAttribute("alt"), unusual.name);
});

test("empty reviews remain calm without star or zero-count summaries", () => {
  const root = harness().reviews(emptyReviews);
  assert.match(root.text, /No reviews yet/);
  assert.equal(root.querySelector(".summary"), null);
  assert.equal(root.querySelector('[role="img"]'), null);
  assert.doesNotMatch(root.text, /0 reviews|☆☆☆☆☆|return window/i);
  assertReferencesResolve(root);
});

test("review CTA is a native disclosure with truthful private-invitation guidance", () => {
  const root = harness().reviews(emptyReviews);
  const details = root.querySelector("details.reviewGuidance");
  assert.ok(details);
  assert.equal(details.hasAttribute("open"), false);
  assert.match(details.querySelector("summary").text, /How to write a review/);
  assert.match(details.text, /private link/);
  assert.equal(details.querySelector('a[href="/account"]').text.trim(), "View my orders →");
  assert.equal(root.querySelector("form"), null, "public page must not invent an unauthenticated review form");
});

test("populated reviews expose accessible ratings and retain the review disclosure", () => {
  const root = harness().reviews({ averageRating: 4.5, reviewCount: 2, reviews: [review, { ...review, id: "r2", rating: 5 }] });
  assert.equal(root.querySelectorAll("article").length, 2);
  assert.equal(root.querySelector(".summary [role=img]").getAttribute("aria-label"), "4.5 out of 5 stars");
  assert.equal(root.querySelector("article [role=img]").getAttribute("aria-label"), "4 out of 5 stars");
  assert.match(root.querySelector(".summary").text, /2 reviews/);
  assert.ok(root.querySelector("details summary"));
  assertReferencesResolve(root);
});

test("unverified reviews never acquire a verified-purchase badge", () => {
  const root = harness().reviews({ averageRating: 4, reviewCount: 1, reviews: [{ ...review, verifiedPurchase: false }] });
  assert.equal(root.querySelector(".verified"), null);
  assert.match(root.querySelector(".summary").text, /1 review\b/);
  assert.doesNotMatch(root.querySelector(".summary").text, /verified/);
});

test("review copy renders as text, not customer-provided markup", () => {
  const root = harness().reviews({ averageRating: 4, reviewCount: 1, reviews: [{ ...review, body: '<script>alert("x")</script>', title: '<img src=x onerror="alert(1)">', reviewerName: "<b>Person</b>" }] });
  assert.equal(root.querySelector("script"), null);
  assert.equal(root.querySelector("article img"), null);
  assert.equal(root.querySelector("article b"), null);
  assert.match(root.querySelector("article p").text, /<script>/);
});

test("WhatsApp control is disabled and explained when no business number is configured", () => {
  const root = harness().contact(product(0));
  const trigger = root.querySelector('button[aria-haspopup="dialog"]');
  assert.equal(trigger.hasAttribute("disabled"), true);
  assert.match(byId(root, trigger.getAttribute("aria-describedby")).text, /not available yet/);
  assert.equal(root.querySelector("dialog").hasAttribute("open"), false);
  assertReferencesResolve(root);
});

test("configured WhatsApp dialog has labelled controls, icon and a truthful handoff note", () => {
  const root = harness({ whatsappNumber: "+919999999999" }).contact(product(0));
  const trigger = root.querySelector('button[aria-haspopup="dialog"]');
  const dialog = root.querySelector("dialog");
  assert.equal(trigger.hasAttribute("disabled"), false);
  assert.equal(trigger.getAttribute("aria-controls"), dialog.getAttribute("id"));
  assert.equal(trigger.querySelector("svg").getAttribute("aria-hidden"), "true");
  assert.match(byId(root, dialog.getAttribute("aria-labelledby")).text, /Your selection/);
  assert.match(byId(root, dialog.getAttribute("aria-describedby")).text, /does not place an order or reserve stock/);
  assert.equal(dialog.querySelectorAll("select").length, 2);
  for (const select of dialog.querySelectorAll("select")) {
    assert.ok(root.querySelectorAll("label").find((label) => label.getAttribute("for") === select.getAttribute("id")));
  }
  assert.ok(dialog.querySelector('button[aria-label="Close WhatsApp selection"]'));
  assert.ok(dialog.querySelector('output[aria-live="polite"]'));
  assertReferencesResolve(root);
});

test("initial WhatsApp selection never silently chooses size or bypasses stock verification", () => {
  const root = harness({ whatsappNumber: "+919999999999" }).contact(product(0));
  const dialog = root.querySelector("dialog");
  const size = dialog.querySelectorAll("select").find((select) => select.getAttribute("id").endsWith("-size"));
  assert.equal(size.querySelector("option[selected]").getAttribute("value"), "");
  assert.equal(size.querySelector('option[value="v0-l"]').hasAttribute("disabled"), true);
  assert.equal(dialog.querySelector(".continueButton").hasAttribute("disabled"), true);
  assert.equal(dialog.querySelectorAll(".quantityControl button[disabled]").length, 2);
  assert.equal(dialog.querySelector(".totalRow"), null);
});

test("invalid configured WhatsApp numbers fail closed", () => {
  for (const whatsappNumber of ["", "123", "https://wa.me/919999999999", "not-a-number"]) {
    const root = harness({ whatsappNumber }).contact(product(0));
    assert.equal(root.querySelector('button[aria-haspopup="dialog"]').hasAttribute("disabled"), true);
  }
});

test("review CTA and review submission have at least 48px minimum height", () => {
  assert.ok(parseFloat(cssRule("components/product-reviews.module.css", ".reviewButton")["min-height"]) >= 48);
  assert.equal(cssRule("components/product-reviews.module.css", ".reviewButton", "(max-width: 620px)").width, "100%");
  assert.ok(parseFloat(cssRule("app/review/[token]/review.module.css", ".submit")["min-height"]) >= 48);
});

test("brand collage CSS gives garments equal columns and reduces motion", () => {
  const base = cssRule("app/home.module.css", ".closeUpGallery");
  assert.equal(base["grid-template-columns"], "repeat(2, minmax(0, 1fr))");
  assert.equal(cssRule("app/home.module.css", ".closeUpImageWrap")["aspect-ratio"], "3 / 4");
  assert.equal(cssRule("app/home.module.css", ".closeUpImage", "(prefers-reduced-motion: reduce)").transition, "none");
});

test("modal CSS bounds desktop size and allows content scrolling", () => {
  const modal = cssRule("components/product-contact-actions.module.css", ".modal");
  assert.equal(modal.width, "min(560px, calc(100% - 48px))");
  assert.equal(modal["max-height"], "calc(100dvh - 48px)");
  assert.equal(modal["box-sizing"], "border-box");
  assert.equal(modal.overflow, "auto");
  assert.equal(modal["overscroll-behavior"], "contain");
});

test("mobile modal CSS is a bounded bottom sheet with safe-area space and readable selects", () => {
  const file = "components/product-contact-actions.module.css";
  const mobile = "(max-width: 540px)";
  const modal = cssRule(file, ".modal", mobile);
  assert.equal(modal.width, "100%");
  assert.equal(modal.inset, "auto 0 0");
  assert.equal(modal["max-height"], "92dvh");
  assert.match(modal.padding, /env\(safe-area-inset-bottom\)/);
  assert.ok(parseFloat(cssRule(file, ".modal select", mobile)["font-size"]) >= 16);
});

test("modal actions retain usable target sizes, focus outlines and reduced-motion styles", () => {
  const file = "components/product-contact-actions.module.css";
  assert.ok(parseFloat(cssRule(file, ".actions .whatsapp")["min-height"]) >= 48);
  assert.ok(parseFloat(cssRule(file, ".continueButton")["min-height"]) >= 48);
  assert.ok(parseFloat(cssRule(file, ".modal select")["min-height"]) >= 48);
  assert.ok(parseFloat(cssRule(file, ".quantityControl button").height) >= 44);
  assert.match(cssRule(file, ".modal button:focus-visible").outline, /3px solid/);
  assert.equal(cssRule(file, ".spinner", "(prefers-reduced-motion: reduce)").animation, "none");
});

test("dialog source retains native-modal, cancellation and focus-return hooks", () => {
  // Architectural regression guard only. This does not execute browser focus,
  // inertness, Escape handling, layout or React effects.
  const code = source("components/product-contact-actions.tsx");
  assert.match(code, /element\.showModal\(\)/);
  assert.match(code, /onCancel=\{\(\) => setOpen\(false\)\}/);
  assert.match(code, /trigger\.current\?\.focus\(\)/);
  assert.match(code, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(code, /request\.current\?\.abort\(\)/);
});
