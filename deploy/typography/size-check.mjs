import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
export async function verifySizeSettings({context,engine,base,productPath}){
 const results=[],out='evidence/typography/sizes';await mkdir(out,{recursive:true});
 const values={desktop:{heading:40,body:18,product:22,ui:16},mobile:{heading:30,body:15,product:18,ui:14}};
 const api=base+'/api/hidi/typography/admin';
 const state=async()=>{const r=await context.request.get(api);assert(r.ok());return r.json();};
 const request=async body=>{const r=await context.request.post(api,{headers:{Origin:base},data:body});assert(r.ok(),await r.text());return r.json();};
 const reset=async()=>{for(const profile of ['storefront','admin']){let s=await state();s=await request({action:'save',profile,etag:s.etag,config:{heading:'system',body:'system',product:'system',ui:'system',sizes:{desktop:{heading:null,body:null,product:null,ui:null},mobile:{heading:null,body:null,product:null,ui:null}}}});await request({action:'publish',profile,etag:s.etag});}};
 const saved=page=>page.locator('#ht-status').filter({hasText:'Draft saved. Published fonts are unchanged.'}).waitFor();
 const published=page=>page.locator('#ht-status').filter({hasText:/Published version \d+/}).waitFor();
 for(const width of [390,768,1440]){
  await reset();const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:1100});await page.goto(base+'/admin/typography');await page.waitForFunction(()=>!document.querySelector('#ht-controls').disabled);
  for(const [device,roles]of Object.entries(values))for(const [role,n]of Object.entries(roles))await page.locator('#ht-size-'+device+'-'+role).fill(String(n));
  await page.locator('#ht-preset').selectOption('modern');await page.locator('#ht-preset').selectOption('retail');assert.equal(await page.locator('#ht-size-desktop-heading').inputValue(),'40');
  for(const device of ['desktop','mobile']){await page.locator('button[data-size-device='+device+']').click();assert.equal(await page.locator('.ht-editorial h2').evaluate(e=>getComputedStyle(e).fontSize),values[device].heading+'px');assert.equal(await page.locator('.ht-product-label').first().evaluate(e=>getComputedStyle(e).fontSize),values[device].product+'px');}
  await page.locator('#ht-size-mobile-body').fill('99');assert(await page.locator('#ht-save').isDisabled());await page.locator('#ht-size-mobile-body').fill('15');await page.locator('#ht-ui').focus();assert(await page.locator('#ht-save').isEnabled());
  const cssBefore=await(await context.request.get(base+'/typography/published.css')).text();await page.locator('#ht-save').click();await saved(page);assert.equal(await(await context.request.get(base+'/typography/published.css')).text(),cssBefore);
  await page.locator('#ht-publish').click();await published(page);let current=await state();assert.deepEqual(current.profiles.storefront.published.sizes,values);
  const visitor=await context.newPage();await visitor.setViewportSize({width,height:1000});await visitor.goto(base+productPath,{waitUntil:'domcontentloaded'});const title=visitor.locator('.pdp-title-row h1');await title.waitFor();await visitor.waitForFunction(()=>getComputedStyle(document.querySelector('.pdp-title-row h1')).fontFamily.includes('HIDI Lato'));
  for(const [w,device]of [[1440,'desktop'],[701,'desktop'],[700,'mobile'],[390,'mobile']]){await visitor.setViewportSize({width:w,height:1000});assert.equal(await title.evaluate(e=>getComputedStyle(e).fontSize),values[device].product+'px');assert.equal(await visitor.locator('body').evaluate(e=>getComputedStyle(e).fontSize),values[device].body+'px');}
  await visitor.close();await page.reload();await page.waitForFunction(()=>!document.querySelector('#ht-controls').disabled);assert.equal(await page.locator('#ht-size-mobile-product').inputValue(),'18');
  await page.locator('button[data-size-device='+(width<=700?'mobile':'desktop')+']').click();await page.screenshot({path:out+'/'+engine+'-'+width+'.png',fullPage:true,animations:'disabled'});
  await page.locator('#ht-size-reset').click();assert.equal(await page.locator('#ht-size-mobile-product').inputValue(),'');await page.locator('#ht-save').click();await saved(page);await page.locator('#ht-publish').click();await published(page);assert(!/font-size:/.test(await(await context.request.get(base+'/typography/published.css')).text()));
  page.once('dialog',d=>d.accept());await page.locator('#ht-rollback').click();await published(page);current=await state();assert.deepEqual(current.profiles.storefront.published.sizes,values);
  await page.locator('[data-profile=admin]').click();await page.locator('#ht-preset').selectOption('retail');await page.locator('#ht-size-mobile-body').fill('16');await page.locator('#ht-save').click();await saved(page);await page.locator('#ht-publish').click();await published(page);assert.deepEqual((await state()).profiles.storefront.published.sizes,values);
  await page.locator('#ht-size-mobile-body').fill('20');await page.locator('button[data-size-device=mobile]').click();assert.equal(await page.locator('.ht-admin p.ht-body').evaluate(e=>getComputedStyle(e).fontSize),'20px');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  results.push({engine,width,retailPairing:true,invalidSizesBlocked:true,draftIsolation:true,responsiveSizes:true,breakpoint700:true,reload:true,reset:true,rollback:true,profileIsolation:true,previewIndependent:true});await page.close();console.log('PASS typography sizes '+engine+' '+width);
 }
 await reset();return results;
}
