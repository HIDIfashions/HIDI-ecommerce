import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {renderHero} from './hero.mjs';import {createHomeHead} from './head.mjs';
test('native poster selects the exact responsive cacheable URL with a safe format fallback',async()=>{
 const videos={'/selected.mp4':{mobile:{poster:'/small.webp',avifPoster:'/small.avif'},desktop:{poster:'/large.webp',avifPoster:'/large.avif'}}},selection={active:true,type:'video',url:'/selected.mp4'};
 const html=renderHero('<body><header data-hidi-first-header></header></body>',selection,{videos});assert(!html.includes('data:image/avif'));assert(!html.includes('document.cookie'));assert(!html.includes('inline-poster'));
 const code=html.match(/<script data-hidi-first-hero-setup="true">([\s\S]*?)<\/script>/)[1];
 for(const mobile of [true,false])for(const supported of [true,false]){const video={isConnected:true},window={__HidiAvifSupport:Promise.resolve(supported)};vm.runInNewContext(code,{window,Promise,document:{querySelector:()=>video},matchMedia:()=>({matches:mobile})});await Promise.resolve();assert.equal(video.poster,videos['/selected.mp4'][mobile?'mobile':'desktop'][supported?'avifPoster':'poster']);}
});
test('responsive AVIF preloads stay in the early head for both ordinary and returning visits',()=>{
 const root=mkdtempSync(join(tmpdir(),'hidi-poster-hints-'));try{const hints='<link rel="preload" as="image" type="image/avif" media="(max-width: 700px)" href="/small.avif"><link rel="preload" as="image" type="image/avif" media="(min-width: 701px)" href="/large.avif">';assert.equal(createHomeHead(root)('<head>'+hints+'</head><body></body>'),'<head>'+hints+'</head><body></body>');}finally{rmSync(root,{recursive:true,force:true});}
});
