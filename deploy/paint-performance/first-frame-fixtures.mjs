import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {observeFirstFrames,finishFirstFrames,assertFirstFrames} from './first-frame-probe.mjs';

const poster='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const header='<header data-hidi-first-header class="site-header">HIDI</header>';
const hero='<section class="hero"><div class="hero-media"><video data-hidi-first-hero class="hero-live-media" poster="'+poster+'"></video></div><h1>HIDI Indian wear</h1></section>';
const seo='<section data-hidi-home-discovery><h2>Explore HIDI kurta sets</h2><a href="/collections/all">All kurta sets</a></section>';
const css='html,body{margin:0}header{position:fixed;top:0;left:0;width:100%;height:56px;z-index:2;background:#321;color:white}.hero{position:relative;height:100vh;width:100%;background:#6a4b32}.hero-media,video{position:absolute;inset:0;width:100%;height:100%}h1{position:absolute;top:80px;color:white}[data-hidi-home-discovery]{padding:24px;color:#602124;background:#fffdf8}';
const cases=[
 {name:'native-hero-before-below-fold-seo',html:header+hero+seo,pass:true},
 {name:'text-then-hero',html:header+seo,script:'setTimeout(()=>document.querySelector("#root").innerHTML='+JSON.stringify(header+hero+seo)+',250)',pass:false,violation:'text-only-discovery-frame'},
 {name:'missing-hero',html:header+seo,pass:false,violation:'hero-missing-or-zero-geometry'},
 {name:'empty-body',html:'',pass:false,violation:'hero-missing-or-zero-geometry'},
 {name:'missing-header',html:hero+seo,pass:false,violation:'header-missing-or-zero-geometry'},
 {name:'hidden-body-then-visible',html:header+hero+seo,extra:'body{opacity:0}',script:'setTimeout(()=>document.body.style.opacity="1",250)',pass:false,violation:'page-concealed'},
 {name:'collapsed-hero-then-sized',html:header+hero+seo,extra:'.hero{height:0}',script:'setTimeout(()=>document.querySelector(".hero").style.height="100vh",250)',pass:false,violation:'hero-missing-or-zero-geometry'},
 {name:'discovery-overlaps-hero',html:header+hero+seo,extra:'[data-hidi-home-discovery]{position:absolute;top:80px}',pass:false,violation:'discovery-before-hero-end'},
 {name:'concealed-discovery',html:header+hero+seo,extra:'[data-hidi-home-discovery]{display:none}',pass:false,violation:'discovery-concealed-or-zero-geometry'},
 {name:'empty-stream-before-valid-body',html:header+hero+seo,delay:200,pass:true}
];

export async function verifyFirstFrameFixtures(pw,out,{engines=['chromium','webkit']}={}){
 await mkdir(out,{recursive:true});const results=[];
 const server=createServer(async(req,res)=>{
  const item=cases.find(item=>'/'+item.name===req.url);
  if(!item){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
  res.write('<!doctype html><html><head><meta charset="utf-8"><style>'+css+(item.extra||'')+'</style></head>');
  if(item.delay)await new Promise(resolve=>setTimeout(resolve,item.delay));
  res.end('<body><div id="root">'+item.html+'</div><script>'+(item.script||'')+'</script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{for(const engine of engines){
  let browser;
  try{browser=await pw[engine].launch({headless:true});}
  catch(error){results.push({engine,passed:false,launchUnavailable:true,error:String(error)});continue;}
  try{for(const item of cases){
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
   try{
    await page.route('**/*',route=>route.request().method()==='GET'&&new URL(route.request().url()).origin===base?route.continue():route.abort());
    await observeFirstFrames(page);
    await page.goto(base+'/'+item.name,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(550);
    const observation=await finishFirstFrames(page);
    if(item.pass)assertFirstFrames(observation,engine+'/'+item.name);
    else{
     assert.throws(()=>assertFirstFrames(observation,engine+'/'+item.name));
     assert(observation.violations.some(row=>row.code===item.violation),item.name+' must retain the exact initial failure');
    }
    results.push({engine,scenario:item.name,passed:true,expectedAccepted:item.pass,observation});
   }catch(error){results.push({engine,scenario:item.name,passed:false,error:String(error)});}
   finally{await context.close();}
  }}finally{await browser.close();}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 const report={passed:results.every(row=>row.passed),method:'Loopback-only independent first-frame browser fixtures; no storefront/account requests',results};
 await writeFile(resolve(out,'first-frame-fixtures.json'),JSON.stringify(report,null,2));
 assert(report.passed,'First-frame fixture failed: '+results.filter(row=>!row.passed).map(row=>row.engine+'/'+row.scenario+': '+row.error).join('; '));
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert(process.env.HIDI_PLAYWRIGHT_MODULE,'Set HIDI_PLAYWRIGHT_MODULE to the packaged Playwright module path');
 const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
 const report=await verifyFirstFrameFixtures(pw,resolve(process.argv[2]||'evidence/first-frame-fixtures'),{engines:(process.env.HIDI_FIRST_FRAME_ENGINES||'chromium,webkit').split(',')});
 console.log(JSON.stringify({passed:report.passed,cases:report.results.length}));
}
