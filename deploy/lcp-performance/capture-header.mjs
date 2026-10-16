import {pathToFileURL} from 'node:url';import {writeFile,mkdir} from 'node:fs/promises';import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,...(process.platform==='linux'?{executablePath:'/usr/bin/google-chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.route('**/*',r=>new URL(r.request().url()).origin!=='https://hidiindia.com'||!['GET','HEAD'].includes(r.request().method())?r.abort():r.continue());
 await page.goto('https://hidiindia.com/',{waitUntil:'domcontentloaded'});await page.locator('#site-header .campaign-brand img').waitFor();
 const header=await page.locator('#site-header').evaluate(el=>el.outerHTML);
 assert(header.includes('campaign-brand')&&!header.includes('is-solid'));
 await mkdir(process.env.RUNNER_TEMP+'/hidi-lcp-private',{recursive:true});
 await writeFile(process.env.RUNNER_TEMP+'/hidi-lcp-private/header.html',header);
 console.log('Captured exact public header markup for parser-first rendering');
}finally{await browser.close();}
