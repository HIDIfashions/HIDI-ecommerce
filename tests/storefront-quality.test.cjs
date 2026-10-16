const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = p => readFileSync(resolve(__dirname, '../apps/web', p), 'utf8');
test('quality layer loads last without overriding admin or approved theme tokens', () => {
 const layout = read('app/layout.tsx'), css = read('app/storefront-quality.css');
 assert(layout.indexOf('storefront-quality.css') > layout.indexOf('editorial-chrome.css'));
 assert.doesNotMatch(css, /--(?:hidi-page-bg|font-sans)\s*:/);
 assert.match(css, /#main-content/);
});
test('phone and tablet navigation no longer overlaps the campaign', () => {
 const css = read('app/storefront-quality.css');
 assert.match(css, /max-width: 1000px/);
 assert.match(css, /\.site-header\[data-home="true"\] \{ margin-bottom: 0;/);
});
test('mobile garment area is separate from campaign copy and motion button', () => {
 const css = read('app/home.module.css'), source = read('components/editorial-motion.tsx');
 assert.match(css, /\.hero \[data-hidi-campaign\] \{ bottom: 190px;/);
 assert.match(css, /height: 190px; padding: 20px 22px 18px; background: var\(--home-paper\)/);
 assert.match(css, /\[data-hidi-motion-control\] \{ bottom: 206px;/);
 assert.match(source, /data-hidi-campaign/); assert.match(source, /data-hidi-motion-control/);
});
test('PDP touch controls have 48px targets and keyboard focus clears sticky chrome', () => {
 const css = read('app/storefront-quality.css');
 assert.match(css, /min-height: 48px; min-width: 48px/);
 assert.match(css, /scroll-margin-block:/); assert.match(css, /:focus-visible/);
});
test('entry fields keep a readable minimum without changing colour swatches', () => {
 const css = read('app/storefront-quality.css');
 assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
 assert.match(css, /font-size: max\(16px, 1rem\)/);
 assert.doesNotMatch(css, /background(?:-color)?:\s*(white|#fff)/i);
});

test("catalogue filter drawer clears the sticky header and uses reachable controls", () => {const css=read("components/collection-browser.module.css");assert.match(css,/z-index: 1201/);assert.match(css,/z-index: 1200/);assert.match(css,/top: var\(--hidi-header-height, 63px\)/);assert.match(css,/min-height: 44px/);});
