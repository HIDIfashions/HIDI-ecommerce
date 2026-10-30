import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startPreview} from './preview-server.mjs';
import {DRESSES,DEFAULT_ORDER,validOrder} from './model.mjs';
import {KEY} from './storage.mjs';
const root=resolve(process.argv[2]),out=join(root,'results');await mkdir(out,{recursive:true});const server=await startPreview(root);let checks=0;const results=[];
const check=(value,message)=>{assert(value,message);checks++;};
const headers={Cookie:'preview=owner',Origin:server.base,'Content-Type':'application/json'};
const request=(path,options={})=>fetch(server.base+path,options);
const api='/api/hidi/landing-media-portrait-order';
const save=(order,etag,extra={})=>request(api,{method:'POST',headers,body:JSON.stringify({order,etag,...extra})});
const state=()=>request(api,{headers}).then(r=>r.json());
try{
  check((await request(api)).status===401,'Anonymous order access blocked');
  check((await request(api,{headers:{Cookie:'preview=staff'}})).status===403,'Non-owner blocked');
  check((await request('/api/hidi/portrait-order',{method:'POST'})).status===403,'Harness blocks writes to public route');
  let data=await state();assert.deepEqual(data.order,DEFAULT_ORDER);check(data.etag===null&&data.builtinActive,'Legacy collage uses default five dresses');check(server.writes.length===0,'Reads never initialize storage');
  for(const path of ['/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/hero-library','/api/hidi/landing-media-library','/api/hidi/landing-media-range-text'])check((await request(path,{headers})).status===200,'Retained media route '+path);
  check((await request('/api/hidi/landing-media-library')).status===401,'Retained admin authentication');
  check((await request(api,{method:'HEAD',headers})).status===200,'HEAD is read only');
  const reversed=[...DEFAULT_ORDER].reverse();
  for(const bad of [[],DEFAULT_ORDER.slice(1),[...DEFAULT_ORDER,DEFAULT_ORDER[0]],Array(5).fill(DEFAULT_ORDER[0]),[...DEFAULT_ORDER.slice(0,4),'unknown']])check((await save(bad,null)).status===400,'Invalid permutation rejected');
  check((await save(DEFAULT_ORDER,null,{caption:'unexpected'})).status===400,'Cannot change captions via order API');
  check((await request(api,{method:'POST',headers:{...headers,Origin:'https://unrelated.invalid'},body:JSON.stringify({order:reversed,etag:null})})).status===403,'Cross-origin blocked');
  check((await request(api,{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{}'})).status===415,'JSON required');
  check((await request(api,{method:'POST',headers,body:'x'.repeat(2050)})).status===413,'Oversized payload blocked');
  check((await request(api,{method:'POST',headers,body:'{'})).status===400,'Malformed JSON blocked');
  check((await save(reversed,null)).status===200,'First save works');data=await state();assert.deepEqual(data.order,reversed);check(typeof data.etag==='string','Save persists and versions order');
  check((await save(DEFAULT_ORDER,null)).status===409,'Stale editor blocked');
  const concurrent=await Promise.all([save(DEFAULT_ORDER,data.etag),save([...reversed.slice(1),reversed[0]],data.etag)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);checks++;
  for(const [key,value] of server.blobs)if(key!==KEY)check(!server.writes.includes(key),'Unrelated media document unchanged');
  const media=server.blobs.get('brand/landing-media/current.json');const before=structuredClone(media.value);
  media.value.ananya={active:true,items:[{url:'/custom.jpg'}]};check(!(await state()).builtinActive,'Custom gallery is identified');check((await save(DEFAULT_ORDER,(await state()).etag)).status===409,'Custom gallery cannot be replaced');media.value=before;
  server.setFailure(true);check((await request(api,{headers})).status===503,'Storage read failure reported');check((await request('/api/hidi/portrait-order')).status===503,'Public failure lets gallery retain original order');server.setFailure(false);
  check(validOrder(DEFAULT_ORDER),'Model accepts exact set');
  const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'&&process.env.HIDI_FIREFOX_EXECUTABLE?{executablePath:process.env.HIDI_FIREFOX_EXECUTABLE}:{})});
    try{for(const width of [390,1440]){
      server.reset();const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
      await context.addCookies([{name:'preview',value:'owner',url:server.base}]);await context.route('**/*',route=>new URL(route.request().url()).origin===server.base?route.continue():route.abort());
      const page=await context.newPage(),errors=[],orderResponses=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',async response=>{if(response.url().endsWith('/api/hidi/portrait-order'))orderResponses.push({status:response.status(),body:await response.text()});});page.setDefaultTimeout(20000);
      try{
        await page.goto(server.base+'/admin/landing-media?section=ananya');await page.getByText('Saved order loaded.',{exact:false}).waitFor();const panel=page.locator('#portraitOrder');
        check(await panel.locator('li').count()===5,'Five dresses visible');check(await panel.getByRole('button',{name:'Move up: Pink embroidered kurta',exact:true}).isDisabled(),'First up disabled');check(await panel.getByRole('button',{name:'Move down: Red floral embroidered kurta',exact:true}).isDisabled(),'Last down disabled');
        check(await panel.getByRole('button',{name:'Save order',exact:true}).isDisabled(),'No save when unchanged');
        await panel.getByRole('button',{name:'Move up: Yellow floral kurta',exact:true}).click();
        check(await panel.locator('li').first().getAttribute('data-dress')===DEFAULT_ORDER[1],'Move up reorders full row');check(server.writes.length===0,'Move only changes draft');
        check(await page.evaluate(()=>document.activeElement.getAttribute('aria-label'))==='Move down: Yellow floral kurta','Keyboard focus follows moved dress');
        check(await panel.locator('li').first().innerText().then(t=>t.includes(DRESSES[1].caption)&&t.includes(DRESSES[1].title)),'Caption stays paired');
        await panel.screenshot({path:join(out,engine+'-'+width+'-admin.png')});
        const draft=[DEFAULT_ORDER[1],DEFAULT_ORDER[0],...DEFAULT_ORDER.slice(2)];
        await panel.getByRole('button',{name:'Save order',exact:true}).click();await panel.getByText('Order saved.',{exact:false}).waitFor();assert.deepEqual((await state()).order,draft);checks++;
        await page.reload();await page.getByText('Saved order loaded.',{exact:false}).waitFor();check(await panel.locator('li').first().getAttribute('data-dress')===DEFAULT_ORDER[1],'Saved order survives reload');
        await page.goto(server.base+'/');const gallery=page.locator('#meet-hidi');await gallery.locator('.portrait-gallery__preview').first().waitFor();await gallery.scrollIntoViewIfNeeded();
        await page.waitForFunction(id=>document.querySelector('.portrait-gallery__preview img')?.getAttribute('src').includes(id),DEFAULT_ORDER[1]);
        for(let index=0;index<draft.length;index++){
          const dress=DRESSES.find(d=>d.id===draft[index]);await gallery.locator('.portrait-gallery__preview').nth(index).click();await gallery.getByRole('heading',{name:dress.title,exact:true}).waitFor();check(await gallery.locator('.portrait-gallery__story').innerText().then(t=>t.includes(dress.caption)),'Storefront caption matches '+dress.id);
        }
        await gallery.locator('.portrait-gallery__preview').first().click();await gallery.locator('.portrait-gallery__portrait').evaluate(img=>img.decode());check(await gallery.locator('.portrait-gallery__portrait').evaluate(img=>img.naturalWidth>1),'Main portrait renders');await gallery.screenshot({path:join(out,engine+'-'+width+'-storefront.png')});
        check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Homepage no horizontal overflow');
        await page.goto(server.base+'/admin/landing-media?section=ananya');await page.getByText('Saved order loaded.',{exact:false}).waitFor();
        await panel.getByRole('button',{name:'Use original order'}).click();check(server.writes.length===1,'Default is a draft until saved');await panel.getByRole('button',{name:'Save order',exact:true}).click();await panel.getByText('Order saved.',{exact:false}).waitFor();assert.deepEqual((await state()).order,DEFAULT_ORDER);checks++;
        await panel.getByRole('button',{name:'Move down: Pink embroidered kurta',exact:true}).click();
        const fresh=await state();await save(reversed,fresh.etag);await panel.getByRole('button',{name:'Save order',exact:true}).click();await panel.getByText('The order changed in another session.',{exact:false}).waitFor();check(!(await panel.getByRole('button',{name:'Save order',exact:true}).isDisabled()),'Conflict preserves draft');
        page.once('dialog',dialog=>dialog.accept());await panel.getByRole('button',{name:'Reload saved order'}).click();await panel.getByText('Saved order loaded.',{exact:false}).waitFor();check(await panel.locator('li').first().getAttribute('data-dress')===DEFAULT_ORDER[4],'Reload resolves conflict');
        check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin no horizontal overflow');
        server.setFailure(true);await panel.getByRole('button',{name:'Move down: Red floral embroidered kurta',exact:true}).click();await panel.getByRole('button',{name:'Save order',exact:true}).click();await panel.getByText('Gallery order is temporarily unavailable.',{exact:false}).waitFor();check(!(await panel.getByRole('button',{name:'Save order',exact:true}).isDisabled()),'Failed save retains retryable draft');server.setFailure(false);
        page.once('dialog',dialog=>dialog.accept());await panel.getByRole('button',{name:'Reload saved order'}).click();await panel.getByText('Saved order loaded.',{exact:false}).waitFor();
        await page.route('**/api/hidi/portrait-order',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));await page.goto(server.base+'/');await gallery.scrollIntoViewIfNeeded();await gallery.getByRole('heading',{name:DRESSES[0].title,exact:true}).waitFor();check(await gallery.locator('.portrait-gallery__preview').count()===5,'Order API outage preserves complete default gallery');await page.unroute('**/api/hidi/portrait-order');
        const media=server.blobs.get('brand/landing-media/current.json');media.value.ananya={active:true,autoPlay:false,items:[{type:'image',url:DRESSES[3].url,altText:'Custom portrait'}]};await page.reload();await gallery.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('.portrait-gallery__preview').length===1);check(await gallery.locator('.portrait-gallery__story').innerText().then(t=>t.includes('A version of her.')),'Existing custom gallery still takes priority');
        await page.goto(server.base+'/admin/landing-media?section=ananya');await panel.getByText('A custom Ananya photo list is active.',{exact:false}).waitFor();check(await panel.getByRole('button',{name:'Move down: Red floral embroidered kurta',exact:true}).isDisabled(),'Custom gallery order controls disabled');
        assert.deepEqual(errors,[]);assert.deepEqual(server.unexpected,[]);check(server.writes.every(key=>key===KEY),'Only dedicated order document written');
        results.push({engine,width,passed:true});console.log('PASS '+engine+' '+width);
      }catch(error){console.error(JSON.stringify({errors,orderResponses,srcs:await page.locator('.portrait-gallery__preview img').evaluateAll(items=>items.map(i=>i.getAttribute('src')))}));await page.screenshot({path:join(out,'failure.png'),fullPage:true});throw error;}finally{await context.close();}
    }}finally{await browser.close();}
  }
  await writeFile(join(out,'regression.json'),JSON.stringify({passed:true,checks,results,productionWrites:0,notDeployed:true},null,2));console.log('PASS '+checks+' checks; no production writes');
}finally{await server.close();}
