import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isBlockedTelemetry } from '../button-states/request-policy.mjs';

const pw = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base = 'https://hidiindia.com', output = 'evidence/safari-footer-audit';
await mkdir(output, { recursive: true });
const reports = [], writes = [];
let product = '/products/white-printed-sleeveless-kurti-with-palazzo-set';
for (const engine of ['chromium', 'webkit']) {
  const browser = await pw[engine].launch({ headless: true });
  try {
    const viewports = engine === 'webkit' ? [[390,844],[1440,900],[320,568],[768,1024],[844,390]] : [[390,844],[1440,900]];
    for (const [width,height] of viewports) {
      const context = await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:engine==='webkit'&&width<1000,reducedMotion:'reduce'});
      await context.route('**/*', async route => {
        const req=route.request();
        if(!['GET','HEAD'].includes(req.method())) {
          if(!isBlockedTelemetry(req.method(),req.url(),base))writes.push(new URL(req.url()).pathname);
          return route.abort();
        }
        if(req.resourceType()==='media'||/google-analytics|googletagmanager|facebook\.net/.test(new URL(req.url()).hostname))return route.abort();
        return route.continue();
      });
      const page = await context.newPage();page.setDefaultTimeout(20000);
      try {
        for(const path of (width===390||width===1440?['/','/collections/all',product,'/cart','/checkout']:['/','/collections/all'])) {
          const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:45000});
          const footer=page.locator('footer.site-footer, footer.footer').first();await footer.waitFor();
          if(path==='/collections/all'){
            await page.locator('main article h3 a').first().waitFor();
            product=await page.locator('main article h3 a').first().getAttribute('href');
          }
          await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,document.documentElement.scrollHeight);});
          await page.waitForTimeout(350);
          const measure=await footer.evaluate(footer=>{
            const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
            const f=rect(footer),vw=innerWidth,vh=innerHeight;
            const controls=Array.from(footer.querySelectorAll('a,button,input,h3,p')).map(e=>{
              const r=rect(e),s=getComputedStyle(e),center={x:r.x+r.width/2,y:r.y+r.height/2};
              const hit=center.x>=0&&center.x<vw&&center.y>=0&&center.y<vh?document.elementFromPoint(center.x,center.y):null;
              return {tag:e.tagName,text:(e.textContent||e.getAttribute('aria-label')||e.getAttribute('placeholder')||'').trim().slice(0,85),rect:r,display:s.display,visibility:s.visibility,
                fontSize:s.fontSize,color:s.color,background:s.backgroundColor,clippedX:r.width>0&&(r.x<-.5||r.right>vw+.5),
                outsideFooter:r.width>0&&(r.x<f.x-1||r.right>f.right+1||r.bottom>f.bottom+1),
                covered:!!hit&&hit!==e&&!e.contains(hit)&&getComputedStyle(e).pointerEvents!=='none',cover:hit?.tagName+' '+hit?.className};
            }).filter(e=>e.display!=='none'&&e.visibility!=='hidden'&&e.rect.height>0);
            const bars=Array.from(document.querySelectorAll('[class*="bar"],footer')).filter(e=>['fixed','sticky'].includes(getComputedStyle(e).position)).map(e=>({tag:e.tagName,class:e.className,position:getComputedStyle(e).position,rect:rect(e)}));
            return {footer:f,documentWidth:document.documentElement.scrollWidth,viewportWidth:vw,viewportHeight:vh,visualViewport:{width:visualViewport?.width,height:visualViewport?.height,offsetTop:visualViewport?.offsetTop},controls,bars,bodyScrollHeight:document.documentElement.scrollHeight};
          });
          const screenshot=`${engine}-${width}-${path==='/'?'home':path==='/cart'?'bag':path==='/checkout'?'checkout':path==='/collections/all'?'catalogue':'product'}.png`;
          await page.screenshot({path:output+'/'+screenshot});
          const issues=measure.controls.filter(x=>x.clippedX||x.outsideFooter||x.covered);
          const report={engine,width,height,path,status:response.status(),screenshot,issues,measure};reports.push(report);
          console.log('FOOTER '+JSON.stringify({engine,width,height,path,status:report.status,documentWidth:measure.documentWidth,viewportWidth:measure.viewportWidth,footer:measure.footer,issues}));
        }
      } finally {await context.close();}
    }
  } finally {await browser.close();}
}
await writeFile(output+'/report.json',JSON.stringify({reports,writes},null,2));
console.log('AUDIT COMPLETE '+JSON.stringify({cases:reports.length,writes,issueCases:reports.filter(x=>x.issues.length).map(x=>({engine:x.engine,width:x.width,path:x.path,issues:x.issues}))}));
