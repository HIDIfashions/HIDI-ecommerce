import 'reflect-metadata';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaService} from '../../dist/prisma/prisma.service.js';
const db=new PrismaService();const marker=`migration-${randomUUID()}`;const rollback=new Error('ROLLBACK_VALIDATION');
try {
 await db.$connect();
 const products=await db.product.findMany({where:{status:'PUBLISHED'},include:{variants:{include:{inventory:true}},images:true}});
 assert(products.length>0,'Imported published catalogue must be present');
 try {
  await db.$transaction(async tx=>{
   // SQL Server must preserve PostgreSQL's multiple NULL values in unique columns.
   await tx.user.create({data:{id:marker+'-a'}});
   await tx.user.create({data:{id:marker+'-b'}});
   const owner=await tx.user.create({data:{id:marker+'-c',email:marker+'@example.invalid'}});
   assert.equal((await tx.user.findUnique({where:{email:(marker+'@example.invalid').toUpperCase()}}))?.id,owner.id);
   assert.equal(await tx.user.findUnique({where:{id:owner.id.toUpperCase()}}),null,'Identifiers remain case-sensitive');
   const wallet=await tx.walletAccount.create({data:{userId:owner.id,authSubject:marker,balancePaise:500}});
   await tx.walletLedger.create({data:{walletId:wallet.id,kind:'EARN',deltaPaise:500,eventKey:marker}});
   const locked=await tx.$queryRaw`SELECT "id", "balancePaise" FROM "WalletAccount" WITH (UPDLOCK,HOLDLOCK,ROWLOCK) WHERE "id"=${wallet.id}`;
   assert.equal(locked[0].balancePaise,500);
   throw rollback;
  },{isolationLevel:'Serializable',timeout:30000});
 }catch(e){if(e!==rollback)throw e;}
 assert.equal(await db.user.count({where:{id:{startsWith:marker}}}),0,'Synthetic validation rows must roll back');
 console.log(JSON.stringify({passed:true,publishedProducts:products.length,checks:['Prisma catalogue relations','nullable unique indexes','case-insensitive emails','case-sensitive identity IDs','wallet insert and SQL row lock','transaction rollback']}));
}catch(e){console.error(JSON.stringify({failed:true,code:e.code??'ASSERTION',message:e.code?'Prisma integration check failed':e.message}));process.exitCode=1;}
finally{await db.$disconnect();}
