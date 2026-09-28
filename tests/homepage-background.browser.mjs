/**
 * Production-built homepage, isolated read-only catalogue fixtures.
 * No real customer, authentication, order, payment or cloud writes.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.HIDI_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : "playwright");
const port = 3101, apiPort = 4101, base = `http://127.0.0.1:${port}`;
const output = resolve("test-results/homepage-background");
await mkdir(output, { recursive: true });
const products = Array.from({ length: 4 }, (_, i) => ({
  id: `ci-home-${i}`, slug: `ci-home-${i}`, name: `CI homepage kurta ${i + 1}`,
  collections: [], minPricePaise: 149900, maxPricePaise: 149900, inStock: true,
  images: [{ id: `ci-img-${i}`, url: "/products/myra-peach-comfort-kurta-set/01-main.png", alt: "CI catalogue fixture", position: 0 }],
  variants: [{ id: `ci-size-${i}`, sku: `CI-${i}-M`, size: "M", color: "Peach", pricePaise: 149900, mrpPaise: 149900, available: 4 }],
}));
const requests = [], results = [], errors = [];
const upstream = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url });
  const allowed = req.method === "GET" && /^\/v1\/products(?:\/featured)?(?:\?|$)/.test(req.url || "");
  res.writeHead(allowed ? 200 : 404, { "Content-Type": "application/json" });
  res.end(JSON.stringify(allowed ? products : { message: "Unexpected isolated fixture request" }));
});
await new Promise((done, reject) => { upstream.once("error", reject); upstream.listen(apiPort, "127.0.0.1", done); });
const server = spawn(process.execPath, [
  resolve("apps/web/node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port),
], {
  cwd: resolve("apps/web"),
  env: { ...process.env, NODE_ENV: "production", API_URL: `http://127.0.0.1:${apiPort}/v1` },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "", startError, browser;
server.on("error", error => { startError = error; });
server.stdout.on("data", data => { serverLog += data; });
server.stderr.on("data", data => { serverLog += data; });
const sleep = ms => new Promise(done => setTimeout(done, ms));
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (startError) throw startError;
    if (server.exitCode !== null) throw new Error("Next exited: " + serverLog.slice(-2000));
    try {
      ready = (await fetch(base + "/healthz", { signal: AbortSignal.timeout(2000) })).ok;
    } catch {}
    if (ready) break;
    await sleep(500);
  }
  assert(ready, "Isolated Next server did not become ready");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce", deviceScaleFactor: 1 });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.origin === base ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [390, 768, 1024, 1440, 1846]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Pieces to live in now.", exact: true }).waitFor();
    await page.mouse.move(0, 0);
    const snapshot = await page.evaluate(() => {
      const home = document.querySelector("#main-content > div");
      if (!home) throw new Error("Missing homepage root");
      const style = element => {
        const s = getComputedStyle(element);
        return { color: s.backgroundColor, image: s.backgroundImage };
      };
      const effective = element => {
        for (let current = element; current; current = current.parentElement) {
          const s = style(current);
          if (s.image !== "none") throw new Error("Unexpected surface image: " + current.className + " " + s.image);
          if (s.color !== "rgba(0, 0, 0, 0)" && s.color !== "transparent") return s.color;
        }
        return "transparent";
      };
      const sections = [...home.children].filter(el => el.tagName === "SECTION");
      // Hero and manifesto are photography, not neutral page surfaces.
      const neutral = sections.filter(el => !el.querySelector("h1") && el.getAttribute("aria-label") !== "HIDI occasion editorial");
      const privilege = home.querySelector('[aria-labelledby="hidi-privileges-title"]');
      const featured = sections.find(el => el.querySelector("h2")?.textContent === "Pieces to live in now.");
      if (!privilege || !featured) throw new Error("Missing boundary sections");
      return {
        home: style(home), homePaint: effective(home),
        neutral: neutral.map(el => ({ className: el.className, ...style(el), paint: effective(el) })),
        boundary: { upper: effective(privilege), lower: effective(featured) },
        header: style(document.querySelector(".site-header")),
        headerInner: style(document.querySelector(".site-header .header-inner")),
        scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      };
    });
    assert.equal(snapshot.neutral.length, 5, "All neutral homepage sections must be inspected");
    assert.equal(snapshot.homePaint, "rgb(251, 246, 242)");
    for (const section of snapshot.neutral) {
      assert.equal(section.image, "none", section.className);
      assert.equal(section.paint, snapshot.homePaint, section.className);
    }
    assert.deepEqual(snapshot.boundary, { upper: "rgb(251, 246, 242)", lower: "rgb(251, 246, 242)" });
    assert.equal(snapshot.headerInner.color, "rgba(0, 0, 0, 0)");
    assert.equal(snapshot.headerInner.image, "none");
    assert.match(snapshot.header.image, /gradient/);
    assert(snapshot.scrollWidth <= snapshot.viewport + 1, "Unexpected page overflow");
    await page.evaluate(() => {
      const section = document.querySelector('[aria-labelledby="hidi-privileges-title"]');
      const header = document.querySelector(".site-header");
      scrollTo({ top: section.getBoundingClientRect().bottom + scrollY - header.getBoundingClientRect().height - 100, behavior: "instant" });
    });
    await page.screenshot({ path: resolve(output, `boundary-${width}.png`) });
    results.push({ width, ...snapshot });
    console.log(`PASS ${width}px: all five neutral sections and both sides of the reported seam render #FBF6F2 without gradients`);
  }
  assert(requests.some(req => req.url.startsWith("/v1/products/featured")));
  assert(requests.every(req => req.method === "GET"), "Unexpected upstream write");
  assert.deepEqual(errors, []);
  console.log("5 production-build homepage viewport checks passed. Catalogue data is isolated; this is not live checkout certification.");
} finally {
  await writeFile(resolve(output, "result.json"), JSON.stringify({ results, errors, requests }, null, 2));
  await writeFile(resolve(output, "next-server.log"), serverLog);
  if (browser) await browser.close();
  server.kill("SIGTERM");
  upstream.closeAllConnections();
  await new Promise(done => upstream.close(done));
}
