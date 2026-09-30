/** Production-built homepage with isolated, read-only catalogue fixtures. No real customer/auth/order/payment writes. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : "playwright");
const port = 3101, apiPort = 4101, base = `http://127.0.0.1:${port}`;
const widths = [320, 360, 390, 412, 768, 1000, 1001, 1024, 1440, 1846];
const output = resolve("test-results/homepage-background"); await mkdir(output, { recursive: true });
const products = Array.from({ length: 6 }, (_, i) => ({ id: `ci-home-${i}`, slug: `ci-home-${i}`, name: `CI homepage kurta ${i + 1}`, collections: [], minPricePaise: 149900, maxPricePaise: 149900, inStock: true, images: [{ id: `ci-img-${i}`, url: "/products/myra-peach-comfort-kurta-set/01-main.png", alt: "CI catalogue fixture", position: 0 }], variants: [{ id: `ci-size-${i}`, sku: `CI-${i}-M`, size: "M", color: "Peach", pricePaise: 149900, mrpPaise: 149900, available: 4 }] }));
const requests = [], results = [], errors = [];
const upstream = createServer((req, res) => { requests.push({ method: req.method, url: req.url }); const catalogue = req.method === "GET" && /^\/v1\/products(?:\/featured)?(?:\?|$)/.test(req.url || ""); const cart = req.method === "GET" && /^\/v1\/carts\/[\w-]+$/.test(req.url || ""); const data = catalogue ? products : cart ? { items: [], itemCount: 0 } : { message: "Unexpected isolated fixture request" }; res.writeHead(catalogue || cart ? 200 : 404, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); });
await new Promise((done, reject) => { upstream.once("error", reject); upstream.listen(apiPort, "127.0.0.1", done); });
const server = spawn(process.execPath, [resolve("apps/web/node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: resolve("apps/web"), env: { ...process.env, NODE_ENV: "production", API_URL: `http://127.0.0.1:${apiPort}/v1`, INTERNAL_API_URL: `http://127.0.0.1:${apiPort}/v1` }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "", startError, browser, page;
server.on("error", error => { startError = error; }); server.stdout.on("data", data => { serverLog += data; }); server.stderr.on("data", data => { serverLog += data; });
const sleep = ms => new Promise(done => setTimeout(done, ms));
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) { if (startError) throw startError; if (server.exitCode !== null) throw new Error("Next exited: " + serverLog.slice(-2000)); try { ready = (await fetch(base + "/healthz", { signal: AbortSignal.timeout(2000) })).ok; } catch {} if (ready) break; await sleep(500); }
  assert(ready, "Isolated Next server did not become ready"); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce", deviceScaleFactor: 1 });
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  // Load once and exercise actual responsive transitions. Network-idle is not a layout assertion.
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Pieces to live in now.", exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Boolean(document.querySelector('[data-editorial-product] button[aria-pressed]:not(:disabled)')));
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.mouse.move(0, 0);
    await page.evaluate(() => { scrollTo({ top: 0, behavior: "instant" }); return new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
    await page.waitForFunction(() => document.querySelector(".site-header")?.getAttribute("data-scrolled") === "false");
    const snapshot = await page.evaluate(() => {
      const home = document.querySelector("#main-content > div"); if (!home) throw new Error("Missing homepage root");
      const style = element => { const s = getComputedStyle(element); return { color: s.backgroundColor, image: s.backgroundImage }; };
      const effective = element => { for (let current = element; current; current = current.parentElement) { const s = style(current); if (s.image !== "none") throw new Error("Unexpected surface image: " + current.className + " " + s.image); if (s.color !== "rgba(0, 0, 0, 0)" && s.color !== "transparent") return s.color; } return "transparent"; };
      const sections = [...home.children].filter(el => el.tagName === "SECTION"), neutral = [...home.querySelectorAll("[data-neutral-surface]")];
      const privilege = home.querySelector('[aria-labelledby="hidi-privileges-title"]'), featured = sections.find(el => el.querySelector("h2")?.textContent === "Pieces to live in now.");
      if (!privilege || !featured) throw new Error("Missing boundary sections");
      const header = document.querySelector(".site-header"), hero = home.querySelector('[data-section="hero"]');
      if (!header || !hero) throw new Error("Missing header or campaign");
      const headerBox = header.getBoundingClientRect(), heroBox = hero.getBoundingClientRect();
      return { headerSurfaceColor: getComputedStyle(header, "::before").backgroundColor, headerBottom: headerBox.bottom, heroTop: heroBox.top, home: style(home), homePaint: effective(home), neutral: neutral.map(el => ({ className: el.className, ...style(el), paint: effective(el) })), boundary: { upper: effective(privilege), lower: effective(featured) }, header: style(document.querySelector(".site-header")), headerSurface: getComputedStyle(document.querySelector(".site-header"), "::before").backgroundImage, headerInner: style(document.querySelector(".site-header .header-inner")), scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth };
    });
    results.push({ width, ...snapshot }); assert.equal(snapshot.neutral.length, 6, "All neutral homepage sections must be inspected"); assert.equal(snapshot.homePaint, "rgb(251, 246, 242)");
    for (const section of snapshot.neutral) { assert.equal(section.image, "none", section.className); assert.equal(section.paint, snapshot.homePaint, section.className); }
    assert.deepEqual(snapshot.boundary, { upper: "rgb(251, 246, 242)", lower: "rgb(251, 246, 242)" }); assert.equal(snapshot.headerInner.color, "rgba(0, 0, 0, 0)"); assert.equal(snapshot.headerInner.image, "none");
    // Mobile/tablet navigation has its own solid brand surface; desktop keeps the editorial overlay.
    if (width <= 1000) {
      assert.equal(snapshot.headerSurface, "none", `${width}: mobile header must not overlay a gradient on the garment`);
      assert.equal(snapshot.headerSurfaceColor, "rgb(89, 29, 32)", `${width}: approved solid mobile header colour`);
      assert(snapshot.heroTop >= snapshot.headerBottom - 1, `${width}: mobile campaign must start below navigation`);
    } else {
      assert.match(snapshot.headerSurface, /gradient/, `${width}: desktop editorial header gradient must remain`);
    }
    assert(snapshot.scrollWidth <= snapshot.viewport + 1, "Unexpected page overflow");
    await page.evaluate(() => { const section = document.querySelector('[aria-labelledby="hidi-privileges-title"]'), header = document.querySelector(".site-header"); scrollTo({ top: section.getBoundingClientRect().bottom + scrollY - header.getBoundingClientRect().height - 100, behavior: "instant" }); });
    await page.screenshot({ path: resolve(output, `boundary-${width}.png`) }); console.log(`PASS ${width}px: all six neutral sections and both sides of the reported seam render #FBF6F2 without gradients`);
  }
  assert(requests.some(req => req.url.startsWith("/v1/products/featured"))); assert(requests.every(req => req.method === "GET"), "Unexpected upstream write"); assert.deepEqual(errors, []);
  console.log(`${widths.length} production-build homepage viewport checks passed. Catalogue data is isolated; this is not live checkout certification.`);
} catch (error) { errors.push(String(error?.stack || error)); if (page && !page.isClosed()) { await page.screenshot({ path: resolve(output, "failure.png"), timeout: 10000 }).catch(() => {}); await writeFile(resolve(output, "failure.html"), await page.content().catch(() => "")); } throw error; }
finally { await writeFile(resolve(output, "result.json"), JSON.stringify({ results, errors, requests }, null, 2)); await writeFile(resolve(output, "next-server.log"), serverLog); if (browser) await browser.close(); server.kill("SIGTERM"); upstream.closeAllConnections(); await new Promise(done => upstream.close(done)); }
