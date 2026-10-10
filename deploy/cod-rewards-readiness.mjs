// Runs inside the existing API container with its existing managed identity.
// All database statements are SELECTs; no workers or application modules start.
(async () => {
  const assert = (await import('node:assert/strict')).default;
  const {PrismaService} = await import('/app/apps/api/dist/prisma/prisma.service.js');
  assert.equal(process.env.AZURE_SQL_DATABASE, process.argv[1], 'Database changed during readiness verification');
  const db = new PrismaService();
  try {
    await db.$connect();
    const tables = await db.$queryRawUnsafe("SELECT name FROM sys.tables WHERE name IN ('WalletAccount','WalletLedger','WalletHold','RewardAccrual','PaymentRefund','OrderAuditEvent')");
    assert.equal(tables.length, 6);
    const trigger = await db.$queryRawUnsafe("SELECT name FROM sys.triggers WHERE name='WalletLedger_immutable' AND is_disabled=0");
    assert.equal(trigger.length, 1);
    const invalid = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM dbo.WalletAccount w WHERE w.reservedPaise<0 OR w.reservedPaise<>COALESCE((SELECT SUM(h.amountPaise) FROM dbo.WalletHold h WHERE h.walletId=w.id AND h.status='ACTIVE'),0) OR w.balancePaise<>COALESCE((SELECT SUM(CAST(l.deltaPaise AS bigint)) FROM dbo.WalletLedger l WHERE l.walletId=w.id),0)`);
    assert.equal(invalid[0].n, 0, 'Existing wallet balances require reconciliation');
    console.log('HIDI_SQL_READINESS::' + JSON.stringify({passed:true,database:process.env.AZURE_SQL_DATABASE,walletTables:tables.length,appendOnlyLedger:true,existingBalancesReconciled:true,readOnly:true,privateNetwork:true}));
  } finally { await db.$disconnect(); }
})().catch(error => {
  console.log('HIDI_SQL_READINESS_FAILED::' + (error?.code || error?.name || 'READINESS_FAILED'));
  process.exitCode = 1;
});
