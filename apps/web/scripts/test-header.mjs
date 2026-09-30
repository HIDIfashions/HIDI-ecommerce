import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read=p=>readFile(path.join(root,p),'utf8');
const app=await read('src/App.jsx');
const nav=await read('src/components/Navbar.jsx');
const hero=await read('src/components/VideoHero.jsx');
const css=await read('src/styles/immersive-hero.css');
assert.ok(!app.includes('<AnnouncementBar'), 'Scrolling announcements should not render.');
for(const name of ['campaign-brand', 'data-header-state', 'Shopping bag', 'My HIDI account', 'Search HIDI products', 'Open HIDI menu'])assert.ok(nav.includes(name), `Missing header element ${name}`);
for(const name of ['header-account', 'desktop-nav', 'app-download'])assert.ok(!nav.includes(name), `Old top control still rendered: ${name}`);
assert.ok(hero.includes('Shop Now') && hero.includes('campaign-shop-button'));
for(const name of ['hero-copy', 'hero-buttons', 'hero-description', 'SCROLL TO DISCOVER'])assert.ok(!hero.includes(name), `Old hero content: ${name}`);
assert.ok(css.includes('position: fixed') && css.includes('background: transparent'));
assert.ok(css.includes('prefers-reduced-motion'));
for(const variant of ['desktop','mobile']){
 await access(path.join(root,`public/assets/video/hidi-hero-${variant}-luminous-v1.mp4`));
 await access(path.join(root,`public/assets/images/hero-${variant}-luminous-first-frame-v1.webp`));
}
console.log('PASS: centered transparent header, removed announcement/hero copy, one Shop Now action and graded video/poster pairs.');
