"""Exact, repeatable test-fixture repairs. Never deploy or modify customer data."""
from pathlib import Path
import json
ROOT=Path.cwd();plans={}
def edit(name,pairs):
 p=ROOT/name;s=p.read_text()
 for old,new in pairs:
  if old not in s and new in s:continue
  if s.count(old)!=1:raise ValueError('Expected one reviewed anchor in '+name+': '+old[:120])
  s=s.replace(old,new,1)
 if s!=p.read_text():plans[name]=s
edit('tests/editorial-storefront.browser.mjs',[
 ("name:'Workwear Edit',exact:true}).getAttribute('href'),'/collections/work-edit'","name:'Work Wear',exact:true}).getAttribute('href'),'/collections/work-wear'"),
 ("'Carousel navigates, labels editorial sources and filters the archive'","'Editorial carousel navigates without the removed Lookbook link'"),
 ("await section.getByRole('link',{name:'Explore the lookbook'}).click();await page.waitForURL('**/lookbook');await page.getByRole('heading',{name:'The HIDI lookbook.'}).waitFor();\n      for(const[name,count]of[['Work',2],['Everyday',2],['Occasion',2],['All',6]]){await page.getByRole('group',{name:'Filter lookbook'}).getByRole('button',{name,exact:true}).click();assert.equal(await page.locator('[aria-label=\"Editorial lookbook\"] article').count(),count);}await fontAudit(page,engine,'lookbook-archive');await page.screenshot({timeout:30000,path:resolve(output,`${engine}-lookbook.png`),fullPage:true});",
  "assert.equal(await section.getByRole('link',{name:/Explore the lookbook/i}).count(),0);assert.equal(await section.locator('a[href=\"/lookbook\"]').count(),0);assert.equal(await section.locator('[aria-label=\"Editorial lookbook\"] article').count(),6);await fontAudit(page,engine,'editorial-carousel');await page.screenshot({timeout:30000,path:resolve(output,`${engine}-lookbook.png`),fullPage:true});"),
 ("'Footer archive works and newsletter uses the existing service'","'Footer excludes the removed archive and newsletter uses the existing service'"),
 ("assert((await footer.locator('a[href=\"/lookbook\"]').count())>0);","assert.equal(await footer.locator('a[href=\"/lookbook\"]').count(),0);assert.equal(await footer.getByText('Explore our editorial archive',{exact:false}).count(),0);assert.equal(await footer.locator('a[href=\"/privacy\"]').count(),1);")])
edit('tests/storefront-quality.browser.mjs',[
 ("if(path==='/contact'){assert.equal(await page.locator('a[href^=\"mailto:\"]').count(),0);assert.match(content,/not open in this preview/);await shots(page,'contact');}","if(path==='/contact'){const contact=page.getByRole('region',{name:'Contact HIDI'});assert.equal(await contact.locator('a[href=\"mailto:Contact@hidiindia.com\"]').count(),1);assert.equal(await contact.locator('a[href=\"tel:+917093709353\"]').count(),1);assert.equal(await contact.locator('a[href=\"https://wa.me/917093709353\"]').count(),1);assert.match(content,/Flat No\\. 704, Hyma Arcade[\\s\\S]*Hyderabad, Telangana[\\s\\S]*500081/);assert.equal(await contact.locator('[data-hidi-contact-icon]').count(),4);await shots(page,'contact');}"),
 ("'Direct-entry editorial archive uses alternate photographs and real product links'","'Direct entry to the removed archive redirects to the shoppable collection'"),
 ("const images=await page.locator('[aria-label=\"Editorial lookbook\"] img').evaluateAll(items=>items.map(i=>i.getAttribute('src')));assert.equal(images.length,6);assert(images.every(src=>src.includes('02-alt.png')||src.includes('02-alt')));\n  assert.equal(await page.locator('[aria-label=\"Editorial lookbook\"] a[href^=\"/products/\"]').count(),6);", "await page.waitForURL('**/collections/all');assert.equal(new URL(page.url()).pathname,'/collections/all');assert.equal(await page.locator('a[href=\"/lookbook\"]').count(),0);await until(()=>page.locator('article a[href^=\"/products/\"]').count().then(n=>n>=products.length),'redirected collection has product links');assert.equal(await page.locator('h1').count(),1);")])
