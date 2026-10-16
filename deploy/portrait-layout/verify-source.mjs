import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]);
const changed=execFileSync('git',['diff','--name-only',process.env.HIDI_PORTRAIT_BASE_SOURCE_SHA,process.env.HIDI_MEDIA_SOURCE_SHA],{cwd:root,encoding:'utf8'}).trim().split('\n');
assert.deepEqual(changed,['apps/web/src/styles/portrait-gallery.css']);
assert.equal(await readFile(root+'/apps/web/src/styles/portrait-gallery.css','utf8'),await readFile(new URL('./portrait-gallery.css',import.meta.url),'utf8'));
console.log('PASS: source and scoped runtime gallery CSS match; photographs and component unchanged');
