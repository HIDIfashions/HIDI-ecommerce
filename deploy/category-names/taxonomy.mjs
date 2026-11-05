import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invariant = (value, code) => { if (!value) throw Object.assign(new Error(code), {code}); };
export function planRows(rows, definitions) {
  return rows.flatMap(row => {
    const group = definitions.find(g => [g.slug,...g.aliases].includes(row.slug));
    return group && row.name !== group.name ? [{id:row.id,slug:row.slug,before:row.name,after:group.name}] : [];
  });
}
async function refs(db) {
  const select={id:true,slug:true,name:true,active:true,position:true};
  return {category:await db.category.findMany({select,orderBy:{id:'asc'}}),collection:await db.collection.findMany({select,orderBy:{id:'asc'}})};
}
async function assignments(db) {
  return {
    products:await db.product.findMany({select:{id:true,categoryId:true,status:true},orderBy:{id:'asc'}}),
    collections:await db.productCollection.findMany({orderBy:[{productId:'asc'},{collectionId:'asc'}]}),
  };
}
export async function rename(db, definitions, payload) {
  return db.$transaction(async tx => {
    const before=await refs(tx), links=await assignments(tx);
    if(payload.mode==='restore'){
      for(const [kind,changes] of Object.entries(payload.plan))for(const row of changes){
        const current=before[kind].find(r=>r.id===row.id);
        invariant(current&&(current.name===row.after||current.name===row.before),'INDEPENDENT_CATEGORY_CHANGE');
        if(current.name===row.after)await tx[kind].updateMany({where:{id:row.id,name:row.after},data:{name:row.before}});
      }
      invariant(hash(links)===hash(await assignments(tx)),'PRODUCT_ASSIGNMENTS_CHANGED');
      return {passed:true,restored:true,readOnly:false,databaseWrites:true,productAssignmentsPreserved:true};
    }
    const plan=Object.fromEntries(Object.entries(before).map(([kind,rows])=>[kind,planRows(rows,definitions)]));
    for(const group of definitions) {
      invariant(before.collection.some(r=>r.slug===group.slug&&r.active),'CANONICAL_COLLECTION_MISSING');
      if(group.slug!=='ananyas-pick')invariant(before.category.some(r=>r.slug===group.slug&&r.active),'CANONICAL_CATEGORY_MISSING');
    }
    const summary={passed:true,referenceHash:hash(before),assignmentHash:hash(links),plan,
      counts:{products:links.products.length,published:links.products.filter(p=>p.status==='ACTIVE').length,productCollections:links.collections.length},
      references:before};
    if(payload.mode==='inspect')return {...summary,readOnly:true,databaseWrites:false};
    invariant(payload.mode==='apply'&&payload.referenceHash===hash(before)&&payload.assignmentHash===hash(links),'TAXONOMY_CHANGED_AFTER_PREVIEW');
    for(const [kind,changes] of Object.entries(plan))for(const row of changes){
      const result=await tx[kind].updateMany({where:{id:row.id,name:row.before},data:{name:row.after}});
      invariant(result.count===1,'CATEGORY_RENAME_CONFLICT');
    }
    const after=await refs(tx), afterLinks=await assignments(tx);
    invariant(hash(links)===hash(afterLinks),'PRODUCT_ASSIGNMENTS_CHANGED');
    for(const kind of ['category','collection']) {
      const expected=before[kind].map(row=>({...row,name:plan[kind].find(p=>p.id===row.id)?.after??row.name}));
      invariant(hash(after[kind])===hash(expected),'UNEXPECTED_REFERENCE_CHANGE');
    }
    return {...summary,readOnly:false,databaseWrites:true,afterReferenceHash:hash(after),references:after,
      productAssignmentsPreserved:true,collectionMembershipsPreserved:true,productRowsWritten:0,changed:plan.category.length+plan.collection.length};
  },{isolationLevel:'Serializable',maxWait:10000,timeout:30000});
}
export async function run(expectedDatabase,payload) {
  invariant(process.env.AZURE_SQL_DATABASE===expectedDatabase,'DATABASE_TARGET_CHANGED');
  const {PrismaService}=await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db=new PrismaService();
  try {
    await db.$connect();
    const identity=await db.$queryRawUnsafe('SELECT DB_NAME() AS databaseName');
    invariant(identity[0]?.databaseName===expectedDatabase,'DATABASE_TARGET_CHANGED');
    const report=await rename(db,payload.definitions,payload);
    console.log('HIDI_SKN_SCHEMA::'+JSON.stringify({...report,databaseHash:createHash('sha256').update(expectedDatabase).digest('hex')}));
  } finally {await db.$disconnect();}
}
