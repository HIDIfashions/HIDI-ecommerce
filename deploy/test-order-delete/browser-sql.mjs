import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';import {spawn} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';
export async function browserSql(db,make,actor){
 const apiRoot=process.env.HIDI_CANDIDATE_API,web=process.env.HIDI_CANDIDATE_RUNTIME,require=createRequire(apiRoot+'/apps/api/package.json');
 const {Module,UnauthorizedException}=require('@nestjs/common'),{NestFactory}=require('@nestjs/core'),{FastifyAdapter}=require('@nestjs/platform-fastify');
 const {TestOrderController}=await import(pathToFileURL(apiRoot+'/apps/api/dist/admin/test-orders.module.mjs'));
 const {AdminAuthService,AdminGuard}=await import(pathToFileURL(apiRoot+'/apps/api/dist/admin/admin-auth.js'));
 const {PrismaService}=await import(pathToFileURL(apiRoot+'/apps/api/dist/prisma/prisma.service.js'));
 const ownerToken='hidi_admin_'+'a'.repeat(64),staffToken='hidi_admin_'+'b'.repeat(64);
 const auth={resolveActor:async({authorization})=>{if(authorization==='Bearer '+ownerToken)return actor;if(authorization==='Bearer '+staffToken)return {...actor,role:'SUPPORT'};throw new UnauthorizedException();},hasPermission:()=>true};
 class FixtureModule{}Module({controllers:[TestOrderController],providers:[{provide:PrismaService,useValue:db},{provide:AdminAuthService,useValue:auth},AdminGuard]})(FixtureModule);
 const nest=await NestFactory.create(FixtureModule,new FastifyAdapter({logger:false}),{logger:['error'],abortOnError:false});await nest.listen({port:0,host:'127.0.0.1'});const api=await nest.getUrl();
 const upstream=createServer(async(req,res)=>{const path=req.url.replace(/^\/v1/,'');const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(data));};try{
  if(path==='/admin/me'||path==='/auth/admin/activity'){const a=await auth.resolveActor({authorization:req.headers.authorization});return send(200,{admin:a,ok:true});}
  if(path.startsWith('/admin/test-orders')){let body='';for await(const c of req)body+=c;const response=await fetch(api+path,{method:req.method,headers:{authorization:req.headers.authorization||'','content-type':'application/json'},...(body?{body}:{})});res.writeHead(response.status,{'content-type':'application/json'}).end(await response.text());return;}
  return send(401,{message:'Fixture auth required'});
 }catch(e){send(e.getStatus?.()||500,{message:e.message});}});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const fixture='http://127.0.0.1:'+upstream.address().port;
 const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 let logs='';const child=spawn(process.execPath,['--import',new URL('../offers/fixture-preload.mjs',import.meta.url).href,web+'/server.mjs'],{cwd:web,env:{...process.env,PORT:String(port),API_URL:fixture+'/v1',INTERNAL_API_URL:fixture+'/v1'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs=(logs+d).slice(-2000));child.stderr.on('data',d=>logs=(logs+d).slice(-2000));const base='http://127.0.0.1:'+port,results=[];
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert(ready,logs);
  assert.equal((await fetch(base+'/admin/test-orders')).status,401);assert.equal((await fetch(base+'/api/admin/test-orders',{headers:{cookie:'hidi_admin_access='+staffToken}})).status,403);
  assert.equal((await fetch(api+'/admin/test-orders',{headers:{authorization:'Bearer '+staffToken}})).status,403);assert.equal((await fetch(api+'/admin/test-orders')).status,401);
  const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);await mkdir('evidence/test-order-delete',{recursive:true});
  for(const engine of ['chromium','firefox','webkit']){const browser=await pw[engine].launch({headless:true});try{for(const width of [390,1440]){
   const key='BROWSER-'+engine+'-'+width;await make(key);const context=await browser.newContext({viewport:{width,height:1000}});await context.addCookies([{name:'hidi_admin_access',value:ownerToken,url:base}]);const page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==base){external.push(r.request().url());return r.abort();}return r.continue();});
   try{await page.goto(base+'/admin/test-orders');await page.locator('#lookup').fill(key);await page.locator('#lookup-button').click();await page.locator('#review[open]').waitFor();assert.equal(await page.locator('#review-title').innerText(),'Verify this as a test order?');
    await page.locator('#confirm').fill(key);await page.locator('#reason').fill('Browser checkout test completed');assert.equal(await page.locator('#confirm-delete').isEnabled(),false);await page.locator('#attest').check();await page.locator('#confirm-delete').click();await page.locator('#review').waitFor({state:'hidden'});
    const row=page.locator('[data-order="'+key+'"]');await row.waitFor();await row.getByRole('button',{name:'Review deletion',exact:true}).click();await page.locator('#review[open]').waitFor();assert.equal(await page.locator('#confirm-delete').isEnabled(),false);await page.locator('#confirm').fill('wrong');await page.locator('#reason').fill('Test finished, remove from order list');assert.equal(await page.locator('#confirm-delete').isEnabled(),false);await page.locator('#confirm').fill(key);
    await page.screenshot({path:`evidence/test-order-delete/${engine}-${width}-confirmation.png`});await page.locator('#confirm-delete').click();await page.locator('#review').waitFor({state:'hidden'});await row.waitFor({state:'detached'});
    await page.getByRole('tab',{name:'Deleted test orders',exact:true}).click();await row.waitFor();await row.getByRole('button',{name:'Review restore',exact:true}).click();await page.locator('#review[open]').waitFor();await page.locator('#reason').fill('Restore the reviewed test record');await page.locator('#confirm').fill(key);await page.locator('#confirm-delete').click();await page.locator('#review').waitFor({state:'hidden'});await row.waitFor({state:'detached'});
    await page.getByRole('tab',{name:'Test orders',exact:true}).click();await row.waitFor();assert.match(await row.innerText(),/CANCELLED/);await page.reload();await row.waitFor();
    await page.locator('#lookup').fill('CUSTOMER-REAL');await page.locator('#lookup-button').click();await page.locator('#review[open]').waitFor();assert.equal(await page.locator('#delete-form').isVisible(),false);await page.getByRole('button',{name:'Got it',exact:true}).click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`evidence/test-order-delete/${engine}-${width}-orders.png`});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);results.push({engine,width,passed:true,actualCandidate:true,actualSql:true,verifyDeleteRestore:true,customerProtected:true,emptyConfirmationRequired:true});
   }finally{await context.close();}
  }}finally{await browser.close();}}
  await writeFile('evidence/test-order-delete/browser.json',JSON.stringify({passed:true,productionWrites:0,actualRuntime:true,results},null,2));
 }catch(e){console.error(logs);throw e;}finally{child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(()=>{child.kill('SIGKILL');r();},5000).unref();});upstream.closeAllConnections();await new Promise(r=>upstream.close(r));await nest.close();}
}
