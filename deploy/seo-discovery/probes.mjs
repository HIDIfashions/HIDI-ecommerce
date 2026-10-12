import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isBlockedTelemetry } from '../button-states/request-policy.mjs';

export async function probe(base, output) {
  const seoHeaders={'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'};
  const robots=await fetch(base+'/robots.txt',{headers:seoHeaders});
  assert.equal(robots.status,200);
  const policy=await robots.text();
  assert(policy.includes('Sitemap: https://hidiindia.com/sitemap.xml'));
  assert(!/^Disallow: \/$/m.test(policy),'Public host must be crawlable');
  const sitemap=await fetch(base+'/sitemap.xml',{headers:seoHeaders});
  assert.equal(sitemap.status,200,'Conventional sitemap endpoint must work');
  const xml=await sitemap.text();
  assert(xml.includes('/products/'),'Sitemap includes the read-only public catalogue');
  assert(!xml.includes('thehidi.com')&&!xml.includes('/cart'));
  const preview=await fetch(base+'/robots.txt',{headers:{'x-forwarded-host':'thidigk.thehidi.com'}});
  assert((await preview.text()).includes('Disallow: /'),'Preview remains restricted');
  const pw = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  await mkdir(output, {recursive:true});
  const engines = ['chromium','firefox','webkit'], results = [], writes = [];
  let product = '/products/white-printed-sleeveless-kurti-with-palazzo-set';
  for (const engine of engines) {
    const browser = await pw[engine].launch({headless:true,
      ...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try {
      const sizes = [[390,844],[1440,900],...(engine==='webkit'?[[320,568],[620,844],[621,844],[568,320],[844,390],[768,1024]]:[])];
      for (const [width,height] of sizes) {
        const context = await browser.newContext({viewport:{width,height},hasTouch:width<1000,
          isMobile:engine==='webkit'&&width<1000,reducedMotion:'reduce',extraHTTPHeaders:{'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'}});
        await context.route('**/*',async route=>{
          const req=route.request(),url=new URL(req.url());
          if(!['GET','HEAD'].includes(req.method())) {
            if(!isBlockedTelemetry(req.method(),req.url(),base))writes.push({method:req.method(),path:url.pathname});
            return route.abort();
          }
          if(req.resourceType()==='media'||/google-analytics|googletagmanager|facebook\.net/.test(url.hostname))return route.abort();
          return route.continue();
        });
        const page=await context.newPage();page.setDefaultTimeout(45000);
        const checks=[];
        try {
          const pages=width===390||width===1440?['home','catalogue','product','bag','checkout']:['catalogue','product'];
          for(const key of pages) {
            const path={home:'/',catalogue:'/collections/all',product,bag:'/cart',checkout:'/checkout'}[key];
            assert((await page.goto(base+path,{waitUntil:'domcontentloaded'})).ok());
            const footer=page.locator('footer.site-footer, footer.footer').first();await footer.waitFor();
            if(key==='catalogue') {
              const link=page.locator('main article h3 a').first();await link.waitFor();
              product=await link.getAttribute('href');assert(product.startsWith('/products/'));
            }
            if(key==='product'&&width<=620)await page.locator('[class*="add-to-cart_mobileBar__"]').waitFor({state:'visible'});
            const expectedPrivate=['bag','checkout'].includes(key);
            const seo=await page.evaluate(()=>({canonical:document.querySelector('link[rel=canonical]')?.href,robots:document.querySelector('meta[name=robots]')?.content}));
            assert.equal(seo.canonical,'https://hidiindia.com'+path,'Canonical must match the current route after hydration');
            assert.equal(seo.robots?.includes('noindex'),expectedPrivate,'Public pages index; utility pages retain noindex');
            await page.evaluate(async()=>{
              await document.fonts.ready;
              document.documentElement.style.scrollBehavior='auto';
              scrollTo(0,document.documentElement.scrollHeight);
            });
            await page.waitForTimeout(300);
            await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
            await page.waitForFunction(()=>Math.abs(document.documentElement.scrollHeight-innerHeight-scrollY)<2);
            const measurement=await page.evaluate(()=>{
              const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
              const footer=document.querySelector('footer.site-footer,footer.footer');
              const bar=document.querySelector('[class*="add-to-cart_mobileBar__"]');
              const visibleBar=bar&&getComputedStyle(bar).display!=='none'?bar:null;
              const links=Array.from(footer.querySelectorAll('.footer-bottom a')).map(e=>{
                const r=rect(e),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                return {text:e.textContent.trim(),href:e.getAttribute('href'),rect:r,
                  tappable:hit===e||e.contains(hit),cover:hit?.className};
              });
              return {footer:rect(footer),bar:visibleBar?rect(visibleBar):null,links,
                padding:getComputedStyle(footer).paddingBottom,
                pageHasPurchaseBar:!!bar,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth};
            });
            assert(measurement.documentWidth<=measurement.viewportWidth+1,'No horizontal overflow');
            if(key==='product'&&width<=620) {
              assert(measurement.bar,'Mobile purchase bar must still be visible');
              assert.equal(measurement.links.length,4,'All four bottom policy/support links remain');
              for(const link of measurement.links) {
                assert(link.rect.bottom<=measurement.bar.y-8,link.text+' must clear the purchase bar');
                assert(link.tappable,link.text+' must be tappable');
              }
              assert(parseFloat(measurement.padding)>=126,'Footer reserves space for purchase bar and safe area');
            } else if(key==='product') {
              assert.equal(measurement.bar,null,'Desktop/tablet purchase layout remains unchanged');
              assert.equal(parseFloat(measurement.padding),0,'Desktop footer receives no extra clearance');
            } else {
              assert.equal(measurement.pageHasPurchaseBar,false,'Clearance selector applies only to products');
            }
            await page.screenshot({path:`${output}/${engine}-${width}-${height}-${key}.png`});
            checks.push({page:key,path,passed:true,...measurement});
          }
          results.push({engine,width,height,passed:true,checks});
          console.log(`PASS: ${engine} ${width}x${height}: footer links clear the purchase bar; other layouts preserved`);
        } catch(error) {
          await page.screenshot({path:`${output}/${engine}-${width}-${height}-failure.png`}).catch(()=>{});
          await writeFile(`${output}/${engine}-${width}-${height}-failure.txt`,page.url()+'\n'+await page.locator('body').innerText());
          throw error;
        } finally {await context.close();}
      }
    } finally {await browser.close();}
  }
  assert.deepEqual(writes,[],'No commerce writes permitted');
  const report={passed:true,engines,results,liveWrites:0,footerLinksAccessible:true};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));
  return report;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await probe(process.argv[2],process.argv[3]);
