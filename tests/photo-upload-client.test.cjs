const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../apps/web/node_modules/typescript");
function load(file, mocks={}) {
  const text=fs.readFileSync(path.join(__dirname,"../apps/web/lib",file),"utf8");
  const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(js,{exports, require:name=>mocks[name]??{}, File, Blob, FormData, AbortController,
    setTimeout,clearTimeout,fetch:global.fetch},{filename:file});
  return exports;
}
const batch=load("sku-photo-batch.ts");
async function loadBulk(api) {
  // Exercise the actual normalization, mapping and size validators. Only the
  // read-only catalogue lookup is replaced with explicit isolated fixtures.
  const imageSku=await import("../deploy/admin-tools/image-sku-client.mjs");
  return load("hidi-bulk-photos.ts",{
    "./hidi-bulk-import":{skuKey:load("hidi-bulk-import.ts").skuKey},
    "../../../deploy/admin-tools/image-sku-client.mjs":{
      ...imageSku, prepareMappedPhotos:items=>imageSku.prepareMappedPhotos(items,api),
    },
  });
}
const max=40*1024*1024;
test("single-SKU selection accepts large photos and rejects invalid sizes before uploading",()=>{
  assert.equal(batch.MAX_PHOTO_BYTES,Number.MAX_SAFE_INTEGER);
  for(const type of ["image/jpeg","image/png","image/webp","image/avif"])
    for (const size of [1,max,max+1,100*1024*1024,3*1024*1024*1024]) batch.validatePhotoSelection([{name:"photo",size,type}]);
  for(const size of [0,-1])
    assert.throws(()=>batch.validatePhotoSelection([{name:"first",size:1,type:"image/jpeg"},{name:"second",size,type:"image/jpeg"}]),/valid non-empty photo/);
  assert.throws(()=>batch.validatePhotoSelection(Array.from({length:9},()=>({name:"photo",size:1,type:"image/jpeg"}))),/up to 8 photos/);
});
test("bulk photos accept files above the former 40 MiB cap with correct SKU mapping",async()=>{
  const calls=[];
  const bulk=await loadBulk(async url=>{
    calls.push(url);
    if(url==="/api/hidi/product-image-skus")return {bindings:[{imageSku:"HIDI-CREAM-M",productId:"fixture_product",color:"Cream"}]};
    if(url==="/api/admin/products/fixture_product")return {id:"fixture_product",status:"ACTIVE",variants:[{id:"fixture_variant",color:"Cream",active:true}]};
    throw new Error("Unexpected lookup in isolated test: "+url);
  });
  const variants=[]; // Exercise Image-SKU lookup, independently of stock SKU matching.
  const [accepted,larger]=await bulk.photoCandidatesFromFiles([
    new File([new Uint8Array(max)],"HIDI-CREAM-M_1.jpg",{type:"image/jpeg"}),
    new File([new Uint8Array(max+1)],"HIDI-CREAM-M_2.jpg",{type:"image/jpeg"})],variants);
  assert.equal(accepted.error,null);assert.equal(accepted.variantId,"fixture_variant");
  assert.equal(accepted.productId,"fixture_product");assert.equal(accepted.color,"Cream");
  assert.deepEqual(accepted.targetVariantIds,["fixture_variant"]);
  assert.equal(accepted.isMain,true);assert.equal(accepted.sequence,1);
  assert.equal(larger.error,null);
  assert.equal(larger.variantId,"fixture_variant");
  assert.equal(larger.sequence,2);
  assert.deepEqual(calls,["/api/hidi/product-image-skus","/api/admin/products/fixture_product"]);
  await assert.rejects(()=>bulk.photoCandidatesFromFiles(Array.from({length:1001},()=>new File(["x"],"HIDI-CREAM-M.jpg",{type:"image/jpeg"})),variants),/at most 1,000/);
});

