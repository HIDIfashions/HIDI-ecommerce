import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
export async function probe(base,output,{offerWrites}={}) {
 const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),results=[];await mkdir(output,{recursive:true});
 const api=base+'/api/hidi/offers/admin';
 async function read(){const r=await fetch(api,{headers:{Cookie:'hidi_admin_access=owner'}});assert(r.ok);return r.json();}
 async function action(body){const state=await read();const r=await fetch(api,{method:'POST',headers:{Cookie:'hidi_admin_access=owner',Origin:base,'Content-Type':'application/json'},body:JSON.stringify({...body,etag:state.etag})});assert(r.ok,await r.clone().text());return r.json();}
 async function publish(audience='SELECTED',extra={}){let s=await read();await action({action:'save',draft:{...s.draft,audience,allowedPhones:['9000000001'],startsAt:null,endsAt:null,...extra}});return action({action:'publish',confirm:true});}
 for(const engine of ['chromium','firefox','webkit']) {
  const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
  async function context(width,identity=null,owner=false){const c=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await c.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==base||r.resourceType()==='media'||/razorpay\.com|google-analytics|googletagmanager|facebook/.test(u.hostname))return route.abort();if(!['GET','HEAD'].includes(r.method())&&!u.pathname.startsWith('/api/hidi/offers/admin'))return route.abort();return route.continue();});if(identity)await c.addInitScript(value=>localStorage.setItem('hidi_supabase_session',JSON.stringify({access_token:value,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'fixture-user',phone:'+919000000001'}})),identity);if(owner)await c.addCookies([{name:'hidi_admin_access',value:'owner',url:base,httpOnly:true}]);return c;}
  try{
   for(const width of [320,390,620,621,720,721,844,1440]){
    await publish();
    const c=await context(width,'selected'),page=await c.newPage();page.setDefaultTimeout(30000);await page.goto(base+'/');await page.locator('[data-hidi-offer-strip]').waitFor();
    assert.equal(await page.locator('[data-hidi-offer-strip]').count(),1);assert(await page.evaluate(()=>document.querySelector('section.hero--campaign').nextElementSibling.matches('[data-hidi-offer-strip]')));
    const oldHero=await page.locator('section.hero--campaign').getAttribute('class');const details=page.getByRole('button',{name:'View details',exact:true});await details.focus();await page.keyboard.press('Enter');assert.equal(await details.getAttribute('aria-expanded'),'true');await page.locator('#hidi-offer-terms:visible').waitFor();assert.equal(await page.locator('section.hero--campaign').getAttribute('class'),oldHero);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if([390,1440].includes(width))await page.screenshot({path:output+'/'+engine+'-'+width+'-selected.png',fullPage:false});
    await page.evaluate(()=>{localStorage.removeItem('hidi_supabase_session');dispatchEvent(new Event('hidi-auth-updated'));});await page.locator('[data-hidi-offer-strip]').waitFor({state:'detached'});
    await c.close();
    for(const identity of [null,'other','unverified','forged']){const blocked=await context(width,identity),p=await blocked.newPage();const pending=p.waitForResponse(r=>r.url()===base+'/api/hidi/offers');await p.goto(base+'/');await pending;assert.equal(await p.locator('[data-hidi-offer-strip]').count(),0);await blocked.close();}
    const guest=await context(width),g=await guest.newPage();await publish('EVERYONE');await g.goto(base+'/');await g.locator('[data-hidi-offer-strip]').waitFor();await action({action:'pause'});await g.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await g.locator('[data-hidi-offer-strip]').waitFor({state:'detached'});await guest.close();
    results.push({engine,width,selectedOnly:true,guestAndOtherDenied:true,unverifiedAndForgedDenied:true,logoutRemoved:true,everyoneAndPause:true,placementAndKeyboard:true});console.log('PASS offers audience '+engine+' '+width);
   }
   for(const width of [320,390,1440]){
    const c=await context(width,null,true),p=await c.newPage();p.setDefaultTimeout(30000);p.on('dialog',d=>{assert.equal(d.type(),'confirm');d.accept();});await p.goto(base+'/admin/offers');await p.getByText('Owner verified.',{exact:false}).waitFor();
    await p.getByLabel('Main offer',{exact:true}).fill('<img src=x onerror=alert(1)>');assert.equal(await p.getByRole('button',{name:'Publish saved draft'}).isEnabled(),false);
    await p.getByLabel('Who should see this?').selectOption('SELECTED');await p.getByLabel('Selected customer login numbers').fill('9000000001');await p.getByRole('button',{name:'Save draft',exact:true}).click();await p.getByText('Draft saved. Published visibility is unchanged.',{exact:true}).waitFor();
    await p.locator('#confirmed').check();await p.getByRole('button',{name:'Publish saved draft'}).click();await p.getByText('Saved offer published to its chosen audience.',{exact:true}).waitFor();
    await p.getByLabel('Main offer',{exact:true}).fill('My unsaved headline');await action({action:'pause'});await p.getByRole('button',{name:'Save draft',exact:true}).click();await p.getByText('Reload saved settings before another write.',{exact:false}).waitFor();assert.equal(await p.getByLabel('Main offer',{exact:true}).inputValue(),'My unsaved headline');assert.equal(await p.getByRole('button',{name:'Publish saved draft'}).isEnabled(),false);
    await p.getByRole('button',{name:'Reload saved settings'}).click();await p.getByText('Owner verified.',{exact:false}).waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width===390)await p.screenshot({path:output+'/'+engine+'-admin.png',fullPage:true});await c.close();
    results.push({engine,width,adminSavePublish:true,plainTextXssSafe:true,conflictPreservesDraft:true,dirtyPublishBlocked:true});
   }
  }finally{await browser.close();}
 }
 await action({action:'pause'});
 await writeFile(output+'/report.json',JSON.stringify({passed:true,actualCandidateRuntime:true,engines:['chromium','firefox','webkit'],results,productionWrites:0,disposableOfferWrites:offerWrites?.()||0},null,2));
}
