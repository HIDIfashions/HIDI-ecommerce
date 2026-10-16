// Executes the retained Next importer and bulk tool with all admin API calls intercepted.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME),output='evidence/bulk-publish/candidate';
const playwright=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const escaped=[];
const upstream=createServer((req,res)=>{if(!['GET','HEAD'].includes(req.method))escaped.push(req.method+' '+req.url);res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({message:'Read-only fixture'}));});
await new Promise(done=>upstream.listen(0,'127.0.0.1',done));
const reserve=createServer();await new Promise(done=>reserve.listen(0,'127.0.0.1',done));const port=reserve.address().port;await new Promise(done=>reserve.close(done));
const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),API_URL:'http://127.0.0.1:'+upstream.address().port+'/v1',INTERNAL_API_URL:'http://127.0.0.1:'+upstream.address().port+'/v1'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
const base='http://127.0.0.1:'+port;
const fresh=(id,name,images=true)=>({id,name,slug:id,status:'DRAFT',categoryId:'casual',category:{id:'casual',name:'Casual Wear',slug:'casual-wear'},collections:[{collectionId:'ananya',collection:{id:'ananya',slug:'ananyas-pick',name:'Ananya’s Pick'}}],updatedAt:'2026-10-10T00:00:00.000Z',shortDescription:'Keep short',description:'Old details',fabric:'Cotton',care:'Keep care',images:images?[{id:'image',url:'/brand/hidi-logo-header.svg'}]:[],variants:['M','L'].map(size=>({id:id+'-'+size,sku:'FIXTURE-'+id+'-'+size,color:'Magenta',size,colorHex:null,active:true,pricePaise:109500,mrpPaise:149900,weightGrams:null,images:[],inventory:{onHand:0,reserved:0}}))});
const options={categories:[{id:'casual',name:'Casual Wear',slug:'casual-wear'},{id:'work',name:'Work Wear',slug:'work-wear'}],collections:[{id:'ananya',name:'Ananya’s Pick',slug:'ananyas-pick'}]};
const cases=[];
await mkdir(output,{recursive:true});
try{
  let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}if(child.exitCode!==null)throw Error('Candidate exited: '+logs.slice(-1500));await new Promise(done=>setTimeout(done,200));}assert(ready,'Candidate readiness');
  for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
    const browser=await playwright[engine].launch({headless:true});
    try{for(const width of [320,1440])for(const path of ['/admin/import','/admin/product-bulk']){
      const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();
      const records=new Map([fresh('fixture-magenta','Fixture Magenta Set'),fresh('fixture-missing-photo','Fixture Without Photo',false)].map(p=>[p.id,p]));
      const writes=[],errors=[],unexpected=[];let lost=false,version=0;
      page.on('pageerror',error=>{if(!error.message.includes('Minified React error #418'))errors.push(error.message);});page.on('dialog',dialog=>dialog.accept());
      await page.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url()),method=request.method();
        const send=(status,value)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
        if(url.origin===base && url.pathname==='/api/admin/session' && method==='GET')return send(200,{admin:{id:'fixture-owner',displayName:'Fixture Owner',email:'fixture@example.invalid',role:'OWNER',permissions:['catalog:write','catalog:read']}});
        if(url.origin===base && url.pathname.startsWith('/api/admin/products')){
          const tail=url.pathname.slice('/api/admin/products'.length),parts=tail.split('/').filter(Boolean);
          if(tail==='/options'&&method==='GET')return send(200,options);
          if(!parts.length&&method==='GET'){const items=[...records.values()].filter(p=>(url.searchParams.get('status')!=='DRAFT'||p.status==='DRAFT')&&(!url.searchParams.get('q')||p.slug===url.searchParams.get('q')));return send(200,{items,total:items.length,page:1,pageSize:50});}
          const product=records.get(decodeURIComponent(parts[0]||''));if(!product)return send(404,{message:'Fixture product not found'});
          if(parts.length===1&&method==='GET')return send(200,product);
          const body=request.postDataJSON();writes.push({method,tail,body});
          assert.equal(body.expectedUpdatedAt,product.updatedAt,'Fresh product version required');
          if(parts.length===1&&method==='PATCH'){
            assert.equal(body.description,'Uploaded complete product details');assert.deepEqual(body.collectionIds,['ananya']);assert.equal(body.care,'Keep care');assert.equal(body.fabric,'Cotton');assert.equal(body.status,undefined);assert.equal(body.variants,undefined);
            Object.assign(product,Object.fromEntries(Object.entries(body).filter(([key])=>!['expectedUpdatedAt','collectionIds'].includes(key))),{updatedAt:new Date(Date.UTC(2026,9,10,0,0,++version)).toISOString()});return send(200,product);
          }
          if(parts[1]==='status'&&method==='POST'){assert.equal(body.status,'ACTIVE');assert(product.images.length);product.status='ACTIVE';product.updatedAt=new Date(Date.UTC(2026,9,10,0,0,++version)).toISOString();if(lost){lost=false;return send(500,{message:'Fixture lost successful response'});}return send(200,product);}
          unexpected.push(method+' '+url.pathname);return route.abort();
        }
        if(url.origin===base&&url.pathname==='/api/admin/inventory'&&method==='GET')return send(200,{rows:[...records.values()].flatMap(p=>p.variants.map(v=>({productId:p.id,productName:p.name,variantId:v.id,sku:v.sku,color:v.color,size:v.size,onHand:0})))});
        if(!['GET','HEAD'].includes(method)){if(isBlockedTelemetry(method,url,base))return route.abort();unexpected.push(method+' '+url.pathname);return route.abort();}
        return route.continue();
      });
      try{
        await page.goto(base+path,{waitUntil:'domcontentloaded'});
        const panel=page.locator('#hidi-bulk-publish');
        if(path==='/admin/import'){
          await page.getByRole('heading',{name:'Import products, stock & photography',exact:true}).waitFor();
          const csv='mode,product_name,product_slug,category,description,color,size,selling_price,mrp,opening_qty\r\n'+['M','L'].map(size=>'NEW,Fixture Magenta Set,fixture-magenta,Work Wear,Uploaded complete product details,Magenta,'+size+',1095,1499,0').join('\r\n');
          await page.locator('#products-stock input[type=file]').setInputFiles({name:'fixture-import.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
          await page.getByRole('button',{name:'Import 2 rows',exact:true}).click();
          await page.getByText('Import complete. 2 rows saved.',{exact:false}).waitFor();
          assert.equal(writes.filter(row=>row.method==='PATCH').length,1,'Save metadata once across M and L');assert.equal(records.get('fixture-magenta').categoryId,'work');
        }else{
          await page.locator('#status').filter({hasText:'Ready.'}).waitFor();
          await page.locator('#file').setInputFiles({name:'fixture-details.csv',mimeType:'text/csv',buffer:Buffer.from('product_id,description\r\nfixture-magenta,Uploaded complete product details')});
          await page.locator('#preview').click();await page.locator('#rows .batch-product').waitFor();await page.locator('#save').click();await page.locator('#status').filter({hasText:'1 saved'}).waitFor();
          assert.equal(writes.filter(row=>row.method==='PATCH').length,1);
        }
        assert.equal(records.get('fixture-magenta').status,'DRAFT','Saving cannot silently publish');
        await panel.getByText('Ready to publish',{exact:true}).waitFor();
        await panel.getByRole('button',{name:'Select all ready products',exact:true}).click();
        if(path==='/admin/product-bulk')lost=true;
        await panel.getByRole('button',{name:'Publish selected products (1)',exact:true}).click();
        await panel.locator('[data-publish="status"]').filter({hasText:path==='/admin/product-bulk'?'not published':'1 published.'}).waitFor();
        assert.equal(records.get('fixture-magenta').status,'ACTIVE');
        await panel.getByRole('button',{name:'Review latest imported batch',exact:true}).click();await panel.getByText('Already published',{exact:true}).waitFor();
        assert.equal(writes.filter(row=>row.tail.endsWith('/status')).length,1,'Lost response retry must confirm without another write');
        await panel.getByRole('button',{name:'Load draft products',exact:true}).click();await panel.getByText('Upload a product or SKU photo, then review this batch again',{exact:true}).waitFor();
        assert.equal(await panel.getByRole('button',{name:'Publish selected products',exact:true}).isDisabled(),true);
        assert.equal(await panel.getByRole('checkbox',{name:'Publish Fixture Without Photo',exact:true}).isDisabled(),true);
        const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));assert.equal(overflow,0);
        assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
        await page.screenshot({path:join(output,engine+'-'+width+'-'+path.split('/').pop()+'.png'),fullPage:true});
        cases.push({engine,width,path,passed:true,metadataWrites:1,statusWrites:1,realWrites:0,overflow});
      }catch(error){await page.screenshot({path:join(output,engine+'-'+width+'-failure.png'),fullPage:true});throw error;}finally{await context.close();}
    }}finally{await browser.close();}
  }
  assert.deepEqual(escaped,[]);await writeFile('evidence/bulk-publish/candidate.json',JSON.stringify({passed:true,cases,retainedRuntime:true,fixtureOnlyWrites:true},null,2));console.log('PASS: both retained bulk pages save and publish selected products across desktop/mobile and three browsers; no production writes');
}catch(error){console.error(logs.slice(-2500));throw error;}finally{child.kill('SIGTERM');await new Promise(done=>{child.once('exit',done);setTimeout(()=>{child.kill('SIGKILL');done();},5000).unref();});upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
