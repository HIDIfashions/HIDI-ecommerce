// Disposable loopback SQL only. No production credentials or writes.
import assert from 'node:assert/strict';import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {randomUUID} from 'node:crypto';import {resolve} from 'node:path';
assert.equal(process.env.TEST_ORDER_SQL_HOST,'127.0.0.1');assert(process.env.TEST_ORDER_SQL_PASSWORD);
const root=resolve(process.env.HIDI_CANDIDATE_API),require=createRequire(root+'/apps/api/package.json'),sql=require('mssql'),{PrismaMssql}=require('@prisma/adapter-mssql');
const {PrismaClient}=await import(pathToFileURL(root+'/apps/api/dist/generated/prisma/client.js'));
const {createStore,deletedTestOrderIds}=await import(pathToFileURL(root+'/apps/api/dist/admin/test-order-store.mjs'));
await import(pathToFileURL(root+'/apps/api/dist/admin/test-orders.module.mjs'));
const {AdminService}=await import(pathToFileURL(root+'/apps/api/dist/admin/admin.service.js'));
const {AdminDashboardController}=await import(pathToFileURL(root+'/apps/api/dist/admin/admin-dashboard.controller.js'));
const config={server:'127.0.0.1',port:1433,user:'sa',password:process.env.TEST_ORDER_SQL_PASSWORD,options:{encrypt:true,trustServerCertificate:true},pool:{max:10},requestTimeout:30000};
const database='test_orders_'+randomUUID().replaceAll('-','').slice(0,12);let pool,db,checks=0;
for(let i=0;i<30;i++){try{pool=await new sql.ConnectionPool(config).connect();break;}catch{await new Promise(r=>setTimeout(r,1000));}}assert(pool);
await pool.request().batch(`CREATE DATABASE [${database}] COLLATE Latin1_General_100_BIN2; ALTER DATABASE [${database}] SET READ_COMMITTED_SNAPSHOT ON;`);await pool.close();
try{
 pool=await new sql.ConnectionPool({...config,database}).connect();const migrationRoot=new URL('../../apps/api/prisma/migrations-sqlserver/',import.meta.url);for(const dir of (await readdir(migrationRoot,{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name).sort()){let s;try{s=await readFile(new URL(dir+'/migration.sql',migrationRoot),'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}await pool.request().batch(s);}
 db=new PrismaClient({adapter:new PrismaMssql({...config,database},{schema:'dbo'})});await db.$connect();const store=createStore(db),actor={id:'ci-owner',displayName:'CI owner',role:'OWNER',authMode:'SUPABASE'},staff={...actor,role:'SUPPORT'};
 const make=async(n,extra={})=>db.order.create({data:{orderNumber:n,status:'CANCELLED',customerPhone:'9000000000',shippingAddress:'{}',subtotalPaise:149900,totalPaise:149900,...extra}});
 const order=await make('TEST-CLEAN'),real=await make('CUSTOMER-REAL',{status:'CONFIRMED'});const original=await db.order.findMany({orderBy:{id:'asc'}});
 const inspect=()=>store.lookup(order.orderNumber,actor);const action=async(kind,target=order.orderNumber,patch={})=>{const o=await store.lookup(target,actor);return store.action(target,{action:kind,confirmation:target,expectedRevision:o.revision,reason:'Disposable CI test-order check',attestTest:true,...patch},actor);};
 await assert.rejects(()=>store.lookup(order.orderNumber,staff));await assert.rejects(()=>store.list({},staff));await assert.rejects(()=>action('delete'));await assert.rejects(()=>action('verify',real.orderNumber));checks+=4;
 await action('verify');const before=await inspect();await assert.rejects(()=>action('delete',order.orderNumber,{confirmation:'wrong'}));await assert.rejects(()=>action('delete',order.orderNumber,{expectedRevision:'stale'}));checks+=2;
 // Concurrent duplicate requests serialize on the Order row; only one audit append succeeds.
 const request={action:'delete',confirmation:order.orderNumber,expectedRevision:before.revision,reason:'Disposable concurrent test-order check'};
 const race=await Promise.allSettled([store.action(order.orderNumber,request,actor),store.action(order.orderNumber,request,actor)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected').length,1);checks++;
 assert((await deletedTestOrderIds(db)).includes(order.id));const admin=new AdminService(db,{}),dashboard=new AdminDashboardController(db);assert(!(await admin.listOrders()).orders.some(o=>o.id===order.id));assert(!(await dashboard.queue('orders','ALL',undefined,'1')).rows.some(o=>o.id===order.id));assert(!(await dashboard.search(actor,'TEST-CLEAN')).results.some(o=>o.id===order.id));checks+=3;
 await action('restore');assert((await admin.listOrders()).orders.some(o=>o.id===order.id));assert.equal((await inspect()).status,'CANCELLED');await action('unverify');assert.equal((await inspect()).verified,false);assert.equal((await store.list({},actor)).orders.length,0);checks+=4;
 // Eligibility is read again at commit, including relation changes that don't update Order.updatedAt.
 await action('verify');const stale=await inspect();await db.payment.create({data:{orderId:order.id,provider:'FIXTURE',status:'FAILED',amountPaise:149900}});await assert.rejects(()=>store.action(order.orderNumber,{...request,expectedRevision:stale.revision},actor));await assert.rejects(()=>action('delete'));checks+=2;
 const product=await db.product.create({data:{name:'CI fixture',slug:'test-delete-fixture'}}),variant=await db.productVariant.create({data:{productId:product.id,sku:'CI-TEST-DELETE',size:'M',color:'Cream',pricePaise:149900,mrpPaise:149900,inventory:{create:{onHand:10,reserved:1}}}});
 const held=await make('TEST-HELD');await db.inventoryReservation.create({data:{orderId:held.id,variantId:variant.id,quantity:1,status:'ACTIVE',expiresAt:new Date(Date.now()+60000)}});await assert.rejects(()=>action('verify',held.orderNumber));checks++;
 await db.inventoryReservation.updateMany({where:{orderId:held.id},data:{status:'CONSUMED'}});await assert.rejects(()=>action('verify',held.orderNumber));checks++;
 const inventoryBefore=await db.inventory.findMany(),paymentsBefore=await db.payment.findMany();await assert.rejects(()=>action('delete'));assert.deepEqual(await db.inventory.findMany(),inventoryBefore);assert.deepEqual(await db.payment.findMany(),paymentsBefore);checks+=3;
 assert.deepEqual(await db.order.findMany({where:{id:{in:original.map(o=>o.id)}},orderBy:{id:'asc'}}),original);checks++;
 // Audit failures must roll back the operation, never hide an unaudited order.
 const rollback=await make('TEST-ROLLBACK');const wrapped={$transaction:fn=>db.$transaction(tx=>fn(new Proxy(tx,{get:(target,key)=>key==='orderAuditEvent'?{...target.orderAuditEvent,create:async()=>{throw Error('audit unavailable');}}:target[key]})),{isolationLevel:'Serializable'})};
 const roll=await store.lookup(rollback.orderNumber,actor);await assert.rejects(()=>createStore(wrapped).action(rollback.orderNumber,{...request,action:'verify',confirmation:roll.number,expectedRevision:roll.revision,attestTest:true},actor));assert.equal((await store.lookup(roll.number,actor)).verified,false);checks+=2;
 await (await import('./browser-sql.mjs')).browserSql(db,make,actor);
 assert.deepEqual(await db.inventory.findMany(),inventoryBefore);assert.deepEqual(await db.payment.findMany(),paymentsBefore);assert.deepEqual(await db.order.findUnique({where:{id:real.id}}),real);
 await mkdir('evidence/test-order-delete',{recursive:true});await writeFile('evidence/test-order-delete/sql.json',JSON.stringify({passed:true,checks,actualCandidate:true,concurrentDuplicateProtected:true,relationChangeProtected:true,auditFailureRollsBack:true,originalOrdersUnchanged:true,inventoryAndPaymentsUnchanged:true,productionWrites:0},null,2));console.log('PASS SQL test-order regression: '+checks);
}finally{await db?.$disconnect();await pool?.close();const cleanup=await new sql.ConnectionPool(config).connect();await cleanup.request().batch(`ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}];`);await cleanup.close();}
