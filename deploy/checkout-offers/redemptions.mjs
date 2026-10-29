import {ConflictException} from '@nestjs/common';
export const RULE_SET='hidi-welcome-dress-20261029';
export const RULES=Object.freeze({welcomeMinimumPaise:149900,welcomeDiscountPaise:20000,dressMinimumPaise:299900,dressPricePaise:100,dressLimit:25});
const PAID=['CAPTURED','PARTIALLY_REFUNDED','REFUNDED'];
export function verifiedPhone(auth){
 if(auth?.phoneVerified!==true||typeof auth.phone!=='string')return null;
 const digits=auth.phone.replace(/\D/g,''),local=digits.length===12&&digits.startsWith('91')?digits.slice(2):digits;
 return /^[6-9]\d{9}$/.test(local)?'+91'+local:null;
}
const snapshot=order=>{try{return JSON.parse(order.notes||'null')?.hidiOffer;}catch{return null;}};
// Pending orders hold a place until the existing cancellation transaction releases
// them. Consumed stock records confirmed redemptions, even after return/refund.
// A late payment in PAYMENT_REVIEW never resurrects an expired offer reservation.
const holdsPlace=order=>order.status==='PENDING_PAYMENT'||order.reservations?.some(r=>r.status==='CONSUMED');
export function summarizeUsage(orders,phone,userId=null){
 let welcomeUsed=false,dressUsed=false,dressReserved=0,dressRedeemed=0;
 for(const order of orders){
  const raw=String(order.customerPhone||'').replace(/\D/g,'');
  const same=!!phone&&(raw===phone.slice(1)||raw===phone.slice(3))||!!userId&&order.userId===userId;
  if(same&&(holdsPlace(order)||order.payments?.some(p=>PAID.includes(p.status))))welcomeUsed=true;
  const offer=snapshot(order);
  if(offer?.ruleSet!==RULE_SET||offer.choice?.kind!=='DRESS1'||!holdsPlace(order))continue;
  if(order.status==='PENDING_PAYMENT')dressReserved++;else dressRedeemed++;
  if(same)dressUsed=true;
 }
 return {welcomeUsed,dressUsed,dressReserved,dressRedeemed,dressRemaining:Math.max(0,RULES.dressLimit-dressReserved-dressRedeemed)};
}
export async function usage(db,phone,userId=null){
 const digits=phone?.slice(1),local=phone?.slice(3);
 const orders=await db.order.findMany({where:{OR:[{notes:{contains:RULE_SET}},...(phone?[{customerPhone:{in:[phone,digits,local]}},{user:{phone:{in:[phone,digits,local]}}}]:[]),...(userId?[{userId}]:[])]},select:{userId:true,customerPhone:true,status:true,notes:true,user:{select:{phone:true}},payments:{select:{status:true}},reservations:{select:{status:true}}}});
 return summarizeUsage(orders.map(o=>({...o,customerPhone:phone&&[phone,digits,local].includes(o.user?.phone)?phone:o.customerPhone})),phone,userId);
}
export function assertEligibility(choice,config,stats){
 if(choice.kind==='WELCOME200'&&(!config.welcomeEnabled||stats.welcomeUsed))throw new ConflictException('The welcome offer is for your first order only. Another order may already be pending.');
 if(choice.kind==='DRESS1'&&(!config.dressEnabled||stats.dressUsed||stats.dressRemaining<1))throw new ConflictException(stats.dressUsed?'You have already used or reserved the ₹1 dress offer.':'All 25 ₹1 dress places are used or currently reserved.');
}
export async function reserveEligibility(tx,promotion){
 if(promotion.choice.kind==='NONE')return;
 // Transaction-owned SQL Server lock spans eligibility, order creation and stock
 // reservation on every API replica. Policy edits never reset the lifetime cap.
 const rows=await tx.$queryRaw`DECLARE @result int; EXEC @result = sys.sp_getapplock @Resource = 'hidi-welcome-dress-20261029', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 5000; SELECT @result AS result;`;
 if(!rows.length||Number(rows[0].result)<0||!Number.isInteger(Number(rows[0].result)))throw new ConflictException('Another offer checkout is being confirmed. Please retry.');
 assertEligibility(promotion.choice,promotion.config,await usage(tx,promotion.phone,promotion.userId));
}
