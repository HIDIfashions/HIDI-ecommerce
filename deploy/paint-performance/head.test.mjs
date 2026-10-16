import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHomeHead} from './head.mjs';
import {createHash} from 'node:crypto';
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
test('self-contained app and public config retain module/parser execution order without extra requests; imports retain external loading',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-head-'));try{
  mkdirSync(join(root,'assets'));writeFileSync(join(root,'assets/index-abc.js'),'globalThis.app="</script>";');writeFileSync(join(root,'config.js'),'window.HIDI_CONFIG={siteUrl:"/"};');
  const input='<link rel="modulepreload" href="/assets/index-abc.js"><script type="module" crossorigin src="/assets/index-abc.js"></script><div id="root"></div><script src="./config.js?v=one"></script>';
  const result=createHomeHead(root)(input);assert(!result.includes('modulepreload'));assert(result.includes('type="module"'));assert(result.includes('globalThis.app="<\\/script>"'));assert(result.includes('data-hidi-inline-script="/config.js"'));assert(result.indexOf('id="root"')<result.indexOf('window.HIDI_CONFIG'));assert(!result.includes('src="'));
  writeFileSync(join(root,'assets/index-split.js'),'import x from "./chunk.js";');const split='<script type="module" src="/assets/index-split.js"></script>';assert.equal(createHomeHead(root)(split),split);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('header logo embeds the exact current image bytes in HTML and app, while originals remain untouched',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-logo-'));try{
  mkdirSync(join(root,'assets/images'),{recursive:true});const logo=Buffer.from([137,80,78,71,13,10,26,10]);writeFileSync(join(root,'assets/images/hidi-logo.png'),logo);
  writeFileSync(join(root,'assets/index-abc.js'),'const x={src:Tt("images/hidi-logo.png"),fetchPriority:"high"};');
  const html='<link rel="preload" as="image" href="./assets/images/hidi-logo.png"><script type="module" src="/assets/index-abc.js"></script><header><img src="./assets/images/hidi-logo.png"></header>';
  const result=createHomeHead(root)(html),data='data:image/png;base64,'+logo.toString('base64');assert.equal(result.split(data).length,3);assert(!result.includes('rel="preload"'));assert(!result.includes('src:Tt('));assert.equal(Buffer.from(result.match(/<img src="data:image\/png;base64,([^"]+)"/)[1],'base64').compare(logo),0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('critical styles preserve cascade slots and fall back to complete inline CSS when app or CSS changes',()=>{
 const app=mkdtempSync(join(tmpdir(),'hidi-critical-')),root=join(app,'dist');try{
  mkdirSync(join(root,'assets'),{recursive:true});mkdirSync(join(app,'paint-performance'));const css='a{color:red}.b{color:blue}';writeFileSync(join(root,'a.css'),css);writeFileSync(join(root,'assets/index-abc.js'),'window.app=true;');writeFileSync(join(root,'assets/index-def.js'),'window.app=true;');
  writeFileSync(join(app,'paint-performance/critical.json'),JSON.stringify({bundle:'/assets/index-abc.js',sheets:{'/a.css':{hash:createHash('sha256').update(css).digest('hex'),css:'a{color:red}'}}}));
  const html='<script type="module" src="/assets/index-abc.js"></script><link rel="stylesheet" href="/a.css">',result=createHomeHead(root)(html);assert(result.includes('data-hidi-critical-css'));assert(result.includes('media="print"'));assert(result.includes("this.media='all'"));assert(result.includes('<noscript><link rel="stylesheet"'));assert(result.indexOf('a{color:red}')<result.indexOf('data-hidi-deferred-css'));
  assert(!createHomeHead(root)(html.replace('index-abc','index-def')).includes('data-hidi-critical-css'));
  writeFileSync(join(root,'a.css'),'a{color:green}');const changed=createHomeHead(root)(html);assert(!changed.includes('data-hidi-critical-css'));assert(changed.includes('color:green'));assert(!changed.includes('media="print"'));
 }finally{rmSync(app,{recursive:true,force:true});}
});
