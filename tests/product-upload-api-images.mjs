// Load the captured immutable API's compiled image service. Every Prisma call
// is intercepted by disposable fixtures; no connection or real SQL is opened.
import assert from 'node:assert/strict';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root=process.env.HIDI_CANDIDATE_API;
assert(root,'HIDI_CANDIDATE_API must identify the captured actual API image.');
let modulePath,Service;
for(const relative of ['apps/api/dist/admin/admin-inventory.service.js','apps/api/dist/admin/admin.service.js']) {
  const file=path.join(root,relative);
  if(!await stat(file).catch(()=>null))continue;
  const loaded=await import(pathToFileURL(file));
  const candidates=[...Object.values(loaded),...Object.values(loaded.default||{})];
  Service=candidates.find(value=>typeof value==='function'&&typeof value.prototype?.addVariantImage==='function');
  if(Service){modulePath=relative;break;}
}
assert(Service,'Captured compiled API must expose its genuine addVariantImage implementation.');
const moduleSha256=createHash('sha256').update(await readFile(path.join(root,modulePath))).digest('hex');
const product={id:'fixture-product',name:'Fixture ivory kurta',slug:'fixture-ivory-kurta',status:'DRAFT'};
const variants=['M','L','XL','XXL'].map(size=>({id:'fixture-ivory-'+size,productId:product.id,color:'Ivory',size,sku:'PRESERVE-'+size}));
variants.push({id:'fixture-blue-M',productId:product.id,color:'Blue',size:'M',sku:'PRESERVE-BLUE'});
const stock=new Map(variants.map((v,index)=>[v.id,{onHand:10+index,reserved:2,safetyStock:1,reorderLevel:5}]));
const stockBefore=structuredClone([...stock]);
let images=[{id:'blue-old-cover',variantId:'fixture-blue-M',url:'https://fixture.invalid/products/blue-cover.png',alt:'Retain blue cover',position:0,storagePath:null,createdAt:new Date(0)}],sequence=0;
const calls=[],results=[],gallery=id=>images.filter(image=>image.variantId===id).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
const record=(name,args)=>calls.push({name,args:structuredClone(args??{})});
const fail=name=>()=>{throw new Error('Forbidden stock, SQL write or unrelated Prisma operation: '+name);};
const namespace=(name,allowed)=>new Proxy(allowed,{get(target,key){return key in target?target[key]:fail(name+'.'+String(key));}});
const db={
  productVariant:namespace('productVariant',{
    findUnique:async args=>{record('variantRead',args);const v=variants.find(value=>value.id===args.where.id);return v?{...v,product:{...product},images:structuredClone(gallery(v.id))}:null;},
    findMany:async args=>{record('colourRead',args);assert.equal(args.where.productId,product.id);return variants.filter(v=>v.productId===args.where.productId&&v.color===args.where.color).map(v=>({...v}));},
  }),
  product:namespace('product',{findUnique:async args=>{record('productRead',args);assert.equal(args.where.id,product.id);return {...product};}}),
  productImage:namespace('productImage',{findMany:async args=>{record('deletedProductPhotosRead',args);return [];}}),
  productVariantImage:namespace('productVariantImage',{
    count:async args=>{record('photoCount',args);return gallery(args.where.variantId).length;},
    upsert:async args=>{record('photoUpsert',args);const {variantId,url}=args.where.variantId_url;assert(variants.some(v=>v.id===variantId));assert(!Object.keys(args.create).some(k=>/stock|quantity|onHand|reserved/i.test(k)));let image=images.find(value=>value.variantId===variantId&&value.url===url);if(image)Object.assign(image,args.update);else{image={id:'fixture-image-'+(++sequence),...args.create,createdAt:new Date(1)};images.push(image);}return structuredClone(image);},
    findMany:async args=>{record('photoRead',args);return args.where?.variantId?structuredClone(gallery(args.where.variantId)):[];},
    // A retained append-only service must never promote or rewrite positions.
    update:fail('productVariantImage.update'),updateMany:fail('productVariantImage.updateMany'),delete:fail('productVariantImage.delete'),deleteMany:fail('productVariantImage.deleteMany'),
  }),
  inventory:namespace('inventory',{}),inventoryMovement:namespace('inventoryMovement',{}),stockReceipt:namespace('stockReceipt',{}),
  $queryRaw:async(strings,...values)=>{const sql=Array.isArray(strings)?strings.join('?'):String(strings);record('sqlRead',{sql,values});assert(/^\s*SELECT\b/i.test(sql),'Only the existing read/lock query is allowed.');return [{id:product.id}];},
  $executeRaw:fail('$executeRaw'),$executeRawUnsafe:fail('$executeRawUnsafe'),$queryRawUnsafe:fail('$queryRawUnsafe'),$connect:fail('$connect'),
};
db.$transaction=async operation=>{record('transaction');assert.equal(typeof operation,'function');const before=structuredClone(images);try{return await operation(db);}catch(error){images=before;throw error;}};
const prisma=new Proxy(db,{get(target,key){return key in target?target[key]:namespace('unrelated.'+String(key),{});}});
// Bind only this genuine compiled method and its retained prototype helpers.
// Bypass every constructor; no Prisma client or Nest application is created.
const service=Object.create(Service.prototype);Object.defineProperty(service,'prisma',{value:prisma});
const attach=input=>Service.prototype.addVariantImage.call(service,variants[0].id,input);
const mainUrl='https://fixture.invalid/products/variants/fixture/batch-'+('a'.repeat(64))+'.png',galleryUrl='https://fixture.invalid/products/variants/fixture/batch-'+('b'.repeat(64))+'.png';
const main={url:mainUrl,storagePath:'azure://product-media/products/variants/fixture/main.png',alt:'Selected cover first',applyToColor:true,isMain:true};
const pass=name=>results.push({name,status:'PASS'});

