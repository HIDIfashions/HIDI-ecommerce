import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('campaign uses the full-resolution PNG master', async () => {
  const image = await readFile(new URL('public/assets/images/hidi-premium-ai-full-banner-lossless.png', root));
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(image.readUInt32BE(16), 5460);
  assert.equal(image.readUInt32BE(20), 2048);
});

test('campaign connects the next chapter choices to the existing collections', async () => {
  const source = await readFile(new URL('src/components/HidiEdit.jsx', root), 'utf8');
  assert.ok(source.includes("'hidi-edit-banner'"));
  assert.ok(source.includes("'images/hidi-premium-ai-full-banner-lossless.png'"));
  assert.match(source, /width="5460"\s+height="2048"/);
  assert.match(source, /id="edit-title"/);
  assert.match(source, /For wherever/);
  for (const route of ['casual-wear', 'work-wear', 'occasional-wear']) assert.ok(source.includes('/collections/' + route));
  assert.match(source, /aria-pressed=\{chapter === item.id\}/);
  assert.match(source, /aria-live="polite"/);
  for (const obsolete of ['Golden Hour', 'edit-panel', 'occasion-set.webp', 'edit-seal', 'edit-description']) {
    assert.ok(!source.includes(obsolete), `Old occasion content remains: ${obsolete}`);
  }
});

test('campaign scopes its responsive photo treatment and respects reduced motion', async () => {
  const chapterCss = await readFile(new URL('src/styles/next-chapter.css', root), 'utf8');
  assert.match(chapterCss, /#hidi-edit \.next-chapter__frame/);
  assert.match(chapterCss, /@media \(max-width: 700px\)/);
  assert.match(chapterCss, /prefers-reduced-motion: reduce/);
  assert.match(chapterCss, /object-fit: var\(--landing-media-fit, cover\)/);
  assert.match(chapterCss, /animation-play-state: paused/);
  const css = await readFile(new URL('src/styles/styles.css', root), 'utf8');
  assert.match(css, /\.edit-section--campaign\s*\{\s*padding:\s*0;/);
  assert.match(css, /\.edit-section\.edit-section--campaign\s*\{\s*padding:\s*0;/);
  const imageRule = css.match(/\.edit-campaign > img\s*\{([^}]+)\}/)?.[1];
  assert.ok(imageRule);
  assert.match(imageRule, /display:\s*block/);
  assert.match(imageRule, /width:\s*100%/);
  assert.match(imageRule, /height:\s*auto/);
  assert.match(imageRule, /aspect-ratio:\s*5460\s*\/\s*2048/);
  assert.doesNotMatch(imageRule, /cover|transform|padding|border/);
});
