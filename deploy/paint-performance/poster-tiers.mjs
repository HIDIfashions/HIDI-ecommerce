import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {existsSync} from 'node:fs';
export async function verifyPosterTiers(pw,html,manifest,out,mode){
 const variants=Object.values(manifest.videos)[0],early=html.match(/<script data-hidi-early-hero="true">([\s\S]*?)<\/script>/)?.[1];assert(variants.mobile.avifPosterSmall&&early);
 const hints=[...html.matchAll(/<link\b[^>]*rel="preload"[^>]*type="image\/avif"[^>]*>/g)].map(match=>match[0]).join('');assert(hints);
 const browser=await pw.chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})}),cases=[];
 try{for(const [width,dpr] of [[375,1],[390,1.75],[412,1.75],[432,1.75],[433,1.75],[390,2],[390,3],[700,1],[701,1],[1440,1]]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:dpr}),page=await context.newPage();
  try{await page.route('**/*',route=>route.request().url()==='http://poster-tier.fixture/'?route.fulfill({contentType:'text/html',body:'<head>'+hints+'<script>'+early+'</script></head><body></body>'}):route.abort());await page.goto('http://poster-tier.fixture/',{waitUntil:'domcontentloaded'});
   const result=await page.evaluate(variants=>({matching:[...document.querySelectorAll('link[rel="preload"]')].filter(link=>matchMedia(link.media||'all').matches).map(link=>new URL(link.href).pathname),selected:window.__HidiAvifPoster(innerWidth<=700?variants.mobile:variants.desktop)}),variants);
   const small=width<=432&&dpr<=1.75,expected=width>700?variants.desktop.avifPoster:small?variants.mobile.avifPosterSmall:variants.mobile.avifPoster;
   assert.deepEqual(result.matching,[expected],'Responsive preload at '+width+'px / DPR '+dpr);assert.equal(result.selected,expected);if(small)assert(width*dpr<=768,'Smaller poster must never undersample the screen');
   cases.push({width,dpr,expected,passed:true,matchingPreloads:1,fullPhysicalResolution:true});
  }finally{await context.close();}
 }}finally{await browser.close();}
 await writeFile(out+'/poster-tiers-'+mode+'.json',JSON.stringify({passed:true,cases,writes:0},null,2));
}
