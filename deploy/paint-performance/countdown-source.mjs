import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';

export const COUNTDOWN_SOURCE_FILE='dist/hidi-launch-countdown-20261011.js';
export const COUNTDOWN_SOURCE_SHA256='9f32ea5cc3f76cff81a7b5a6537d5437b161a73dd9b6df9328e285e578ac4195';
export const COUNTDOWN_OPTIMIZED_SHA256='de2c96f5b53a953c8d332faa573c5b41905f0515caf1e2e3e0620b822a5695a3';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

// The launch instant, countdown calculation, copy, links and event sources stay exact.
// Header observation already delivers its initial size before paint. Avoid forcing
// that layout in React's mutation checkpoint, and avoid rewriting unchanged copy.
const replacements=[
 ['  function position() {\n    const header = document.querySelector', '  function observeHeader() {\n    const header = document.querySelector'],
 ['      observedHeader = header;\n    }\n    if (header) {', '      observedHeader = header;\n    }\n    return header;\n  }\n  function position() {\n    const header = observeHeader();\n    if (header) {'],
 ["      banner.style.top = top + 'px';", "      const value = top + 'px';\n      if (banner.style.top !== value) banner.style.top = value;"],
 ["    banner.hidden = !document.querySelector('#root .hidi-page');\n    if (banner.hidden) return;\n    position();", "    const hidden = !document.querySelector('#root .hidi-page');\n    if (banner.hidden !== hidden) banner.hidden = hidden;\n    if (hidden) return;\n    if (resizeObserver) observeHeader();\n    else position();"],
 ["    banner.dataset.phase = live ? 'live' : 'countdown';", "    const phase = live ? 'live' : 'countdown';\n    if (banner.dataset.phase !== phase) banner.dataset.phase = phase;"],
 ["      label.textContent = 'We’re live';\n      clock.hidden = true;\n      shop.hidden = false;", "      if (label.textContent !== 'We’re live') label.textContent = 'We’re live';\n      if (!clock.hidden) clock.hidden = true;\n      if (shop.hidden) shop.hidden = false;"],
 ["    label.textContent = 'HIDI launches in';\n    clock.hidden = false;\n    shop.hidden = true;", "    if (label.textContent !== 'HIDI launches in') label.textContent = 'HIDI launches in';\n    if (clock.hidden) clock.hidden = false;\n    if (!shop.hidden) shop.hidden = true;"]
];

export function optimizeCountdownSource(input){
 const original=String(input).replace(/\r\n/g,'\n');
 assert.equal(hash(original),COUNTDOWN_SOURCE_SHA256,'Unreviewed countdown source; refuse to optimize');
 let code=original;
 for(const [from,to]of replacements){
  assert.equal(code.split(from).length,2,'Expected one exact countdown optimization anchor');
  code=code.replace(from,to);
 }
 let inverse=code;
 for(const [from,to]of [...replacements].reverse()){
  assert.equal(inverse.split(to).length,2,'Countdown inverse transform must be unambiguous');
  inverse=inverse.replace(to,from);
 }
 assert.equal(inverse,original,'Unrelated countdown source changed');
 assert.equal(hash(code),COUNTDOWN_OPTIMIZED_SHA256,'Optimized countdown differs from reviewed browser-tested bytes');
 return code;
}

export async function buildCountdownAsset(base,overlay){
 const original=await readFile(join(base,COUNTDOWN_SOURCE_FILE),'utf8');
 const code=optimizeCountdownSource(original),sha256=hash(code);
 const url='/assets/home-countdown-'+sha256.slice(0,16)+'.js';
 await mkdir(join(overlay,'dist/assets'),{recursive:true});
 await writeFile(join(overlay,'dist',url),code);
 return {url,sourceFile:COUNTDOWN_SOURCE_FILE,sourceSha256:COUNTDOWN_SOURCE_SHA256,sha256,bytes:Buffer.byteLength(code)};
}
