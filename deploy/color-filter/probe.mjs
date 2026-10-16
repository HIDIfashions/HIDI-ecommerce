import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const [base,mode='live']=process.argv.slice(2);
const out='evidence/color-filter/'+mode;await mkdir(out,{recursive:true});
const report=JSON.parse(await readFile('evidence/color-filter/patch.json','utf8'));
const products=await fetch(base+'/api/store/products').then(r=>r.json());
const names=[...new Set(products.flatMap(p=>p.variants.map(v=>v.color)))].sort();
const norm=s=>s.trim().toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' ');
const hexes=new Map;for(const p of products)for(const v of p.variants)if(v.colorHex&&/^#[0-9a-f]{6}$/i.test(v.colorHex.trim())&&!hexes.has(v.color))hexes.set(v.color,v.colorHex.trim());
const expected=Object.fromEntries(names.map(n=>[n,hexes.get(n)??report.palette[norm(n)]??(/multi\s*colou?r|floral/.test(norm(n))?'conic-gradient(#c9575c, #dda0b5, #c7a445, #6ba268, #4f7fb7, #c9575c)':null)]));
assert(Object.values(expected).every(Boolean),'Every catalogue name must resolve');
const results=[];
async function assess(page){
 const values=await page.locator('label[class*="colorOption"]').evaluateAll((labels,expected)=>labels.map(label=>{
  const name=label.querySelector('[class*="colorLabel"]').textContent;
  const el=label.querySelector('[class*="colorSwatch"]');const computed=getComputedStyle(el);
  const reference=document.createElement('span');reference.style.background=expected[name];document.body.append(reference);const wanted=getComputedStyle(reference);
  const row={name,color:computed.backgroundColor,image:computed.backgroundImage,expectedColor:wanted.backgroundColor,expectedImage:wanted.backgroundImage};reference.remove();return row;
 }),expected);
 assert.deepEqual(values.map(v=>v.name).sort(),names);
 for(const row of values){assert.equal(row.color,row.expectedColor,row.name);assert.equal(row.image,row.expectedImage,row.name);assert.notEqual(row.color,'rgb(184, 181, 174)',row.name+' gray fallback');}
 return values;
}
for(const engine of ['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:920}});const page=await context.newPage();
   await page.route('**/*',route=>!['GET','HEAD'].includes(route.request().method())||route.request().resourceType()==='image'||new URL(route.request().url()).origin!==new URL(base).origin?route.abort():route.continue());
   await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded',timeout:90000});
   const trigger=page.getByRole('button',{name:width<1000?/^Filter & Sort/:/^Filter(?: \(\d+\))?$/}).first();
   await trigger.waitFor();
   // SSR buttons exist before React attaches their handlers on a cold visit.
   await page.waitForFunction(button=>{const key=Object.keys(button).find(k=>k.startsWith('__reactProps$'));return key&&typeof button[key]?.onClick==='function';},await trigger.elementHandle());
   const dialog=page.getByRole('dialog',{name:'Product filters',exact:true});
   for(let attempt=0;attempt<3;attempt++){
    if(await dialog.isVisible())break;
    await trigger.click();
    try{await dialog.waitFor({timeout:3000});break;}catch(error){if(attempt===2)throw error;}
   }
   await dialog.waitFor();
   const values=await assess(page);
   await dialog.screenshot({path:out+'/'+engine+'-'+width+'-drawer.png'});
   // Exercise every actual colour selection and compare its availability count.
   for(const name of names){
    const label=dialog.locator('label[class*="colorOption"]').filter({has:page.locator('[class*="colorLabel"]',{hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});
    await label.locator('input').check();
    const count=products.filter(p=>p.inStock&&p.variants.some(v=>v.color===name&&v.available>0)).length;
    await page.waitForFunction(({count})=>[...document.querySelectorAll('[role="dialog"] button')].some(b=>b.textContent.trim().toLowerCase()==='show '+count+' styles'),{count});
    await label.locator('input').uncheck();
   }
   await assess(page);
   // Display the measured swatches together for review; the assertions above use the actual drawer.
   await page.evaluate(values=>{document.body.innerHTML='';document.body.style.cssText='margin:20px;background:#fff8ef;font:14px Arial;display:grid;grid-template-columns:repeat(3,1fr);gap:14px';for(const v of values){const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:10px;min-height:44px';const dot=document.createElement('span');dot.style.cssText='flex:0 0 22px;height:22px;border:1px solid #bbb;border-radius:50%';dot.style.backgroundColor=v.color;dot.style.backgroundImage=v.image;row.append(dot,document.createTextNode(v.name));document.body.append(row);}},values);
   await page.setViewportSize({width:1000,height:1000});await page.screenshot({path:out+'/'+engine+'-'+width+'-all-swatches.png',fullPage:true});
   results.push({engine,width,passed:true,colors:values});await context.close();
  }
 }finally{await browser.close();}
}
await writeFile(out+'/report.json',JSON.stringify({passed:true,colorCount:names.length,results},null,2));
await writeFile('evidence/color-filter/'+mode+'.json',JSON.stringify({passed:true,colorCount:names.length,checks:results.length,allSelectionsVerified:true}));
console.log('PASS: '+names.length+' swatches and every colour filter selection across Chromium, Firefox, WebKit; mobile and desktop');
