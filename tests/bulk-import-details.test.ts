import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProductRows,importDetails} from '../apps/web/lib/hidi-bulk-import.ts';
import type {ProductRecord} from '../apps/web/lib/admin-products-contract.ts';
const row={product_name:'Magenta Set',product_slug:'magenta-set',category:'Work Wear',description:'Complete supplier details',color:'Magenta',size:'M',selling_price:'1095',mrp:'1499'};
test('conflicting full descriptions across size rows are rejected before importing',()=>{
  const values=normalizeProductRows([row,{...row,size:'L',description:'Different details'}]);assert.equal(values[0].errors.length,0);assert.match(values[1].errors.join(' '),/Product-level fields differ/);
});
test('one design with consistent descriptions accepts a size matrix',()=>{assert(normalizeProductRows([row,{...row,size:'L'}]).every(row=>!row.errors.length));});
test('source metadata helper retains blank data, collections and optimistic version',()=>{
  const product={id:'product',name:'Old name',slug:'magenta-set',categoryId:'casual',collections:[{collectionId:'ananya'}],updatedAt:'current-version',description:'Old',shortDescription:'Keep',fabric:'Cotton',care:'Wash gently'} as ProductRecord;
  const payload=importDetails(normalizeProductRows([row])[0],product,'work');assert(payload);assert.equal(payload.description,row.description);assert.equal(payload.categoryId,'work');assert.equal(payload.fabric,'Cotton');assert.equal(payload.care,'Wash gently');assert.deepEqual(payload.collectionIds,['ananya']);assert.equal(payload.expectedUpdatedAt,'current-version');
  assert.equal(importDetails(normalizeProductRows([{...row,product_name:product.name,category:'',description:''}])[0],product,null),null);
});
