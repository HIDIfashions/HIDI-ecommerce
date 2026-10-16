import test from 'node:test';
import assert from 'node:assert/strict';
import {readProductPackage,matchPackagePhotos,MAX_PACKAGE_BYTES} from '../deploy/product-upload/package.mjs';
import {parseProducts,HEADERS} from '../deploy/product-upload/model.mjs';
import {zipPackage} from './product-upload-package-fixture.mjs';
const image=Buffer.from([137,80,78,71,13,10,26,10,0,1,2,3]);
const file=bytes=>new File([bytes],'products.zip',{type:'application/zip'});
const base=[['Products.csv','action,product_key\nUPDATE,one\n'],['photos/KUR_001/DSC00137.png',image]];
const parse=rows=>parseProducts([{name:'Products',rows:[HEADERS,...rows.map(row=>HEADERS.map(h=>row[h]||''))]}]);
const row=(sku='KUR_001',overrides={})=>({action:'NEW',product_key:sku.toLowerCase(),product_name:sku,color:'Ivory',size:'M',selling_price:'999',mrp:'1499',image_sku:sku,...overrides});
test('stored and deflated ZIP packages retain spreadsheet and image bytes',async()=>{
  for(const compressed of [false,true]){const progress=[];const batch=await readProductPackage(file(zipPackage(base,{compressed})),v=>progress.push(v));assert.equal(batch.workbook.name,'Products.csv');assert.equal(await batch.workbook.text(),base[0][1]);assert(Buffer.from(await batch.photos[0].file.arrayBuffer()).equals(image));assert.equal(batch.photos[0].file.type,'image/png');assert.equal(progress.at(-1).completed,2);}
});
test('camera filenames in different colour folders match separately across all sizes',async()=>{
  const batch=await readProductPackage(file(zipPackage([...base,['photos/KUR_001/DSC00143.png',image],['photos/COR_003/DSC00137.png',image]])));
  const parsed=parse([row(),row('KUR_001',{size:'L'}),row('COR_003')]);const result=matchPackagePhotos(parsed,batch.photos);assert.equal(result.files.length,3);assert.deepEqual(parsed.groups[0].variants.map(v=>v.photoNames),[['KUR_001_1.png','KUR_001_2.png'],['KUR_001_1.png','KUR_001_2.png']]);assert.equal(parsed.groups[1].variants[0].photoNames[0],'COR_003_1.png');assert.equal(result.files[2].packagePath,'photos/COR_003/DSC00137.png');assert(Buffer.from(await result.files[2].arrayBuffer()).equals(image));
});
test('explicit original camera photo order and main cover are preserved',async()=>{
  const batch=await readProductPackage(file(zipPackage([...base,['photos/KUR_001/DSC00143.png',image]])));const parsed=parse([row('KUR_001',{photo_names:'DSC00143.png;DSC00137.png',main_photo:'DSC00137.png'})]);const result=matchPackagePhotos(parsed,batch.photos);assert.deepEqual(result.files.map(f=>f.packagePath),['photos/KUR_001/DSC00143.png','photos/KUR_001/DSC00137.png']);assert.equal(parsed.groups[0].variants[0].mainPhoto,'KUR_001_2.png');
  assert.throws(()=>matchPackagePhotos(parse([row('KUR_001',{main_photo:'missing.jpg'})]),batch.photos),/Main photo is missing/);
});
test('flat numbered files remain compatible and ambiguous folders fail',async()=>{
  const batch=await readProductPackage(file(zipPackage([base[0],['photos/KUR_001_1.png',image]])));const parsed=parse([row()]);assert.equal(matchPackagePhotos(parsed,batch.photos).files[0].name,'KUR_001_1.png');assert.deepEqual(parsed.groups[0].variants[0].photoNames,[]);
  const duplicate=await readProductPackage(file(zipPackage([...base,['other/KUR_001/DSC00137.png',image]])));assert.throws(()=>matchPackagePhotos(parse([row()]),duplicate.photos),/one folder/);
});
test('damaged, traversal, encrypted, unsupported and duplicate package entries fail before review',async()=>{
  for(const [entries,pattern] of [[[],/too many|invalid ZIP/],[[base[1]],/exactly one/],[[...base,['Other.xlsx','fake']],/exactly one/],[[...base,['photos/../evil.png',image]],/invalid folder/],[[...base,['photos/KUR_001/raw.ARW',image]],/Unsupported/],[[...base,['products.csv','duplicate']],/Duplicate/]])await assert.rejects(readProductPackage(file(zipPackage(entries))),pattern);
  const corrupted=zipPackage(base,{compressed:false});corrupted[30+Buffer.byteLength(base[0][0])]^=1;await assert.rejects(readProductPackage(file(corrupted)),/damaged/);
  const encrypted=zipPackage(base);const central=encrypted.readUInt32LE(encrypted.length-6);encrypted.writeUInt16LE(1,central+8);await assert.rejects(readProductPackage(file(encrypted)),/Encrypted/);
  await assert.rejects(readProductPackage({name:'big.zip',size:MAX_PACKAGE_BYTES+1}),/512 MB/);
});
test('forged expanded sizes and overlapping local data are rejected',async()=>{
  const data=zipPackage(base);const central=data.readUInt32LE(data.length-6);data.writeUInt32LE(13*1024*1024,central+46+Buffer.byteLength(base[0][0])+24);await assert.rejects(readProductPackage(file(data)),/too large/);
  const bomb=zipPackage(base);bomb.writeUInt32LE(1,central+24);await assert.rejects(readProductPackage(file(bomb)),/declared size/);
});
