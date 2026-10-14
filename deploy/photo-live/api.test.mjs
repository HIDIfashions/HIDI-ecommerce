import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
const root=resolve(process.env.HIDI_CANDIDATE_API);
const {AdminInventoryService}=await import(pathToFileURL(join(root,'apps/api/dist/admin/admin-inventory.service.js')).href);
function fixture(){
 const state={writes:[],status:'ACTIVE',found:true};
 const product={status:'ACTIVE',slug:'fixture'};
 const db={productVariant:{findUnique:async()=>state.found?{id:'fixture-v',productId:'fixture-p',product:{...product,status:state.status}}:null},product:{findUnique:async()=>({...product,status:state.status})},$queryRaw:async()=>[{id:'fixture-p'}],adminMediaUploadTicket:{deleteMany:async()=>({count:0}),create:async({data})=>{state.writes.push(data);return data;}}};db.$transaction=fn=>fn(db);
 return {service:new AdminInventoryService(db),state};
}
test('retained API accepts 12, 30, 40, 45, 60 and 100 MiB for all supported photo formats',async()=>{
 const {service,state}=fixture();for(const mimeType of ['image/jpeg','image/png','image/webp','image/avif'])for(const mib of [12,30,40,45,60,100]){
  const sizeBytes=mib*1024*1024;const result=await service.createVariantImageUploadTicket('fixture-v',{mimeType,sizeBytes});assert.equal(typeof result.token,'string');assert.equal(state.writes.at(-1).maxBytes,sizeBytes);assert.equal(typeof state.writes.at(-1).maxBytes,'number');
 }assert.equal(state.writes.length,24);
});
test('retained SQL integer capacity is respected and malformed/empty sizes do not create a ticket',async()=>{
 const {service,state}=fixture();for(const sizeBytes of [0,-1,NaN,Infinity,1.5,'123',2147483648,Number.MAX_SAFE_INTEGER])await assert.rejects(()=>service.createVariantImageUploadTicket('fixture-v',{mimeType:'image/jpeg',sizeBytes}));assert.equal(state.writes.length,0);
});
test('unsupported format does not gain access by removing the old MB cap',async()=>{
 const {service,state}=fixture();for(const mimeType of ['image/svg+xml','application/pdf','image/gif',''])await assert.rejects(()=>service.createVariantImageUploadTicket('fixture-v',{mimeType,sizeBytes:45*1024*1024}));assert.equal(state.writes.length,0);
});
test('missing product variant remains rejected',async()=>{
 const {service,state}=fixture();state.found=false;await assert.rejects(()=>service.createVariantImageUploadTicket('fixture-v',{mimeType:'image/jpeg',sizeBytes:45*1024*1024}),/not found/i);assert.equal(state.writes.length,0);
});
