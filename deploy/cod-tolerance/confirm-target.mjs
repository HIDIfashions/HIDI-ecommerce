(async()=>{
  const {createHash}=await import('node:crypto');
  const {PrismaService}=await import('/app/apps/api/dist/prisma/prisma.service.js');
  const {DelhiveryService}=await import('/app/apps/api/dist/delhivery/delhivery.service.js');
  const {DelhiverySyncService,COD_AMOUNT_TOLERANCE_PAISE,TRACKING_INTERVAL_HOURS}=await import('/app/apps/api/dist/delhivery/delhivery-sync.service.js');
  const {deliveryEvidence}=await import('/app/apps/api/dist/delhivery/tracking-evidence.js');
  const assert=(v)=>{if(!v)throw Error('VERIFICATION_FAILED')};const db=new PrismaService();
  try{
    await db.$connect();const carrier=new DelhiveryService(),worker=new DelhiverySyncService(db,carrier);
    assert(worker.enabled()&&COD_AMOUNT_TOLERANCE_PAISE===100&&TRACKING_INTERVAL_HOURS===6);
    const reviews=await db.orderAuditEvent.findMany({where:{source:'DELHIVERY_TRACKING_SYNC',eventType:'COD_COLLECTION_REVIEW_REQUIRED'},select:{order:{include:{payments:true,shipments:{orderBy:[{createdAt:'desc'},{id:'desc'}],take:1}}}}});
    const order=reviews.map(r=>r.order).find(o=>createHash('sha256').update(o.orderNumber).digest('hex')==='937f2f3ecf578098598a924f492ca707ec72f2cbd0499bfb251602deb2c813c4');
    assert(order?.status==='DELIVERED');const shipment=order.shipments[0];assert(shipment?.awb);
    const proof=deliveryEvidence((await carrier.track(shipment.awb)).raw,shipment.awb);assert(proof);
    await worker.reconcileCod({id:shipment.id,orderId:order.id,awb:shipment.awb},proof);
    const payment=await db.payment.findFirst({where:{orderId:order.id,provider:'COD',status:'CAPTURED'}});assert(payment);
    const event=await db.orderAuditEvent.findUnique({where:{eventKey:`cod-payment:${payment.id}:collected`}});assert(event);
    const meta=JSON.parse(event.metadata);assert(meta.tolerancePaise===100&&Math.abs(meta.differencePaise)<=100&&meta.expectedAmountPaise===payment.amountPaise&&meta.bankRemittanceConfirmed===false);
    console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:true,enabled:worker.enabled(),intervalHours:TRACKING_INTERVAL_HOURS,tolerancePaise:COD_AMOUNT_TOLERANCE_PAISE,targetConfirmed:true,collectionAuditVerified:true,orderAmountPreserved:true}));
  }finally{await db.$disconnect();}
})().catch(()=>{console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:false,code:'TARGET_CONFIRMATION_FAILED'}));process.exitCode=1;});
