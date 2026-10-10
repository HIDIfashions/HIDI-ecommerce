import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicationState,publishProducts,importDetails} from '../deploy/admin-tools/product-publication.mjs';
const product=(id='p',patch={})=>({id,name:'Magenta Set',slug:'magenta-set',status:'DRAFT',updatedAt:'2026-10-10T22:00:00.000Z',categoryId:'casual',collections:[{collectionId:'ananya'}],shortDescription:'Keep',description:'Old',fabric:'Cotton',care:'Wash gently',images:[{id:'photo'}],variants:[{active:true,pricePaise:109500,mrpPaise:149900,images:[],inventory:{onHand:0}}],...patch});
test('readiness matches existing backend guards, including SKU-only photos and zero stock',()=>{
  assert.equal(publicationState(product()).ready,true);
  assert.equal(publicationState(product('p',{images:[],variants:[{active:true,pricePaise:109500,mrpPaise:109500,images:[{id:'sku-photo'}]}]})).ready,true);
  for(const patch of [{images:[]},{variants:[]},{variants:[{active:false,pricePaise:1,mrpPaise:1,images:[{}]}]},{variants:[{active:true,pricePaise:0,mrpPaise:1}]},{variants:[{active:true,pricePaise:5,mrpPaise:4}]}])assert.equal(publicationState(product('p',patch)).ready,false);
});
test('only selected unique ready drafts are published with fresh optimistic versions',async()=>{
  const calls=[];let version=0;
  const results=await publishProducts(['a','a','b','c'],async(path,method='GET',body)=>{calls.push({path,method,body});const id=path.split('/')[1];if(method==='GET')return product(id,{updatedAt:'version-'+(++version),...(id==='b'?{images:[]}:{}),...(id==='c'?{status:'ARCHIVED'}:{})});return product(id,{status:'ACTIVE'});});
  assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.deepEqual(calls[1].body,{status:'ACTIVE',expectedUpdatedAt:'version-1'});assert.deepEqual(results.map(row=>row.state),['published','blocked','blocked']);
});
test('already published and archived/deleted products are never rewritten',async()=>{
  let writes=0;await publishProducts(['a','b'],async(path,method)=>{if(method)writes++;return product(path.slice(1),{status:path==='/a'?'ACTIVE':'ARCHIVED'});});assert.equal(writes,0);
});
test('partial validation/version failures remain visible while other selected products finish',async()=>{
  const results=await publishProducts(['a','b'],async(path,method)=>{if(method&&path.includes('/a/')){const error=new Error('Changed by another staff member');error.status=409;throw error;}return product(path.split('/')[1],method?{status:'ACTIVE'}:{});});assert.deepEqual(results.map(row=>row.state),['failed','published']);assert.match(results[0].message,/another staff/);
});
test('sign-in or permission failure pauses before any later product is touched',async()=>{
  const seen=[];const results=await publishProducts(['a','b'],async(path)=>{seen.push(path);const error=new Error('Sign in required');error.status=401;throw error;});assert.deepEqual(seen,['/a']);assert.equal(results[0].status,401);
});
test('retry after a lost successful publish response confirms ACTIVE without another status write',async()=>{
  let current=product(),writes=0;
  const api=async(path,method)=>{if(!method)return current;writes++;current=product('p',{status:'ACTIVE'});throw new Error('Connection interrupted');};
  assert.equal((await publishProducts(['p'],api))[0].state,'failed');assert.equal((await publishProducts(['p'],api))[0].state,'published');assert.equal(writes,1);
});
test('spreadsheet details preserve blank fields and collections, use current version, and omit status/stock/prices',()=>{
  const original=product();const payload=importDetails({productName:'Updated Set',category:'Work Wear',description:'Full new details',fabric:'',care:'',shortDescription:''},original,'work');
  assert.deepEqual(payload,{name:'Updated Set',slug:'magenta-set',categoryId:'work',collectionIds:['ananya'],expectedUpdatedAt:original.updatedAt,shortDescription:'Keep',description:'Full new details',fabric:'Cotton',care:'Wash gently'});
  assert.equal(importDetails({productName:original.name,category:'',description:'',fabric:'',care:'',shortDescription:''},original,null),null);
});
