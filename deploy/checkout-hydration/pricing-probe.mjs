import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {probe as pricingProbe} from '../pricing/probes.mjs';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
export async function probe(base,output,{overlay=false}={}){
 const errors=[],writes=[];
 const result=await pricingProbe(base,output,{engines:process.env.HIDI_BROWSER_ENGINES?.split(',')||['chromium','firefox','webkit'],prepareContext:async context=>{
  context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   if(overlay&&url.origin===base&&path==='/pricing-assets/storefront.mjs')return route.fulfill({contentType:'application/javascript',body:await readFile(new URL('../pricing/storefront.mjs',import.meta.url),'utf8')});
   // Explicit staff fixtures exercise the actual deployed pricing modules without credentials or real saves.
   if(url.origin===base&&path.startsWith('/api/admin/products'))return route.fallback();
   if(url.origin===base&&path==='/collections/all')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/pricing-assets/styles.css"><script type="module" data-hidi-pricing-loader src="/pricing-assets/storefront.mjs"></script></head><body><main data-hidi-collection-hydrated="true"><article><a href="/products/isolated-style">Isolated pricing fixture</a><div class="product-card_priceRow"><strong>₹1,000</strong><s>₹1,150</s></div></article></main></body></html>'});
   if(url.origin===base&&path==='/admin/product-pricing')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../pricing/admin.html',import.meta.url),'utf8')});
   if(url.origin===base&&path==='/admin')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><script type="module" data-hidi-pricing-loader src="/pricing-assets/storefront.mjs"></script></head><body><main>Isolated admin fixture</main></body></html>'});
   if(!['GET','HEAD','OPTIONS'].includes(req.method())){if(isBlockedTelemetry(req.method(),req.url(),base))return route.fulfill({status:204,body:''});writes.push(req.method()+' '+path);return route.fulfill({status:403,body:'{}'});}
   if(req.resourceType()==='script'&&url.origin!==base)return route.fulfill({contentType:'application/javascript',body:''});
   if(['image','media'].includes(req.resourceType()))return route.abort();
   return route.fallback();
  });
 }});
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);const report={...result,runtimeErrors:errors,unexpectedWrites:writes,isolatedStaffAndCollectionFixtures:true};await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
