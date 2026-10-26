import assert from 'node:assert/strict';
export async function run(mode) {
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService(); await db.$connect();
  try {
    if(mode==='schema'){
      await db.$executeRawUnsafe(SCHEMA_PLACEHOLDER);
      console.log('HIDI_SECURITY_LIVE::'+JSON.stringify({passed:true,schemaReady:true}));return;
    }
    if(mode==='cleanup'||mode==='verify'){
      const {AdminSalesService}=await import('file:///app/apps/api/dist/admin/admin-sales.service.js');
      const {resolveAdminSession,revokeAdminSession}=await import('file:///app/apps/api/dist/admin/admin-session.js');
      const {createHash,randomBytes}=await import('node:crypto');
      const staff=await db.adminStaff.findFirst({where:{email:'fashionshidi@gmail.com',active:true}});
      assert(staff?.role==='OWNER');const actor={...staff,authMode:'SUPABASE'};
      if(mode==='cleanup'){
        const service=new AdminSalesService(db),preview=await service.preview('2026-10-10',actor);
        const retained=await db.order.findMany({where:{createdAt:{gte:new Date('2026-10-09T18:30:00Z')}},orderBy:{id:'asc'}});
        const result=await service.remove({before:'2026-10-10',snapshot:preview.snapshot,confirmation:'DELETE BEFORE 2026-10-10'},actor);
        for(const row of retained)assert.deepEqual(await db.order.findUnique({where:{id:row.id}}),row);
        assert.equal(await db.order.count({where:{createdAt:{lt:new Date('2026-10-09T18:30:00Z')}}}),0);
        console.log('HIDI_SECURITY_LIVE::'+JSON.stringify({passed:true,...result,retained:retained.length,retainedRecordsUnchanged:true}));return;
      }
      const rollback=new Error('EXPECTED_ROLLBACK');let checks=0;
      try{await db.$transaction(async tx=>{
        const token='hidi_admin_'+randomBytes(32).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
        await tx.$executeRaw`INSERT INTO [dbo].[AdminLoginSession] ([tokenHash],[staffId],[createdAt],[lastActivityAt]) VALUES (${digest},${staff.id},SYSUTCDATETIME(),SYSUTCDATETIME())`;
        assert.equal((await resolveAdminSession(tx,'Bearer '+token)).email,staff.email);checks++;
        await tx.$executeRaw`UPDATE [dbo].[AdminLoginSession] SET [lastActivityAt]=DATEADD(minute,-61,SYSUTCDATETIME()) WHERE [tokenHash]=${digest}`;
        await assert.rejects(()=>resolveAdminSession(tx,'Bearer '+token));
        await assert.rejects(()=>resolveAdminSession(tx,'Bearer '+token,true));checks+=2;
        await tx.$executeRaw`UPDATE [dbo].[AdminLoginSession] SET [lastActivityAt]=SYSUTCDATETIME() WHERE [tokenHash]=${digest}`;
        await revokeAdminSession(tx,'Bearer '+token);await assert.rejects(()=>resolveAdminSession(tx,'Bearer '+token));checks++;
        const service=new AdminSalesService(new Proxy(tx,{get(target,key){if(key==='$transaction')return fn=>fn(tx);return target[key];}}));
        for(const who of [{...actor,email:'other@example.invalid'},{...actor,role:'SUPPORT'},{...actor,authMode:'LEGACY_KEY'}]){await assert.rejects(()=>service.preview('2026-10-10',who));checks++;}
        // Exercise real SQL archive/FK deletes, then roll the entire probe back.
        const prefix='SECURITY-ROLLBACK-'+Date.now();
        const create=createdAt=>tx.order.create({data:{orderNumber:prefix+createdAt.getTime(),createdAt,subtotalPaise:100,totalPaise:100,customerPhone:'0000000000',shippingAddress:'rollback fixture'}});
        const older=await create(new Date('2000-01-01T18:29:59.999Z')),boundary=await create(new Date('2000-01-01T18:30:00Z'));
        const candidates=await tx.$queryRaw`SELECT TOP (1) [id] FROM [dbo].[Inventory] WHERE [onHand]-[reserved]-[safetyStock]>=2 ORDER BY [id]`;
        assert(candidates.length,'Stock fixture required');
        const inventory=await tx.inventory.findUnique({where:{id:candidates[0].id},include:{variant:true}});
        const item=await tx.orderItem.create({data:{orderId:older.id,productId:inventory.variant.productId,variantId:inventory.variantId,productName:'Rollback fixture',sku:inventory.variant.sku,size:inventory.variant.size,color:inventory.variant.color,quantity:1,unitPricePaise:100,totalPaise:100}});
        await tx.inventory.update({where:{id:inventory.id},data:{reserved:{increment:2}}});
        await tx.inventoryReservation.create({data:{orderId:older.id,variantId:inventory.variantId,quantity:1,status:'ACTIVE',expiresAt:new Date(Date.now()+3600000)}});
        await tx.returnRequest.create({data:{orderId:older.id,orderItemId:item.id,type:'EXCHANGE',reason:'Rollback fixture',quantity:1,requestedVariantId:inventory.variantId,status:'APPROVED',exchangeReservationStatus:'ACTIVE'}});
        const preview=await service.preview('2000-01-02',actor);assert.equal(preview.count,1);
        const removed=await service.remove({before:preview.before,snapshot:preview.snapshot,confirmation:'DELETE BEFORE 2000-01-02'},actor);assert.equal(removed.deleted,1);
        assert.equal(await tx.order.findUnique({where:{id:older.id}}),null);assert(await tx.order.findUnique({where:{id:boundary.id}}));checks+=4;
        const afterInventory=await tx.inventory.findUnique({where:{id:inventory.id}});
        assert.equal(afterInventory.reserved,inventory.reserved);assert.equal(afterInventory.onHand,inventory.onHand);checks+=2;
        throw rollback;
      },{timeout:120000});}catch(error){if(error!==rollback)throw error;}
      console.log('HIDI_SECURITY_LIVE::'+JSON.stringify({passed:true,checks,rollbackOnly:true,idleExpiryVerified:true,revocationVerified:true,cutoffBoundaryVerified:true}));return;
    }
    assert.equal(mode, 'inspect');
    const cutoff = new Date('2026-10-09T18:30:00.000Z');
    const owner = await db.adminStaff.findFirst({where:{email:'fashionshidi@gmail.com'},select:{role:true,active:true}});
    const older = await db.order.groupBy({by:['status'],where:{createdAt:{lt:cutoff}},_count:{_all:true},_sum:{totalPaise:true}});
    const relations = await db.$queryRawUnsafe(`SELECT OBJECT_NAME(f.parent_object_id) AS childTable, COL_NAME(c.parent_object_id,c.parent_column_id) AS childColumn, OBJECT_NAME(f.referenced_object_id) AS parentTable FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id WHERE OBJECT_NAME(f.referenced_object_id) IN ('Order','OrderItem','Payment','ReturnRequest','WalletLedger','WalletHold','RewardAccrual')`);
    console.log('HIDI_SECURITY_LIVE::'+JSON.stringify({passed:true,owner,cutoff:cutoff.toISOString(),older,kept:await db.order.count({where:{createdAt:{gte:cutoff}}}),relations,legacyEnabled:process.env.ADMIN_LEGACY_KEY_ENABLED==='true'}));
  } finally { await db.$disconnect(); }
}
