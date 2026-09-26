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

function harness({ products = [], bestSellers = [], whatsappNumber = "" } = {}) {
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
      getBestSellers: async () => bestSellers,
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

test("homepage launch fallback is bounded, premium and navigable", async () => {
  const root = await harness({ products: catalogue }).homepage();
  assert.equal(root.querySelectorAll("[data-qa-product]").length, 4, "premium homepage edit remains intentionally bounded");
  assert.match(root.text, /THE HIDI EDIT/);
  assert.match(root.text, /Pieces to live in now/);
  assert.match(root.text, /Indian wear, made to feel effortless/);
  assert.equal(root.querySelector(".heroCta").getAttribute("href"), "/collections/new-arrivals");
  assert.equal(root.querySelector(".heroImage").getAttribute("src"), "/brand/hidi-hero-green-garden-fullbody.webp");
  assert.match(root.querySelector(".heroImage").getAttribute("alt"), /full-length garden editorial/);
  assert.equal(root.querySelector(".inlineLink").getAttribute("href"), "/about");
  assertReferencesResolve(root);
});

test("homepage premium edit keeps real best sellers first when sales data exists", async () => {
  const bestSellers = [product(6), product(2), product(9)];
  const root = await harness({ products: catalogue, bestSellers }).homepage();
  const cards = root.querySelectorAll("[data-qa-product]");
  assert.equal(cards.length, 4);
  assert.deepEqual(
    cards.slice(0, bestSellers.length).map((card) => card.getAttribute("data-qa-product")),
    bestSellers.map((item) => item.slug),
  );
  assert.equal(cards[3].getAttribute("data-qa-product"), "style-0", "catalogue fallback only fills the remaining premium slot");
  assert.match(root.text, /Pieces to live in now/);
  assert.doesNotMatch(root.text, /A rotating edit led by what customers are choosing now/);
});

test("Shop by Edit stays concise and lets the three editorials lead", async () => {
  const root = await harness({ products: catalogue }).homepage();
  assert.match(root.text, /SHOP BY EDIT/);
  assert.match(root.text, /Work\. Everyday\. Occasion\./);
  assert.doesNotMatch(root.text, /Three moods\. One HIDI point of view\./);
  assert.doesNotMatch(root.text, /Move from work to everyday plans/);
});

test("homepage exposes the four core collection destinations without a marketplace strip", async () => {
  const root = await harness({ products: catalogue }).homepage();
  const hrefs = new Set(root.querySelectorAll("a").map((link) => link.getAttribute("href")));
  for (const href of [
    "/collections/new-arrivals",
    "/collections/work-edit",
    "/collections/everyday",
    "/collections/occasion",
  ]) {
    assert.equal(hrefs.has(href), true, `missing core collection destination ${href}`);
  }
  assert.equal(root.querySelector('[aria-label="Shop HIDI edits"]').querySelectorAll("a").length, 3);
});

test("homepage showcases HIDI Privileges without turning into a discount banner", async () => {
  const root = await harness({ products: catalogue }).homepage();
  const section = root.querySelector('[aria-labelledby="hidi-privileges-title"]');
  assert.ok(section);
  assert.match(section.text, /The ₹1 HIDI Privilege/);
  assert.match(section.text, /A Little Silver/);
  assert.match(section.text, /HIDI Rewards/);
  assert.match(section.text, /₹3,999\+/);
  assert.match(section.text, /2 g silver launch keepsake/);
  assert.equal(section.querySelectorAll("a").length, 3);

  const hrefs = section.querySelectorAll("a").map((link) => link.getAttribute("href"));
  assert.deepEqual(hrefs, ["/collections/all", "/collections/new-arrivals", "/account"]);
});

test("homepage follows the simplified editorial shopping flow", () => {
  const page = source("app/page.tsx");
  const hero = page.indexOf('className={styles.hero}');
  const edits = page.indexOf('className={styles.editSection}');
  const editorial = page.indexOf('className={styles.manifesto}');
  const privileges = page.indexOf('className={styles.privileges}');
  const featured = page.indexOf('className={styles.featured');
  const services = page.indexOf('className={styles.serviceStrip}');
  const brandStory = page.indexOf('className={styles.intro}');

  assert.ok(hero >= 0, "hero is present");
  assert.ok(edits > hero, "Shop by Edit follows the hero");
  assert.ok(editorial > edits, "Ananya editorial follows Shop by Edit");
  assert.ok(privileges > editorial, "HIDI Privileges follows Ananya editorial");
  assert.ok(featured > privileges, "featured products follow HIDI Privileges");
  assert.ok(services > featured, "service strip follows featured products");
  assert.ok(brandStory > services, "short brand story closes the homepage");
  assert.doesNotMatch(page, /principleGrid/, "repetitive principles grid stays removed");
});

test("HIDI Privileges keeps an editorial three-column desktop layout and stacked mobile layout", () => {
  const file = "app/home.module.css";
  assert.equal(
    cssRule(file, ".privilegeGrid")["grid-template-columns"],
    "repeat(3, minmax(0, 1fr))",
  );
  assert.equal(
    cssRule(file, ".privilegeGrid", "(max-width: 1100px)")["grid-template-columns"],
    "1fr",
  );
  assert.equal(
    cssRule(file, ".privilegeCard", "(prefers-reduced-motion: reduce)").transition,
    "none",
  );
});

test("homepage service strip communicates four practical shopping promises", async () => {
  const root = await harness({ products: catalogue }).homepage();
  const bar = root.querySelector('[aria-label="HIDI shopping services"]');
  assert.ok(bar);
  assert.equal(bar.querySelectorAll(".serviceItem").length, 4);
  assert.match(bar.text, /Complimentary shipping/);
  assert.match(bar.text, /Easy exchange/);
  assert.match(bar.text, /Secure checkout/);
  assert.match(bar.text, /Human shopping help/);
});

test("homepage WhatsApp service falls back safely when no business number is configured", async () => {
  const root = await harness({ products: catalogue }).homepage();
  const link = root.querySelector(".serviceLink");
  assert.equal(link.getAttribute("href"), "/account");
  assert.equal(link.hasAttribute("target"), false);
});

test("homepage WhatsApp service creates a clean external handoff when configured", async () => {
  const root = await harness({ products: catalogue, whatsappNumber: "+91 99999 99999" }).homepage();
  const link = root.querySelector(".serviceLink");
  assert.match(link.getAttribute("href"), /^https:\/\/wa\.me\/919999999999\?text=/);
  assert.equal(link.getAttribute("target"), "_blank");
  assert.equal(link.getAttribute("rel"), "noreferrer");
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

test("homepage hero preserves the full-body garden composition on desktop", () => {
  const file = "app/home.module.css";
  const hero = cssRule(file, ".hero");
  assert.equal(hero.width, "100%");
  assert.equal(hero.height, "auto");
  assert.equal(hero["aspect-ratio"], "1672 / 941");

  const image = cssRule(file, ".heroImage");
  assert.equal(image["object-fit"], "cover");
  assert.equal(image["object-position"], "center center");

  const mobileHero = cssRule(file, ".hero", "(max-width: 760px)");
  assert.equal(mobileHero["aspect-ratio"], "auto");
  assert.match(mobileHero.height, /clamp\(560px/);
});

test("homepage section transitions stay compact without oversized blank gaps", () => {
  const file = "app/home.module.css";
  const editSection = cssRule(file, ".editSection");
  assert.match(editSection["padding-top"], /clamp\(28px/);

  const featured = cssRule(file, ".featured");
  assert.match(featured["padding-top"], /clamp\(42px/);
  assert.match(featured["padding-bottom"], /clamp\(40px/);

  const mobileEdit = cssRule(file, ".editSection", "(max-width: 760px)");
  assert.equal(mobileEdit["padding-top"], "26px");

  const mobileFeatured = cssRule(file, ".featured", "(max-width: 760px)");
  assert.equal(mobileFeatured["padding-top"], "40px");
  assert.equal(mobileFeatured["padding-bottom"], "42px");
});

test("homepage premium interactions preserve desktop rhythm, mobile stacking and reduced motion", () => {
  const file = "app/home.module.css";
  assert.equal(cssRule(file, ".edits")["grid-template-columns"], "repeat(3, minmax(0, 1fr))");
  assert.equal(cssRule(file, ".productGrid")["grid-template-columns"], "repeat(4, minmax(0, 1fr))");
  assert.equal(cssRule(file, ".serviceGrid")["grid-template-columns"], "repeat(4, minmax(0, 1fr))");
  assert.equal(cssRule(file, ".edits", "(max-width: 760px)")["grid-template-columns"], "1fr");
  assert.equal(cssRule(file, ".editCard img", "(prefers-reduced-motion: reduce)").transition, "none");
  assert.equal(cssRule(file, ".serviceLink", "(prefers-reduced-motion: reduce)").transition, "none");
  assert.match(cssRule(file, ".intro").padding, /clamp\(46px/);
  assert.equal(cssRule(file, ".serviceItem")["min-height"], "88px");
});

test("manifesto is a full-width uncropped Ananya editorial with no overlaid copy", () => {
  const page = source("app/page.tsx");
  assert.match(page, /\/brand\/hidi-manifesto-ananya\.webp/);
  assert.match(page, /Ananya in a royal purple HIDI occasion dress/);
  assert.doesNotMatch(page, /Designed to feel considered\. Never complicated\./);
  assert.doesNotMatch(page, /HIDI \/ Occasion/);
  assert.doesNotMatch(page, /Ananya['’]s Pick/i);

  const file = "app/home.module.css";
  const section = cssRule(file, ".manifesto");
  assert.equal(section.width, "100%");
  assert.equal(section.padding, "0");

  const image = cssRule(file, ".manifestoFullImage");
  assert.equal(image.width, "100%");
  assert.equal(image.height, "auto");
  assert.equal(image["object-fit"], "contain");
});

test("storefront typography is build-safe and does not depend on Google font fetching", () => {
  const layout = source("app/layout.tsx");
  assert.doesNotMatch(layout, /next\/font\/google/);
  const globals = source("app/globals.css");
  assert.match(globals, /--font-display:\s*Georgia/);
  assert.match(globals, /--font-product:[^;]*Futura[^;]*Century Gothic/);
});

test("HIDI theme keeps homepage and catalogue commerce on Mulberry, Gold and warm ivory", () => {
  const globalCss = source("app/globals.css");
  assert.match(
    globalCss,
    /HIDI AUTHORITATIVE BRAND TOKENS[\s\S]*--hidi-mulberry-clay:\s*#591d20;[\s\S]*--hidi-mulberry-gold:\s*#d5a24d;/,
  );

  const manifesto = cssRule("app/home.module.css", ".manifesto");
  assert.equal(manifesto.background, "#ead8c4");

  const serviceStrip = cssRule("app/home.module.css", ".serviceStrip");
  assert.match(serviceStrip.background, /var\(--home-soft\)/);

  const selectedSize = cssRule("components/product-card.module.css", ".fitRibbonSizeActive");
  assert.equal(selectedSize.background, "var(--card-brand)");
  assert.equal(selectedSize.color, "#fff8ef");
  assert.match(selectedSize["box-shadow"], /rgba\(213,162,77/);

  const add = cssRule("components/product-card.module.css", ".addButton");
  assert.equal(add.background, "var(--card-brand)");
  assert.equal(add.color, "#fff8ef");

  const buy = cssRule("components/product-card.module.css", ".buyButton");
  assert.equal(buy.background, "#fffaf5");
  assert.equal(buy.color, "var(--card-brand)");

  const filterCount = cssRule("components/collection-browser.module.css", ".filterCount");
  assert.equal(filterCount.background, "var(--hidi-mulberry-clay, #591d20)");
});

test("Option 1 footer keeps the HIDI ending dusty clay, gold and responsive", () => {
  const file = "app/globals.css";
  const footer = cssRule(file, ".footer");
  assert.equal(footer.background, "var(--footer-clay)");
  assert.equal(footer.color, "var(--footer-ink)");
  assert.equal(footer["border-top"], "4px solid #d6b06b");

  const main = cssRule(file, ".footer-main");
  assert.match(main.background, /#96574f/);
  assert.match(main.background, /var\(--footer-clay\)/);
  assert.match(main.background, /#824943/);

  const heading = cssRule(file, ".footer h3");
  assert.equal(heading.color, "var(--footer-gold-bright)");

  const link = cssRule(file, ".footer-grid a");
  assert.equal(link.color, "#fff3e8");
  assert.equal(cssRule(file, ".footer-grid a:hover").color, "var(--footer-gold-bright)");

  const bottom = cssRule(file, ".footer-bottom-shell");
  assert.match(bottom.background, /var\(--footer-clay-deep\)/);

  assert.equal(
    cssRule(file, ".footer .footer-grid", "(max-width: 620px)")["grid-template-columns"],
    "1fr 1fr",
  );
  assert.equal(
    cssRule(file, ".footer .footer-bottom", "(max-width: 620px)")["flex-direction"],
    "column",
  );

  const footerSource = source("components/site-footer.tsx");
  assert.match(footerSource, /footer-bottom-shell/);
  assert.match(footerSource, /Good clothes\. Brighter days\./);
  assert.match(footerSource, /\/collections\/all/);
});

test("HIDI Privileges use the header Mulberry colour on hover and focus", () => {
  const file = "app/home.module.css";
  const hover = cssRule(file, ".privilegeCard:hover");
  assert.equal(hover.background, "var(--home-brand)");
  assert.equal(hover.color, "#fff8ef");

  assert.equal(
    cssRule(file, ".privilegeCard:hover .privilegeCopy h3").color,
    "#fff8ef",
  );
  assert.equal(
    cssRule(file, ".privilegeCard:hover .privilegeCta").color,
    "var(--home-gold)",
  );
});

test("WhatsApp ordering uses the recognisable WhatsApp mark", () => {
  const card = source("components/product-card.tsx");
  assert.match(card, /WhatsAppIcon size=\{16\} className=\{styles\.whatsappIcon\}/);
  assert.match(card, /Order on WhatsApp/);

  const css = cssRule("components/product-card.module.css", ".whatsappIcon");
  assert.equal(css.color, "#25d366");

  const homepage = source("app/page.tsx");
  assert.match(homepage, /WhatsAppIcon size=\{18\} className=\{styles\.serviceWhatsappIcon\}/);
});

test("HIDI Fit selected size toggles off when the same size is clicked again", () => {
  const card = source("components/product-card.tsx");
  assert.match(card, /const deselecting = variantId === variant\.id;/);
  assert.match(card, /setVariantId\(deselecting \? "" : variant\.id\);/);
  assert.match(card, /rememberSelection\(deselecting \? undefined : variant\);/);
  assert.match(card, /Unselect size/);
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
