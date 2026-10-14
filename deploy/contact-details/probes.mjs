import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isBlockedTelemetry } from '../button-states/request-policy.mjs';

export async function probe(base, output) {
  const pw = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  await mkdir(output, { recursive: true });
  for (const path of ['/lookbook', '/lookbook/', '/lookbook?from=footer']) {
    for (const method of ['GET','HEAD']) {
      const response = await fetch(base+path, {method,redirect:'manual'});
      assert.equal(response.status,301);
      assert.equal(response.headers.get('location'),'/collections/all');
    }
  }
  const results = [], writes = [], engines = ['chromium','firefox','webkit'];
  for (const engine of engines) {
    const browser = await pw[engine].launch({headless:true,
      ...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try {
      for (const [width,height] of [[390,844],[1440,900]]) {
        const context = await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
        await context.route('**/*',route=> {
          const request=route.request();
          if (!['GET','HEAD'].includes(request.method())) {
            if (!isBlockedTelemetry(request.method(),request.url(),new URL(base).origin)) writes.push(new URL(request.url()).pathname);
            return route.abort();
          }
          if (request.resourceType()==='media'||/googletagmanager|google-analytics|facebook\.net|cloudflareinsights\.com/.test(request.url())) return route.abort();
          return route.continue();
        });
        const page=await context.newPage();
        page.setDefaultTimeout(30000);
        const check=async()=> {
          await page.locator('footer').first().waitFor();
          const visible=await page.locator('a[href="/lookbook"],a[href="/lookbook/"],a[href="https://hidiindia.com/lookbook"]').evaluateAll(links=>links.filter(a=>a.getClientRects().length && getComputedStyle(a).display!=='none').map(a=>a.textContent));
          assert.deepEqual(visible,[],'No customer-facing Lookbook links remain');
        };
        try {
          const verifyContact=async()=> {
            const card=page.locator('section[aria-label="Contact HIDI"]');
            await card.waitFor();
            await card.getByRole('heading',{name:'Talk to HIDI',exact:true}).waitFor();
            assert.equal(await card.locator('a[href="https://wa.me/917093709353"]').count(),1);
            assert.equal(await card.locator('a[href="tel:+917093709353"]').count(),1);
            assert.equal(await card.locator('a[href="mailto:contact@hidiindia.com"]').count(),1);
            for(const text of ['+91 70937 09353','contact@hidiindia.com','Flat No. 704, Hyma Arcade','Khanamet, Ayyappa Society, Madhapur','Hyderabad, Telangana – 500081','India']) assert((await card.innerText()).includes(text),text);
            assert(!(await card.innerText()).includes('Direct support is not open'));
            assert((await card.innerText()).includes('For an order enquiry'));
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Contact address fits mobile viewport');
            await check();
          };
          const contactResponse=await page.goto(base+'/contact',{waitUntil:'domcontentloaded'});
          assert(contactResponse.ok());
          const raw=await contactResponse.text();
          assert(raw.includes('tel:+917093709353') && raw.includes('mailto:contact@hidiindia.com'),'Contact details appear in initial server HTML');
          await verifyContact();
          await page.screenshot({path:`${output}/${engine}-${width}-contact.png`});
          assert((await page.goto(base+'/',{waitUntil:'domcontentloaded'})).ok());
          await check();
          const response=await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded'});
          assert(response.ok());
          assert(!/<a\b[^>]*href="\/lookbook\/?"/i.test(await response.text()),'Server footer no longer emits the retired link');
          await page.locator('main article h3 a').first().waitFor();
          await check();
          await page.locator('footer a[href="/contact"]').first().click();
          await page.waitForURL('**/contact');
          await verifyContact();
          await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded'});
          await page.locator('main article h3 a').first().waitFor();
          const product=await page.locator('main article h3 a').first().getAttribute('href');
          await page.locator('main article h3 a').first().click();
          await page.waitForURL('**/products/**');
          await page.getByRole('heading',{level:1}).first().waitFor();
          await check();
          await page.goto(base+'/cart',{waitUntil:'domcontentloaded'});
          await check();
          await page.goto(base+'/lookbook',{waitUntil:'domcontentloaded'});
          assert.equal(new URL(page.url()).pathname,'/collections/all');
          await page.locator('main article h3 a').first().waitFor();
          await check();
          await page.screenshot({path:`${output}/${engine}-${width}-catalogue.png`});
          results.push({engine,width,height,passed:true,product,lookbookRedirect:true,footerLinksRemoved:true,cartRetained:true,contactDetails:true,contactClientNavigation:true});
        } catch(error) {
          await page.screenshot({path:`${output}/${engine}-${width}-failure.png`}).catch(()=>{});
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(writes,[]);
  const report={passed:true,engines,results,liveWrites:0};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));
  return report;
}
if (process.argv[1]===new URL(import.meta.url).pathname) await probe(process.argv[2],process.argv[3]);
