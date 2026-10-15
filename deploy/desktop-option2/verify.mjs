/** Read-only, real-storefront before/after proof. No cart/order/API writes. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { snapshotServer } from '../catalogue-polish/snapshot-server.mjs';

const pw = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const live = process.env.HIDI_DESKTOP_LIVE === '1';
const root = resolve('evidence/desktop-option2');
await mkdir(root, { recursive: true });
const css = await readFile(new URL('./desktop-option2.css', import.meta.url), 'utf8');
const digest = data => createHash('sha256').update(data).digest('hex');
const engines = ['chromium', 'firefox', 'webkit'];
const widths = live ? [320,390,720,1050,1051,1366,1440,1920] :
  [320,360,375,390,414,430,620,621,720,721,768,820,844,1024,1050,1051,1100,1280,1366,1440,1536,1771,1920,2560];
const snapshot = live ? null : await snapshotServer({ directory: join(root,'snapshot'), css });
const base = live ? 'https://hidiindia.com' : snapshot.base;
const gridSelector = '[class*="collection-browser_productGrid__"]';
const styleSelector = 'style[data-hidi-storefront-layer-fix="true"]';
const measurements = [], extraCases = [], errors = [];
let attemptedWrites = 0;

async function routeReadOnly(route) {
  const request = route.request(), url = new URL(request.url());
  if (!['GET','HEAD'].includes(request.method())) {
    // Do not send telemetry or application mutations to the live service.
    attemptedWrites++;
    return route.abort();
  }
  if (/razorpay\.com|google-analytics|googletagmanager|facebook\.net/.test(url.hostname) || request.resourceType() === 'media') return route.abort();
  if (snapshot && url.origin !== snapshot.base) {
    try {
      const response = await snapshot.pull(request.url());
      return route.fulfill({status:response.status,contentType:response.contentType,body:response.body});
    } catch (error) { errors.push({kind:'asset',url:url.origin+url.pathname,message:error.message}); return route.abort(); }
  }
  return route.continue();
}
async function freeze(page) {
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}'});
  await page.evaluate(async()=>{await document.fonts.ready;});
}
async function ready(page) {
  await page.locator(gridSelector+' article').first().waitFor({state:'visible'});
  await page.evaluate(async()=>{await document.fonts.ready;});
  await page.waitForFunction(()=>[...document.images].filter(i=>{
    const r=i.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0;
  }).every(i=>i.complete&&i.naturalWidth>0),null,{timeout:60000});
  await page.waitForTimeout(150);
}
async function setCandidate(page, enabled) {
  await page.evaluate(({css,enabled,live})=>{
    const element=document.querySelector('style[data-hidi-storefront-layer-fix="true"]');
    if(!element)throw Error('Retained storefront style block is missing');
    if(element.dataset.desktopBaseline===undefined){
      if(live&&!element.textContent.includes(css))throw Error('Live page does not contain the exact approved desktop CSS');
      element.dataset.desktopBaseline=element.textContent.includes(css)?element.textContent.replace(css,''):element.textContent;
    }
    element.textContent=element.dataset.desktopBaseline+(enabled?'\n'+css+'\n':'');
  },{css,enabled,live});
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
}
async function styles(page, all=false) {
  return page.evaluate(all=>{
    const selectors=all?'body,header,header *,main,main *,footer,footer *':'header,header *,.collection-page,.collection-page *,footer,footer *';
    const properties=['display','position','width','height','min-width','max-width','margin','padding','gap','grid-template-columns','font','color','background-color','border','object-fit','aspect-ratio','overflow','visibility','transform'];
    return [...document.querySelectorAll(selectors)].map(e=>{
      const c=getComputedStyle(e),r=e.getBoundingClientRect();
      return {tag:e.tagName,className:typeof e.className==='string'?e.className:'svg',rect:[r.x,r.y,r.width,r.height],css:Object.fromEntries(properties.map(p=>[p,c.getPropertyValue(p)]))};
    });
  },all);
}
async function stable(page, all=false) {
  let previous='',count=0,last;
  for(let i=0;i<70;i++) {
    last=await styles(page,all);const current=JSON.stringify(last);
    count=current===previous?count+1:0;previous=current;
    if(count>=3)return last;
    await page.waitForTimeout(120);
  }
  throw Error('Page geometry did not settle for a reliable before/after comparison');
}
async function measure(page) {
  return page.evaluate(selector=>{
    const grid=document.querySelector(selector),cards=[...grid.querySelectorAll('article')],c=getComputedStyle(grid);
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    const media=cards.slice(0,3).map(card=>card.querySelector('[class*="product-card-media_stage__"]')||card.querySelector('img')).filter(Boolean);
    const content=document.querySelector('.collection-page [class*="collection-browser_content__"]');
    return {columns:c.gridTemplateColumns.split(/\s+/).length,columnGap:c.columnGap,rowGap:c.rowGap,grid:rect(grid),content:rect(content),
      cards:cards.slice(0,6).map(rect),media:media.map(rect),
      names:cards.map(card=>card.querySelector('h3')?.textContent),
      prices:cards.map(card=>card.querySelector('[class*="priceRow__"]')?.textContent),
      photos:cards.flatMap(card=>[...card.querySelectorAll('img')].map(i=>({src:i.getAttribute('src'),srcset:i.getAttribute('srcset'),alt:i.alt}))),
      fonts:cards.slice(0,3).map(card=>{const e=card.querySelector('h3');const c=getComputedStyle(e);return[c.fontFamily,c.fontSize,c.fontWeight,c.color];}),
      overflow:document.documentElement.scrollWidth>innerWidth+1};
  },gridSelector);
}
function desktopCheck(state,width) {
  assert.equal(state.columns,3,'Desktop must keep exactly three columns');
  assert(state.cards.length>=3,'Three real products required for responsive validation');
  for(const card of state.cards)assert(card.width<=360.6,'Desktop card exceeds the approved 360px cap at '+width);
  assert.equal(state.overflow,false,'No horizontal page overflow');
  const left=state.content.x,right=width-state.content.x-state.content.width;
  assert(Math.abs(left-right)<5,'Desktop collection content remains centred');
}
async function screen(page,path) {
  return page.screenshot({path,animations:'disabled',caret:'hide'});
}

try {
  for(const engine of engines) {
    const browser=await pw[engine].launch({headless:true});
    try {
      for(const width of widths) {
        const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',deviceScaleFactor:1});
        await context.route('**/*',routeReadOnly);
        const page=await context.newPage();page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(120000);
        try {
          console.log('CHECK '+(live?'live ':'preview ')+engine+' '+width);
          await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded'});
          await freeze(page);await ready(page);
          await setCandidate(page,false);await ready(page);
          const beforeStyles=await stable(page),before=await measure(page);
          const keepScreens=engine==='chromium'&&[320,390,1050,1051,1366,1440,1771,1920].includes(width);
          const prefix=(live?'live-':'')+engine+'-'+width;
          const beforePng=await screen(page,keepScreens?join(root,prefix+'-before.png'):undefined);
          await setCandidate(page,true);await ready(page);
          const afterStyles=await stable(page),after=await measure(page);
          const afterPng=await screen(page,keepScreens?join(root,prefix+'-after.png'):undefined);
          for(const key of ['names','prices','photos','fonts','columnGap','rowGap'])assert.deepEqual(after[key],before[key],key+' must remain unchanged');
          assert.equal(after.overflow,false,'Horizontal overflow at '+width);
          let pixelIdentical=null;
          if(width<=1050) {
            assert.deepEqual(afterStyles,beforeStyles,'All existing mobile/tablet geometry and styles must remain unchanged');
            pixelIdentical=beforePng.equals(afterPng);
            assert(pixelIdentical,'Mobile/tablet screenshot must be pixel-identical at '+width);
          } else {
            desktopCheck(after,width);
            assert.equal(after.columns,before.columns,'Existing column count preserved');
            for(let i=0;i<Math.min(before.media.length,after.media.length);i++) {
              const b=before.media[i],a=after.media[i];
              assert(Math.abs(a.height/a.width-b.height/b.width)<0.012,'Full outfit image proportions preserved');
            }
            if(before.cards[0].width>361)assert(after.cards[0].width<before.cards[0].width,'Oversized desktop photos must shrink');
          }
          measurements.push({engine,width,height:1000,before,after,pixelIdentical,beforePngSha256:digest(beforePng),afterPngSha256:digest(afterPng),passed:true});
          console.log('PASS '+engine+' '+width+' width='+after.cards[0].width.toFixed(2)+(pixelIdentical?' mobile/tablet pixels identical':''));
          if(!live&&[390,720].includes(width)) {
            for(const name of ['Show one product per row','Show two products per row']) {
              const toggle=page.getByRole('button',{name,exact:true});
              assert.equal(await toggle.count(),1,'Existing mobile grid switch remains available');
              await setCandidate(page,false);await toggle.click();await ready(page);
              await page.waitForFunction(e=>e.getAttribute('aria-pressed')==='true',await toggle.elementHandle());
              const original=await stable(page),png=await screen(page);
              await setCandidate(page,true);await ready(page);
              assert.deepEqual(await stable(page),original,'Mobile '+name+' remains unchanged');
              assert(png.equals(await screen(page)),'Mobile '+name+' pixels remain unchanged');
              extraCases.push({engine,width,test:name,passed:true});
            }
            const mobile=await stable(page);
            await page.setViewportSize({width:1440,height:1000});await ready(page);desktopCheck(await measure(page),1440);
            await page.setViewportSize({width,height:1000});await ready(page);
            assert.deepEqual(await stable(page),mobile,'Returning from desktop must restore mobile layout');
            extraCases.push({engine,width,test:'mobile-desktop-mobile resize',passed:true});
          }
          if(!live&&width===1440) {
            for(const count of [0,1,2,3,4,6]) {
              const handle=await page.addStyleTag({content:gridSelector+' > :nth-child(n+'+(count+1)+'){display:none!important}'});
              const state=await page.locator(gridSelector).evaluate(e=>({columns:getComputedStyle(e).gridTemplateColumns.split(/\s+/).length,widths:[...e.querySelectorAll('article')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.getBoundingClientRect().width),overflow:document.documentElement.scrollWidth>innerWidth+1}));
              assert.equal(state.columns,3);assert(state.widths.every(w=>w<=360.6));assert.equal(state.overflow,false);
              await handle.evaluate(e=>e.remove());
              extraCases.push({engine,width,test:'sparse-grid-'+count,passed:true});
            }
          }
          if(!live&&[390,1440].includes(width)) {
            const product=await page.locator(gridSelector+' article h3 a').first().getAttribute('href');
            for(const path of ['/',product,'/cart','/checkout','/account','/admin/sign-in']) {
              if(!path)throw Error('Real product link missing');
              await page.goto(base+path,{waitUntil:'domcontentloaded'});await freeze(page);await page.waitForTimeout(500);
              await setCandidate(page,false);const original=await stable(page,true);
              await setCandidate(page,true);assert.deepEqual(await stable(page,true),original,'Non-collection page unchanged: '+path);
              extraCases.push({engine,width,test:'unchanged-route',path,passed:true});
            }
          }
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.equal(measurements.length,engines.length*widths.length);
  const report={passed:true,engines,cssSha256:digest(css),measurements,extraCases,upstreamWrites:0,blockedNonReadRequests:attemptedWrites,assetWarnings:errors,live};
  await writeFile(join(root,live?'live.json':'report.json'),JSON.stringify(report,null,2));
  console.log('PASS '+measurements.length+' viewport comparisons and '+extraCases.length+' additional checks; zero upstream writes');
} catch(error) {
  await writeFile(join(root,live?'live-failure.json':'failure.json'),JSON.stringify({passed:false,error:error.stack,measurements,extraCases,errors,upstreamWrites:0},null,2));
  throw error;
} finally { if(snapshot){await snapshot.save();await snapshot.close();} }
