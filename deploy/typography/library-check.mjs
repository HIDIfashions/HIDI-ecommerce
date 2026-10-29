import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fonts,fontSources,roles} from './registry.mjs';
import {fontFaces} from './css.mjs';

export const additions=['playfair-display','cormorant-garamond','libre-baskerville','poppins','montserrat','dm-sans','nunito-sans','source-sans-3'];
const wait=async(fn,label)=>{for(let n=0;n<100;n++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);};
const focus=page=>page.evaluate(()=>window.dispatchEvent(new Event('focus')));
const family=(page,selector)=>page.locator(selector).first().evaluate(el=>getComputedStyle(el).fontFamily);
async function publish(editor,profile,id){
 await editor.locator('[data-profile='+profile+']').click();
 for(const role of roles){assert.deepEqual(await editor.locator('#ht-'+role+' option').evaluateAll(options=>options.map(option=>option.value)),Object.keys(fonts));await editor.locator('#ht-'+role).selectOption(id);}
 await editor.locator('#ht-save').click();await editor.locator('#ht-status').filter({hasText:'Draft saved. Published fonts are unchanged.'}).waitFor();
 await editor.locator('#ht-publish').click();await editor.locator('#ht-status').filter({hasText:/Published version \d+/}).waitFor();
}
export async function verifyFontLibrary({context,engine,base,productPath}){
 const report=[],editor=await context.newPage();await editor.goto(base+'/admin/typography',{waitUntil:'domcontentloaded'});await wait(()=>editor.locator('#ht-heading').isEnabled(),'library editor owner access');
 await publish(editor,'storefront','system');await publish(editor,'admin','system');
 const visitor=await context.newPage(),admin=await context.newPage();
 const legacy=fontFaces('', ['inter','lora','manrope']);
 for(const page of [visitor,admin])await page.route('**/typography/assets/fonts.css*',route=>route.fulfill({status:200,contentType:'text/css',body:legacy}));
 await visitor.goto(base+productPath,{waitUntil:'domcontentloaded'});await visitor.locator('.pdp-title-row h1').waitFor();
 await admin.goto(base+'/admin/typography',{waitUntil:'domcontentloaded'});await wait(()=>admin.locator('#ht-heading').isEnabled(),'admin observer loaded');
 const navigations=new Map([[visitor,0],[admin,0]]);for(const page of [visitor,admin])page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.set(page,navigations.get(page)+1);});
 for(const profile of ['storefront','admin'])for(const [index,id] of additions.entries()){
  console.log(new Date().toISOString(),engine,'font library',profile,id);
  const observer=profile==='storefront'?visitor:admin,other=profile==='storefront'?admin:visitor;
  await observer.setViewportSize({width:[390,768,1440][index%3],height:1000});
  const otherBefore=await family(other,'body'),navBefore=navigations.get(observer);
  await publish(editor,profile,id);await focus(observer);await focus(other);
  const expected='HIDI '+fonts[id].name;
  await wait(async()=>(await family(observer,'body')).includes(expected),'new font on '+profile+' body');
  assert((await family(observer,'h1')).includes(expected));assert((await family(observer,'button')).includes(expected));
  assert((await observer.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--font-product'))).includes(expected));
  if(profile==='storefront')assert((await family(observer,'.pdp-title-row h1')).includes(expected));
  const weights=id==='poppins'?[100,200,300,400,500,600,700,800,900]:[400,700];
  const loaded=await observer.evaluate(async({expected,weights})=>{const counts=[];for(const weight of weights)counts.push((await document.fonts.load(weight+' 16px '+JSON.stringify(expected),'Aara Sage Kurta Set 0123456789')).filter(face=>face.status==='loaded').length);return counts;},{expected,weights});
  assert(loaded.every(count=>count>0),'Real font faces decoded at every tested weight');
  assert.equal(navigations.get(observer),navBefore,'Font publication must not reload an open page');
  assert.equal(await family(other,'body'),otherBefore,'The other typography profile stays unchanged');
  assert.equal(await observer.locator('#hidi-published-typography').count(),1);
  assert.equal(await observer.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  report.push({engine,font:id,profile,preUpgradeTab:true,fontLoaded:true,weights});
 }
 for(const page of [visitor,admin]){await page.reload({waitUntil:'domcontentloaded'});await wait(async()=>(await family(page,'body')).includes('HIDI Source Sans 3'),'new selection persists after reload');await page.close();}
 await editor.close();return report;
}
export async function verifyLiveFontAssets(base){
 const files=[];
 for(const face of Object.values(fonts).flatMap(fontSources)){
  const response=await fetch(base+'/typography/assets/fonts/'+face.file,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(new URL('fonts/'+face.file,import.meta.url)),'Live font matches tested bytes: '+face.file);files.push(face.file);
 }
 return files;
}
