import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {snapshotServer} from './snapshot-server.mjs';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const root=resolve(process.env.HIDI_CATALOGUE_EVIDENCE||'evidence/catalogue-polish');
await mkdir(root,{recursive:true});
const css=await readFile(new URL('./catalogue-polish.css',import.meta.url),'utf8');
const snapshot=await snapshotServer({directory:join(root,'snapshot'),css});
const engines=(process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',');
const viewports=[{width:320,height:740},{width:390,height:1000},{width:620,height:844},{width:621,height:844},{width:720,height:900},{width:721,height:900},{width:844,height:900},{width:1440,height:1000}];
const measurements=[];
// Keep browser traffic local. Anonymous external media is read through the
// snapshot's curl transport; commerce/API routes retain the canonical fixtures.
for(const engine of engines){
  const launch=pw[engine].launch.bind(pw[engine]);
  pw[engine].launch=async options=>{
    const browser=await launch(options);
    const newContext=browser.newContext.bind(browser);
    browser.newContext=async options=>{
      const context=await newContext(options),newPage=context.newPage.bind(context);
      context.newPage=async()=>{
        const page=await newPage();
        await page.route('**/*',async route=>{
          const req=route.request(),url=new URL(req.url());
          if(/googletagmanager|google-analytics|facebook\.net/.test(url.hostname))return route.abort();
          if(url.origin===snapshot.base||url.pathname.startsWith('/api/')||!['GET','HEAD'].includes(req.method())||req.resourceType()==='media')return route.fallback();
          const response=await snapshot.pull(req.url());
          return route.fulfill({status:response.status,contentType:response.contentType,body:response.body});
        });
        return page;
      };
      return context;
    };
    return browser;
  };
}
async function measure(page){
  return page.evaluate(()=>{
    const grid=document.querySelector('[class*="collection-browser_productGrid__"]'),card=grid.querySelector('article'),title=card.querySelector('[class*="product-card_name__"]');
    const style=element=>{const c=getComputedStyle(element);return{fontFamily:c.fontFamily,fontSize:c.fontSize,fontWeight:c.fontWeight,color:c.color,background:c.backgroundColor,display:c.display,height:c.height,width:c.width};};
    const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
    const buttons=[...card.querySelectorAll('[class*="product-card-media_expandIcon__"],[class*="product-card_mobileQuickAdd__"]')].map(e=>({label:e.getAttribute('aria-label'),rect:rect(e),style:style(e),surface:getComputedStyle(e,'::before').content,surfaceInset:getComputedStyle(e,'::before').top,svg:e.querySelector('svg')?rect(e.querySelector('svg')):null}));
    const c=getComputedStyle(grid);
    return{padding:parseFloat(getComputedStyle(document.querySelector('.collection-page')).paddingTop),rowGap:parseFloat(c.rowGap),columnGap:c.columnGap,columns:c.gridTemplateColumns,grid:rect(grid),title:style(title),buttons,header:style(document.querySelector('.site-header')),footer:style(document.querySelector('footer.site-footer,footer.footer')),cardNames:[...grid.querySelectorAll('article h3')].map(e=>e.textContent),prices:[...grid.querySelectorAll('[class*="priceRow__"]')].map(e=>e.textContent),photos:[...grid.querySelectorAll('img')].map(e=>({src:e.src,srcset:e.getAttribute('srcset'),alt:e.alt})),overflow:document.documentElement.scrollWidth>innerWidth};
  });
}
async function ready(page){
  await page.locator('[class*="collection-browser_productGrid__"] article').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('[class*="product-card_mobileQuickAdd__"]')?.disabled===false);
  await page.evaluate(()=>document.fonts.ready);
  await settledStyles(page);
}
async function applyCss(page){
  await page.evaluate(css=>{
    const style=document.querySelector('style[data-hidi-storefront-layer-fix="true"]');
    if(!style)throw Error('Retained style block missing');
    style.textContent+='\n/* hidi-catalogue-polish-20261013 */\n'+css+'\n';
  },css);
}
async function navigationStyles(page){
  return page.evaluate(()=>[...document.querySelectorAll('body,.site-header,.site-header *,.site-footer,.site-footer *,.footer,.footer *,.product-page,.product-page *,.cart-page,.cart-page *,.checkout-page,.checkout-page *')].map(e=>{const c=getComputedStyle(e);let concealed=c.display==='none';for(let p=e.parentElement;p;p=p.parentElement){if(getComputedStyle(p).display==='none')concealed=true;if(p.matches('details:not([open])')&&!p.querySelector(':scope > summary')?.contains(e))concealed=true;}return{tag:e.tagName,className:e.className,concealed,color:c.color,bg:c.backgroundColor,font:c.font,weight:c.fontWeight,padding:c.padding,margin:c.margin,...(!concealed?{width:c.width,height:c.height}:{}),border:c.border,display:c.display};}));
}
async function settledStyles(page){
  // Wait for actual scripts and hydration, then require a stable layout before
  // comparing. Closed details retain their non-geometric styles in the check.
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('script[src]:not([nomodule])')).filter(s=>new URL(s.src).origin===location.origin).every(s=>performance.getEntriesByName(s.src).length>0));
  if(await page.locator('[data-hidi-react-pdp]').count())await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor({state:'attached'});
  await page.evaluate(()=>document.fonts.ready);
  let last='',stable=0;
  const start=Date.now();
  while(Date.now()-start<15000){
    const styles=await navigationStyles(page),current=JSON.stringify(styles);
    stable=current===last?stable+1:0;last=current;
    if(stable>=5)return styles;
    await page.waitForTimeout(100);
  }
  throw Error('Non-catalogue layout did not settle');
}
try{
  for(const engine of engines){
    const browser=await pw[engine].launch({headless:true});
    try{
      for(const viewport of viewports){
        const context=await browser.newContext({viewport,reducedMotion:'reduce',hasTouch:viewport.width<=844});
        await context.route('**/*',route=>!['GET','HEAD'].includes(route.request().method())||route.request().resourceType()==='media'||/googletagmanager|google-analytics|facebook\.net/.test(route.request().url())?route.abort():route.continue());
        const page=await context.newPage();page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(120000);
        try{
          snapshot.setCandidate(false);await page.goto(snapshot.base+'/collections/all',{waitUntil:'domcontentloaded'});await ready(page);const before=await measure(page);
          if(engine==='chromium'&&[390,1440].includes(viewport.width))await page.screenshot({path:join(root,'before-'+viewport.width+'.jpg'),type:'jpeg',quality:80});
          await applyCss(page);
          await page.waitForFunction(expected=>parseFloat(getComputedStyle(document.querySelector('.collection-page')).paddingTop)===expected,viewport.width<=720?12:20,{timeout:5000});
          const after=await measure(page);
          assert.equal(after.padding,viewport.width<=720?12:20,'Requested catalogue top padding');
          assert(after.padding<before.padding,'Top gap must shrink');assert(after.rowGap<before.rowGap,'Rows must tighten');assert.equal(after.title.fontWeight,'400');
          for(const key of ['columns','columnGap','cardNames','prices','photos','header','footer'])assert.deepEqual(after[key],before[key],key+' remains unchanged');
          for(const key of ['fontFamily','fontSize','color','height','width'])assert.equal(after.title[key],before.title[key],'Title '+key+' remains unchanged');
          assert.equal(after.overflow,false);
          for(const button of after.buttons){assert(button.rect.width>=44&&button.rect.height>=44,'44px tap target');assert.equal(button.surfaceInset,'6px');assert.equal(button.svg.width,16);const beforeButton=before.buttons.find(b=>b.label===button.label);assert.equal(button.rect.width,beforeButton.rect.width);assert.equal(button.rect.height,beforeButton.rect.height);}
          const quick=page.locator('[class*="product-card_mobileQuickAdd__"]').first(),zoom=page.locator('[class*="product-card-media_expandIcon__"]').first();
          for(const control of [quick,zoom]){const box=await control.boundingBox();const hits=await control.evaluate(e=>{const r=e.getBoundingClientRect();return[[r.x+r.width/2,r.y+r.height/2],[r.x+3,r.y+r.height/2]].every(([x,y])=>{const hit=document.elementFromPoint(x,y);return e===hit||e.contains(hit);});});assert(hits,'Icon centre and outer tap area remain clickable');assert(box.width>=44);}
          if(viewport.width<=720){for(const [name,gap]of [['Show one product per row','32px'],['Show two products per row','24px']]){const toggle=page.getByRole('button',{name,exact:true});await toggle.click();await page.waitForFunction(e=>e.getAttribute('aria-pressed')==='true',await toggle.elementHandle());await page.waitForFunction(expected=>getComputedStyle(document.querySelector('[class*="collection-browser_productGrid__"]')).rowGap===expected,gap);assert.equal(await page.locator('[class*="collection-browser_productGrid__"]').evaluate(e=>getComputedStyle(e).rowGap),gap);}}
          await zoom.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog').filter({has:page.getByRole('button',{name:/Close.*(?:photo|gallery)|Close zoom/i})});
          // Native lightbox semantics differ by retained gallery version; Escape
          // always closes the opened full-photo dialog without altering selection.
          await page.getByRole('dialog').last().waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').last().waitFor({state:'hidden'});
          measurements.push({engine,...viewport,before,after,passed:true});console.log('PASS styling '+engine+' '+viewport.width);
          // Same-page scoped CSS must leave every existing non-catalogue surface
          // unchanged, including typography, control colours and layout metrics.
          if([390,1440].includes(viewport.width)){
            const slug=(await page.locator('article h3 a').first().getAttribute('href'));
            for(const path of ['/',slug,'/cart','/checkout','/account','/admin/sign-in']){
              snapshot.setCandidate(false);await page.goto(snapshot.base+path,{waitUntil:'domcontentloaded'});await page.locator('body').waitFor();const old=await settledStyles(page);
              if(await page.locator('style[data-hidi-storefront-layer-fix="true"]').count())await applyCss(page);
              const next=await settledStyles(page);
              if(JSON.stringify(next)!==JSON.stringify(old))console.error('ROUTE_STYLE_DIFF',path,JSON.stringify(next.map((value,index)=>JSON.stringify(value)!==JSON.stringify(old[index])?{index,before:old[index],after:value}:null).filter(Boolean)));
              assert.deepEqual(next,old,'Styles are unchanged outside catalogue: '+path);
            }
          }
          // Verify the deployable HTML addition itself, rather than relying on
          // the same-document comparison used to isolate style differences.
          snapshot.setCandidate(true);
          await page.goto(snapshot.base+'/collections/all',{waitUntil:'domcontentloaded'});await ready(page);
          await page.waitForFunction(expected=>parseFloat(getComputedStyle(document.querySelector('.collection-page')).paddingTop)===expected,viewport.width<=720?12:20,{timeout:5000});
          const served=await measure(page);
          for(const key of ['padding','rowGap','columns','columnGap','title','cardNames','prices','photos','header','footer','overflow'])assert.deepEqual(served[key],after[key],'Candidate HTML preserves verified '+key);
          assert.equal(await page.locator('style[data-hidi-storefront-layer-fix="true"]').evaluate(e=>(e.textContent.match(/hidi-catalogue-polish-20261013/g)||[]).length),1,'Exactly one stylesheet addition');
          if(engine==='chromium'&&[390,1440].includes(viewport.width))await page.screenshot({path:join(root,'after-'+viewport.width+'.jpg'),type:'jpeg',quality:80});
        }catch(error){
          const diagnostic=await page.evaluate(()=>{const e=document.querySelector('.collection-page'),s=document.querySelector('style[data-hidi-storefront-layer-fix="true"]');return{padding:e?getComputedStyle(e).paddingTop:null,transition:e?getComputedStyle(e).transition:null,animation:e?getComputedStyle(e).animation:null,styleTail:s?.textContent.slice(-2400),rules:s?.sheet?.cssRules.length};});
          console.error('STYLE_DIAGNOSTIC',JSON.stringify(diagnostic));
          await writeFile(join(root,engine+'-'+viewport.width+'-failure.txt'),error.stack+'\n'+JSON.stringify(diagnostic)+'\n'+await page.locator('body').innerText());throw error;}
        finally{await context.close();}
      }
    }finally{await browser.close();}
  }
  // Keep every canonical commerce assertion intact; only browser launch options
  // are adapted for the local network. Candidate HTML receives the exact CSS.
  const canonical=await import('./commerce.mjs');
  snapshot.setCandidate(false);const baseline=await canonical.probe(snapshot.base,join(root,'baseline-commerce'));
  snapshot.setCandidate(true);const candidate=await canonical.probe(snapshot.base,join(root,'candidate-commerce'));
  assert.equal(baseline.passed,true);assert.equal(candidate.passed,true);assert.equal(candidate.liveWrites,0);assert.equal(baseline.liveWrites,0);
  // Unload beacons can outlive Playwright routing. The local server rejects
  // them with 405 before its GET/HEAD transport, so they never reach production.
  const localTelemetry=snapshot.denied.filter(r=>r.method==='POST'&&new URL(r.path,snapshot.base).pathname==='/api/hidi/performance');
  assert.deepEqual(snapshot.denied.filter(r=>!localTelemetry.includes(r)),[],'No business write may reach the local read-only guard');
  const report={passed:true,cssSha256:createHash('sha256').update(css).digest('hex'),sourceSha:process.env.GITHUB_SHA||null,engines,viewports,measurements,baseline,candidate,localUnloadTelemetryRejected:localTelemetry.length,upstreamWrites:0,deploymentPerformed:false};
  await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));console.log('PASS complete baseline and candidate commerce regression; production unchanged');
}finally{await snapshot.save();await snapshot.close();}
