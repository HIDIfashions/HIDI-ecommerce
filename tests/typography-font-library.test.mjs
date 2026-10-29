import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fonts,fontSources,roles} from '../deploy/typography/registry.mjs';
import {fontFaces,publishedCss} from '../deploy/typography/css.mjs';
import {initialState} from '../deploy/typography/handler.mjs';
const folder=new URL('../deploy/typography/fonts/',import.meta.url);
const hash=body=>createHash('sha256').update(body).digest('hex');
test('all bundled faces match their pinned provenance and accompanying license',async()=>{
 const manifest=JSON.parse(await readFile(new URL('manifest.json',folder),'utf8'));
 const catalogFiles=new Set(Object.values(fonts).flatMap(fontSources).map(face=>face.file));
 const recorded=new Set();
 for(const entry of manifest){
  const license=await readFile(new URL(entry.name+'-LICENSE.txt',folder));assert.match(license.toString(),/SIL OPEN FONT LICENSE/);
  if(entry.licenseSha256)assert.equal(hash(license),entry.licenseSha256);
  for(const file of entry.files||[{file:entry.name+'.woff2',sha256:entry.sha256,bytes:entry.bytes}]){
   const bytes=await readFile(new URL(file.file,folder));assert.equal(bytes.subarray(0,4).toString(),'wOF2');assert.equal(hash(bytes),file.sha256);assert.equal(bytes.length,file.bytes);recorded.add(file.file);
  }
 }
 assert.deepEqual(recorded,catalogFiles);assert.equal(manifest.length,23);assert.equal(Object.keys(fonts).length,24);
});
test('original font binaries remain byte-identical to the deployed library',async()=>{
 const expected=JSON.parse(await readFile(new URL('fixtures/typography-installed-fonts.json',import.meta.url),'utf8'));
 for(const [file,digest] of Object.entries(expected))assert.equal(hash(await readFile(new URL(file,folder))),digest);
});
test('single-weight display faces and all Lato weights advertise only their real weights',()=>{
 for(const id of ['dm-serif-display','prata','italiana']){
  assert.deepEqual(fontSources(fonts[id]),[{file:id+'-400.woff2',weight:'400'}]);
  const css=fontFaces('',[id]);assert.equal((css.match(/@font-face/g)||[]).length,1);assert(css.includes('font-weight:400;'));assert(!css.includes('700'));
 }
 assert.deepEqual(fontSources(fonts.lato).map(face=>Number(face.weight)),[100,300,400,700,900]);
 const css=fontFaces('', ['lato']);assert.equal((css.match(/@font-face/g)||[]).length,5);
});
test('static Poppins uses separate real faces and newly published CSS carries only required additions',()=>{
 const faces=fontFaces('', ['poppins']);assert.equal((faces.match(/@font-face/g)||[]).length,9);
 for(let weight=100;weight<=900;weight+=100){assert(faces.includes('font-weight:'+weight+';'));assert(faces.includes('/poppins-'+weight+'.woff2'));}
 const state=initialState();state.profiles.storefront.published=Object.fromEntries(roles.map(role=>[role,'dm-sans']));
 const css=publishedCss(state);assert(css.includes('/dm-sans.woff2'));assert(!css.includes('/poppins-'));assert(!css.includes('/montserrat.woff2'));
 assert.equal((css.match(/@font-face/g)||[]).length,1);
});
