(async () => {
  const { PrismaService } = await import('/app/apps/api/dist/prisma/prisma.service.js');
  const { DelhiveryService } = await import('/app/apps/api/dist/delhivery/delhivery.service.js');
  const { DelhiverySyncService, TRACKING_INTERVAL_HOURS } = await import('/app/apps/api/dist/delhivery/delhivery-sync.service.js');
  const db = new PrismaService();
  try {
    await db.$connect(); const worker=new DelhiverySyncService(db,new DelhiveryService());
    const result=await worker.runOnce();
    const leases=await db.$queryRawUnsafe("SELECT COUNT(*) AS total, SUM(CASE WHEN expiresAt>SYSUTCDATETIME() AND expiresAt<=DATEADD(HOUR,6,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS reserved FROM dbo.BackgroundLease WHERE id LIKE 'tracking:%'");
    const audits=await db.orderAuditEvent.groupBy({by:['eventType'],where:{source:'DELHIVERY_TRACKING_SYNC',createdAt:{gte:new Date(Date.now()-3600000)}},_count:true});
    console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:true,enabled:worker.enabled(),intervalHours:TRACKING_INTERVAL_HOURS,failed:result?.failed||0,result,leases,audits}));
  } finally { await db.$disconnect(); }
})().catch(error=>{console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:false,code:error?.code||error?.name||'UNKNOWN'}));process.exitCode=1;});
