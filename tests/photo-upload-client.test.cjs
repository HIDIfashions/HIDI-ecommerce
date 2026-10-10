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
const bulk=load("hidi-bulk-photos.ts",{"@/lib/hidi-bulk-import":{skuKey:load("hidi-bulk-import.ts").skuKey}});
const max=12*1024*1024;
test("single-SKU photo selection accepts exactly 12 MB and still rejects a larger member before the batch starts",()=>{
  assert.equal(batch.MAX_PHOTO_BYTES,max);
  for(const type of ["image/jpeg","image/png","image/webp","image/avif"])
    batch.validatePhotoSelection([{name:"photo",size:max,type}]);
  for(const size of [max+1,0,-1])
    assert.throws(()=>batch.validatePhotoSelection([{name:"first",size:1,type:"image/jpeg"},{name:"second",size,type:"image/jpeg"}]),/no larger than 12 MB/);
  assert.throws(()=>batch.validatePhotoSelection(Array.from({length:9},()=>({name:"photo",size:1,type:"image/jpeg"}))),/up to 8 photos/);
});
test("bulk photos accept the new boundary without changing SKU matching or batch limits",async()=>{
  const variants=[{sku:"HIDI-CREAM-M",variantId:"fixture_variant"}];
  const [accepted,rejected]=await bulk.photoCandidatesFromFiles([
    new File([new Uint8Array(max)],"HIDI-CREAM-M_1.jpg",{type:"image/jpeg"}),
    new File([new Uint8Array(max+1)],"HIDI-CREAM-M_2.jpg",{type:"image/jpeg"})],variants);
  assert.equal(accepted.error,null);assert.equal(accepted.variantId,"fixture_variant");
  assert.equal(rejected.error,"Image exceeds 12 MB.");
  assert.equal(rejected.variantId,"fixture_variant");
  await assert.rejects(()=>bulk.photoCandidatesFromFiles(Array.from({length:1001},()=>new File(["x"],"HIDI-CREAM-M.jpg",{type:"image/jpeg"})),variants),/at most 1,000/);
});

