import assert from 'node:assert/strict';
export async function run(mode) {
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService(); await db.$connect();
  try {
    assert.equal(mode, 'inspect');
    const cutoff = new Date('2026-10-09T18:30:00.000Z');
    const owner = await db.adminStaff.findFirst({where:{email:'fashionshidi@gmail.com'},select:{role:true,active:true}});
    const older = await db.order.groupBy({by:['status'],where:{createdAt:{lt:cutoff}},_count:{_all:true},_sum:{totalPaise:true}});
    const relations = await db.$queryRawUnsafe(`SELECT OBJECT_NAME(f.parent_object_id) AS childTable, COL_NAME(c.parent_object_id,c.parent_column_id) AS childColumn, OBJECT_NAME(f.referenced_object_id) AS parentTable FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id WHERE OBJECT_NAME(f.referenced_object_id) IN ('Order','OrderItem','Payment','ReturnRequest','WalletLedger','WalletHold','RewardAccrual')`);
    console.log('HIDI_SECURITY_LIVE::'+JSON.stringify({passed:true,owner,cutoff:cutoff.toISOString(),older,kept:await db.order.count({where:{createdAt:{gte:cutoff}}}),relations,legacyEnabled:process.env.ADMIN_LEGACY_KEY_ENABLED==='true'}));
  } finally { await db.$disconnect(); }
}
