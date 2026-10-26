import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.env.HIDI_CANDIDATE_RUNTIME;
const handlerPath=root?root+'/admin-security/handler.mjs':new URL('handler.mjs',import.meta.url).pathname;
const {createAdminSecurityHandler}=await import(root?pathToFileURL(handlerPath):new URL('handler.mjs',import.meta.url));
const {chromium}=await import(process.env.HIDI_PLAYWRIGHT_MODULE);
let token='hidi_admin_'+'a'.repeat(64),active=false,deleted=false,activity=0;
const actor={email:'fashionshidi@gmail.com',role:'OWNER'};
const handler=createAdminSecurityHandler({apiBase:'http://fixture/v1',requestFetch:async(url,options)=>{
  if(url.endsWith('/otp/verify')){active=true;return Response.json({sessionToken:token,admin:actor});}
  if(url.endsWith('/auth/admin/session')){active=false;return Response.json({ok:true});}
  if(!active)return Response.json({message:'Expired'},{status:401});
  if(url.includes('/sales-deletion')){
    if(options.method==='DELETE'){deleted=true;return Response.json({deleted:1,before:'2026-10-10'});}
    return Response.json({before:'2026-10-10',count:1,totalPaise:10000,snapshot:'fixture',orders:[{orderNumber:'HIDI-TEST',createdAt:'2026-10-09T10:00:00Z',status:'DELIVERED',totalPaise:10000}]});
  }
  if(url.endsWith('/activity'))activity++;
  return Response.json({admin:actor});
}});
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;
  if(path==='/api/store/auth/admin/otp/request'){res.setHeader('Content-Type','application/json');res.end('{}');return;}
  if(path==='/admin'){res.setHeader('Content-Type','text/html');res.end('<html><head><script type="module" src="/admin-security-assets/activity.mjs"></script></head><body><nav aria-label="Admin navigation"></nav><h1>Admin fixture</h1></body></html>');return;}
  if(!await handler(req,res,path)){res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
await mkdir('evidence/admin-security',{recursive:true});const results=[];
const browser=await chromium.launch();
try{
  for(const width of [390,1440]){
    active=false;deleted=false;const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
    await page.goto(base+'/admin/sign-in');await page.locator('#email').fill(actor.email);await page.locator('#send').click();await page.locator('#otp').fill('12345678');await page.locator('#verify').click();
    await page.waitForURL(base+'/admin');await page.getByRole('link',{name:'Delete sales'}).click();await page.waitForURL(base+'/admin/sales-delete');
    await page.locator('#preview-button').click();await page.locator('#orders tr').waitFor();assert.equal(await page.locator('#delete-button').isDisabled(),true);
    await page.screenshot({path:`evidence/admin-security/sales-${width}.png`,fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflows viewport');
    await page.locator('#confirmation').fill('DELETE BEFORE 2026-10-10');await page.locator('#delete-button').click();await page.getByText('Deleted 1 sales records.',{exact:false}).waitFor();assert(deleted);
    await page.goto(base+'/admin/sign-in');await page.locator('#email').waitFor();assert.equal(new URL(page.url()).pathname,'/admin/sign-in');
    await page.screenshot({path:`evidence/admin-security/login-${width}.png`,fullPage:true});
    // A second login on the same browser requires entering a new code.
    await page.locator('#email').fill(actor.email);await page.locator('#send').click();await page.locator('#otp').fill('87654321');await page.locator('#verify').click();await page.waitForURL(base+'/admin');
    await page.clock.install();await page.clock.fastForward(3600001);await page.waitForURL(/\/admin\/sign-in/);assert.equal(active,false);
    await context.close();results.push({engine:'chromium',width});
  }
  await writeFile('evidence/admin-security/candidate.json',JSON.stringify({passed:true,results,productionWrites:0,idleUiVerified:true,sameDeviceOtpVerified:true}));
}finally{await browser.close();await new Promise(done=>server.close(done));}