edit('tests/checkout-theme.browser.mjs',[
 ("'Mobile Quick add maintains brown Add to bag through selection and success'","'Mobile Quick Add uses approved beige Add to Cart through selection and success'"),
 ("const add=dialog.getByRole('button',{name:'Add to bag',exact:true});assert.equal(await color(add),brown);await dialog.getByRole('button',{name:'M',exact:true}).click();assert.equal(await color(add),brown);await add.click();await dialog.getByRole('button',{name:'Added to bag',exact:true}).waitFor();assert.equal(await color(dialog.getByRole('button',{name:'Added to bag',exact:true})),brown);", "const beige='rgb(232, 216, 196)';const add=dialog.getByRole('button',{name:'Add to Cart',exact:true});assert.equal(await color(add),beige);assert.equal(await add.isEnabled(),true);await add.click();await dialog.getByRole('alert').filter({hasText:'Select a size to continue.'}).waitFor();await dialog.getByRole('button',{name:'M',exact:true}).click();assert.equal(await color(add),beige);await add.click();await dialog.getByRole('button',{name:'Added to bag',exact:true}).waitFor();assert.equal(await color(dialog.getByRole('button',{name:'Added to bag',exact:true})),beige);"),
 ("assert.equal(await page.locator('.checkout-mobile-summary').evaluate(e=>e.open),Boolean(shipping));assert.match(await page.locator('.checkout-summary').innerText(),shipping?/Shipping\\s*₹99/:/Shipping\\s*Complimentary/);", "const mobileSummary=page.locator('.checkout-mobile-summary');assert.equal(await mobileSummary.evaluate(e=>e.open),Boolean(shipping));if(!shipping)await mobileSummary.locator('summary').click();assert.match(await mobileSummary.innerText(),shipping?/Shipping\\s*₹99/:/Shipping\\s*Complimentary/);assert.match(await page.locator('.checkout-summary').textContent(),shipping?/Shipping\\s*₹99/:/Shipping\\s*Complimentary/);")])
edit('tests/product-upload-release.test.py',[("['page.html', 'client.mjs', 'package.mjs', 'HIDI_Product_Upload_Package.zip']","['page.html', 'client.mjs', 'package.mjs', 'engine.mjs', 'model.mjs', 'photo-digest.mjs', 'HIDI_Product_Upload_Package.zip']")])
edit('tests/account-otp-web-completion.test.py',[(
 '        self.assertIn("PUSH_REVIEWED_SOURCE: \'\'", workflow)\n        self.assertIn("PUSH_EXPECTED_WEB: \'\'", workflow)\n        self.assertIn("PUSH_EXPECTED_API: \'\'", workflow)',
 '''        # Activated release pins are immutable inputs, not necessarily empty.
        # Existing resolver tests still prove missing and invalid pins fail closed.
        self.assertRegex(workflow, r"PUSH_REVIEWED_SOURCE: '(?:[0-9a-f]{40})?'")
        self.assertRegex(workflow, r"PUSH_EXPECTED_WEB: '(?:acrhidiprod0927\\.azurecr\\.io/hidi-web@sha256:[0-9a-f]{64})?'")
        self.assertRegex(workflow, r"PUSH_EXPECTED_API: '(?:acrhidiprod0927\\.azurecr\\.io/hidi-api@sha256:[0-9a-f]{64})?'")''')])
edit('tests/admin-navigation.browser.mjs',[
 ("import { readFile, mkdir } from 'node:fs/promises';","import { readFile, mkdir, readdir } from 'node:fs/promises';"),
 ("const server = createServer((req, res) => {", "const moduleAssets=new Map();\nconst assetRoot=new URL('../deploy/admin-tools/',import.meta.url);\nfor(const name of await readdir(assetRoot))if(/\\.(?:mjs|js)$/.test(name))moduleAssets.set('/admin-tools-assets/'+name,await readFile(new URL(name,assetRoot)));\nconst server = createServer((req, res) => {\n  const assetPath=new URL(req.url,'http://fixture.test').pathname;\n  if(moduleAssets.has(assetPath)){res.writeHead(200,{'content-type':'text/javascript'});return res.end(moduleAssets.get(assetPath));}\n  if(assetPath.startsWith('/api/')){res.writeHead(401,{'content-type':'application/json'});return res.end(JSON.stringify({message:'Isolated navigation fixture: no API writes'}));}")])
edit('deploy/image-optimization/full-regression.py',[
 ("os.environ['HIDI_BROWSER_ENGINES']='chromium,firefox,webkit'", "# Match the production same-origin browser API configuration during the build.\nos.environ['NEXT_PUBLIC_API_URL']='/api/store'\nos.environ['HIDI_BROWSER_ENGINES']='chromium,firefox,webkit'"),
 ("run(name,'node tests/'+file+'.browser.mjs',300)","run(name,'node --experimental-strip-types tests/'+file+'.browser.mjs',300)"),
 ("run('polish-browser','node tests/editorial-polish.browser.mjs',300,web)","run('polish-browser','node tests/editorial-polish.browser.mjs',300,web)\nrun('navigation-browser','node tests/admin-navigation.browser.mjs',300)\nrun('otp-browser','node tests/auth-otp-resend.browser.mjs',300,web)\nrun('web-upload-and-rendering','node --experimental-strip-types tests/photo-web-upload.browser.mjs',420,web)")])
# Validate all source anchors before the first write.
for name,text in plans.items():(ROOT/name).write_text(text)
(ROOT/'rendering-repair-files.json').write_text(json.dumps(list(plans),indent=2))
print(json.dumps({'repairedFiles':list(plans),'productionChanged':False}))
