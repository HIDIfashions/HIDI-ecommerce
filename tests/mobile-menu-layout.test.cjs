const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const header = readFileSync(path.join(root, "apps/web/components/header.tsx"), "utf8");
const css = readFileSync(path.join(root, "apps/web/app/launch-overrides.css"), "utf8");
const effect = header.match(/useLayoutEffect\(\(\) => \{([\s\S]*?)\n  \}, \[menuOpen\]\);/)[1];

function setup(width, bottom, menuOpen = true) {
  const values = new Map();
  const listeners = new Map();
  const viewportListeners = new Map();
  let bounds = bottom;
  let disconnected = false;
  let observerCallback;
  const updates = [];
  const element = {
    style: { setProperty: (k, v) => values.set(k, v), removeProperty: k => values.delete(k) },
    getBoundingClientRect: () => ({ bottom: bounds }),
  };
  const window = {
    innerWidth: width,
    addEventListener: (k, fn) => listeners.set(k, fn),
    removeEventListener: k => listeners.delete(k),
    visualViewport: {
      addEventListener: (k, fn) => viewportListeners.set(k, fn),
      removeEventListener: k => viewportListeners.delete(k),
    },
  };
  class ResizeObserver {
    constructor(fn) { observerCallback = fn; }
    observe(el) { assert.equal(el, element); }
    disconnect() { disconnected = true; }
  }
  const cleanup = vm.runInNewContext("(function () {" + effect + "})()", {
    window, ResizeObserver, menuOpen, headerRef: { current: element },
    setMenuOpen: value => updates.push(value),
  });
  return { values, listeners, viewportListeners, window, updates, cleanup,
    resizeHeader: value => { bounds = value; observerCallback(); },
    get disconnected() { return disconnected; } };
}

test("drawer tracks actual header bottom at phone and tablet widths", () => {
  for (const [width, bottom] of [[320,89], [360,89], [390,89], [412,89], [768,71], [1000,71]]) {
    const state = setup(width, bottom);
    assert.equal(state.values.get("--hidi-menu-top"), bottom + "px");
    state.cleanup();
  }
});
test("header resize and viewport/scroll changes recompute the anchor", () => {
  const state = setup(390, 89);
  state.resizeHeader(103.5);
  assert.equal(state.values.get("--hidi-menu-top"), "103.5px");
  state.listeners.get("scroll")();
  state.viewportListeners.get("resize")();
  assert.equal(state.values.get("--hidi-menu-top"), "103.5px");
  state.cleanup();
});
test("desktop transition closes the mobile drawer", () => {
  const state = setup(390,89);
  state.window.innerWidth = 1200;
  state.listeners.get("resize")();
  assert.deepEqual(state.updates, [false]);
  state.cleanup();
});
test("closing removes observers, listeners and measured state", () => {
  const state = setup(390,89);
  state.cleanup();
  assert.equal(state.disconnected, true);
  assert.equal(state.listeners.size,0);
  assert.equal(state.viewportListeners.size,0);
  assert.equal(state.values.size,0);
});
test("closed menu does not measure or attach observers", () => {
  const state = setup(390,89,false);
  assert.equal(state.values.size,0);
  assert.equal(state.listeners.size,0);
  assert.equal(state.cleanup,undefined);
});
test("CSS protects viewport positioning and scrollable content from regression", () => {
  assert.match(css, /@media \(max-width: 1000px\)/);
  assert.match(css, /-webkit-backdrop-filter: none !important/);
  assert.match(css, /\n    backdrop-filter: none !important/);
  assert.match(css, /inset: var\(--hidi-menu-top, 0px\) 0 0 !important/);
  assert.match(css, /height: calc\(100dvh - var\(--hidi-menu-top, 0px\)\) !important/);
  assert.doesNotMatch(css, /(?:108|114|184)px/);
  const links = css.match(/\.mobile-nav-links \{([^}]+)\}/)[1];
  assert.match(links, /min-height: 0 !important/);
  assert.match(links, /overflow-y: auto !important/);
  const account = css.match(/\.mobile-nav-account \{([^}]+)\}/)[1];
  assert.match(account, /flex: 0 0 auto !important/);
});
