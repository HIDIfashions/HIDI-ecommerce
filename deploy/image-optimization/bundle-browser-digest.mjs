/** Produce reproducible MIT-licensed browser ESM with no unresolved package imports. */
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {copyFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve('apps/api/package.json'));
const esbuild=createRequire(require.resolve('tsx/package.json'))('esbuild');
const target='deploy/admin-tools/photo-digest.mjs';
await esbuild.build({entryPoints:['apps/web/lib/photo-digest.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:target,legalComments:'inline',banner:{js:'// Generated from @noble/hashes 1.8.0 (MIT). Regenerate with bundle-browser-digest.mjs.'}});
await copyFile(target,'deploy/product-upload/photo-digest.mjs');
const text=await readFile(target,'utf8');assert.doesNotMatch(text,/^import\s/m);assert.match(text,/photoDigest/);
console.log('Browser hash bundles generated; both raw admin entry points use the same incremental SHA-256 implementation.');
