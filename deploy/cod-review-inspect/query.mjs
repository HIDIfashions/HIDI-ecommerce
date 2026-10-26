// Read only. Order references and financial values leave the API only encrypted.
(async()=>{
  const { PrismaService }=await import('/app/apps/api/dist/prisma/prisma.service.js');
  const {randomBytes,createCipheriv,publicEncrypt,constants}=await import('node:crypto');
  const db=new PrismaService();
  try{
    await db.$connect();
    const events=await db.orderAuditEvent.findMany({where:{source:'DELHIVERY_TRACKING_SYNC',eventType:'COD_COLLECTION_REVIEW_REQUIRED'},orderBy:{createdAt:'desc'},take:20,
      select:{createdAt:true,amountPaise:true,metadata:true,order:{select:{orderNumber:true,status:true,totalPaise:true,currency:true,payments:{select:{provider:true,status:true,amountPaise:true}}}}}});
    const records=events.map(event=>{const meta=JSON.parse(event.metadata||'{}');return {orderNumber:event.order.orderNumber,orderStatus:event.order.status,currency:event.order.currency,orderTotalPaise:event.order.totalPaise,expectedCodPaise:event.amountPaise,reportedCodPaise:meta.reportedAmountPaise??null,reason:meta.reason,reviewedAt:event.createdAt,payments:event.order.payments};});
    const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
    const encrypted=Buffer.concat([cipher.update(JSON.stringify({queriedAt:new Date(),records}),'utf8'),cipher.final()]);
    const wrapped=publicEncrypt({key:Buffer.from('LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUFrZ0J5SDNaU3dVS284a0sxN3FhYwpIdXRGRlNtZ0VFdUZRUWpjeWNmWnZlTTZDOHg3aVBNUkx6YU41aFE3TzBHUUgyNDlMbGg5bk9ZdVhkUTNjV0NvCmxDbTYrZnVXU3I5RWVOL21WMU1rNlErU0NvMjNld3o3MlVCU2Q2aWIxejdQQzhsTUtpQWkvQTk0SDBCZ0hXL2sKUHRqTHoyRXFSalo2SVJqUWtsbG5TUUoxQzlJNDMyVWt3QzQza3RXTWNxREhHVWJMdS9nWTlVdXVvV3RsL2UxaQpraTlnRmZiTWVTTEZFOEVMb1h2aVVLTGUybEhPb3NOWWlSclFVa2diWjBNZ1I1b0NjWHk3SUdVbzFHVTNvM1pRClJkR0w3TXlMOHVTT2RLT0ZLR2x3MmZxclo5bTAzRGNQdmhhRjFGbHlJTUxTbm1CaisrNE1NU1JJL2JNMHZJdGkKZFFJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==','base64').toString(),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);
    console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:true,encrypted:true,key:wrapped.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}));
  }finally{await db.$disconnect();}
})().catch(()=>{console.log('HIDI_DELIVERY_RESULT::'+JSON.stringify({passed:false,code:'READ_ONLY_QUERY_FAILED'}));process.exitCode=1;});
