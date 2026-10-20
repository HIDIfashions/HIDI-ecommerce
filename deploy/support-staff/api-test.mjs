import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const root=process.env.HIDI_CANDIDATE_API || '/app';
const load=name=>import(pathToFileURL(root+'/apps/api/dist/admin/'+name+'.js'));
const {AdminSupportService}=await load('admin-support.service');
const {AdminAuthService,AdminGuard}=await load('admin-auth');
const {AdminSupportController}=await load('admin-support.controller');
const {AdminController}=await load('admin.controller');
const require=createRequire(root+'/apps/api/package.json');const {Reflector}=require('@nestjs/core');
let checks=0;
const rows=[],staff=[];
const db={order:{findUnique:async({where})=>where.orderNumber==='HIDI-TEST'?{id:'o1'}:null},orderAuditEvent:{
 create:async({data})=>{if(data.eventKey&&rows.some(row=>row.eventKey===data.eventKey))throw Object.assign(Error('Duplicate'),{code:'P2002'});const row={id:'event-'+(rows.length+1),createdAt:new Date(),order:{orderNumber:'HIDI-TEST'},...data};rows.push(row);return row;},
 findMany:async({where})=>rows.filter(row=>Object.entries(where).every(([key,value])=>typeof value==='object'&&value!==null?value.in.includes(row[key]):row[key]===value)),
 findFirst:async({where})=>rows.find(row=>Object.entries(where).every(([key,value])=>row[key]===value))},
 adminStaff:{findUnique:async({where})=>staff.find(row=>row.id===where.id),count:async()=>2,update:async({where,data})=>Object.assign(staff.find(row=>row.id===where.id),data)}};
const service=new AdminSupportService(db),auth=new AdminAuthService(db,{});
const actor=role=>({id:role,email:role==='OWNER'?'fashionshidi@gmail.com':'fixture@example.test',displayName:role,role,authMode:'SUPABASE',authSubject:'fixture'});
for(const role of ['OWNER','OPERATIONS','SUPPORT','CATALOG']){
 const guard=new AdminGuard({resolveActor:async()=>actor(role),hasPermission:auth.hasPermission.bind(auth)},new Reflector());
 for(const [klass,name,permission] of [[AdminSupportController,'supportUpdate','support:write'],[AdminSupportController,'supportDecision','support:approve'],[AdminController,'updateStatus','order:write'],[AdminController,'updateReturn','return:write'],[AdminController,'createStaff','staff:manage']]){
  const context={switchToHttp:()=>({getRequest:()=>({headers:{}})}),getHandler:()=>klass.prototype[name],getClass:()=>klass};
  if(auth.hasPermission(actor(role),permission))assert(await guard.canActivate(context));else await assert.rejects(()=>guard.canActivate(context));checks++;
 }
}
await service.create('HIDI-TEST',{kind:'NOTE',text:'<script>fixture</script>',actorId:'forged'},actor('SUPPORT'));
await service.create('HIDI-TEST',{kind:'TAGS',tags:['Delivery','delivery']},actor('SUPPORT'));
await service.create('HIDI-TEST',{kind:'FOLLOW_UP',status:'OPEN',dueAt:'2030-01-01',text:'Call back'},actor('SUPPORT'));
assert.equal((await service.list('HIDI-TEST')).events[0].actorId,'SUPPORT');checks++;
for(const type of ['REFUND','CANCELLATION','COMPENSATION','ORDER_CHANGE']){
 const req=await service.create('HIDI-TEST',{kind:'APPROVAL_REQUEST',type,text:'Exact fixture request',amountPaise:100,decision:'APPROVED'},actor('SUPPORT'));
 for(const role of ['SUPPORT','OPERATIONS','CATALOG'])await assert.rejects(()=>service.decide('HIDI-TEST',req.id,{decision:'APPROVED',text:'Attempt'},actor(role)));
 const decisions=await Promise.allSettled([service.decide('HIDI-TEST',req.id,{decision:'APPROVED',text:'Reviewed'},actor('OWNER')),service.decide('HIDI-TEST',req.id,{decision:'REJECTED',text:'Second decision'},actor('OWNER'))]);
 assert.equal(decisions.filter(row=>row.status==='fulfilled').length,1);checks+=5;
}
for(const body of [{kind:'NOTE',text:''},{kind:'NOTE',text:'x'.repeat(2001)},{kind:'TAGS',tags:[12]},{kind:'TAGS',tags:Array(11).fill('x')},{kind:'FOLLOW_UP',status:'OPEN',text:'No date'},{kind:'APPROVAL_REQUEST',type:'REFUND',text:'Reason',amountPaise:0},{kind:'APPROVAL_REQUEST',type:'REFUND',text:'Reason',amountPaise:0.5},{kind:'APPROVAL_REQUEST',type:'OTHER',text:'Reason'},{kind:'EXECUTE_REFUND'}]){await assert.rejects(()=>service.create('HIDI-TEST',body,actor('SUPPORT')));checks++;}
staff.push({id:'primary',email:'Fashionshidi@gmail.com',displayName:'Primary',role:'OWNER',active:true});
for(const body of [{active:false},{role:'SUPPORT'},{role:'OPERATIONS'}]){await assert.rejects(()=>auth.updateStaff('primary',body,actor('OWNER')),/primary HIDI Owner/);checks++;}
await service.create('HIDI-TEST',{kind:'FOLLOW_UP',status:'DONE',text:'Resolved'},actor('SUPPORT'));assert.equal((await service.queue()).items.length,0);checks++;
const report={passed:true,checks,allRolesVerified:true,primaryOwnerProtected:true,financialActionsExecuted:0,productionWrites:0};
const out=process.env.HIDI_SUPPORT_EVIDENCE || 'evidence/support-staff';await mkdir(out,{recursive:true});await writeFile(out+'/compiled-api.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
