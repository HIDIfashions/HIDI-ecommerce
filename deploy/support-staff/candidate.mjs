import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSupportHandler} from './handler.mjs';
const pw=await import(process.env.HIDI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href:'playwright');
const port=3187,base='http://127.0.0.1:'+port,events=[];let staff=[],created=0;
const actor=role=>({id:role,role,displayName:role,email:role==='OWNER'?'fashionshidi@gmail.com':'fixture@example.test'});
const getRole=req=>String(req.headers.authorization||'').replace('Bearer fixture-','');
const cookieRole=req=>req.headers.cookie?.match(/hidi_admin_access=fixture-([A-Z]+)/)?.[1];
async function body(req){let bytes='';for await(const chunk of req)bytes+=chunk;return JSON.parse(bytes||'{}');}
function send(res,status,data){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));}
async function fixture(req,res,path,role){
 if(!['OWNER','OPERATIONS','SUPPORT','CATALOG'].includes(role))return send(res,401,{message:'Staff sign-in required'});
 if(path==='/admin/me'||path==='/api/admin/session')return send(res,200,{admin:actor(role)});
 if(path==='/admin/staff'||path==='/api/admin/staff'){
  if(role!=='OWNER')return send(res,403,{message:'Owner access required'});
  if(req.method==='POST'){const value=await body(req);staff.push({id:'fixture-user-'+(++created),...value,active:true});return send(res,200,{staff:staff.at(-1)});}
  return send(res,200,{staff});
 }
 if(path==='/admin/support'){
  const done=new Set(events.filter(e=>e.kind==='APPROVAL_DECISION').map(e=>e.requestId));const follow=events.filter(e=>e.kind==='FOLLOW_UP').at(-1);
  return send(res,200,{items:[...events.filter(e=>e.kind==='APPROVAL_REQUEST'&&!done.has(e.id)),...(follow&&follow.status!=='DONE'?[follow]:[])].map(e=>({...e,orderNumber:'HIDI-TEST'}))});
 }
 if(path.endsWith('/support')&&req.method==='GET')return send(res,200,{events});
 if(path.includes('/support/')&&path.endsWith('/decision')){const value=await body(req);events.push({...value,kind:'APPROVAL_DECISION',requestId:path.split('/').at(-2),id:'event-'+(events.length+1),createdAt:new Date(),actorName:role});return send(res,200,{ok:true});}
 if(path.endsWith('/support')&&req.method==='POST'){const value=await body(req);events.push({...value,id:'event-'+(events.length+1),createdAt:new Date(),actorName:role});return send(res,200,{ok:true});}
 return send(res,404,{message:'Unmocked fixture endpoint'});
}
const upstream=createServer((req,res)=>{void fixture(req,res,new URL(req.url,base).pathname.replace(/^\/v1/,''),getRole(req)).catch(()=>send(res,500,{message:'Fixture failure'}));});
await new Promise(r=>upstream.listen(4187,'127.0.0.1',r));
let child,local,browser;const diagnostics=[];
const output=resolve('evidence/support-staff');await mkdir(output,{recursive:true});
try{
 if(process.env.HIDI_CANDIDATE_RUNTIME){const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME);child=spawn(process.execPath,[root+'/server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),API_URL:'http://127.0.0.1:4187/v1',INTERNAL_API_URL:'http://127.0.0.1:4187/v1'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',()=>{});child.stderr.on('data',data=>diagnostics.push(String(data).slice(0,1000)));}
 else{const handler=createSupportHandler({origin:base,apiBase:'http://127.0.0.1:4187/v1'});local=createServer((req,res)=>{void(async()=>{const path=new URL(req.url,base).pathname;if(await handler(req,res,path))return;await fixture(req,res,path,cookieRole(req));})().catch(()=>send(res,500,{message:'Fixture failure'}));});await new Promise(r=>local.listen(port,'127.0.0.1',r));}
 for(let i=0;i<90;i++){try{const response=await fetch(base+'/support-assets/admin.mjs');if(response.ok)break;}catch{}if(i===89)throw Error('Candidate did not start: '+diagnostics.join(''));await new Promise(r=>setTimeout(r,1000));}
 const results=[];
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(','))for(const width of [390,1440]){
  events.length=0;staff=[{...actor('OWNER'),active:true}];
  browser=await pw[engine].launch({headless:true});const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addCookies([{name:'hidi_admin_access',value:'fixture-SUPPORT',url:base}]);const page=await context.newPage();
  await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await page.goto(base+'/admin/support?order=HIDI-TEST');await page.getByRole('heading',{name:'HIDI-TEST · Support'}).waitFor();
  await page.getByLabel('Details / exact requested action and reason').fill('Customer note <img src=x onerror=alert(1)>');await page.getByRole('button',{name:'Save support update'}).click();
  await page.getByText('Customer note <img src=x onerror=alert(1)>',{exact:true}).waitFor();assert.equal(await page.locator('#history img').count(),0);
  await page.getByLabel('Action',{exact:true}).selectOption('TAGS');await page.getByLabel('Issue tags (comma separated; up to 10)').fill('delivery, callback');await page.getByRole('button',{name:'Save support update'}).click();await page.getByText('Issue tags: delivery, callback',{exact:true}).waitFor();
  await page.getByLabel('Action',{exact:true}).selectOption('FOLLOW_UP');await page.getByLabel('Details / exact requested action and reason').fill('Call customer');await page.getByLabel('Follow-up date and time').fill('2030-01-01T12:00');await page.getByRole('button',{name:'Save support update'}).click();await page.locator('#followup-summary').filter({hasText:'Call customer'}).waitFor();
  await page.getByLabel('Action',{exact:true}).selectOption('APPROVAL_REQUEST');await page.getByLabel('Details / exact requested action and reason').fill('Refund request for review');await page.getByLabel('Amount in ₹ (if applicable)').fill('100');await page.getByRole('button',{name:'Submit for Owner approval'}).click();await page.getByText('PENDING OWNER APPROVAL',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:output+`/${engine}-${width}-support.png`,fullPage:true});
  const csrf=await context.request.post(base+'/api/admin/orders/HIDI-TEST/support',{data:{kind:'NOTE',text:'forged'},headers:{origin:'https://attacker.example'}});assert.equal(csrf.status(),403);
  const staffDenied=await context.request.get(base+'/admin/staff');assert.equal(staffDenied.status(),403);
  const decisionDenied=await context.request.post(base+'/api/admin/orders/HIDI-TEST/support/event-4/decision',{headers:{origin:base},data:{decision:'APPROVED',text:'forged'}});assert.equal(decisionDenied.status(),403);
  await context.addCookies([{name:'hidi_admin_access',value:'fixture-OWNER',url:base}]);await page.reload();await page.getByLabel('Decision reason').fill('Reviewed');await page.getByRole('button',{name:'Approve',exact:true}).click();await page.getByText('APPROVED',{exact:true}).first().waitFor();assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).count(),0);
  await page.goto(base+'/admin/staff');await page.getByRole('heading',{name:'Create admin user'}).waitFor();await page.getByLabel('Name',{exact:true}).fill('New support user');await page.getByLabel('Email / user ID').fill('fixture-user@example.test');await page.getByRole('button',{name:'Create user ID',exact:true}).click();await page.getByText('fixture-user@example.test',{exact:true}).waitFor();
  assert.equal(await page.locator('.entry').filter({hasText:'fashionshidi@gmail.com'}).getByRole('button').count(),0);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:output+`/${engine}-${width}-staff.png`,fullPage:true});
  await context.addCookies([{name:'hidi_admin_access',value:'fixture-CATALOG',url:base}]);assert.equal((await context.request.get(base+'/admin/support')).status(),403);
  await context.clearCookies();assert.equal((await context.request.get(base+'/admin/support')).status(),401);assert.equal((await context.request.get(base+'/api/admin/support')).status(),401);
  results.push({engine,width,passed:true,notesTagsFollowups:true,ownerApproval:true,staffCreation:true,csrfAndRoleBoundaries:true});await browser.close();browser=null;
 }
 const report={passed:true,results,productionWrites:0,actualRuntime:!!process.env.HIDI_CANDIDATE_RUNTIME};await writeFile(output+'/candidate.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();if(child)child.kill('SIGTERM');if(local)await new Promise(r=>local.close(r));await new Promise(r=>upstream.close(r));}
