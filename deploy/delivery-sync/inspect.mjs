(async () => {
  const { PrismaService } = await import('/app/apps/api/dist/prisma/prisma.service.js');
  const { DelhiveryService } = await import('/app/apps/api/dist/delhivery/delhivery.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    const permissions = await db.$queryRawUnsafe("SELECT permission_name FROM fn_my_permissions('dbo.BackgroundLease','OBJECT') WHERE permission_name IN ('SELECT','INSERT','UPDATE')");
    const eligible = await db.order.findMany({where:{status:'SHIPPED',shipments:{some:{provider:'DELHIVERY',awb:{not:null}}}},
      select:{id:true,payments:{select:{provider:true,status:true,amountPaise:true}},shipments:{orderBy:{createdAt:'desc'},take:1,select:{awb:true,provider:true}}},take:5});
    const carrier = new DelhiveryService(), samples=[];
    for (const order of eligible) {
      try {
        const tracking=await carrier.track(order.shipments[0].awb), s=tracking.raw?.ShipmentData?.[0]?.Shipment;
        samples.push({status:s?.Status?.Status ?? null,statusType:s?.Status?.StatusType ?? null,orderType:s?.OrderType ?? null,
          hasCodAmount:s?.CODAmount != null,hasAwb:!!s?.AWB,awbMatches:String(s?.AWB)===order.shipments[0].awb,
          reverseInTransit:s?.ReverseInTransit ?? null,hasTimestamp:!!s?.Status?.StatusDateTime,
          codAmountMatches:order.payments.some(p=>p.provider==='COD' && Math.round(Number(s?.CODAmount)*100)===p.amountPaise),
          fields:s?Object.keys(s).sort():[]});
      } catch { samples.push({trackingFailed:true}); }
    }
    console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:true,readOnly:true,
      permissions:permissions.map(p=>p.permission_name).sort(),productionTracking:process.env.DELHIVERY_BASE_URL?.replace(/\/$/,'')==='https://track.delhivery.com',
      tokenPresent:!!process.env.DELHIVERY_API_TOKEN,currentlyEnabled:process.env.DELHIVERY_SYNC_ENABLED==='true',samples}));
  } finally { await db.$disconnect(); }
})().catch(error=>{console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:false,code:error?.code||error?.name||'UNKNOWN'}));process.exitCode=1;});
