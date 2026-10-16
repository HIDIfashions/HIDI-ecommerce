// Uses only disposable CI SQL Server, never the Azure database or payment network.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {PrismaMssql} from '../apps/api/node_modules/@prisma/adapter-mssql/dist/index.mjs';
import {PrismaClient} from '../apps/api/dist/generated/prisma/client.js';
import {WalletService} from '../apps/api/dist/wallet/wallet.service.js';
import {CheckoutService} from '../apps/api/dist/checkout/checkout.service.js';
import {PaymentsService} from '../apps/api/dist/payments/payments.service.js';
import {AdminService} from '../apps/api/dist/admin/admin.service.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url)),sql=require('mssql');
assert.equal(process.env.COD_TEST_SQL_HOST,'127.0.0.1');
const config={server:'127.0.0.1',port:1433,user:'sa',password:process.env.COD_TEST_SQL_PASSWORD,options:{encrypt:true,trustServerCertificate:true},pool:{max:10}};
let pool;for(let i=0;i<30;i++){try{pool=await new sql.ConnectionPool(config).connect();break;}catch{await new Promise(r=>setTimeout(r,2000));}}
assert(pool);await pool.request().batch('CREATE DATABASE cod_rewards_regression COLLATE Latin1_General_100_BIN2; ALTER DATABASE cod_rewards_regression SET READ_COMMITTED_SNAPSHOT ON;');await pool.close();
pool=await new sql.ConnectionPool({...config,database:'cod_rewards_regression'}).connect();
const migrations=await readdir(new URL('../apps/api/prisma/migrations-sqlserver/',import.meta.url),{withFileTypes:true});
for(const folder of migrations.filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort()){
 try{await pool.request().batch(await readFile(new URL('../apps/api/prisma/migrations-sqlserver/'+folder+'/migration.sql',import.meta.url),'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
}
await pool.close();
const db=new PrismaClient({adapter:new PrismaMssql({...config,database:'cod_rewards_regression'},{schema:'dbo'})});await db.$connect();
process.env.HIDI_WALLET_ENABLED='true';process.env.HIDI_COD_ENABLED='true';
const wallet=new WalletService(db),gateway={createOrder:async q=>({id:'order_'+randomUUID(),amount:q.amountPaise,currency:'INR'}),publicKey:()=> 'rzp_test_fixture'};
const carrier={checkServiceability:async()=>({cod:true})},checkout=new CheckoutService(db,gateway,wallet,carrier),payments=new PaymentsService(db,gateway,wallet),admin=new AdminService(db,carrier);
const actor={id:'fixture-admin',role:'OWNER',displayName:'CI admin'},auth={id:'ci-subject',email:'ci@example.test',phone:null,phoneVerified:false,metadata:{}};
try {
 const enroll=await Promise.all([wallet.ensureWallet(auth),wallet.ensureWallet(auth)]);assert.equal(enroll[0].id,enroll[1].id);
 const account=enroll[0];await db.walletLedger.create({data:{walletId:account.id,kind:'EARN',deltaPaise:300000,eventKey:'fixture-credit'}});await db.walletAccount.update({where:{id:account.id},data:{balancePaise:300000}});
 const product=await db.product.create({data:{slug:'ci-product',name:'CI only',description:'Fixture',status:'ACTIVE'}});
 const variant=await db.productVariant.create({data:{productId:product.id,sku:'CI-M',size:'M',color:'Ivory',pricePaise:100000,mrpPaise:100000,inventory:{create:{onHand:20}}}});
 async function input(walletPaise=0,paymentMethod='RAZORPAY'){
  const sessionId=randomUUID(),checkoutToken=randomUUID();await db.cart.create({data:{sessionId,items:{create:{productId:product.id,variantId:variant.id,quantity:1,unitPricePaise:100000}}}});
  return {sessionId,checkoutToken,walletPaise,paymentMethod,customerEmail:'ci@example.test',customerPhone:'9000000000',expectedTotalPaise:100000,expectedPayableTotalPaise:109900,shippingAddress:{firstName:'CI',phone:'9000000000',line1:'Fixture',city:'Hyderabad',state:'Telangana',postalCode:'500001'}};
 }
 const fullInput=await input(109900),full=await checkout.prepare(fullInput,auth);assert.equal(full.provider,'WALLET');assert.equal(full.captured,true);assert.equal((await checkout.prepare(fullInput,auth)).orderNumber,full.orderNumber);
 assert.equal((await db.walletAccount.findUnique({where:{id:account.id}})).balancePaise,190100);
 const mixed=await checkout.prepare(await input(10000),auth),payment=await db.payment.findFirst({where:{orderId:mixed.hidiOrderId}});
 const captures=await Promise.all([payments.captureOrder(payment.id,'pay_ci','upi'),payments.captureOrder(payment.id,'pay_ci','upi')]);assert(captures.every(x=>x.captured));
 assert.equal(await db.walletLedger.count({where:{orderId:mixed.hidiOrderId,kind:'REDEEM'}}),1);
 const capturedBalance=(await db.walletAccount.findUnique({where:{id:account.id}})).balancePaise;assert.equal(capturedBalance,180100);
 const codInput=await input(0,'COD'),cod=await checkout.prepare(codInput,auth);assert.equal(cod.captured,false);assert.equal(cod.confirmed,true);assert.equal((await checkout.prepare(codInput,auth)).orderNumber,cod.orderNumber);
 assert.equal((await wallet.reconcileOrder(cod.hidiOrderId)).status,'PENDING');
 await db.shipment.create({data:{orderId:cod.hidiOrderId,provider:'FIXTURE',awb:'CI-AWB',trackingUrl:'https://example.test/fixture',status:'SHIPPED'}});await db.order.update({where:{id:cod.hidiOrderId},data:{status:'SHIPPED'}});
 await assert.rejects(admin.updateStatus(cod.orderNumber,'DELIVERED',actor),/COD amount/);assert.equal((await db.payment.findFirst({where:{orderId:cod.hidiOrderId}})).status,'CREATED');
 await admin.updateStatus(cod.orderNumber,'DELIVERED',actor,true);assert.equal((await db.payment.findFirst({where:{orderId:cod.hidiOrderId}})).status,'CAPTURED');
 assert.equal((await wallet.reconcileOrder(cod.hidiOrderId)).status,'PENDING');
 const createdAt=new Date(Date.now()-10*86400000),deliveredAt=new Date(Date.now()-8*86400000);
 await db.order.update({where:{id:cod.hidiOrderId},data:{createdAt}});await db.shipment.updateMany({where:{orderId:cod.hidiOrderId},data:{deliveredAt}});
 await Promise.all([wallet.reconcileOrder(cod.hidiOrderId),wallet.reconcileOrder(cod.hidiOrderId)]);assert.equal(await db.walletLedger.count({where:{orderId:cod.hidiOrderId,kind:'EARN'}}),1);
 await db.order.update({where:{id:cod.hidiOrderId},data:{status:'RETURNED'}});await Promise.all([wallet.reconcileOrder(cod.hidiOrderId),wallet.reconcileOrder(cod.hidiOrderId)]);assert.equal(await db.walletLedger.count({where:{orderId:cod.hidiOrderId,kind:'REVERSE_EARN'}}),1);
 assert.equal((await db.walletAccount.findUnique({where:{id:account.id}})).balancePaise,capturedBalance);
 const insufficient=await input(109900);await db.walletAccount.update({where:{id:account.id},data:{balancePaise:100}});await assert.rejects(checkout.prepare(insufficient,auth));assert.equal(await db.order.count({where:{checkoutToken:insufficient.checkoutToken}}),0);
 console.log('PASS: real SQL enrollment concurrency, full-wallet/split capture, COD collection, seven-day maturation, duplicate/restart safety, return reversal and rollback');
} finally {await db.$disconnect();}
