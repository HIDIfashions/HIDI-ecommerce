import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const root=process.env.HIDI_CANDIDATE_API||process.cwd();
const {AdminAuthService}=await import(pathToFileURL(root+'/apps/api/dist/admin/admin-auth.js'));
const {salesCutoff,requireSalesOwner}=await import(pathToFileURL(root+'/apps/api/dist/admin/admin-sales.service.js'));
const auth=new AdminAuthService({},{});let checks=0;
for(const input of [{authorization:'Bearer old.jwt.token'},{adminKey:'old-key'},{}]){await assert.rejects(()=>auth.resolveActor(input));checks++;}
assert.equal(salesCutoff('2026-10-10').toISOString(),'2026-10-09T18:30:00.000Z');checks++;
for(const actor of [{role:'OWNER',email:'other@example.invalid',authMode:'SUPABASE'},{role:'SUPPORT',email:'fashionshidi@gmail.com',authMode:'SUPABASE'},{role:'OWNER',email:'fashionshidi@gmail.com',authMode:'LEGACY_KEY'}]){assert.throws(()=>requireSalesOwner(actor));checks++;}
requireSalesOwner({role:'OWNER',email:'fashionshidi@gmail.com',authMode:'SUPABASE'});checks++;
await mkdir('evidence/admin-security',{recursive:true});await writeFile('evidence/admin-security/compiled-api.json',JSON.stringify({passed:true,checks,productionWrites:0}));
console.log('PASS: compiled session and sales authorization policy');
