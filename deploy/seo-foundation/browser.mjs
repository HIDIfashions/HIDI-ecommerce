import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';

export async function foundationProbe(base,output,{baseline}={}) {
  await mkdir(output,{recursive:true});
  const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  const landing=await (await fetch('https://hidiindia.com/api/hidi/landing-media-config')).json();
  const results=[],writes=[];
  for(const engine of ['chromium','firefox','webkit']) {
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try {
      const sizes=[[390,844],[1440,900],...(engine==='webkit'?[[320,568],[620,844],[621,844],[568,320],[844,390],[768,1024]]:[])];
      for(const [width,height] of sizes) {
        const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',extraHTTPHeaders:{'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'}});
        await context.route('**/*',async route=>{
          const request=route.request(),url=new URL(request.url());
          if(!['GET','HEAD'].includes(request.method())) {
            if(!isBlockedTelemetry(request.method(),request.url(),base)&&!(baseline&&isBlockedTelemetry(request.method(),request.url(),baseline)))writes.push({method:request.method(),path:url.pathname});
            return route.abort();
          }
          if(request.resourceType()==='media'||/google-analytics|googletagmanager|facebook\.net|cloudflareinsights/.test(url.hostname))return route.abort();
          if(url.pathname==='/api/hidi/landing-media-config')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(landing)});
          return route.continue();
        });
        const page=await context.newPage(),prior=baseline?await context.newPage():null;
        const errors=[];page.on('pageerror',error=>errors.push(String(error)));
        const reads=new Map();
        for(const p of [page,...(prior?[prior]:[])]) {
          const pending=new Set();reads.set(p,pending);
          p.on('request',request=>{const url=new URL(request.url());if(request.method()==='GET'&&(url.pathname.startsWith('/api/store/carts/')||url.searchParams.has('_rsc')))pending.add(request);});
          for(const event of ['requestfinished','requestfailed'])p.on(event,request=>pending.delete(request));
        }
        const settleReads=async p=>{
          const pending=reads.get(p);let quiet=0;
          for(let elapsed=0;elapsed<15000;elapsed+=50) {
            await new Promise(done=>setTimeout(done,50));
            quiet=pending.size?0:quiet+50;if(quiet>=500)return;
          }
          assert.fail('Cart/prefetch reads did not settle: '+[...pending].map(request=>request.url()).join(', '));
        };
        page.setDefaultTimeout(30000);prior?.setDefaultTimeout(30000);
        const prepare=async(p,url)=>{
          assert.equal((await p.goto(url+'/',{waitUntil:'domcontentloaded'})).status(),200);
          await p.locator('.hidi-collection-link').first().waitFor();
          await p.waitForFunction(()=>document.querySelector('#our-range')?.dataset.landingConfigStatus==='ready');
          const pause=p.getByRole('button',{name:'Pause automatic collection rotation',exact:true});
          if(await pause.count())await pause.click();
          await p.locator('#range-carousel').press('Home');
          await p.waitForFunction(()=>document.querySelector('#range-carousel')?.dataset.activeIndex==='0');
          await p.evaluate(async()=>{await document.fonts.ready;});
          await settleReads(p);
        };
        try {
          await Promise.all([prepare(page,base),...(prior?[prepare(prior,baseline)]:[])]);
          const measurement=p=>p.evaluate(()=>{
            const selectors=['.campaign-shop-button','.range-join .text-link','.hidi-collection-link','.footer-column > a,.footer-column > button','#our-promises .small-link','.social-link'];
            const styles=['display','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','borderTopWidth','borderRadius','paddingTop','paddingRight','paddingBottom','paddingLeft','textAlign','textDecorationLine'];
            return selectors.map(selector=>({selector,nodes:[...document.querySelectorAll(selector)].map(node=>{
              const computed=getComputedStyle(node),rect=node.getBoundingClientRect();
              return {text:node.textContent.replace(/\s+/g,' ').trim(),width:rect.width,height:rect.height,styles:Object.fromEntries(styles.map(key=>[key,computed[key]]))};
            })}));
          });
          const actual=await measurement(page);
          if(prior) {
            const original=await measurement(prior);
            for(let i=0;i<actual.length;i++) {
              assert.equal(actual[i].nodes.length,original[i].nodes.length,'Navigation/control count preserved');
              for(let j=0;j<actual[i].nodes.length;j++) {
                const a=actual[i].nodes[j],b=original[i].nodes[j];
                assert.equal(a.text,b.text,'Existing captions and labels retained');
                assert.deepEqual(a.styles,b.styles,actual[i].selector+' typography and styling preserved');
                assert(Math.abs(a.width-b.width)<=1 && Math.abs(a.height-b.height)<=1,actual[i].selector+' size preserved');
              }
            }
          }
          const cards=await page.locator('a.hidi-collection-link').evaluateAll(nodes=>nodes.map(node=>({
            label:node.getAttribute('aria-label'),href:node.getAttribute('href')
          })));
          const cardPaths=cards.map(card=>card.href);
          if(prior) {
            const originalCards=await prior.locator('a.hidi-collection-link').evaluateAll(nodes=>nodes.map(node=>({
              label:node.getAttribute('aria-label'),href:node.getAttribute('href')
            })));
            assert.deepEqual(cards,originalCards,'Configured collection labels, destinations and order are preserved exactly');
          }
          const expectedPaths=['/collections/casual-wear','/collections/work-wear','/collections/occasional-wear','/collections/ananyas-pick','/collections/ananyas-pick'];
          assert.deepEqual([...cardPaths].sort(),[...expectedPaths].sort(),'All five crawlable collection destinations remain present');
          const expectedByLabel=new Map([
            ['Casual Wear','/collections/casual-wear'],['Work Wear','/collections/work-wear'],
            ['Occasional Wear','/collections/occasional-wear'],['Ananya’s Pick','/collections/ananyas-pick']
          ]);
          for(const card of cards) {
            const label=card.label?.replace(/^Explore /,'').replace(/ - Photo \d+$/,'');
            assert.equal(card.href,expectedByLabel.get(label),'Each configured card label keeps its matching destination');
          }
          assert.equal(await page.locator('.campaign-shop-button').getAttribute('href'),'/collections/all');
          assert.equal(await page.locator('.range-join .text-link').getAttribute('href'),'/collections/all');
          for(const [label,path] of [['Casual Wear','/collections/casual-wear'],['Work Wear','/collections/work-wear'],['Occasional Wear','/collections/occasional-wear'],['Ananya’s Pick','/collections/ananyas-pick'],['Shipping','/shipping'],['Returns & exchanges','/returns'],['Contact HIDI','/contact']]) {
            assert.equal(await page.locator('footer').getByRole('link',{name:label,exact:true}).getAttribute('href'),path);
          }
          assert.equal(await page.getByRole('link',{name:'HIDI Instagram',exact:true}).getAttribute('href'),'https://www.instagram.com/hidiindia/');
          assert.equal(await page.getByRole('button',{name:'About checkout',exact:true}).count(),1,'Payment information action remains a button');
          assert.equal(await page.getByRole('button',{name:'Terms of use',exact:true}).count(),1,'Unpublished policy action retains its existing behavior');
          const carousel=page.locator('#range-carousel');
          await carousel.focus();const before=await carousel.getAttribute('data-active-index');
          await carousel.press('ArrowRight');
          await page.waitForFunction(old=>document.querySelector('#range-carousel')?.dataset.activeIndex!==old,before);
          await carousel.press('Home');
          await page.waitForFunction(()=>document.querySelector('#range-carousel')?.dataset.activeIndex==='0');
          await page.locator('a.hidi-collection-link').first().focus();
          assert.equal(await page.locator('a.hidi-collection-link').first().getAttribute('tabindex'),'0','Carousel retains focus eligibility');
          await page.screenshot({path:`${output}/${engine}-${width}-home.png`});
          const shop=page.locator('.campaign-shop-button');await shop.focus();await shop.press('Space');
          await page.waitForURL('**/collections/all');
          assert.equal(await page.locator('main article h3 a').count()>0,true,'Existing Shop Now navigation remains functional');
          await settleReads(page);
          const aboutMarker='Introduced by actress Ananya Nagalla';
          const expectedIntroduction='Introduced by actress Ananya Nagalla, HIDI brings together women’s Indian wear for work, everyday dressing and occasions. Our point of view is simple: feel comfortable, look composed and be yourself.';
          const readAbout=async p=>{
            await p.getByRole('heading',{level:1}).waitFor();
            await p.locator('main p').filter({hasText:aboutMarker}).first().waitFor();
            await p.waitForLoadState('networkidle');
            return p.locator('main').evaluate((main,marker)=>{
              const clean=value=>value?.replace(/\s+/g,' ').trim()||'';
              const introduction=[...main.querySelectorAll('p')].find(node=>node.textContent?.includes(marker));
              return {
                heading:clean(main.querySelector('h1')?.innerText),
                introduction:clean(introduction?.innerText),
                links:[...main.querySelectorAll('a')].map(link=>({text:clean(link.textContent),href:link.getAttribute('href')}))
              };
            },aboutMarker);
          };
          const aboutResponses=await Promise.all([
            page.goto(base+'/about',{waitUntil:'domcontentloaded'}),
            ...(prior?[prior.goto(baseline+'/about',{waitUntil:'domcontentloaded'})]:[])
          ]);
          for(const response of aboutResponses)assert.equal(response?.status(),200,'About page remains available');
          const about=await readAbout(page);
          if(prior)assert.deepEqual(about,await readAbout(prior),'About copy and destinations match the current Next page exactly');
          assert.equal(about.heading,'Considered clothing. A clear point of view.','Current About heading remains intact');
          assert.equal(about.introduction,expectedIntroduction,'Visible About association is factual and present');
          for(const [text,href] of [['Explore HIDI','/collections/all'],['Talk to our team ↗','/contact'],['Read our returns policy ↗','/returns']]) {
            assert(about.links.some(link=>link.text===text&&link.href===href),`${text} keeps its current destination`);
          }
          await page.reload({waitUntil:'domcontentloaded'});
          assert.deepEqual(await readAbout(page),about,'About semantics survive rendering and reload');
          await page.screenshot({path:`${output}/${engine}-${width}-about.png`});
          const blocking=errors.filter(e=>!e.includes('Minified React error #418;'));
          assert.deepEqual(blocking,[],'No new shopping or DOM ownership errors');
          results.push({engine,width,height,passed:true,appearancePreserved:!!prior,crawlablePublicDestinations:true,carouselKeyboardPreserved:true,spaceActivationPreserved:true,aboutCopyVerified:true});
          console.log(`PASS: SEO foundation ${engine} ${width}x${height}: crawlable links, retained controls, About association`);
        } catch(error) {
          await page.screenshot({path:`${output}/${engine}-${width}-failure.png`}).catch(()=>{});
          await writeFile(`${output}/${engine}-${width}-failure.json`,JSON.stringify({message:String(error),url:page.url(),errors},null,2));throw error;
        } finally {await context.close();}
      }
    } finally {await browser.close();}
  }
  assert.deepEqual(writes,[],'No commerce writes permitted');
  await writeFile(output+'/report.json',JSON.stringify({passed:true,results,liveWrites:0},null,2));
}

if(process.argv[1]===new URL(import.meta.url).pathname)await foundationProbe(process.argv[2],process.argv[3]);
