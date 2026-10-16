import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheet, detailsPayload, pricePaise } from '../deploy/admin-tools/product-sheet.mjs';
import { parseCreate, parseEdit } from '../apps/api/src/admin/products/product-input.ts';
export const sample = `Product Name\tWomen's Cream Floral Printed Kurta Set with Dupatta
SKU / Style Code\tKUR_001
Category\tWomen's Ethnic Wear
Subcategory\tKurta Set with Bottom and Dupatta
Colour\tCream / Pale Yellow with Pink, Peach and Green Floral Print
Occasion\tCasual Wear, Festive Wear, Daywear
Number of Pieces\t3-Piece Set
Included Components\tKurta, Bottom and Dupatta
Top / Kurta
Fabric : Cotton
Size- L, XL, XXL, 3XXL
Colour: Pale Yellow
Pattern: All-over multicolour floral print
Gentle Hand Wash / Dry Clean\tNeckline: V neck with embroidered detailing
Sleeves: Full sleeves
Sleeve Detail: Lace detailing at sleeve cuffs
Length: Long kurta, approximately calf length
Fit: Flared A-line silhouette
Bottom / Pants
Colour: Pale Yellow
Fabric : Cotton
Pattern: Solid
Style: Straight-fit
Length: Full length
Fit: Relaxed fit
Hem Detail: Decorative lace trim at the bottom
Dupatta / Chunni
Fabric: Cotton
Base Colour: Pink Border with Pale Yellow
Pattern: Multicolour floral print with green leaves
Border: Pink Printed border
Style: Matching ethnic dupatta
Finish: Lightweight drape appearance`;
test('labelled Excel columns map summary and preserve every garment component',()=>{const r=parseSheet(sample);assert.equal(r.fields.name,"Women's Cream Floral Printed Kurta Set with Dupatta");assert.equal(r.fields.fabric,'Cotton');assert.equal(r.fields.care,'Gentle Hand Wash / Dry Clean');assert.match(r.fields.description,/Bottom \/ Pants/);assert.match(r.fields.description,/Dupatta \/ Chunni/);assert.match(r.fields.description,/KUR_001/);assert.match(r.fields.description,/Neckline: V neck/);assert.match(r.fields.description,/Hem Detail/);assert.match(r.fields.description,/Lightweight drape/);assert.equal(r.category,"Women's Ethnic Wear");assert.equal(r.fields.pricePaise,undefined);});
test('size colon, screenshot hyphen and comma preserve distinct sizes without inventing stock',()=>{assert.deepEqual(parseSheet('Product Name: Test\nSizes: L, XL, XXL, 3XXL, L').sizes,['L','XL','XXL','3XXL']);assert.deepEqual(parseSheet(sample).sizes,['L','XL','XXL','3XXL']);});
test('mixed component fabrics retain the correct section',()=>{const r=parseSheet('Product Name: Test\nTop / Kurta\nFabric: Cotton\nBottom / Pants\nFabric: Silk\nDupatta / Chunni\nFabric: Organza');assert.equal(r.fields.fabric,'Top / Kurta: Cotton; Bottom / Pants: Silk; Dupatta / Chunni: Organza');});
test('included pieces and fit use existing PDP labels without losing component fits',()=>{const r=parseSheet(sample);assert.match(r.fields.description,/(?:^|\n)Includes: Kurta, Bottom and Dupatta/);assert.match(r.fields.description,/(?:^|\n)Fit: Flared A-line silhouette/);assert.match(r.fields.description,/Bottom \/ Pants: Fit: Relaxed fit/);});
test('bottom colours and sizes do not overwrite overall summary',()=>{const r=parseSheet('Product Name: Test\nColour: Cream\nSizes: XL\nBottom / Pants\nColour: Pink\nSizes: M');assert.equal(r.color,'Cream');assert.deepEqual(r.sizes,['XL']);});
test('unrecognised rows remain in the description and absent name is flagged',()=>{const r=parseSheet('Embroidery: Hand work\nVendor note: verify lining');assert.match(r.fields.description,/verify lining/);assert.ok(r.warnings.some(w=>w.includes('name')));});
test('missing fields are not implicitly cleared in updates',()=>{const p={name:'Original',description:'Old',fabric:'Cotton',care:'Dry clean',categoryId:'cat',shortDescription:'Keep',updatedAt:'2026-10-10T00:00:00.000Z',collections:[{collectionId:'collection'}]};const r=detailsPayload(p,{description:'Updated'},new Set(['description']));assert.equal(r.name,'Original');assert.equal(r.fabric,'Cotton');assert.equal(r.care,'Dry clean');assert.equal(r.categoryId,'cat');assert.equal(r.shortDescription,'Keep');assert.deepEqual(r.collectionIds,['collection']);assert.equal(r.expectedUpdatedAt,p.updatedAt);assert.equal(r.description,'Updated');assert.equal(r.variants,undefined);assert.equal(r.stock,undefined);assert.equal(r.status,undefined);});
test('clearing a field requires explicit selection',()=>{assert.equal(detailsPayload({care:'Old'}, {care:''},new Set()).care,'Old');assert.equal(detailsPayload({care:'Old'}, {care:''},new Set(['care'])).care,null);});
test('bounded input and duplicate name warn without guessing',()=>{assert.throws(()=>parseSheet(''));assert.throws(()=>parseSheet('x'.repeat(20001)));const r=parseSheet('Product Name: A\nProduct Name: B');assert.equal(r.fields.name,'A');assert.ok(r.warnings.some(w=>w.includes('Multiple')));});
test('rupee conversion is exact and rejects unsafe/malformed prices',()=>{assert.equal(pricePaise('2499.99'),249999);assert.equal(pricePaise('0.01'),1);for(const input of ['',0,-1,'1e3','1,999','1.001','999999999999999'])assert.throws(()=>pricePaise(input));});
test('quick fill payloads satisfy the existing backend create/edit contracts',()=>{const sheet=parseSheet(sample);const fields={...sheet.fields,categoryId:'cat1'};const selected=new Set(Object.keys(fields));const create={...detailsPayload(null,fields,selected),colors:[{name:'Pale Yellow',hex:null}],sizes:sheet.sizes,pricePaise:249900,mrpPaise:349900,weightGrams:null,requestId:'00000000-0000-4000-8000-000000000001'};assert.equal(parseCreate(create).sizes.length,4);const record={...fields,updatedAt:'2026-10-10T00:00:00.000Z',collections:[{collectionId:'retain'}]};const edit=detailsPayload(record,fields,selected);assert.equal(parseEdit(edit).fabric,'Cotton');assert.deepEqual(parseEdit(edit).collectionIds,['retain']);});
