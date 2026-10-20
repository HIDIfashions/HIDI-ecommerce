import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {existsSync} from 'node:fs';
export async function verifyPosterTiers(pw,html,manifest,out,mode){
 const variants=Object.values(manifest.videos)[0],early=html.match(/<script data-hidi-early-hero="true">([\s\S]*?)<\/script>/)?.[1];assert(variants.mobile.avifPosterSmall&&early);
 const hints=[...html.matchAll(/<link\b[^>]*rel="preload"[^>]*type="image\/avif"[^>]*>/g)].map(match=>match[0]).join('');assert(hints);
 const browser=await pw.chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})}),cases=[];
 try{for(const [width,height,dpr] of [[375,900,1],[390,900,1.75],[412,823,1.75],[432,760,1.75],[433,900,1.75],[390,900,2],[390,900,3],[390,600,1],[700,900,1],[701,900,1],[1440,900,1],[1350,940,1],[1440,1080,1],[1366,768,1]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr}),page=await context.newPage();
  try{await page.route('**/*',route=>route.request().url()==='http://poster-tier.fixture/'?route.fulfill({contentType:'text/html',body:'<head>'+hints+'<script>'+early+'</script></head><body><video class="hero-live-media" style="width:100vw;height:100vh"></video></body>'}):route.abort());await page.goto('http://poster-tier.fixture/',{waitUntil:'domcontentloaded'});
   const result=await page.evaluate(variants=>({matching:[...document.querySelectorAll('link[rel="preload"]')].filter(link=>matchMedia(link.media||'all').matches).map(link=>new URL(link.href).pathname),selected:window.__HidiAvifPoster(innerWidth<=700?variants.mobile:variants.desktop)}),variants);
   const small=width<=432&&height>=760,tallDesktop=width>700&&width/height<=40/27,expected=width>700?(tallDesktop?variants.desktop.avifPosterSmall:variants.desktop.avifPoster):small?variants.mobile.avifPosterSmall:variants.mobile.avifPoster;
   assert.deepEqual(result.matching,[expected],'Responsive preload at '+width+'px / DPR '+dpr);assert.equal(result.selected,expected);if(small)assert(width/height<=variants.mobile.posterCrop.width/variants.mobile.posterCrop.height,'Cropped poster must retain the original visible field');
   if(tallDesktop)assert(width/height<=variants.desktop.posterCrop.width/variants.desktop.posterCrop.height,'Desktop crop must retain original visible pixels');
   cases.push({width,height,dpr,expected,passed:true,matchingPreloads:1,sourcePixelsRetained:true});
  }finally{await context.close();}
 }}finally{await browser.close();}
 await writeFile(out+'/poster-tiers-'+mode+'.json',JSON.stringify({passed:true,cases,writes:0},null,2));
}
