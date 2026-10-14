import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';

export async function probe(base, output) {
  const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  await mkdir(output,{recursive:true});
  const catalogue=await fetch(base+'/api/store/products');assert(catalogue.ok);
  const products=await catalogue.json();
  const product=products.find(p=>p.inStock && p.variants?.some(v=>v.available>0));assert(product);
  const results=[],escaped=[];
  const engines=['chromium','firefox','webkit'];
  for (const engine of engines) {
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try {
      for(const [width,height] of [[390,844],[1440,1000]]) {
        const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
        const page=await context.newPage();page.setDefaultTimeout(30000);
        let posts=0;const quantities=[];
        await context.route('**/*',async route=>{
          const req=route.request(),url=new URL(req.url());
          if(/\/carts\/[^/]+(?:\/items)?$/.test(url.pathname)) {
            if(req.method()==='POST' && url.pathname.endsWith('/items')) {
              const body=req.postDataJSON();
              assert.equal(body.quantity,1);assert(product.variants.some(v=>v.id===body.variantId && v.available>0));
              quantities.push(body);posts++;
              await new Promise(done=>setTimeout(done,250));
            } else assert(['GET','HEAD'].includes(req.method()));
            return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],itemCount:posts,subtotalPaise:0,totalPaise:0})});
          }
          if(!['GET','HEAD'].includes(req.method())) {
            if(!isBlockedTelemetry(req.method(),req.url(),new URL(base).origin)) escaped.push(url.pathname);
            return route.abort();
          }
          if(req.resourceType()==='media'||/googletagmanager|google-analytics|facebook\.net|cloudflareinsights\.com|razorpay\.com/.test(url.hostname))return route.abort();
          return route.continue();
        });
        const catalogueView=async()=>{
          assert((await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded'})).ok());
          const one=page.getByRole('button',{name:'Show one product per row',exact:true});
          if(await one.isVisible()) {
            await one.click();
            await page.waitForFunction(()=>document.querySelector('[class*="collection-browser_gridOne__"]'));
          }
        };
        try {
          await catalogueView();
          const card=page.locator('main article').filter({has:page.getByRole('heading',{name:product.name,exact:true})}).first();
          await card.waitFor();
          // The wishlist effect confirms React has attached handlers to this card.
          await page.waitForFunction(name=>Array.from(document.querySelectorAll('main article')).some(card=>card.querySelector('h3')?.textContent===name && Array.from(card.querySelectorAll('button')).some(button=>/wishlist/i.test(button.getAttribute('aria-label')||'')&&!button.disabled)),product.name);
          await card.hover();
          const add=card.locator('button:visible').filter({hasText:/^Add to Cart$/i}).first();
          const buy=card.locator('button:visible').filter({hasText:/^Buy Now$/i}).first();
          await add.waitFor();assert(await add.isEnabled() && await buy.isEnabled(),'Both actions enabled without a size');
          assert.equal(await add.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(232, 216, 196)');
          assert.equal(await buy.evaluate(e=>getComputedStyle(e).color),'rgb(255, 248, 239)');
          assert((await buy.evaluate(e=>getComputedStyle(e).backgroundImage)).includes('rgb(89, 29, 32)'),'Buy Now uses the header palette');
          assert.equal(await card.locator('[role="alert"]:visible').count(),0);
          await add.click();
          const error=card.locator('[role="alert"]:visible').first();
          await error.waitFor();assert.equal((await error.innerText()).trim(),'Select a size to continue.');
          assert.equal(await error.evaluate(e=>getComputedStyle(e).color),'rgb(180, 35, 24)');
          assert.equal(posts,0,'No cart request without a size');
          await buy.click();assert.equal((await error.innerText()).trim(),'Select a size to continue.');assert.equal(posts,0);
          await page.screenshot({path:`${output}/${engine}-${width}-size-error.png`});
          const sizes=card.locator('[class*="fitRibbon"] button:visible:enabled');
          const choice=sizes.first();const size=(await choice.innerText()).trim();
          await choice.click();
          assert.equal(await choice.getAttribute('aria-pressed'),'true');
          assert.equal(await card.locator('[role="alert"]:visible').count(),0,'Choosing a size clears the error');
          await add.evaluate(button=>{button.dispatchEvent(new MouseEvent('click',{bubbles:true}));button.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
          await page.waitForFunction(()=>Array.from(document.querySelectorAll('main article button')).some(b=>b.textContent.trim()==='Added'));
          assert.equal(posts,1,'Repeated clicks produce one isolated addition');
          await add.waitFor({state:'visible'});
          await page.waitForFunction(name=>Array.from(document.querySelectorAll('main article')).filter(c=>c.querySelector('h3')?.textContent===name).some(c=>Array.from(c.querySelectorAll('button')).some(b=>/^Add to Cart$/i.test(b.textContent.trim())&&!b.disabled)),product.name);
          await choice.click();
          await buy.click();await error.waitFor();assert.equal((await error.innerText()).trim(),'Select a size to continue.');assert.equal(posts,1);
          await choice.click();
          await buy.evaluate(button=>{button.dispatchEvent(new MouseEvent('click',{bubbles:true}));button.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
          await page.waitForURL('**/checkout');assert.equal(posts,2,'Buy Now adds once before checkout');
          assert(quantities.every(v=>v.quantity===1));
          await catalogueView();
          const soldOut=products.find(p=>!p.inStock);
          if(soldOut) {
            const soldCard=page.locator('main article').filter({has:page.getByRole('heading',{name:soldOut.name,exact:true})}).first();
            await soldCard.hover();
            assert(await soldCard.locator('button:visible').filter({hasText:/^Sold out$/i}).first().isDisabled(),'Sold-out action remains disabled');
          }
          const unavailable=page.locator('main article').filter({has:page.getByRole('heading',{name:product.name,exact:true})}).first().locator('[class*="fitRibbon"] button:visible:disabled');
          if(base.includes('127.0.0.1'))assert(await unavailable.count()>0,'Unavailable size fixture remains disabled');
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
          const contact=await page.request.get(base+'/contact');assert(contact.ok());assert((await contact.text()).includes('mailto:Contact@hidiindia.com'));
          const lookbook=await page.request.get(base+'/lookbook',{maxRedirects:0});assert.equal(lookbook.status(),301);
          results.push({engine,width,height,passed:true,missingSizeWrites:0,isolatedCartAdds:posts,duplicateClicksBlocked:true,stockChecksRetained:true,chosenSize:size,checkoutNavigation:true});
        } catch(error) {
          console.error('PURCHASE_UI_DIAGNOSTIC',JSON.stringify({engine,width,posts,controls:await page.locator('main article').first().locator('button,[role="alert"]').evaluateAll(nodes=>nodes.map(e=>({text:e.textContent,className:e.className,disabled:e.disabled,color:getComputedStyle(e).color,display:getComputedStyle(e).display}))).catch(()=>[])}));
          await page.screenshot({path:`${output}/${engine}-${width}-failure.png`}).catch(()=>{});throw error;
        }
        finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(escaped,[],'No live commerce writes permitted');
  const report={passed:true,engines,results,liveWrites:0};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await probe(process.argv[2],process.argv[3]);
