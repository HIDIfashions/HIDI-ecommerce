import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(resolve('apps/web/package.json'));
const sharp = require(require.resolve('sharp', { paths: [require.resolve('next')] }));
const landing = resolve(process.argv[2]);
const source = resolve(landing, 'apps/web/public/assets/images/hidi-premium-ai-full-banner-lossless.png');
const master = await readFile(source), version = createHash('sha256').update(master).update('hidi-banner-webp85-v1').digest('hex').slice(0, 12);
const folder = resolve(landing, 'apps/web/public/assets/images/performance'); await mkdir(folder, { recursive: true });
const sizes = [];
for (const width of [640, 1280, 1920, 2560]) {
  const buffer = await sharp(master).resize({ width, withoutEnlargement: true }).webp({ quality: 85, effort: 6 }).toBuffer();
  const name = `banner-${version}-${width}.webp`; await writeFile(resolve(folder, name), buffer);
  sizes.push({ width, bytes: buffer.length, name });
}
if (sizes.find(item => item.width === 1920).bytes > 600 * 1024) throw Error('Desktop image exceeds the reviewed 600 KiB budget');
const path = resolve(landing, 'apps/web/src/components/HidiEdit.jsx');
let component = await readFile(path, 'utf8');
const anchor = '  return (\n';
if (!component.includes("'images/hidi-premium-ai-full-banner-lossless.png'") || component.includes('const responsive =')) throw Error('Unexpected or already-patched banner source');
if (component.split(anchor).length !== 2) throw Error('Banner patch anchor is not unique');
const prefix = '/assets/images/performance/';
component = component.replace(anchor, `  // Uploaded media stays authoritative; variants apply only to the bundled master.\n  const responsive = banner.src && !landingMedia['hidi-edit-banner'] ? {\n    src: '${prefix}banner-${version}-1280.webp',\n    srcSet: '${sizes.map(item => prefix + item.name + ' ' + item.width + 'w').join(', ')}',\n    sizes: '100vw',\n  } : {};\n\n` + anchor).replace('          {...banner}\n', '          {...banner}\n          {...responsive}\n');
await writeFile(path, component);
await mkdir('evidence', { recursive: true });
await writeFile('evidence/banner-variants.json', JSON.stringify({ masterBytes: master.length, version, format: 'webp', quality: 85, variants: sizes }, null, 2));
console.log(JSON.stringify({ masterBytes: master.length, variants: sizes }));
