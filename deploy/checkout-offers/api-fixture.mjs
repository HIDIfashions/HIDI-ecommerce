import assert from 'node:assert/strict';
const {RULE_SET,RULES,summarizeUsage}=await import('./redemptions.mjs');
let published={version:1,config:{welcomeEnabled:true,dressEnabled:true,audience:'SELECTED',allowedPhones:['+919000000001'],startsAt:null,endsAt:null,checkoutEnabled:true,eligibleProductIds:['gift-product','regular-product']}};
process.env.AZURE_STORAGE_ACCOUNT='fixtureaccount';process.env.IDENTITY_ENDPOINT='http://127.0.0.1/identity';
globalThis.fetch=async(url,o={})=>{if(String(url)==='https://hidiindia.com/api/hidi/offers/checkout-policy'){const c=published.config,allowed=c.audience==='EVERYONE'||c.audience==='SELECTED'&&o.headers?.Authorization==='Bearer selected';return Response.json(allowed&&c.checkoutEnabled?{available:true,version:published.version,ruleSet:RULE_SET,couponVersion:1,rules:RULES,welcomeEnabled:c.welcomeEnabled,dressEnabled:c.dressEnabled,eligibleProductIds:c.eligibleProductIds}:{available:false});}throw Error('External network forbidden in financial test');};
const {CheckoutService}=await import('./checkout.service.js');const engine=await import('./offers-engine.mjs');
const auth={id:'fixture-subject',phoneVerified:true,phone:'+919000000001',email:null,offerAuthorization:'Bearer selected'};
let checks=0;
const input=(offer,subtotal,total)=>({sessionId:'fixture-session',checkoutToken:'fixture-token-'+checks,customerPhone:'9000000001',shippingAddress:{firstName:'Fixture',phone:'9000000001',line1:'Fixture street',city:'Hyderabad',state:'Telangana',postalCode:'500001'},walletPaise:0,expectedTotalPaise:subtotal,expectedPayableTotalPaise:total,offer});
function fixture({price=200000,quantity=1,stock=10,giftMrp=100000,giftStock=5,walletEnabled=false,sameVariant=false}={}){
 let state={orders:[],payments:[],reservations:[],inventory:{regular:{onHand:stock,reserved:0,safetyStock:0},gift:{onHand:giftStock,reserved:0,safetyStock:0}}};const gateway=[];
 const gift={id:sameVariant?'regular':'gift',productId:sameVariant?'regular-product':'gift-product',active:true,sku:'GIFT',size:'M',color:'Ivory',pricePaise:sameVariant?price:90000,mrpPaise:giftMrp,product:{id:sameVariant?'regular-product':'gift-product',name:'Gift dress',slug:'gift-dress',status:'ACTIVE',images:[]},inventory:state.inventory[sameVariant?'regular':'gift'],images:[]};
 const cart={id:'cart',sessionId:'fixture-session',items:[{variantId:'regular',productId:'regular-product',quantity,product:{id:'regular-product',name:'Regular dress',status:'ACTIVE',images:[]},variant:{id:'regular',sku:'REGULAR',active:true,size:'M',color:'Ivory',pricePaise:price,mrpPaise:price,inventory:state.inventory.regular,images:[]}}]};
 const mutate=(row,data)=>{for(const[k,v]of Object.entries(data)){if(v&&typeof v==='object'&&'increment'in v)row[k]+=v.increment;else if(v&&typeof v==='object'&&'decrement'in v)row[k]-=v.decrement;else row[k]=v;}return {...row};};
 const db={walletAccount:{findUnique:async()=>null},user:{upsert:async q=>({id:'user-'+q.where.phone})},cart:{findUnique:async()=>structuredClone(cart),update:async()=>({})},cartItem:{deleteMany:async()=>({})},productVariant:{findUnique:async q=>q.where.id===gift.id?structuredClone(gift):null,findMany:async()=>[structuredClone(gift)]},order:{findMany:async()=>state.orders.map(o=>({...o,payments:state.payments.filter(p=>p.orderId===o.id),reservations:state.reservations.filter(r=>r.orderId===o.id)})),findUnique:async q=>{const[key,value]=Object.entries(q.where)[0],o=state.orders.find(o=>o[key]===value);return o?{...o,payments:state.payments.filter(p=>p.orderId===o.id)}:null;},create:async q=>{const o={id:'order-'+state.orders.length,currency:'INR',...q.data};state.orders.push(o);return {...o};},update:async q=>mutate(state.orders.find(o=>o.id===q.where.id),q.data),updateMany:async()=>({count:0})},payment:{create:async q=>{const p={id:'payment-'+state.payments.length,provider:'RAZORPAY',...q.data};state.payments.push(p);return p;}},inventoryReservation:{findMany:async()=>[],create:async q=>{assert(!state.reservations.some(r=>r.orderId===q.data.orderId&&r.variantId===q.data.variantId));state.reservations.push(q.data);return q.data;},updateMany:async()=>({})},inventory:{update:async q=>mutate(state.inventory[q.where.variantId],q.data),updateMany:async()=>({count:1})},orderAuditEvent:{create:async q=>q.data},$queryRaw:async(parts,...values)=>parts.join('').includes('sp_getapplock')?[{result:0}]:parts.join('').includes('FROM "Order"')?[{id:values[0]}]:[{...state.inventory[values[0]]}]};
 let tail=Promise.resolve();db.$transaction=async fn=>{const previous=tail;let release;tail=new Promise(r=>release=r);await previous;const before=structuredClone(state);try{return await fn(db);}catch(e){state=before;throw e;}finally{release();}};
 const wallet={enabled:()=>walletEnabled,ensureWallet:async()=>({id:'wallet',userId:'fixture-user'}),reserve:async()=>{},createAccrual:async()=>{},consume:async()=>true,release:async()=>{},reverseEarned:async()=>{}};
 const razorpay={createOrder:async q=>{gateway.push(q);return {id:'rzp-fixture',amount:q.amountPaise,currency:'INR'};},publicKey:()=> 'rzp_test_fixture'};
 return {db,state:()=>state,gateway,service:new CheckoutService(db,razorpay,wallet,{checkServiceability:async()=>({cod:true})})};
}
let f=fixture(),body=input({kind:'WELCOME250',code:'WELCOME250',version:1},200000,175000);let result=await f.service.prepare(body,auth);assert.equal(result.amountPaise,175000);assert.equal(f.gateway[0].amountPaise,175000);assert.equal(f.state().orders[0].discountPaise,25000);assert.equal(f.state().orders[0].items.create[0].totalPaise,175000);checks++;
await f.service.prepare(body,auth);assert.equal(f.gateway.length,1);checks++;
await assert.rejects(f.service.prepare({...body,offer:{kind:'NONE'}},auth),/Offer selection changed/);checks++;
f=fixture({price:400000});body=input({kind:'DRESS1',code:'GET1',version:1,variantId:'gift'},400000,400100);result=await f.service.prepare(body,auth);assert.equal(result.amountPaise,400100);assert.equal(f.gateway[0].amountPaise,400100);const order=f.state().orders[0];assert.equal(order.discountPaise,89900);assert.equal(order.items.create.find(i=>i.sku==='GIFT').totalPaise,100);assert.equal(f.state().reservations.length,2);checks++;
f=fixture({price:100000,quantity:4,sameVariant:true});await f.service.prepare(input({kind:'DRESS1',code:'GET1',version:1,variantId:'regular'},400000,400100),auth);assert.equal(f.state().reservations.length,1);assert.equal(f.state().reservations[0].quantity,5);checks++;
for(const setup of [{price:399899},{price:400000,giftStock:0},{price:100000,quantity:4,sameVariant:true,stock:4}]){f=fixture(setup);await assert.rejects(f.service.prepare(input({kind:'DRESS1',code:'GET1',version:1,variantId:setup.sameVariant?'regular':'gift'},setup.price*(setup.quantity||1),setup.price*(setup.quantity||1)+100),auth));assert.equal(f.state().orders.length,0);assert.equal(f.gateway.length,0);checks++;}
for(const identity of [null,{...auth,phoneVerified:false,offerAuthorization:'Bearer unverified'},{...auth,phone:'+919000000002',offerAuthorization:'Bearer other'}]){f=fixture();await assert.rejects(f.service.prepare(input({kind:'WELCOME250',code:'WELCOME250',version:1},200000,175000),identity));assert.equal(f.gateway.length,0);checks++;}
f=fixture();await assert.rejects(f.service.prepare(input({kind:'WELCOME250',code:'WELCOME250',version:1},200000,100),auth));assert.equal(f.state().orders.length,0);checks++;
f=fixture({walletEnabled:true});body={...input({kind:'WELCOME250',code:'WELCOME250',version:1},200000,175000),walletPaise:50000};await assert.rejects(f.service.prepare(body,auth),/cannot be combined/);assert.equal(f.gateway.length,0);checks++;
published.config.audience='HIDDEN';f=fixture();await assert.rejects(f.service.prepare(input({kind:'WELCOME250',code:'WELCOME250',version:1},200000,175000),auth));checks++;
f=fixture();result=await f.service.prepare(input({kind:'NONE'},200000,200000),null);assert.equal(result.amountPaise,200000);checks++;
const allocated=engine.allocate(Array.from({length:1000},()=>({variant:{pricePaise:1},quantity:1})),150);assert.equal(allocated.reduce((s,i)=>s+i.hidiDiscountPaise,0),150);assert(allocated.every(i=>i.hidiDiscountPaise<=1));checks++;

