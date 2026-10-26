import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSupportHandler} from '../support-staff/handler.mjs';
import {DETAIL_FIELDS} from '../admin-tools/product-detail-fields.mjs';
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const root=process.env.HIDI_CANDIDATE_RUNTIME,base='http://127.0.0.1:3198',output='evidence/product-multirole';
await mkdir(output,{recursive:true});
const owner={id:'fixture-owner',displayName:'Fixture Owner',email:'fashionshidi@gmail.com',role:'OWNER',roles:['OWNER'],active:true};
let actor=owner,staff=[],writes=[],sequence=0;
const product=JSON.parse(await readFile('tests/fixtures/pdp-refinement/product.json','utf8'));
product.id='fixture-details';product.slug='fixture-product-details';product.name='Fixture optional details';product.shortDescription='';product.description='Verified fixture narrative';
for(const field of DETAIL_FIELDS)product.description+='\n'+field.stored+': '+(field.key==='model'?'Height 168 cm; wears M':'Verified '+field.key);
product.images=[];for(const variant of product.variants)variant.images=[];
const reviews={averageRating:0,reviewCount:0,verifiedReviewCount:0,ratingDistribution:{1:0,2:0,3:0,4:0,5:0},reviews:[]};
const send=(res,body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
async function payload(req){let raw='';for await(const part of req)raw+=part;return JSON.parse(raw||'{}');}
async function fixture(req,res,path){
  if(path==='/admin/me'||path==='/auth/admin/session'||path==='/api/admin/session'||path==='/auth/admin/activity')return send(res,{admin:actor});
  if(path==='/admin/staff'||path==='/api/admin/staff'){
    if(actor.role!=='OWNER')return send(res,{message:'Owner required'},403);
    if(req.method==='POST'){const body=await payload(req);assert(Array.isArray(body.roles));writes.push(body);const roles=['OWNER','OPERATIONS','SUPPORT','CATALOG'].filter(role=>body.roles.includes(role));staff.push({...body,id:'fixture-'+(++sequence),role:roles[0],roles,active:true});return send(res,{staff:staff.at(-1)});}
    return send(res,{staff});
  }
  if(/^\/(?:api\/)?admin\/staff\//.test(path)&&req.method==='PATCH'){
    const member=staff.find(member=>path.endsWith('/'+member.id));assert(member);const body=await payload(req);writes.push(body);Object.assign(member,body);if(body.roles)member.role=['OWNER','OPERATIONS','SUPPORT','CATALOG'].find(role=>body.roles.includes(role));return send(res,{staff:member});
  }
  if(path.endsWith('/queue'))return send(res,{kind:'orders',page:1,pageSize:25,total:0,asOf:new Date().toISOString(),rows:[]});
  if(path===`/products/${product.slug}`)return send(res,product);
  if(path.includes('/reviews/products/'))return send(res,reviews);
  if(path==='/products')return send(res,[product]);
  if(path==='/categories')return send(res,[product.category]);
  if(path==='/collections')return send(res,product.collections);
  return send(res,[]);
}
const upstream=createServer((req,res)=>void fixture(req,res,new URL(req.url,base).pathname.replace(/^\/v1/,'')).catch(error=>send(res,{message:error.message},500)));
await new Promise(done=>upstream.listen(4198,'127.0.0.1',done));
let child,local,browser;let diagnostics='';
try{
  if(root){child=spawn(process.execPath,[resolve(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:'3198',HOSTNAME:'127.0.0.1',API_URL:'http://127.0.0.1:4198/v1',INTERNAL_API_URL:'http://127.0.0.1:4198/v1'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',()=>{});child.stderr.on('data',value=>diagnostics=(diagnostics+value).slice(-3000));}
  else {const support=createSupportHandler({origin:base,apiBase:'http://127.0.0.1:4198/v1'});local=createServer((req,res)=>void(async()=>{const path=new URL(req.url,base).pathname;if(await support(req,res,path))return;await fixture(req,res,path);})());await new Promise(done=>local.listen(3198,'127.0.0.1',done));}
  let ready=false;for(let i=0;i<90;i++){try{if((await fetch(base+'/support-assets/admin.mjs')).ok){ready=true;break;}}catch{}if(child&&child.exitCode!==null)break;await new Promise(done=>setTimeout(done,500));}assert(ready,diagnostics);
  browser=await chromium.launch();const results=[];
  for(const width of [390,1440]){
    actor=owner;staff=[structuredClone(owner)];writes=[];
    const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'hidi_admin_access',value:'hidi_admin_'+'a'.repeat(64),url:base}]);
    await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
    await page.goto(base+'/admin/staff');await page.getByRole('heading',{name:'Create admin user'}).waitFor();
    await page.getByLabel('Name',{exact:true}).fill('Combined fixture');await page.getByLabel('Email / user ID').fill('combined@example.test');
    await page.locator('#staff-role input[value="CATALOG"]').check();
    await page.getByRole('button',{name:'Create user ID',exact:true}).click();await page.getByText('combined@example.test',{exact:true}).waitFor();
    assert.deepEqual(writes[0].roles,['SUPPORT','CATALOG']);
    let row=page.locator('#staff-list article').filter({hasText:'combined@example.test'});
    await row.locator('input[value="OPERATIONS"]').check();assert(await row.locator('input[value="OWNER"]').isDisabled());
    await row.getByRole('button',{name:'Save roles',exact:true}).click();await page.getByText('Staff roles updated.',{exact:true}).waitFor();
    assert.deepEqual(new Set(writes.at(-1).roles),new Set(['SUPPORT','OPERATIONS','CATALOG']));
    assert(await row.locator('input[value="OWNER"]').isDisabled(),'A saved three-role selection also prevents a fourth role');
    await row.locator('input[value="OPERATIONS"]').uncheck();await row.locator('input[value="CATALOG"]').uncheck();await row.locator('input[value="SUPPORT"]').uncheck();
    const before=writes.length;await row.getByRole('button',{name:'Save roles',exact:true}).click();await page.getByText('Choose between one and three roles.',{exact:true}).waitFor();assert.equal(writes.length,before);
    await row.locator('input[value="SUPPORT"]').check();await row.getByRole('button',{name:'Save roles',exact:true}).click();await page.getByText('Staff roles updated.',{exact:true}).waitFor();assert.deepEqual(writes.at(-1).roles,['SUPPORT']);
    assert.equal(await page.locator('#staff-list article').filter({hasText:'fashionshidi@gmail.com'}).getByRole('button').count(),0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:output+`/staff-${width}.png`,fullPage:true});
    if(root){
      actor={...owner,id:'combined',email:'combined@example.test',role:'SUPPORT',roles:['SUPPORT','CATALOG']};
      await page.goto(base+'/admin/orders');await page.getByRole('button',{name:'Sign out of admin',exact:true}).waitFor();
      if(width<800)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
      assert(await page.getByRole('link',{name:'Bulk imports',exact:true}).last().isVisible());assert.equal(await page.getByRole('link',{name:'Team & access',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'Receive stock',exact:true}).count(),0);
      await page.goto(base+'/products/'+product.slug);const summary=page.locator('details').filter({has:page.getByRole('heading',{name:'Product details',exact:true})});await summary.locator('summary').click();
      for(const field of DETAIL_FIELDS.filter(field=>!['model','fit','includes','lining'].includes(field.key)))await summary.getByText('Verified '+field.key,{exact:true}).waitFor();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:output+`/product-${width}.png`,fullPage:true});
      // No value means no row, including no placeholder or suggested default.
      const previous=product.description;product.description='Verified fixture narrative\nNeckline: Round neck';await page.reload();await summary.locator('summary').click();await summary.getByText('Round neck',{exact:true}).waitFor();assert.equal(await summary.getByText('Pockets',{exact:true}).count(),0);assert.equal(await summary.getByText('Verified pockets',{exact:true}).count(),0);product.description=previous;
    }
    assert.deepEqual(errors,[]);await context.close();results.push({engine:'chromium',width,rolesCreateEdit:true,optionalDetails:!!root});
  }
  await writeFile(output+'/candidate.json',JSON.stringify({passed:true,results,actualRuntime:!!root,productionWrites:0},null,2));console.log('PASS: multi-role staff forms, combined navigation and optional product details');
}finally{if(browser)await browser.close();if(child)child.kill('SIGTERM');if(local){local.closeAllConnections();await new Promise(done=>local.close(done));}upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
