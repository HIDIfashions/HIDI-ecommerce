import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {labels,normalizeRange,names,tooling} from './patch-runtime.mjs';
import {rename} from './taxonomy.mjs';
import {categoryCollectionSlug,categoryOption,parseWorkbook} from '../admin-tools/product-batch.mjs';
import {subcategoryPick,parseSheet} from '../admin-tools/product-sheet.mjs';
test('new import names retain the existing collection and product identity',()=>{
  for(const [name,slug] of [['Daily Dose','everyday'],['Chill Vibes','work-edit'],['Pretty Little Plans','occasion'],['Casual Wear','everyday']])assert.equal(categoryCollectionSlug(name),slug);
  assert.equal(categoryOption({categories:[{id:'kept',slug:'work-wear',name:'Chill Vibes'}]},'Work Wear').id,'kept');
  for(const label of ['Ananya’s Closet',"Ananya's Closet",'Ananya’s Pick'])assert.equal(subcategoryPick(label,''),true);
  assert.throws(()=>subcategoryPick('Ananya’s Closet','FALSE'),/conflicts/);
  assert.equal(parseSheet('Product Name\tTest\nAnanya’s Closet\tYES').ananyaPick,true);
  assert.equal(parseWorkbook([{name:'test',rows:[['product_name','ananyas_closet'],['Test','TRUE']]}]).entries[0].ananyaPick,true);
});
test('runtime labels preserve descriptive product facts and URLs',()=>{
  assert.equal(labels('name:"Casual Wear",url:"/collections/casual-wear"'),'name:"Daily Dose",url:"/collections/casual-wear"');
  assert.equal(labels('"Casual Wear Kurta"'),'"Casual Wear Kurta"');
  assert.equal(labels('"Occasion: Casual Wear, Festive Wear"'),'"Occasion: Casual Wear, Festive Wear"');
  assert.equal(labels('"Ananya\\u2019s Pick"'),'"Ananya’s Closet"');
  assert.equal(labels("'Ananya\\'s Pick'"),"'Ananya’s Closet'");
});
test('retained bulk uploader resolves old and new names to the canonical option when legacy names duplicate',()=>{
  const code=tooling('this.match=options.categories.find(c=>c.name.toLowerCase()===row.category.toLowerCase());','product-bulk.mjs');
  for(const name of ['Daily Dose','Casual Wear','casual-wear']){
    const ctx={options:{categories:[{id:'legacy',slug:'casual-ware',name:'Daily Dose'},{id:'main',slug:'casual-wear',name:'Daily Dose'}]},row:{category:name}};
    vm.runInNewContext(code,ctx);assert.equal(ctx.match.id,'main');
  }
});
test('saved default range captions change while custom captions are preserved',()=>{
  const text=readFileSync(new URL('../range-text/server-text.mjs.txt',import.meta.url),'utf8');
  const ctx={};vm.runInNewContext(normalizeRange(text)+';this.result=publicRangeText({cards:{"range-everyday":{title:"Casual Wear"},"range-work-edit":{title:"My custom caption"}}});',ctx);
  assert.equal(ctx.result.cards['range-everyday'].title,'Daily Dose');
  assert.equal(ctx.result.cards['range-work-edit'].title,'My custom caption');
});
function fixture(){
  const state={category:names.slice(0,3).map((g,i)=>({id:'c'+i,slug:g.slug,name:g.old[0],active:true,position:i})),collection:names.map((g,i)=>({id:'l'+i,slug:g.slug,name:g.old[0],active:true,position:i})),products:[{id:'p1',categoryId:'c0',status:'ACTIVE'}],links:[{productId:'p1',collectionId:'l3',position:0}]};
  state.category.push({id:'legacy',slug:'casual-ware',name:'Casual ware',active:true,position:4});
  const db={product:{findMany:async()=>structuredClone(state.products)},productCollection:{findMany:async()=>structuredClone(state.links)}};
  for(const kind of ['category','collection'])db[kind]={findMany:async()=>structuredClone(state[kind]),updateMany:async({where,data})=>{const row=state[kind].find(r=>r.id===where.id&&r.name===where.name);if(!row)return {count:0};Object.assign(row,data);return {count:1};}};
  db.$transaction=async fn=>{const snapshot=structuredClone(state);try{return await fn(db);}catch(e){Object.assign(state,snapshot);throw e;}};
  return {db,state};
}
test('rename changes only reference names, including legacy categories, and is idempotent',async()=>{
  const {db,state}=fixture(),products=structuredClone(state.products),links=structuredClone(state.links);
  const preview=await rename(db,names,{mode:'inspect'});assert.equal(preview.changed,undefined);assert.equal(state.category[0].name,'Casual Wear');
  const result=await rename(db,names,{mode:'apply',...{referenceHash:preview.referenceHash,assignmentHash:preview.assignmentHash}});
  assert.equal(result.changed,8);assert.equal(state.category.at(-1).name,'Daily Dose');assert.deepEqual(state.products,products);assert.deepEqual(state.links,links);
  const after=await rename(db,names,{mode:'inspect'});assert.equal((await rename(db,names,{mode:'apply',referenceHash:after.referenceHash,assignmentHash:after.assignmentHash})).changed,0);
  await rename(db,names,{mode:'restore',plan:preview.plan});assert.equal(state.category[0].name,'Casual Wear');assert.deepEqual(state.links,links);
});
test('concurrent reference or product assignment edits prevent a stale rename',async()=>{
  for(const change of ['category','product']){
    const {db,state}=fixture(),preview=await rename(db,names,{mode:'inspect'});
    if(change==='category')state.category[0].name='Independent edit';else state.products[0].categoryId='c1';
    await assert.rejects(rename(db,names,{mode:'apply',referenceHash:preview.referenceHash,assignmentHash:preview.assignmentHash}),/TAXONOMY_CHANGED_AFTER_PREVIEW/);
    assert.equal(state.category[1].name,'Work Wear');
  }
});
test('rollback refuses to overwrite a later admin rename',async()=>{
  const {db,state}=fixture(),preview=await rename(db,names,{mode:'inspect'});
  await rename(db,names,{mode:'apply',referenceHash:preview.referenceHash,assignmentHash:preview.assignmentHash});state.category[0].name='Independent';
  await assert.rejects(rename(db,names,{mode:'restore',plan:preview.plan}),/INDEPENDENT_CATEGORY_CHANGE/);
  assert.equal(state.category[0].name,'Independent');
});
