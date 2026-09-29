// Source-level regression contracts; browser/layout checks run separately.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('apps/web/app/storefront-surfaces.css');
const header = read('apps/web/components/header.tsx');
const homeClick = header.match(/function handleWordmarkClick[^\{]+\{([\s\S]*?)\n  \}/)[1];

test('surface overrides load after typography and compatibility styles', () => {
  const layout = read('apps/web/app/layout.tsx');
  const index = layout.indexOf('import "./storefront-surfaces.css"');
  assert(index > layout.indexOf('import "./typography.css"'));
  assert(index > layout.indexOf('import "./launch-overrides.css"'));
});
test('one shared ivory token drives public surfaces', () => {
  assert.match(css, /--hidi-page-bg:\s*#fbf6f2;/);
  assert.match(css, /--paper:\s*var\(--hidi-page-bg\);/);
  assert.match(css, /--ivory:\s*var\(--hidi-page-bg\);/);
});
test('inner header is transparent, and desktop grid fits the approved logo', () => {
  assert.match(css, /\.site-header \.header-inner\s*\{\s*background:\s*transparent;/);
  assert.match(css, /@media \(min-width: 1001px\)[\s\S]*?grid-template-columns:\s*176px minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(css, /\.mobile-nav-panel\s*\{/);
  assert.doesNotMatch(css, /\.footer\s*\{/);
});
test('collection title is 24px desktop and 22px mobile, using shared font', () => {
  assert.match(css, /\.collection-page \.collection-header h1\s*\{[^}]*font-family:\s*var\(--font-sans\);[^}]*font-size:\s*24px;/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.collection-page \.collection-header h1\s*\{\s*font-size:\s*22px;/);
});
test('collection headings do not reintroduce HIDI EDIT or descriptive subtitle', () => {
  for (const file of ['apps/web/app/collections/all/page.tsx', 'apps/web/app/collections/[slug]/page.tsx']) {
    const markup = read(file).match(/<header className="collection-header">([\s\S]*?)<\/header>/)[1];
    assert.doesNotMatch(markup, /HIDI EDIT|<p\b/);
    assert.match(markup, /<h1>/);
  }
});
test('home logo scrolls to top and closes the menu without stealing focus', () => {
  const calls = [];
  vm.runInNewContext('(function(){' + homeClick + '})()', {
    pathname: '/', closeMenu: v => calls.push(['close', v]),
    event: { preventDefault: () => calls.push(['prevent']) },
    window: { scrollTo: v => calls.push(['scroll', v.top, v.left, v.behavior]) },
  });
  assert.deepEqual(calls, [['close', false], ['prevent'], ['scroll', 0, 0, 'smooth']]);
});
test('logo on another page retains normal Next Link navigation to home', () => {
  const calls = [];
  vm.runInNewContext('(function(){' + homeClick + '})()', {
    pathname: '/collections/all', closeMenu: v => calls.push(v),
    event: { preventDefault: () => assert.fail('must retain link navigation') },
    window: { scrollTo: () => assert.fail('must navigate before scrolling') },
  });
  assert.deepEqual(calls, [false]);
  assert.match(header, /<Link className="wordmark" href="\/"/);
});
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('admin') || ['node_modules', '.next', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.module.css')) yield full;
  }
}
test('public CSS modules contain no hard-coded white surface fills', () => {
  for (const file of walk(path.join(root, 'apps/web'))) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/\bbackground(?:-color)?\s*:\s*([^;}]+)/g)) {
      assert.doesNotMatch(match[1], /(?<![\w-])(?:#ffffff|#fff|#fcf9f9|white)(?![\w-])/i, path.relative(root, file));
      for (const rgba of match[1].matchAll(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/g)) {
        assert(Number(rgba[1]) < 0.7, path.relative(root, file) + ': white glass surface');
      }
    }
  }
});
test('inline product and cart fills use the shared token without altering imagery', () => {
  const page = read('apps/web/app/products/[slug]/page.tsx');
  const media = read('apps/web/components/product-purchase-summary.tsx');
  assert.match(page, /<ProductMedia key=\{product\.id\} product=\{product\}/);
  assert.match(media, /<ProductGallery/);
  assert.match(media, /specific\.length \? specific : product\.images/);
  for (const file of ['product-gallery.tsx', 'cart-client.tsx', 'catalog-image.tsx']) {
    const content = read('apps/web/components/' + file);
    assert.doesNotMatch(content, /background:\s*"(?:#fff(?:fff)?|white|rgba\(255,255,255,\.(?:9|92)\))"/);
    assert.match(content, /var\(--hidi-page-bg, #fbf6f2\)/);
  }
});
test('native input rule excludes color swatches and validation feedback', () => {
  assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="color"\]\)/);
  assert.match(css, /:not\(:user-invalid\)/);
  assert.doesNotMatch(css, /filter\s*:/);
});
