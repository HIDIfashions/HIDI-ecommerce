import assert from 'node:assert/strict';
let published={version:1,config:{audience:'SELECTED',allowedPhones:['+919000000001'],startsAt:null,endsAt:null,checkoutEnabled:true,eligibleProductIds:['gift-product','regular-product']}};
process.env.AZURE_STORAGE_ACCOUNT='fixtureaccount';process.env.IDENTITY_ENDPOINT='http://127.0.0.1/identity';
globalThis.fetch=async(url,o={})=>{if(String(url)==='https://hidiindia.com/api/hidi/offers/checkout-policy'){const c=published.config,allowed=c.audience==='EVERYONE'||c.audience==='SELECTED'&&o.headers?.Authorization==='Bearer selected';return Response.json(allowed&&c.checkoutEnabled?{available:true,version:published.version,eligibleProductIds:c.eligibleProductIds}:{available:false});}throw Error('External network forbidden in financial test');};
const {CheckoutService}=await import('./checkout.service.js');const engine=await import('./offers-engine.mjs');
const auth={id:'fixture-subject',phoneVerified:true,phone:'+919000000001',email:null,offerAuthorization:'Bearer selected'};
let checks=0;
const input=(offer,subtotal,total)=>({sessionId:'fixture-session',checkoutToken:'fixture-token-'+checks,customerPhone:'9000000001',shippingAddress:{firstName:'Fixture',phone:'9000000001',line1:'Fixture street',city:'Hyderabad',state:'Telangana',postalCode:'500001'},walletPaise:0,expectedTotalPaise:subtotal,expectedPayableTotalPaise:total,offer});
function fixture({price=200000,quantity=1,stock=10,giftMrp=100000,giftStock=5,walletEnabled=false,sameVariant=false}={}){
 let state={orders:[],payments:[],reservations:[],inventory:{regular:{onHand:stock,reserved:0,safetyStock:0},gift:{onHand:giftStock,reserved:0,safetyStock:0}}};const gateway=[];
 const gift={id:sameVariant?'regular':'gift',productId:sameVariant?'regular-product':'gift-product',active:true,sku:'GIFT',size:'M',color:'Ivory',pricePaise:sameVariant?price:90000,mrpPaise:giftMrp,product:{id:sameVariant?'regular-product':'gift-product',name:'Gift dress',slug:'gift-dress',status:'ACTIVE',images:[]},inventory:state.inventory[sameVariant?'regular':'gift'],images:[]};
 const cart={id:'cart',sessionId:'fixture-session',items:[{variantId:'regular',productId:'regular-product',quantity,product:{id:'regular-product',name:'Regular dress',status:'ACTIVE',images:[]},variant:{id:'regular',sku:'REGULAR',active:true,size:'M',color:'Ivory',pricePaise:price,mrpPaise:price,inventory:state.inventory.regular,images:[]}}]};
 const mutate=(row,data)=>{for(const[k,v]of Object.entries(data)){if(v&&typeof v==='object'&&'increment'in v)row[k]+=v.increment;else if(v&&typeof v==='object'&&'decrement'in v)row[k]-=v.decrement;else row[k]=v;}return {...row};};
 const db={walletAccount:{findUnique:async()=>null},user:{upsert:async()=>({id:'fixture-user'})},cart:{findUnique:async()=>structuredClone(cart),update:async()=>({})},cartItem:{deleteMany:async()=>({})},productVariant:{findUnique:async q=>q.where.id===gift.id?structuredClone(gift):null,findMany:async()=>[structuredClone(gift)]},order:{findUnique:async q=>{const[key,value]=Object.entries(q.where)[0],o=state.orders.find(o=>o[key]===value);return o?{...o,payments:state.payments.filter(p=>p.orderId===o.id)}:null;},create:async q=>{const o={id:'order-'+state.orders.length,currency:'INR',...q.data};state.orders.push(o);return {...o};},update:async q=>mutate(state.orders.find(o=>o.id===q.where.id),q.data),updateMany:async()=>({count:0})},payment:{create:async q=>{const p={id:'payment-'+state.payments.length,provider:'RAZORPAY',...q.data};state.payments.push(p);return p;}},inventoryReservation:{findMany:async()=>[],create:async q=>{assert(!state.reservations.some(r=>r.orderId===q.data.orderId&&r.variantId===q.data.variantId));state.reservations.push(q.data);return q.data;},updateMany:async()=>({})},inventory:{update:async q=>mutate(state.inventory[q.where.variantId],q.data),updateMany:async()=>({count:1})},orderAuditEvent:{create:async q=>q.data},$queryRaw:async(parts,...values)=>parts.join('').includes('FROM "Order"')?[{id:values[0]}]:[{...state.inventory[values[0]]}]};
 db.$transaction=async fn=>{const before=structuredClone(state);try{return await fn(db);}catch(e){state=before;throw e;}};
 const wallet={enabled:()=>walletEnabled,ensureWallet:async()=>({id:'wallet',userId:'fixture-user'}),reserve:async()=>{},createAccrual:async()=>{},consume:async()=>true,release:async()=>{},reverseEarned:async()=>{}};
 const razorpay={createOrder:async q=>{gateway.push(q);return {id:'rzp-fixture',amount:q.amountPaise,currency:'INR'};},publicKey:()=> 'rzp_test_fixture'};
 return {db,state:()=>state,gateway,service:new CheckoutService(db,razorpay,wallet)};
}

