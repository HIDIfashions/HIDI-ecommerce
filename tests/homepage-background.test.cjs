// Regression for the visible HIDI Privileges -> featured-products colour seam.
// Browser coverage uses the production build in homepage-background.browser.mjs.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const css = fs.readFileSync(path.resolve(__dirname, "../apps/web/app/home.module.css"), "utf8");
const baseRule = (name) => {
  const match = css.match(new RegExp("\\." + name + "\\s*\\{([^}]+)\\}"));
  assert(match, "Missing homepage rule: " + name);
  return match[1];
};

test("homepage neutral tokens resolve to the same shared ivory", () => {
  const home = baseRule("home");
  assert.match(home, /--home-paper:\s*var\(--hidi-page-bg,\s*#fbf6f2\);/);
  assert.match(home, /--home-soft:\s*var\(--hidi-page-bg,\s*#fbf6f2\);/);
});

test("Privileges has a flat shared background, not a separate beige or gold gradient", () => {
  assert.match(baseRule("privileges"), /background:\s*var\(--home-paper\);/);
  assert.doesNotMatch(baseRule("privileges"), /gradient|background-image|#fbf7f2|#f8f0e9/i);
});

test("shopping services use the same flat ivory as the next brand-story section", () => {
  assert.match(baseRule("serviceStrip"), /background:\s*var\(--home-soft\);/);
  assert.match(baseRule("intro"), /background:\s*var\(--home-soft\);/);
});

test("responsive rules cannot reintroduce a gradient on neutral homepage sections", () => {
  for (const name of ["home", "intro", "editSection", "featured", "privileges", "serviceStrip"]) {
    const rules = css.matchAll(new RegExp("\\." + name + "\\s*\\{([^}]+)\\}", "g"));
    for (const [, declarations] of rules) {
      assert.doesNotMatch(declarations, /(?:background(?:-image|-color)?):[^;]*(?:gradient|#f8f0e9|#fbf7f2)/i, name);
    }
  }
});

test("privilege-card hover/focus and image-overlay treatments remain distinct", () => {
  assert.match(css, /\.privilegeCard:hover,\s*\.privilegeCard:focus-visible\s*\{[^}]*background:\s*var\(--home-brand\);/);
  assert.match(baseRule("heroShade"), /linear-gradient/);
  assert.match(baseRule("editShade"), /linear-gradient/);
});