published.config.audience='SELECTED';f=fixture({price:149900});result=await f.service.prepare(input({kind:'WELCOME250',code:'WELCOME250',version:1},149900,124900),auth);assert.equal(result.amountPaise,124900);checks++;
await assert.rejects(f.service.prepare({...input({kind:'WELCOME250',code:'WELCOME250',version:1},149900,124900),checkoutToken:'another-token'},auth),/first purchase only/);checks++;
f=fixture({price:149899});await assert.rejects(f.service.prepare(input({kind:'WELCOME250',code:'WELCOME250',version:1},149899,124899),auth));checks++;
f=fixture({price:399900,giftMrp:220000});result=await f.service.prepare(input({kind:'DRESS1',code:'GET1',version:1,variantId:'gift'},399900,400000),auth);assert.equal(result.amountPaise,400000);checks++;
const redeemed=(status='CONFIRMED',phone='+919000000002',reservation='CONSUMED')=>({status,customerPhone:phone,notes:JSON.stringify({hidiOffer:{ruleSet:RULE_SET,choice:{kind:'DRESS1',code:'GET1',version:99}}}),payments:[{status:'CAPTURED'}],reservations:[{status:reservation}]});
assert.equal(summarizeUsage(Array.from({length:25},()=>redeemed()),auth.phone).dressRemaining,0);checks++;
assert.equal(summarizeUsage([redeemed('CANCELLED',auth.phone,'RELEASED')],auth.phone).dressRemaining,25);checks++;
assert.equal(summarizeUsage([redeemed('RETURNED',auth.phone)],auth.phone).dressRemaining,24);checks++;
const withSupportNotes=redeemed('RETURN_REQUESTED',auth.phone);withSupportNotes.notes+='\nRETURN_REQUESTED: reference: customer returned this item\nREFUND: processed';
assert.equal(summarizeUsage([withSupportNotes],auth.phone).dressRemaining,24);assert.equal(summarizeUsage([withSupportNotes],auth.phone).dressUsed,true);checks++;
assert.equal(summarizeUsage([redeemed('PAYMENT_REVIEW',auth.phone,'RELEASED')],auth.phone).dressRemaining,25);checks++;
for(const paymentStatus of ['CAPTURED','REFUNDED','PARTIALLY_REFUNDED']){f=fixture();f.state().orders.push({id:'old',customerPhone:'9000000001',status:'CANCELLED'});f.state().payments.push({orderId:'old',status:paymentStatus});await assert.rejects(f.service.prepare(input({kind:'WELCOME250',code:'WELCOME250',version:1},200000,175000),auth),/first purchase only/);checks++;}
f=fixture({price:399900});f.state().orders.push(...Array.from({length:25},(_,i)=>({...redeemed(),id:'used-'+i})));
for(const o of f.state().orders)f.state().reservations.push({orderId:o.id,variantId:'used-'+o.id,status:'CONSUMED'});
await assert.rejects(f.service.prepare(input({kind:'DRESS1',code:'GET1',version:1,variantId:'gift'},399900,400000),auth),/All 25/);assert.equal(f.gateway.length,0);checks++;
await assert.rejects(engine.loadChoice({kind:'WELCOME250',code:'WELCOME250',version:1},{...auth,phoneVerified:false}),/verified mobile/);checks++;
assert.throws(()=>engine.normalizedChoice({kind:'PERCENT15',version:1}));checks++;

