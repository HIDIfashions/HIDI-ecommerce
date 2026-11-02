import {createHash,randomUUID} from 'node:crypto';
import {SOURCE,EVENTS,owner,number,state,blockers,validateAction,fail} from './policy.mjs';
const eventWhere={source:SOURCE,eventType:{in:EVENTS}};
export async function deletedTestOrderIds(db){
 const rows=await db.$queryRaw`SELECT [orderId] FROM (SELECT [orderId],[eventType],ROW_NUMBER() OVER(PARTITION BY [orderId] ORDER BY [createdAt] DESC,[id] DESC) n FROM [dbo].[OrderAuditEvent] WHERE [source]=${SOURCE} AND [eventType] IN ('TEST_ORDER_VERIFIED','TEST_ORDER_DELETED','TEST_ORDER_RESTORED','TEST_ORDER_UNVERIFIED')) s WHERE n=1 AND [eventType]='TEST_ORDER_DELETED'`;
 return rows.map(r=>r.orderId);
}
export function createStore(db){
 async function read(tx,key){
  const order=await tx.order.findUnique({where:{orderNumber:key},include:{auditEvents:{where:eventWhere,orderBy:[{createdAt:'desc'},{id:'desc'}],take:30}}});if(!order)throw fail(404,'Order not found.');
  const [paymentRecords,stockReservations,movements,shipments,returns,walletEntries,walletHolds,rewards,coupons]=await Promise.all([
   tx.payment.count({where:{orderId:order.id}}),tx.inventoryReservation.count({where:{orderId:order.id,status:{not:'RELEASED'}}}),
   tx.inventoryMovement.count({where:{reference:{in:[order.id,order.orderNumber]}}}),tx.shipment.count({where:{orderId:order.id}}),tx.returnRequest.count({where:{orderId:order.id}}),
   tx.walletLedger.count({where:{orderId:order.id}}),tx.walletHold.count({where:{orderId:order.id}}),tx.rewardAccrual.count({where:{orderId:order.id}}),tx.couponRedemption.count({where:{orderId:order.id}})
  ]);
  const last=order.auditEvents[0],mark=state(last),revision=createHash('sha256').update(JSON.stringify([order.updatedAt,mark.revision,paymentRecords,stockReservations,movements,shipments,returns,walletEntries,walletHolds,rewards,coupons,order.notes,order.status])).digest('hex');
  const dto={number:order.orderNumber,status:order.status,totalPaise:order.totalPaise,createdAt:order.createdAt,verified:mark.verified,deleted:mark.deleted,revision,paymentRecords,stockActivity:stockReservations+movements,shipments,returns,walletActivity:walletEntries+walletHolds+rewards,couponActivity:coupons+(order.discountPaise!==0||order.walletAppliedPaise!==0||order.notes?.includes('hidiOffer')?1:0),history:order.auditEvents.map(e=>({action:e.eventType,at:e.createdAt,actor:e.actorId,details:JSON.parse(e.metadata||'{}')}))};
  return {order,dto:{...dto,blockers:blockers(dto),verificationBlockers:blockers(dto,false)}};
 }
 return {
  async lookup(key,actor){owner(actor);return (await read(db,number(key))).dto;},
  async list(query,actor){owner(actor);const view=query?.view||'tests';if(!['tests','deleted'].includes(view))throw fail(400,'Invalid order view.');const page=Number(query?.page||1);if(!Number.isSafeInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
   const rows=await db.$queryRaw`SELECT o.[orderNumber],s.[eventType] FROM [dbo].[Order] o JOIN (SELECT [orderId],[eventType],ROW_NUMBER() OVER(PARTITION BY [orderId] ORDER BY [createdAt] DESC,[id] DESC) n FROM [dbo].[OrderAuditEvent] WHERE [source]=${SOURCE} AND [eventType] IN ('TEST_ORDER_VERIFIED','TEST_ORDER_DELETED','TEST_ORDER_RESTORED','TEST_ORDER_UNVERIFIED')) s ON s.[orderId]=o.[id] AND s.n=1 WHERE s.[eventType]<>'TEST_ORDER_UNVERIFIED' ORDER BY o.[createdAt] DESC,o.[id]`;
   const filtered=rows.filter(r=>(r.eventType==='TEST_ORDER_DELETED')===(view==='deleted'));return {view,page,total:filtered.length,pageSize:25,orders:await Promise.all(filtered.slice((page-1)*25,page*25).map(async r=>(await read(db,r.orderNumber)).dto))};
  },
  async action(key,input,actor){owner(actor);number(key);
   return db.$transaction(async tx=>{
    // Serializes verification/delete/restore; serializable relation reads prevent stale eligibility.
    await tx.$queryRaw`SELECT [id] FROM [dbo].[Order] WITH (UPDLOCK,HOLDLOCK) WHERE [orderNumber]=${key}`;
    const {order,dto}=await read(tx,key),eventType=validateAction(dto,input),last=order.auditEvents[0];
    const createdAt=new Date(Math.max(Date.now(),last?new Date(last.createdAt).getTime()+1:0));
    await tx.orderAuditEvent.create({data:{id:randomUUID(),orderId:order.id,eventType,actorType:'ADMIN',actorId:actor.id,source:SOURCE,createdAt,metadata:JSON.stringify({reason:input.reason.trim(),actorName:actor.displayName||'Owner',recoverable:true,financialWrites:false,inventoryWrites:false})}});
    return (await read(tx,key)).dto;
   },{isolationLevel:'Serializable',timeout:20000});
  }
 };
}
