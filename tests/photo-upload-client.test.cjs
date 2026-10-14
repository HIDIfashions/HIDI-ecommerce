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
test("single-SKU photo selection accepts exactly 40 MiB and still rejects a larger member before the batch starts",()=>{
  assert.equal(batch.MAX_PHOTO_BYTES,max);
  for(const type of ["image/jpeg","image/png","image/webp","image/avif"])
    batch.validatePhotoSelection([{name:"photo",size:max,type}]);
  for(const size of [max+1,0,-1])
    assert.throws(()=>batch.validatePhotoSelection([{name:"first",size:1,type:"image/jpeg"},{name:"second",size,type:"image/jpeg"}]),/no larger than 40 MiB/);
  assert.throws(()=>batch.validatePhotoSelection(Array.from({length:9},()=>({name:"photo",size:1,type:"image/jpeg"}))),/up to 8 photos/);
});
test("bulk photos accept the 40 MiB boundary without changing SKU matching or batch limits",async()=>{
  const calls=[];
  const bulk=await loadBulk(async url=>{
    calls.push(url);
    if(url==="/api/hidi/product-image-skus")return {bindings:[{imageSku:"HIDI-CREAM-M",productId:"fixture_product",color:"Cream"}]};
    if(url==="/api/admin/products/fixture_product")return {id:"fixture_product",status:"ACTIVE",variants:[{id:"fixture_variant",color:"Cream",active:true}]};
    throw new Error("Unexpected lookup in isolated test: "+url);
  });
  const variants=[{sku:"HIDI-CREAM-M",variantId:"fixture_variant"}];
  const [accepted,rejected]=await bulk.photoCandidatesFromFiles([
    new File([new Uint8Array(max)],"HIDI-CREAM-M_1.jpg",{type:"image/jpeg"}),
    new File([new Uint8Array(max+1)],"HIDI-CREAM-M_2.jpg",{type:"image/jpeg"})],variants);
  assert.equal(accepted.error,null);assert.equal(accepted.variantId,"fixture_variant");
  assert.equal(accepted.productId,"fixture_product");assert.equal(accepted.color,"Cream");
  assert.deepEqual(accepted.targetVariantIds,["fixture_variant"]);
  assert.equal(accepted.isMain,true);assert.equal(accepted.sequence,1);
  assert.equal(rejected.error,"Each image must be between 1 byte and 40 MiB.");
  assert.equal(rejected.variantId,"fixture_variant");
  assert.deepEqual(calls,["/api/hidi/product-image-skus","/api/admin/products/fixture_product"]);
  await assert.rejects(()=>bulk.photoCandidatesFromFiles(Array.from({length:1001},()=>new File(["x"],"HIDI-CREAM-M.jpg",{type:"image/jpeg"})),variants),/at most 1,000/);
});