f=fixture({price:399900});f.state().orders.push(...Array.from({length:24},(_,i)=>({...redeemed(),id:'used-'+i})));for(const o of f.state().orders)f.state().reservations.push({orderId:o.id,variantId:'used-'+o.id,status:'CONSUMED'});
published.config.audience='EVERYONE';
const attempts=await Promise.allSettled(Array.from({length:6},(_,i)=>f.service.prepare({...input({kind:'DRESS1',code:'GET1',version:1,variantId:'gift'},399900,400000),checkoutToken:'concurrent-'+i},{...auth,id:'subject-'+i,phone:'+91910000000'+i})));
assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);assert.equal(f.gateway.length,1);assert(attempts.filter(a=>a.status==='rejected').every(a=>/All 25/.test(a.reason.message)));checks++;
f=fixture();const sameCustomer=await Promise.allSettled(Array.from({length:3},(_,i)=>f.service.prepare({...input({kind:'WELCOME250',code:'WELCOME250',version:1},200000,175000),checkoutToken:'same-customer-'+i},auth)));assert.equal(sameCustomer.filter(a=>a.status==='fulfilled').length,1);assert.equal(f.gateway.length,1);checks++;

published.config.audience='EVERYONE';f=fixture({price:149900});
const welcomeQuote=await engine.quote(f.db,{sessionId:'fixture-session',couponCode:' welcome 250 '},auth);assert.equal(welcomeQuote.choice.code,'WELCOME250');assert.equal(welcomeQuote.totalPaise,124900);checks++;
for(const couponCode of ['BADCODE','',[],null,'WELCOME250 GET1','A'.repeat(33)]){await assert.rejects(engine.quote(f.db,{sessionId:'fixture-session',couponCode},auth));checks++;}
await assert.rejects(engine.loadChoice({kind:'WELCOME250',version:1},auth),/matching coupon/);checks++;
await assert.rejects(engine.loadChoice({kind:'DRESS1',version:1,variantId:'gift'},auth),/Apply WELCOME250/);checks++;
await assert.rejects(engine.quote(f.db,{sessionId:'fixture-session',couponCode:'WELCOME250'},null),/verified mobile/);checks++;
f=fixture({price:399900});const getQuote=await engine.quote(f.db,{sessionId:'fixture-session',couponCode:'get 1'},auth);assert.equal(getQuote.selectionRequired,true);assert.equal(getQuote.totalPaise,399900);assert.equal(getQuote.candidates.length,1);assert.equal(getQuote.choice.code,'GET1');checks++;
await assert.rejects(f.service.prepare(input(getQuote.choice,399900,399900),auth),/Select your/);checks++;
const selectedQuote=await engine.quote(f.db,{sessionId:'fixture-session',couponCode:'GET1',offer:{...getQuote.choice,variantId:'gift'}},auth);assert.equal(selectedQuote.selectionRequired,false);assert.equal(selectedQuote.totalPaise,400000);checks++;
await assert.rejects(engine.quote(f.db,{sessionId:'fixture-session',couponCode:'WELCOME250',offer:{...getQuote.choice,variantId:'gift'}},auth),/one coupon/);checks++;
await assert.rejects(engine.quote(f.db,{sessionId:'fixture-session',couponCode:'GET1',offer:{...getQuote.choice,variantId:'not-selected'}},auth),/available offer dress/);checks++;
f=fixture({price:399899});await assert.rejects(engine.quote(f.db,{sessionId:'fixture-session',couponCode:'GET1'},auth),/3,999/);checks++;
f=fixture({price:399900,giftStock:0});await assert.rejects(engine.quote(f.db,{sessionId:'fixture-session',couponCode:'GET1'},auth),/out of stock/);checks++;
f=fixture();published.config.audience='HIDDEN';await assert.rejects(engine.quote(f.db,{sessionId:'fixture-session',couponCode:'WELCOME250'},auth),/not currently available/);checks++;
published.config.audience='EVERYONE';published.config.welcomeEnabled=false;await assert.rejects(engine.quote(f.db,{sessionId:'fixture-session',couponCode:'WELCOME250'},auth));published.config.welcomeEnabled=true;checks++;
// Prepared legacy payment retries retain their stored amount and choice.
engine.assertRetry({notes:JSON.stringify({hidiOffer:{choice:{kind:'WELCOME200',version:1}}}),totalPaise:180000},{offer:{kind:'WELCOME200',version:1},expectedPayableTotalPaise:180000});checks++;
await assert.rejects(engine.loadChoice({kind:'WELCOME200',version:1},auth),/Apply WELCOME250/);checks++;
// Ordinary orders still support rewards and COD, without any offer policy dependency.
f=fixture({walletEnabled:true});result=await f.service.prepare({...input({kind:'NONE'},200000,200000),walletPaise:50000},auth);assert.equal(result.amountPaise,150000);checks++;
process.env.HIDI_COD_ENABLED='true';f=fixture();result=await f.service.prepare({...input({kind:'NONE'},200000,200000),paymentMethod:'COD'},auth);assert.equal(result.provider,'COD');assert.equal(f.gateway.length,0);delete process.env.HIDI_COD_ENABLED;checks++;
console.log('CHECKOUT_OFFERS_RESULT:'+JSON.stringify({passed:true,actualCheckoutService:true,checks,providerStubOnly:true,productionWrites:0,exactPaymentAmounts:true,orderAndInventoryVerified:true}));
