export const SOURCE='hidi-test-order-cleanup-v1';
export const EVENTS=['TEST_ORDER_VERIFIED','TEST_ORDER_DELETED','TEST_ORDER_RESTORED','TEST_ORDER_UNVERIFIED'];
export const fail=(status,message)=>Object.assign(new Error(message),{status});
export function owner(actor){if(actor?.role!=='OWNER'||actor.authMode!=='SUPABASE'||!actor.id)throw fail(403,'Only a signed-in owner can manage test orders.');}
export function number(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,191}$/.test(value))throw fail(400,'Enter the exact order number.');return value;}
export function state(event){return {verified:!!event&&event.eventType!=='TEST_ORDER_UNVERIFIED',deleted:event?.eventType==='TEST_ORDER_DELETED',revision:event?.id||'unmarked'};}
export function blockers(order,marked=true){const out=[];
 if(marked&&!order.verified)out.push('The owner has not verified this as a test order.');
 if(order.status!=='CANCELLED')out.push('The order must already be cancelled.');
 if(order.paymentRecords!==0)out.push('Payment records are linked to this order.');
 if(order.stockActivity!==0)out.push('Stock is reserved or an inventory movement is linked to this order.');
 if(order.shipments!==0)out.push('A shipment is linked to this order.');
 if(order.returns!==0||order.walletActivity!==0||order.couponActivity!==0)out.push('Return, reward or coupon records are linked to this order.');
 if(order.deleted)out.push('This test order is already deleted.');
 return out;
}
export function validateAction(order,input){
 if(!input||Object.keys(input).some(k=>!['action','expectedRevision','confirmation','reason','attestTest'].includes(k)))throw fail(400,'Invalid test-order request.');
 if(!['verify','delete','restore','unverify'].includes(input.action))throw fail(400,'Choose a supported action.');
 if(input.expectedRevision!==order.revision)throw fail(409,'This order changed after review. Open it again.');
 if(input.confirmation!==order.number)throw fail(400,'Type the full order number exactly.');
 if(typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.trim().length>500)throw fail(400,'Add a reason between 10 and 500 characters.');
 if(input.action==='restore'){if(!order.verified||!order.deleted)throw fail(409,'Only a deleted test order can be restored.');return 'TEST_ORDER_RESTORED';}
 if(input.action==='unverify'){if(!order.verified||order.deleted)throw fail(409,'Restore the order before removing its test marker.');return 'TEST_ORDER_UNVERIFIED';}
 const reasons=blockers(order,input.action==='delete');if(reasons.length)throw fail(409,reasons.join(' '));
 if(input.action==='verify'){if(order.verified)throw fail(409,'This order is already verified.');if(input.attestTest!==true)throw fail(400,'Confirm that you created this order only for testing.');return 'TEST_ORDER_VERIFIED';}
 return 'TEST_ORDER_DELETED';
}