const {shippingQuote}=await import('./shipping-policy.js');
for(const price of [10000,149899,149900]){
 const expected=price+shippingQuote(price).shippingPaise,small=fixture({price});
 const prepared=await small.service.prepare(input({kind:'NONE'},price,expected),auth);
 assert.equal(prepared.amountPaise,expected);assert.equal(small.gateway[0].amountPaise,expected);checks++;
}
// Both quote and prepare must reject forged/stale percentage choices before writes.
for(const identity of [null,auth,{...auth,offerAuthorization:'Bearer other'}]){
 const blocked=fixture();await assert.rejects(blocked.service.prepare(input({kind:'PERCENT15',version:1},200000,170000),identity),/percentage discounts are disabled/);
 await assert.rejects(engine.quote(blocked.db,{sessionId:'fixture-session',offer:{kind:'PERCENT15',version:1}},identity),/percentage discounts are disabled/);
 assert.equal(blocked.state().orders.length,0);assert.equal(blocked.gateway.length,0);checks++;
}
let f=fixture({price:400000}),body=input({kind:'DRESS1',version:1,variantId:'gift'},400000,400100),result=await f.service.prepare(body,auth);
assert.equal(result.amountPaise,400100);assert.equal(f.gateway[0].amountPaise,400100);const order=f.state().orders[0];assert.equal(order.discountPaise,89900);assert.equal(order.items.create.find(i=>i.sku==='GIFT').totalPaise,100);assert.equal(f.state().reservations.length,2);checks++;
await f.service.prepare(body,auth);assert.equal(f.gateway.length,1);checks++;
await assert.rejects(f.service.prepare({...body,offer:{kind:'NONE'}},auth),/Offer selection changed/);checks++;
f=fixture({price:100000,quantity:4,sameVariant:true});await f.service.prepare(input({kind:'DRESS1',version:1,variantId:'regular'},400000,400100),auth);assert.equal(f.state().reservations.length,1);assert.equal(f.state().reservations[0].quantity,5);checks++;
for(const setup of [{price:399900},{price:400000,giftMrp:110000},{price:400000,giftStock:0},{price:100000,quantity:4,sameVariant:true,stock:4}]){f=fixture(setup);await assert.rejects(f.service.prepare(input({kind:'DRESS1',version:1,variantId:setup.sameVariant?'regular':'gift'},setup.price*(setup.quantity||1),setup.price*(setup.quantity||1)+100),auth));assert.equal(f.state().orders.length,0);assert.equal(f.gateway.length,0);checks++;}
for(const identity of [null,{...auth,phoneVerified:false,offerAuthorization:'Bearer unverified'},{...auth,phone:'+919000000002',offerAuthorization:'Bearer other'}]){f=fixture({price:400000});await assert.rejects(f.service.prepare(input({kind:'DRESS1',version:1,variantId:'gift'},400000,400100),identity));assert.equal(f.gateway.length,0);checks++;}
f=fixture({price:400000});await assert.rejects(f.service.prepare(input({kind:'DRESS1',version:1,variantId:'gift'},400000,100),auth));assert.equal(f.state().orders.length,0);checks++;
f=fixture({price:400000,walletEnabled:true});body={...input({kind:'DRESS1',version:1,variantId:'gift'},400000,400100),walletPaise:50000};result=await f.service.prepare(body,auth);assert.equal(result.amountPaise,350100);checks++;
published.config.audience='HIDDEN';f=fixture({price:400000});await assert.rejects(f.service.prepare(input({kind:'DRESS1',version:1,variantId:'gift'},400000,400100),auth));checks++;
f=fixture();result=await f.service.prepare(input({kind:'NONE'},200000,200000),null);assert.equal(result.amountPaise,200000);checks++;
console.log('CHECKOUT_OFFERS_RESULT:'+JSON.stringify({passed:true,actualCheckoutService:true,checks,providerStubOnly:true,productionWrites:0,extraPercentRejected:true,privateDressEligibilityVerified:true,exactPaymentAmounts:true,orderAndInventoryVerified:true}));
