import test from 'node:test';import assert from 'node:assert/strict';
import {priceStatus,target15,catalogueStatus,paise,variantPayload,sellingForDiscount} from './model.mjs';
test('MRP and percentage calculate selling price in integer paise',()=>{
 assert.equal(sellingForDiscount(200000,'15'),170000);assert.equal(sellingForDiscount(200000,'0'),200000);assert.equal(sellingForDiscount(115000,'20'),92000);assert.equal(sellingForDiscount(212175,'15'),180349);assert.equal(sellingForDiscount(10000,'12.5'),8750);
 for(const value of ['100','101','-1','15.999','NaN','','1e2'])assert.throws(()=>sellingForDiscount(200000,value));
 assert.throws(()=>sellingForDiscount(1,'99.99'));
});
test('15 percent uses MRP as denominator and rounds integer paise',()=>{
 assert.equal(target15(200000),170000);assert.equal(target15(212175),180349);
 assert.equal(priceStatus(212175,184500).exact15,false);assert.equal(priceStatus(200000,170000).exact15,true);
 for(const pair of [[0,1],[100,101],[100,-1],[100.5,80],[null,null]])assert.equal(priceStatus(...pair).valid,false);
});
test('sitewide assertion requires every product and variant including sold-out sizes',()=>{
 const p={variants:[{mrpPaise:200000,pricePaise:170000,available:1}]};assert.equal(catalogueStatus([p]).ready,true);
 assert.equal(catalogueStatus([]).ready,false);assert.equal(catalogueStatus([p,{variants:[]}]).ready,false);
 assert.equal(catalogueStatus([{variants:[...p.variants,{mrpPaise:200000,pricePaise:200000,available:0}]}]).ready,false);
});
test('manual edits preserve non-price fields and product revision without float truncation',()=>{
 assert.equal(paise('1803.49'),180349);for(const value of ['1.234','-1','1e3','0','','1000001'])assert.throws(()=>paise(value));
 const v={id:'v',active:true,weightGrams:null,bustMm:1000,waistMm:800};
 const payload=variantPayload({updatedAt:'revision'},v,'2000','1700');assert.equal(payload.expectedUpdatedAt,'revision');assert.equal(payload.weightGrams,null);assert.equal(payload.bustMm,1000);assert.equal(payload.waistMm,800);assert.equal(payload.active,true);assert.equal(payload.mrpPaise,200000);assert.equal(payload.pricePaise,170000);
 assert.throws(()=>variantPayload({updatedAt:'revision'},v,'100','101'));
});
