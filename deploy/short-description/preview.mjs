import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
import {mkdir,writeFile} from 'node:fs/promises';
import {renderProductCopy} from '../../apps/web/lib/product-copy.mjs';
const origin='https://hidiindia.com', slug='hidi-043-dusty-pink-embroidered-kurta-set-with-dupatta';
const product=await fetch(origin+'/api/store/products/'+slug).then(r=>r.json());
const output='evidence/short-description';await mkdir(output,{recursive:true});
await writeFile(output+'/product.json',JSON.stringify(product,null,2));
const css='.hidi-pdp-short-description{margin:12px 0 0;color:#675c53;font-size:14px;line-height:1.65;overflow-wrap:anywhere}.hidi-pdp-short-description p{margin:0 0 .65em}.hidi-pdp-short-description>:last-child{margin-bottom:0}.hidi-pdp-short-description ul,.hidi-pdp-short-description ol{margin:0 0 .65em;padding-left:1.4em}';
const browser=await chromium.launch();
try {for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}});
 await page.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.fulfill({status:204,body:''}));
 await page.goto(origin+'/products/'+slug,{waitUntil:'domcontentloaded'});
 await page.locator('[data-hidi-hydrated=true]').waitFor();
 await page.locator('.pdp-gallery img:visible').first().evaluate(image=>image.decode());
 await page.screenshot({path:output+'/before-'+width+'.png',fullPage:false});
 await page.addStyleTag({content:css});
 await page.locator('.pdp-title-row').evaluate((title,html)=>{const description=document.createElement('div');description.className='hidi-pdp-short-description';description.innerHTML=html;title.after(description);},renderProductCopy(product.shortDescription));
 if(width<760)await page.locator('.pdp-title-row').scrollIntoViewIfNeeded();
 await page.screenshot({path:output+'/preview-'+width+'.png',fullPage:false});
 await page.close();
}}finally{await browser.close();}
console.log('Preview saved for HIDI-043 at 1440px and 390px; production writes: 0.');
