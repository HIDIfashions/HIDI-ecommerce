import {readFile,writeFile,mkdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {resolve} from 'node:path';
import {selectInitialCss} from './critical-filter.mjs';
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const require=createRequire(process.env.HIDI_POSTCSS_MODULE),postcss=require(process.env.HIDI_POSTCSS_MODULE);
const sheets=new Map(),hash=s=>createHash('sha256').update(s).digest('hex');
const browser=await chromium.launch({headless:true,...(process.platform==='linux'?{executablePath:'/usr/bin/google-chrome'}:{})});
try{for(const width of [320,390,412,768,1100,1350,1440]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),cdp=await context.newCDPSession(page);
 await page.route('**/*',r=>new URL(r.request().url()).origin!=='https://hidiindia.com'||!['GET','HEAD'].includes(r.request().method())?r.abort():r.continue());
 await cdp.send('DOM.enable');await cdp.send('CSS.enable');await cdp.send('CSS.startRuleUsageTracking');
 await page.goto('https://hidiindia.com/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('video.hero-live-media')?.readyState>=2);await page.waitForTimeout(500);
 await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
 const height=await page.evaluate(()=>document.documentElement.scrollHeight);
 for(let y=0;y<height;y+=600){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(200);await page.waitForFunction(()=>[...document.querySelectorAll('main img')].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;}).every(i=>i.complete&&i.naturalWidth>1&&!i.currentSrc.startsWith('data:')));}
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
 for(const label of ['Open HIDI menu','Search HIDI products']){
  const button=page.getByRole('button',{name:label,exact:true});if(await button.isVisible()){await button.click();await page.waitForTimeout(200);await page.keyboard.press('Escape');await page.waitForTimeout(100);}
 }
 await page.keyboard.press('Tab');
 const usage=(await cdp.send('CSS.stopRuleUsageTracking')).ruleUsage.filter(r=>r.used),byId=new Map();for(const row of usage){if(!byId.has(row.styleSheetId))byId.set(row.styleSheetId,[]);byId.get(row.styleSheetId).push([row.startOffset,row.endOffset]);}
 const styles=await page.locator('style[data-hidi-inline-css]').evaluateAll(nodes=>nodes.map(n=>({href:n.dataset.hidiInlineCss,css:n.textContent})));
 for(const [id,ranges] of byId){let text;try{text=(await cdp.send('CSS.getStyleSheetText',{styleSheetId:id})).text;}catch{continue;}const source=styles.find(s=>s.css.trim()===text.trim());if(!source)continue;
  const key=new URL(source.href,'https://hidiindia.com').pathname;const prior=sheets.get(key);if(prior)assert.equal(prior.hash,hash(source.css),'Public stylesheet changed while gathering');else sheets.set(key,{css:source.css,hash:hash(source.css),ranges:[]});
  const shift=source.css.indexOf(text.trim())-text.indexOf(text.trim());sheets.get(key).ranges.push(...ranges.map(([a,b])=>[a+shift,b+shift]));
 }
 await context.close();
}}finally{await browser.close();}
const manifest={bundle:'/'+process.argv[2],sheets:{}},summary=[];
for(const [href,item] of sheets){
 const critical=selectInitialCss(postcss,item.css,item.ranges);if(!critical.trim()||critical.length>=item.css.length*.95)continue;
 manifest.sheets[href]={hash:item.hash,css:critical};summary.push({href,fullBytes:Buffer.byteLength(item.css),initialBytes:Buffer.byteLength(critical)});
}
assert(Object.keys(manifest.sheets).length>=3,'Expected several verified critical stylesheets');
const target=resolve(process.env.RUNNER_TEMP,'hidi-paint-private/web/overlay/paint-performance');await mkdir(target,{recursive:true});await writeFile(target+'/critical.json',JSON.stringify(manifest));
await writeFile('evidence/paint-performance/critical-css.json',JSON.stringify({passed:true,widths:[320,390,412,768,1100,1350,1440],sheets:summary},null,2));console.log(JSON.stringify({passed:true,criticalStyles:summary}));
