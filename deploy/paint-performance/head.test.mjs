import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {createHomeHead} from './head.mjs';
test('public CSS retains cascade order, markers and asset URL resolution; remote/imported/conditional styles remain links',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-head-'));
 try{
  mkdirSync(join(root,'assets'));writeFileSync(join(root,'assets/one.css'),'.a{background:url(../image.webp)}');writeFileSync(join(root,'two.css'),'.a{color:red}');writeFileSync(join(root,'import.css'),'@import "other.css";');
  const input='<link rel="stylesheet" data-marker href="/assets/one.css"><link rel="stylesheet" href="/two.css"><link rel="stylesheet" href="https://other.example/a.css"><link rel="stylesheet" media="print" href="/two.css"><link rel="stylesheet" href="/import.css">';
  const result=createHomeHead(root)(input);
  assert(result.includes('data-marker=""'));assert(result.includes('url("/image.webp")'));assert(result.indexOf('background')<result.indexOf('color:red'));assert(result.includes('href="https://other.example/a.css"'));assert(result.includes('media="print"'));assert(result.includes('href="/import.css"'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('future image overlays supply fresh CSS and unavailable or unsafe paths fall back',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-head-'));try{
  const link='<link rel="stylesheet" href="/a.css">';writeFileSync(join(root,'a.css'),'a{color:red}');assert(createHomeHead(root)(link).includes('color:red'));writeFileSync(join(root,'a.css'),'a{color:blue}');assert(createHomeHead(root)(link).includes('color:blue'));assert.equal(createHomeHead(root)('<link rel="stylesheet" href="/missing.css">'),'<link rel="stylesheet" href="/missing.css">');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('app stays external and preloaded so the parser can paint the header sooner; config retains execution order',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-head-'));try{
  mkdirSync(join(root,'assets'));writeFileSync(join(root,'assets/index-abc.js'),'globalThis.app="</script>";');writeFileSync(join(root,'config.js'),'window.HIDI_CONFIG={siteUrl:"/"};');
  const input='<link rel="modulepreload" href="/assets/index-abc.js"><script type="module" crossorigin src="/assets/index-abc.js"></script><div id="root"></div><script src="./config.js?v=one"></script>';
  const result=createHomeHead(root)(input);assert(result.includes('modulepreload'));assert(result.includes('type="module"'));assert(result.includes('src="/assets/index-abc.js"'));assert(!result.includes('globalThis.app='));assert(result.includes('data-hidi-inline-script="/config.js"'));assert(result.indexOf('id="root"')<result.indexOf('window.HIDI_CONFIG'));assert(!result.includes('src="./config.js'));
  writeFileSync(join(root,'assets/index-split.js'),'import x from "./chunk.js";');const split='<script type="module" src="/assets/index-split.js"></script>';assert.equal(createHomeHead(root)(split),split);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('parser header logo embeds exact bytes while external app loading is preserved',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-logo-'));try{
  mkdirSync(join(root,'assets/images'),{recursive:true});const logo=Buffer.from([137,80,78,71,13,10,26,10]);writeFileSync(join(root,'assets/images/hidi-logo.png'),logo);
  writeFileSync(join(root,'assets/index-abc.js'),'const x={src:Tt("images/hidi-logo.png"),fetchPriority:"high"};');
  const html='<link rel="preload" as="image" href="./assets/images/hidi-logo.png"><script type="module" src="/assets/index-abc.js"></script><header><img src="./assets/images/hidi-logo.png"></header>';
  const result=createHomeHead(root)(html),data='data:image/png;base64,'+logo.toString('base64');assert.equal(result.split(data).length,2);assert(!result.includes('rel="preload"'));assert(!result.includes('src:Tt('));assert.equal(Buffer.from(result.match(/<img src="data:image\/png;base64,([^"]+)"/)[1],'base64').compare(logo),0);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('sized favicons retain Apple/PWA declarations and stale branding metadata is ignored',()=>{
 const app=mkdtempSync(join(tmpdir(),'hidi-icons-')),root=join(app,'dist');try{
  mkdirSync(root);mkdirSync(join(app,'paint-performance'));const source=Buffer.from('current-icon-frames');writeFileSync(join(root,'brand.ico'),source);
  const markup='<link rel="icon" type="image/png" sizes="32x32" href="/media-performance/assets/icon-exact-32.png">';writeFileSync(join(app,'paint-performance/icons.json'),JSON.stringify({sourceFile:'dist/brand.ico',originalSha256:createHash('sha256').update(source).digest('hex'),markup}));
  const input='<link rel="shortcut icon" href="/brand.ico"><link rel="icon" href="/other.png"><link rel="apple-touch-icon" href="/touch.png"><link rel="manifest" href="/site.webmanifest">';const output=createHomeHead(root,app)(input);
  assert(output.startsWith(markup));assert(!output.includes('/brand.ico'));assert(!output.includes('/other.png'));assert(output.includes('href="/touch.png"'));assert(output.includes('href="/site.webmanifest"'));
  writeFileSync(join(root,'brand.ico'),'updated-brand');assert.equal(createHomeHead(root,app)(input),input);
 }finally{rmSync(app,{recursive:true,force:true});}
});
