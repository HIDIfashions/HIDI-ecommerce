import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizePhotoUpload} from '../../apps/web/lib/photo-upload-authorize.mjs';
import {readFile} from 'node:fs/promises';
const url='https://hidiindia.com/api/admin/inventory/example/images';
const request=(headers={})=>new Request(url,{method:'POST',headers,body:'unused'});
for(const role of ['OWNER','CATALOG'])test(role+' staff verified by backend before reading the body',async()=>{
 const req=request({'origin':'https://hidiindia.com'});let calls=0;
 await authorizePhotoUpload(req,'http://127.0.0.1:4100/v1/',{Authorization:'Bearer fixture'},async(endpoint,options)=>{
  calls++;assert.equal(endpoint,'http://127.0.0.1:4100/v1/admin/me');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer fixture');return Response.json({admin:{id:'fixture-admin',role}});
 });assert.equal(calls,1);assert.equal(req.bodyUsed,false);
});
for(const role of ['OPERATIONS','SUPPORT','CUSTOMER','',null])test('reject unauthorized role '+role,async()=>{
 const req=request();await assert.rejects(()=>authorizePhotoUpload(req,'http://127.0.0.1:4100/v1',{},async()=>Response.json({admin:{id:'fixture',role}})),e=>e.status===403);assert.equal(req.bodyUsed,false);
});
for(const status of [401,403,500,503])test('backend status '+status+' cannot accept an upload body',async()=>{
 const req=request();await assert.rejects(()=>authorizePhotoUpload(req,'http://127.0.0.1:4100/v1',{},async()=>new Response('',{status})),e=>e.status===(status<500?status:503));assert.equal(req.bodyUsed,false);
});
for(const value of [{},{admin:{role:'OWNER'}},{admin:{id:'',role:'OWNER'}}])test('incomplete admin response fails closed '+JSON.stringify(value),async()=>{
 await assert.rejects(()=>authorizePhotoUpload(request(),'http://127.0.0.1:4100/v1',{},async()=>Response.json(value)),e=>e.status===503);
});
test('network failure fails closed before body consumption',async()=>{const req=request();await assert.rejects(()=>authorizePhotoUpload(req,'http://127.0.0.1:4100/v1',{},async()=>{throw Error('connection');}),e=>e.status===503);assert.equal(req.bodyUsed,false);});
for(const headers of [{'origin':'https://outside.example'},{'sec-fetch-site':'cross-site'}])test('reject cross-site upload '+JSON.stringify(headers),async()=>{
 let calls=0;const req=request(headers);await assert.rejects(()=>authorizePhotoUpload(req,'http://127.0.0.1:4100/v1',{},async()=>{calls++;}),e=>e.status===403);assert.equal(calls,0);assert.equal(req.bodyUsed,false);
});
test('route verifies staff and domain before any body read and retains ticket authorization',async()=>{
 const text=await readFile(new URL('../../apps/web/app/api/admin/inventory/[variantId]/images/route.ts',import.meta.url),'utf8');
 const post=text.slice(text.indexOf('export async function POST('),text.indexOf('export async function DELETE('));
 assert(post.indexOf('uploadDomainPolicy(request)')<post.indexOf('authorizePhotoUpload('));
 assert(post.indexOf('isAdminRequest(request)')<post.indexOf('authorizePhotoUpload('));
 assert(post.indexOf('authorizePhotoUpload(')<post.indexOf('request.json()'));
 assert(post.indexOf('authorizePhotoUpload(')<post.indexOf('readStreamedPhotoForm(request)'));
 assert(post.indexOf('createUploadTicket(request, variantId, file)')<post.indexOf('uploadProductImageFile('));
 assert.match(post,/finally[\s\S]*photoForm\?\.cleanup\(\)[\s\S]*releasePhotoUpload\?\.\(\)/);
 assert.doesNotMatch(post,/file\.arrayBuffer\(|file\.size\s*>\s*(?:40|12)/);
});
