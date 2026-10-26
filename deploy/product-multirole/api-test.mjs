import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const root=process.env.HIDI_CANDIDATE_API||process.cwd();
const {AdminAuthService}=await import(pathToFileURL(root+'/apps/api/dist/admin/admin-auth.js'));
const {validateRoles,storedRoles}=await import(pathToFileURL(root+'/apps/api/dist/admin/admin-roles.js'));
const {resolveAdminSession}=await import(pathToFileURL(root+'/apps/api/dist/admin/admin-session.js'));
const {requireSalesOwner}=await import(pathToFileURL(root+'/apps/api/dist/admin/admin-sales.service.js'));
const service=new AdminAuthService({},{}),all=['OWNER','OPERATIONS','SUPPORT','CATALOG'];let checks=0;
for(let mask=1;mask<15;mask++){
  const roles=validateRoles(all.filter((_,index)=>mask&(1<<index)));
  const actor={id:'fixture',displayName:'Fixture',email:'fixture@example.invalid',authMode:'SUPABASE',role:roles[0],roles};
  assert.equal(service.hasPermission(actor,'catalog:write'),roles.includes('OWNER')||roles.includes('CATALOG'));
  assert.equal(service.hasPermission(actor,'order:write'),roles.includes('OWNER')||roles.includes('OPERATIONS'));
  assert.equal(service.hasPermission(actor,'staff:manage'),roles.includes('OWNER'));
  assert.equal(service.hasPermission(actor,'support:approve'),roles.includes('OWNER'));checks+=4;
  assert.throws(()=>requireSalesOwner(actor));checks++;
}
for(const value of [[],all,['SUPPORT','SUPPORT'],['UNKNOWN'],null]){assert.throws(()=>validateRoles(value));checks++;}
assert.deepEqual(storedRoles('SUPPORT',null),['SUPPORT']);assert.throws(()=>storedRoles('SUPPORT','["OWNER"]'));checks+=2;
let staff={id:'fixture',displayName:'Fixture',email:'fixture@example.invalid',authSubject:'fixture',active:true,role:'SUPPORT',rolesJson:'["SUPPORT","CATALOG"]'};
const db={$queryRaw:async()=>[staff]};const token='Bearer hidi_admin_'+'b'.repeat(64);
assert(service.hasPermission(await resolveAdminSession(db,token),'catalog:write'));staff.rolesJson='["SUPPORT"]';assert(!service.hasPermission(await resolveAdminSession(db,token),'catalog:write'));checks+=2;
for(const input of [{authorization:'Bearer old.jwt.token'},{adminKey:'old-key'},{}]){await assert.rejects(()=>service.resolveActor(input));checks++;}
await mkdir('evidence/product-multirole',{recursive:true});await writeFile('evidence/product-multirole/compiled-api.json',JSON.stringify({passed:true,checks,productionWrites:0}));console.log('PASS: '+checks+' compiled API authorization checks');
