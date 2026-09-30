import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collections } from '../src/data/collections.js';
import { slideDelta, wrapIndex } from '../src/data/carousel.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const item of collections) await access(path.join(root, 'public/assets', item.image));
for (const item of ['images/hidi-logo.png', 'images/hidi-full-logo-ad0f5383c1-16.png', 'images/hidi-full-logo-ad0f5383c1-32.png', 'images/hidi-full-logo-ad0f5383c1-48.png', 'images/hidi-full-logo-ad0f5383c1-180.png', 'images/hidi-full-logo-ad0f5383c1-256.png', 'images/hero-landscape.webp', 'images/hero-portrait.webp',
  'images/footer-pattern.svg', 'images/hero-desktop-luminous-first-frame-v1.webp', 'images/hero-mobile-luminous-first-frame-v1.webp',
  'video/hidi-hero-desktop-luminous-v1.mp4', 'video/hidi-hero-mobile-luminous-v1.mp4']) {
  await access(path.join(root, 'public/assets', item));
}
assert.equal(new Set(collections.map((item) => item.id)).size, collections.length);
assert.equal(wrapIndex(-1, 5), 4);
assert.equal(wrapIndex(5, 5), 0);
for (let active = 0; active < 5; active++) {
  const positions = collections.map((_, index) => slideDelta(index, active, 5));
  assert.equal(new Set(positions).size, 5);
  assert.equal(positions[active], 0);
  assert.ok(positions.every((delta) => Math.abs(delta) <= 2));
}
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) await scan(file);
    else if (/\.jsx?$/.test(item.name)) {
      const text = await readFile(file, 'utf8');
      assert.ok(!text.includes('dangerouslySetInnerHTML'), `${file}: unexpected HTML wrapper`);
      for (const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        await access(path.resolve(path.dirname(file), match[1]));
      }
    }
  }
}
await scan(path.join(root, 'src'));
const carouselSource = await readFile(path.join(root, 'src/components/RangeCarousel.jsx'), 'utf8');
assert.ok(!carouselSource.includes('hidi-collection-counter'), 'Visible collection counter must remain removed.');
assert.ok(!carouselSource.includes('hidi-collection-motion'), 'Visible collection play control must remain removed.');
const portraitSource = await readFile(path.join(root, 'src/components/MeetHidi.jsx'), 'utf8');
assert.ok(portraitSource.includes('meet-cinematic'), 'Meet HIDI cinematic banner must remain static.');
for (const token of ['useEffect', 'useRef', 'meet-photo--motion', 'requestAnimationFrame']) {
  assert.ok(!portraitSource.includes(token), `Unexpected portrait motion hook: ${token}`);
}
for (const file of ['public/favicon.ico', 'public/favicon.svg', 'public/favicon.png',
  'public/assets/images/favicon.svg', 'public/apple-touch-icon.png',
  'public/hidi-full-logo-ad0f5383c1-v3.svg']) await access(path.join(root, file));
const legacyIcon = await readFile(path.join(root, 'public/assets/images/favicon.svg'), 'utf8');
assert.ok(legacyIcon.includes('data:image/png;base64,'), 'Legacy icon must embed the supplied full logo.');
console.log('PASS: bundled assets, imports, carousel invariants, static portrait and full-logo favicon aliases.');

for (const file of ['public/hidi-brand-full-20260929-r4-32.png', 'public/hidi-brand-full-20260929-r4-48.png',
  'public/hidi-brand-full-20260929-r4.ico', 'public/site.webmanifest']) await access(path.join(root, file));
const entry = await readFile(path.join(root, 'index.html'), 'utf8');
assert.ok(entry.includes('hidi-brand-full-20260929-r4-48.png'), 'Current full-logo path missing.');
const settings = await readFile(path.join(root, 'vite.config.js'), 'utf8');
assert.ok(settings.includes('port: 5188') && settings.includes('strictPort: false'), 'Automatic development-port fallback missing.');
const appSource = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
const mainSource = await readFile(path.join(root, 'src/main.jsx'), 'utf8');
const styleSource = await readFile(path.join(root, 'src/styles/styles.css'), 'utf8');
const runtimeConfig = await readFile(path.join(root, 'public/config.js'), 'utf8');
assert.ok(appSource.includes('className="hidi-page"'), 'Stationary page container missing.');
assert.ok(appSource.includes('useSmoothPageScroll'), 'Normal smooth scrolling must remain.');
assert.ok(styleSource.includes('overscroll-behavior: none'), 'Native edge-bounce prevention missing.');
for (const text of [appSource, mainSource, styleSource, runtimeConfig]) {
  assert.ok(!text.includes('useElasticOverscroll') && !text.includes('hidi-elastic') && !text.includes('--hidi-edge-'), 'Page-stretching code must be removed.');
}
for (const file of ['src/hooks/useElasticOverscroll.js', 'src/styles/elastic-overscroll.css']) {
  await assert.rejects(access(path.join(root, file)), { code: 'ENOENT' });
}
console.log('PASS: full-logo icons, automatic port fallback and stationary page; no page-stretching hook.');
