// @ts-nocheck -- shared promotion engine; tested against the compiled checkout service.
import {BadRequestException,ConflictException,UnauthorizedException} from '@nestjs/common';
import {shippingQuote} from './shipping-policy.js';
import {RULE_SET,RULES,verifiedPhone,usage,assertEligibility,reserveEligibility} from './redemptions.js';
export const normalizedChoice=input=>{
 const value=input??{kind:'NONE'};
 if(!value||typeof value!=='object'||Array.isArray(value)||!['NONE','WELCOME200','DRESS1'].includes(value.kind))throw new BadRequestException('Choose one supported HIDI offer');
 if(value.kind==='NONE')return {kind:'NONE'};
 if(!Number.isSafeInteger(value.version)||value.version<1)throw new BadRequestException('Refresh the offer before checkout');
 if(value.kind==='DRESS1'&&(typeof value.variantId!=='string'||!value.variantId||value.variantId.length>64))throw new BadRequestException('Select your ₹1 dress and size');
 return {kind:value.kind,version:value.version,...(value.kind==='DRESS1'?{variantId:value.variantId}:{})};
};
export function assertRetry(existing,input){
 let saved;try{saved=JSON.parse(existing.notes||'null')?.hidiOffer?.choice;}catch{}
 if(JSON.stringify(saved||{kind:'NONE'})!==JSON.stringify(normalizedChoice(input.offer)))throw new ConflictException('Offer selection changed. Start a new checkout attempt.');
 if(input.expectedPayableTotalPaise!==undefined&&input.expectedPayableTotalPaise!==existing.totalPaise)throw new ConflictException('Checkout amount changed. Start a new checkout attempt.');
}
export async function campaign(auth){
 try{
  const authorization=auth?.offerAuthorization;
  const response=await fetch('https://hidiindia.com/api/hidi/offers/checkout-policy',{headers:typeof authorization==='string'?{Authorization:authorization}:{},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('Policy unavailable');
  const policy=await response.json();
  if(policy?.available===false)return null;
  if(policy?.available!==true||policy.ruleSet!==RULE_SET||!Number.isSafeInteger(policy.version)||policy.version<1||!Array.isArray(policy.eligibleProductIds)||policy.eligibleProductIds.length>200||policy.eligibleProductIds.some(id=>typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(id))||Object.entries(RULES).some(([key,value])=>policy.rules?.[key]!==value))throw Error('Invalid policy');
  return {version:policy.version,config:{checkoutEnabled:true,welcomeEnabled:policy.welcomeEnabled===true,dressEnabled:policy.dressEnabled===true,eligibleProductIds:policy.eligibleProductIds}};
 }catch{throw new ConflictException('Offers could not be confirmed. Retry or continue without an offer.');}
}
export async function loadChoice(input,auth,context={}){
 const choice=normalizedChoice(input);
 if(choice.kind==='NONE')return {choice,config:null};
 const phone=verifiedPhone(auth);
 if(!phone)throw new UnauthorizedException('Sign in with your verified mobile number to use an offer');
 if((context.walletPaise||0)>0)throw new BadRequestException('Choose either this offer or reward redemption. They cannot be combined.');
 const published=await campaign(auth);
 if(!published||published.version!==choice.version||!published.config[choice.kind==='WELCOME200'?'welcomeEnabled':'dressEnabled'])throw new ConflictException('This offer is no longer available. Refresh checkout.');
 return {choice,config:published.config,phone,userId:context.userId||null};
}
const stock=v=>Math.max(0,(v.inventory?.onHand||0)-(v.inventory?.reserved||0)-(v.inventory?.safetyStock||0));
export function qualifies(v,config){return !!v&&v.active===true&&v.product?.status==='ACTIVE'&&config?.eligibleProductIds?.includes(v.productId)&&Number.isSafeInteger(v.pricePaise)&&v.pricePaise>=100&&stock(v)>0;}
export function amounts(subtotal,choice,gift=null){
 if(!Number.isSafeInteger(subtotal)||subtotal<=0||subtotal>2147483647)throw new BadRequestException('Invalid order total');
 let gross=subtotal,discount=0;
 if(choice.kind==='WELCOME200'){
  if(subtotal<RULES.welcomeMinimumPaise)throw new ConflictException('Shop ₹1,499 of regular items to use the ₹200 welcome offer');
  discount=RULES.welcomeDiscountPaise;
 }
 if(choice.kind==='DRESS1'){
  if(subtotal<RULES.dressMinimumPaise)throw new ConflictException('Shop ₹2,999 of regular items to unlock the ₹1 dress');
  if(!gift||!Number.isSafeInteger(gift.pricePaise)||gift.pricePaise<100)throw new ConflictException('Select an available offer dress and size');
  gross+=gift.pricePaise;discount=gift.pricePaise-100;
 }
 const shipping=shippingQuote(subtotal).shippingPaise,total=gross-discount+shipping;
 if(!Number.isSafeInteger(total)||gross>2147483647||total>2147483647)throw new BadRequestException('Invalid order total');
 return {originalSubtotalPaise:subtotal,subtotalPaise:gross,discountPaise:discount,shippingPaise:shipping,totalPaise:total,netSubtotalPaise:gross-discount};
}
export function allocate(items,discount){const total=items.reduce((s,i)=>s+i.variant.pricePaise*i.quantity,0);let cumulative=0,assigned=0;return items.map(item=>{cumulative+=item.variant.pricePaise*item.quantity;const next=Math.floor(discount*cumulative/total),share=next-assigned;assigned=next;return {...item,hidiDiscountPaise:share};});}
export async function applyChoice(tx,cart,subtotal,promotion){
 const {choice,config}=promotion;let gift=null;
 await reserveEligibility(tx,promotion);
 if(choice.kind==='DRESS1'){
  gift=await tx.productVariant.findUnique({where:{id:choice.variantId},include:{product:true,inventory:true}});
  if(!qualifies(gift,config))throw new ConflictException('Your selected ₹1 dress is unavailable or not eligible. Choose another.');
 }
 const result=amounts(subtotal,choice,gift);
 if(choice.kind==='WELCOME200')cart.items=allocate(cart.items,result.discountPaise);
 if(gift)cart.items.push({productId:gift.productId,variantId:gift.id,quantity:1,product:gift.product,variant:gift,hidiDiscountPaise:gift.pricePaise-100});
 cart.items.sort((a,b)=>a.variantId.localeCompare(b.variantId));
 return {...result,snapshot:choice.kind==='NONE'?null:{ruleSet:RULE_SET,choice,...result}};
}
export function reservationItems(items){const grouped=new Map();for(const item of items){const existing=grouped.get(item.variantId);if(existing)existing.quantity+=item.quantity;else grouped.set(item.variantId,{...item});}return [...grouped.values()].sort((a,b)=>a.variantId.localeCompare(b.variantId));}
export async function quote(prisma,input,auth){
 if(typeof input?.sessionId!=='string'||input.sessionId.length<8||input.sessionId.length>128)throw new BadRequestException('Cart session is required');
 const choice=normalizedChoice(input.offer),published=await campaign(auth);
 const cart=await prisma.cart.findUnique({where:{sessionId:input.sessionId},include:{items:{orderBy:{variantId:'asc'},include:{product:{include:{images:{orderBy:{position:'asc'},take:1}}},variant:{include:{inventory:true,images:{orderBy:{position:'asc'},take:1}}}}}}});
 if(!cart||!cart.items.length)return {available:false};
 if(cart.items.some(i=>!i.variant.active||i.product.status!=='ACTIVE'||!Number.isSafeInteger(i.quantity)||i.quantity<1||!Number.isSafeInteger(i.variant.pricePaise)||i.variant.pricePaise<=0||stock(i.variant)<i.quantity))throw new ConflictException('Your bag stock or prices changed. Review your bag.');
 const subtotal=cart.items.reduce((s,i)=>s+i.quantity*i.variant.pricePaise,0);
 if(!published||published.config.checkoutEnabled!==true){if(choice.kind!=='NONE')throw new ConflictException('This offer is no longer available');return {available:false};}
 const config=published.config;
 const phone=verifiedPhone(auth),stats=phone?await usage(prisma,phone):null;
 if(choice.kind!=='NONE'){
  if(!phone)throw new UnauthorizedException('Sign in with your verified mobile number to use an offer');
  assertEligibility(choice,config,stats);
 }
 const welcomeEligible=!!phone&&config.welcomeEnabled&&!stats.welcomeUsed&&subtotal>=RULES.welcomeMinimumPaise;
 const dressUnlocked=!!phone&&config.dressEnabled&&!stats.dressUsed&&stats.dressRemaining>0&&subtotal>=RULES.dressMinimumPaise;
 let candidates=[];
 if(dressUnlocked&&(config.eligibleProductIds||[]).length)candidates=await prisma.productVariant.findMany({where:{productId:{in:config.eligibleProductIds},active:true,pricePaise:{gte:100},product:{status:'ACTIVE'}},include:{product:{include:{images:{orderBy:{position:'asc'},take:1}}},inventory:true,images:{orderBy:{position:'asc'},take:1}},orderBy:[{productId:'asc'},{id:'asc'}],take:1000});
 candidates=candidates.filter(v=>qualifies(v,config)&&stock(v)>cart.items.filter(i=>i.variantId===v.id).reduce((s,i)=>s+i.quantity,0));
 if(choice.kind!=='NONE'&&choice.version!==published.version)throw new ConflictException('Offer changed. Refresh checkout.');
 const gift=choice.kind==='DRESS1'?candidates.find(v=>v.id===choice.variantId):null;
 if(choice.kind==='DRESS1'&&!gift)throw new ConflictException('Choose an available offer dress and size');
 const totals=amounts(subtotal,choice,gift);
 const view=v=>({id:v.id,productId:v.productId,name:v.product.name,slug:v.product.slug,size:v.size,color:v.color,mrpPaise:v.mrpPaise,image:v.images?.[0]?.url||v.product.images?.[0]?.url||null,available:stock(v)});
 return {available:true,version:published.version,rules:RULES,requiresSignIn:!phone,welcomeEnabled:config.welcomeEnabled,dressEnabled:config.dressEnabled,welcomeEligible,welcomeUsed:stats?.welcomeUsed||false,dressUsed:stats?.dressUsed||false,dressRemaining:stats?.dressRemaining??null,dressUnlocked,candidates:candidates.map(view),choice,...totals,gift:gift?view(gift):null};
}
