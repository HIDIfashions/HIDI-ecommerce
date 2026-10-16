import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const base=resolve(process.argv[2]),overlay=resolve(process.argv[3]);
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
let html=await readFile(base+'/dist/index.html','utf8');
const hrefs=[...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
hrefs.push('/pricing-assets/styles.css','/offers-assets/offers.css');
const template=await readFile(new URL('./hero-template.html',import.meta.url),'utf8');
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
html=html.replace(/(<header\b[^>]*data-hidi-first-header[^>]*>[\s\S]*?<\/header>)/i,tag=>tag+template);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage();
await page.route('**/*',r=>r.abort());await page.setContent(html);
const styles={};
try{for(const href of new Set(hrefs)){
 // Only split the main homepage sheet. Runtime offer, header, countdown and
 // other supplemental sheets keep their existing complete inline delivery.
 if(!/^(?:\.?\/)?assets\/index-[A-Za-z0-9_-]+\.css$/.test(href))continue;
 const url=new URL(href,'https://hidiindia.com/'),special={'/pricing-assets/styles.css':'pricing/styles.css','/offers-assets/offers.css':'offers/offers.css'};
 let input;try{input=await readFile(resolve(base,special[url.pathname]||'dist'+url.pathname),'utf8');}catch{continue;}
 if(input.length>160000||/@import\b/i.test(input)||/<\/style/i.test(input))continue;
 const css=input.replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/gi,(whole,quote,value)=>/^(?:data:|https?:|\/|#)/i.test(value)?whole:'url('+JSON.stringify(new URL(value,url).pathname)+')');
 const critical=await page.evaluate(css=>{
  const sheet=new CSSStyleSheet();sheet.replaceSync(css);
  const keep=rule=>{
   if(rule.type===CSSRule.STYLE_RULE){
    const selector=rule.selectorText;
    if(/\.(?:hero[\w-]*|site-header|header-actions|desktop-nav|brand-logo|announcement[\w-]*|hidi-price-announcement)\b/.test(selector))return rule.cssText;
    try{const plain=selector.replace(/::[\w-]+(?:\([^)]*\))?/g,'').replace(/:(?:hover|focus-visible|focus-within|focus|active|visited|link|target|disabled|enabled|checked)\b/g,'');return document.querySelector(plain)?rule.cssText:'';}catch{return rule.cssText;}
   }
   if(rule.cssRules&&rule.type!==CSSRule.KEYFRAMES_RULE){const children=[...rule.cssRules].map(keep).join('');return children?rule.cssText.slice(0,rule.cssText.indexOf('{')+1)+children+'}':'';}
   return rule.cssText;
  };
  return [...sheet.cssRules].map(keep).join('\n');
 },css);
 if(critical.length>=css.length||critical.includes('</style'))continue;
 styles[url.pathname]={sha256:createHash('sha256').update(css).digest('hex'),critical,originalBytes:Buffer.byteLength(css),criticalBytes:Buffer.byteLength(critical)};
}}finally{await browser.close();}
await mkdir(overlay+'/paint-performance',{recursive:true});await writeFile(overlay+'/paint-performance/critical-css.json',JSON.stringify({styles}));
console.log(JSON.stringify(Object.fromEntries(Object.entries(styles).map(([key,row])=>[key,{originalBytes:row.originalBytes,criticalBytes:row.criticalBytes}]))));