await attach(main);
for(const v of variants.filter(v=>v.color==='Ivory')){assert.equal(gallery(v.id).length,1);assert.equal(gallery(v.id)[0].position,0);assert.equal(gallery(v.id)[0].url,mainUrl);assert.equal(gallery(v.id)[0].alt,main.alt);assert.equal(gallery(v.id)[0].storagePath,main.storagePath);}
assert.deepEqual(gallery('fixture-blue-M').map(v=>v.id),['blue-old-cover']);
pass('Chosen image uploaded first becomes position-zero cover for all four sizes; another colour is unchanged');

// Even when a caller supplies the unshipped flag, this captured API is
// append-only. Our uploader queues its cover first instead of relying on it.
await attach({url:galleryUrl,storagePath:'azure://product-media/products/variants/fixture/gallery.png',alt:'Second image',applyToColor:true,isMain:true});
for(const v of variants.filter(v=>v.color==='Ivory')){assert.deepEqual(gallery(v.id).map(i=>i.url),[mainUrl,galleryUrl]);assert.deepEqual(gallery(v.id).map(i=>i.position),[0,1]);}
assert(!calls.some(call=>/position.*write|photo.*update/i.test(call.name)));
pass('Captured service appends later photos and preserves the existing first cover without reordering');

const beforeRetry=images.length;
await attach({...main,alt:'Corrected cover alternative text'});
assert.equal(images.length,beforeRetry);
for(const v of variants.filter(v=>v.color==='Ivory')){assert.deepEqual(gallery(v.id).map(i=>i.url),[mainUrl,galleryUrl]);assert.equal(gallery(v.id)[0].position,0);assert.equal(gallery(v.id)[0].alt,'Corrected cover alternative text');assert.equal(gallery(v.id).filter(i=>i.url===mainUrl).length,1);}
pass('Retry upserts one attachment per size, refreshes alt text and retains cover/order');
assert.deepEqual([...stock],stockBefore);assert.deepEqual(variants.map(v=>v.sku),['PRESERVE-M','PRESERVE-L','PRESERVE-XL','PRESERVE-XXL','PRESERVE-BLUE']);
assert(!calls.some(call=>/inventory|movement|receipt|stockWrite/i.test(call.name)));
pass('Compiled image attachment never changes stock, reservations, SKU identity or another colour');

const report={passed:true,actualCompiledApi:true,coverByFirstUploadVerified:true,allSizesVerified:true,altUpdateVerified:true,duplicateMetadataAvoided:true,existingCoverPreserved:true,
  mainFlagReorderingUnsupported:true,inventoryWrites:0,productionDatabaseWrites:0,productionBlobWrites:0,moduleRelativePath:modulePath,moduleSha256,checks:results,fixtureMetadataRows:images.length,fixturePhotoUpserts:calls.filter(c=>c.name==='photoUpsert').length};
await mkdir('evidence/product-upload',{recursive:true});await writeFile('evidence/product-upload/api-images.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
