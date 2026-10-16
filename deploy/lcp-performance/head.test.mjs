import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHomeHead} from './head.mjs';
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
