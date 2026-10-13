import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('./hidi-analytics.js',import.meta.url),'utf8');
const origin='https://hidiindia.com';
const endpoint=origin+'/api/store/carts/private-cart-session/items';
const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({variantId:'variant-m',quantity:1})};
const cart={itemCount:3,items:[{quantity:3,unitPricePaise:169900,product:{slug:'test-kurta',name:'Test Kurta'},variant:{id:'variant-m',size:'M',pricePaise:169900}}]};
const response=(data=cart,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(done=>setTimeout(done,5));};
function storage(entries=[]){const data=new Map(entries);return {getItem(key){return data.get(key)||null;},setItem(key,value){data.set(key,value);}};}
async function harness(enabled=true, settings={}){
  const events=[],calls=[];
  let next=settings.next||(()=>Promise.resolve(response()));
  const native=function(...args){calls.push({self:this,args});if(String(args[0]).endsWith('/api/hidi/analytics-config'))return Promise.resolve(response({enabled,ga4MeasurementId:'G-Z45WSHLDHG'}));return next(...args);};
  const sandbox={URL,URLSearchParams,Request,Response,Promise,setTimeout,clearTimeout,queueMicrotask,console,
    location:{href:origin+(settings.path||'/')+(settings.search||''),origin,pathname:settings.path||'/',search:settings.search||''},history:{pushState(){},replaceState(){}},
    sessionStorage:settings.sessionStorage||storage(),localStorage:settings.localStorage||storage([['hidi_cart_session','private-cart-session']]),addEventListener(){},dispatchEvent(){},
    CustomEvent:class{constructor(name,props){this.type=name;this.detail=props?.detail;}},
    document:{readyState:'complete',title:'Fixture',querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},createElement(){return {};},head:{appendChild(script){queueMicrotask(()=>script.onload());}}},
    gtag(...args){if(args[0]==='event')events.push({name:args[1],params:args[2]});},fetch:native};
  sandbox.window=sandbox;vm.runInNewContext(source,sandbox);await flush();
  return {sandbox,events,calls,native,setNext(fn){next=fn;},adds(){return events.filter(e=>e.name==='add_to_cart');}};
}

test('confirmed addition emits added quantity and INR price, not cumulative cart quantity',async()=>{
  const h=await harness();await h.sandbox.fetch(endpoint,options);await flush();
  assert.equal(h.adds().length,1);const p=h.adds()[0].params;
  assert.equal(p.items[0].quantity,1);assert.equal(p.items[0].item_id,'test-kurta');
  assert.equal(p.items[0].item_variant,'M');assert.equal(p.items[0].price,1699);assert.equal(p.value,1699);assert.equal(p.currency,'INR');
  assert(!JSON.stringify(p).includes('private-cart-session'));
});
test('response, promise, options and caller binding are preserved',async()=>{
  const h=await harness();const expected=response();const promise=Promise.resolve(expected);h.setNext(()=>promise);
  const caller={marker:true};const actual=h.sandbox.fetch.call(caller,endpoint,options);
  assert.equal(actual,promise);assert.equal(await actual,expected);
  const call=h.calls.at(-1);assert.equal(call.self,caller);assert.equal(call.args[1],options);
  assert.deepEqual(await expected.json(),cart);await flush();assert.equal(h.adds().length,1);
});
test('two successful additions each emit once even when the same variant is already in cart',async()=>{
  const h=await harness();await h.sandbox.fetch(endpoint,options);await h.sandbox.fetch(endpoint,options);await flush();
  assert.equal(h.adds().length,2);assert(h.adds().every(e=>e.params.items[0].quantity===1));
});
test('rejections, malformed JSON and invalid cart responses do not emit additions',async()=>{
  for(const value of [response({message:'Out of stock'},409),new Response('invalid',{status:200}),response({}),response({itemCount:0})]){
    const h=await harness();h.setNext(()=>Promise.resolve(value));assert.equal(await h.sandbox.fetch(endpoint,options),value);await flush();assert.equal(h.adds().length,0);
  }
  const h=await harness();const failure=new Error('network');h.setNext(()=>Promise.reject(failure));
  await assert.rejects(h.sandbox.fetch(endpoint,options),error=>error===failure);await flush();assert.equal(h.adds().length,0);
});
test('reads, removals, quantity edits, unrelated writes and foreign origins are untouched',async()=>{
  const h=await harness();
  for(const [url,init] of [[endpoint,{method:'GET'}],[endpoint+'/item',{method:'PATCH',body:options.body}],[endpoint+'/item',{method:'DELETE'}],[origin+'/api/store/orders',options],['https://foreign.example/api/store/carts/x/items',options]]){
    await h.sandbox.fetch(url,init);
  }
  await flush();assert.equal(h.adds().length,0);
});
test('Request bodies are cloned before native fetch consumes them',async()=>{
  const h=await harness();h.setNext(async(input)=>{await input.text();return response();});
  await h.sandbox.fetch(new Request(endpoint,options));await flush();assert.equal(h.adds().length,1);
});
test('disabled analytics never wraps fetch or emits commerce events',async()=>{
  const h=await harness(false);assert.equal(h.sandbox.fetch,h.native);
  await h.sandbox.fetch(endpoint,options);await flush();assert.equal(h.adds().length,0);
});
test('invalid request metadata cannot block a successful shopping response',async()=>{
  const h=await harness();h.setNext(()=>Promise.resolve(response()));
  for(const body of ['invalid',JSON.stringify({variantId:'',quantity:1}),JSON.stringify({variantId:'variant-m',quantity:-1})]){
    const r=await h.sandbox.fetch(endpoint,{...options,body});assert(r.ok);
  }
  await flush();assert.equal(h.adds().length,0);
});
test('native synchronous failures are propagated exactly once without a retry',async()=>{
  const h=await harness();let calls=0;const error=new Error('synchronous fetch failure');
  h.setNext(()=>{calls++;throw error;});
  assert.throws(()=>h.sandbox.fetch(origin+'/unrelated'),cause=>cause===error);assert.equal(calls,1);
  assert.throws(()=>h.sandbox.fetch(endpoint,options),cause=>cause===error);assert.equal(calls,2);
});

const order='HIDI-ISOLATED-001';
const receipt=()=>({orderNumber:order,status:'CONFIRMED',currency:'INR',subtotalPaise:339800,discountPaise:0,shippingPaise:9900,taxPaise:1000,totalPaise:350700,walletAppliedPaise:100000,
  customerEmail:'private@example.test',customerPhone:'private-phone',shippingAddress:{line1:'private address'},
  payment:{provider:'RAZORPAY',status:'CAPTURED',amountPaise:250700},
  items:[{id:'private-order-item',slug:'test-kurta',productName:'Test Kurta',size:'M',color:'Blue',quantity:2,unitPricePaise:169900,totalPaise:339800}]});
const purchaseHarness=async(data=receipt(),settings={})=>harness(true,{path:'/order-confirmed',search:'?order='+order,next:()=>Promise.resolve(response(data)),...settings});
const purchases=h=>h.events.filter(e=>e.name==='purchase');
const replay=h=>h.sandbox.history.replaceState(null,'','/order-confirmed?order='+order);

test('purchase uses receipt, excludes shipping/tax, preserves rewards value and omits customer data',async()=>{
  const h=await purchaseHarness();assert.equal(purchases(h).length,1);const p=purchases(h)[0].params;
  assert.equal(p.transaction_id,order);assert.equal(p.currency,'INR');assert.equal(p.value,3398);assert.equal(p.shipping,99);assert.equal(p.tax,10);
  assert.equal(p.items[0].quantity,2);assert.equal(p.items[0].price,1699);assert.equal(p.items[0].item_name,'Test Kurta');
  for(const privateValue of ['private@example.test','private-phone','private address','private-order-item','private-cart-session'])assert(!JSON.stringify(p).includes(privateValue));
  const call=h.calls.at(-1);assert.equal(call.args[1].method,'GET');assert.equal(call.args[1].cache,'no-store');
  assert.equal(new URL(call.args[0],origin).searchParams.get('sessionId'),'private-cart-session');
});
test('pending, review, failed, cancelled and refunded receipts emit no purchase',async()=>{
  for(const [status,payment] of [['PENDING_PAYMENT','CREATED'],['PAYMENT_REVIEW','CAPTURED'],['CANCELLED','FAILED'],['CONFIRMED','AUTHORIZED'],['CONFIRMED','REFUNDED'],['CONFIRMED','PARTIALLY_REFUNDED']]){
    const data=receipt();data.status=status;data.payment.status=payment;const h=await purchaseHarness(data);assert.equal(purchases(h).length,0,status+'/'+payment);
  }
});
test('confirmed COD and fully reward-paid orders emit purchase',async()=>{
  for(const payment of [{provider:'COD',status:'CREATED'},{provider:'WALLET',status:'CAPTURED'}]){
    const data=receipt();data.payment=payment;const h=await purchaseHarness(data);assert.equal(purchases(h).length,1);
  }
});
test('identity and totals must match a complete validated INR receipt',async()=>{
  const mutations=[d=>d.orderNumber='different-order',d=>d.currency='USD',d=>d.payment=null,d=>d.items=[],d=>d.items[0].quantity=0,d=>d.items[0].unitPricePaise=-1,d=>d.items[0].totalPaise++,d=>d.items[0].slug='',d=>d.subtotalPaise++,d=>d.totalPaise++,d=>d.shippingPaise=NaN,d=>d.discountPaise=d.subtotalPaise+1,d=>d.taxPaise=1.5];
  for(const mutate of mutations){const data=receipt();mutate(data);const h=await purchaseHarness(data);assert.equal(purchases(h).length,0);}
});
test('discounts allocated across quantities match exact event value',async()=>{
  const data=receipt();data.items.push({...data.items[0],slug:'second-kurta',quantity:3,unitPricePaise:49900,totalPaise:149700});
  data.subtotalPaise+=149700;data.discountPaise=12345;data.totalPaise=data.subtotalPaise-data.discountPaise+data.shippingPaise+data.taxPaise;
  const h=await purchaseHarness(data);const p=purchases(h)[0].params;
  assert.equal(p.value,(489500-12345)/100);assert(Math.abs(p.items.reduce((sum,i)=>sum+i.price*i.quantity,0)-p.value)<1e-8);
  assert(p.items.every(i=>i.price>=0&&i.discount>0));
});
test('reloads, SPA callbacks and legacy markers prevent duplicates',async()=>{
  const local=storage([['hidi_cart_session','private-cart-session']]);const h=await purchaseHarness(receipt(),{localStorage:local});
  replay(h);replay(h);await flush();assert.equal(purchases(h).length,1);
  const next=await purchaseHarness(receipt(),{localStorage:local});assert.equal(purchases(next).length,0);
  const legacy=await purchaseHarness(receipt(),{sessionStorage:storage([['hidi_purchase_'+order,'1']])});assert.equal(purchases(legacy).length,0);
});
test('simultaneous route callbacks perform one read and emit once',async()=>{
  let resolve;const waiting=new Promise(done=>resolve=done);const h=await purchaseHarness(receipt(),{next:()=>waiting});
  replay(h);replay(h);await flush();assert.equal(h.calls.filter(c=>String(c.args[0]).includes('/checkout/confirmation/')).length,1);
  resolve(response(receipt()));await flush();assert.equal(purchases(h).length,1);
});
test('receipt arriving after leaving confirmation is ignored',async()=>{
  let resolve;const h=await purchaseHarness(receipt(),{next:()=>new Promise(done=>resolve=done)});
  h.sandbox.location.pathname='/cart';resolve(response(receipt()));await flush();assert.equal(purchases(h).length,0);
});
test('failed reads never mark purchase; route revisit can retry',async()=>{
  for(const failed of [()=>Promise.resolve(response({},403)),()=>Promise.resolve(new Response('invalid')),()=>Promise.reject(new Error('network'))]){
    const h=await purchaseHarness(receipt(),{next:failed});assert.equal(purchases(h).length,0);assert.equal(h.sandbox.localStorage.getItem('hidi_purchase_'+order),null);
    h.setNext(()=>Promise.resolve(response(receipt())));replay(h);await flush();assert.equal(purchases(h).length,1);
  }
});
test('missing, blocked or short cart session prevents receipt reads',async()=>{
  for(const localStorage of [storage(),storage([['hidi_cart_session','short']]),{getItem(){throw new Error('blocked');}}]){
    const h=await purchaseHarness(receipt(),{localStorage});assert.equal(purchases(h).length,0);assert.equal(h.calls.length,1);
  }
});
test('storage failure still preserves one emission within page',async()=>{
  const failing={getItem(key){return key==='hidi_cart_session'?'private-cart-session':null;},setItem(){throw new Error('quota');}};
  const h=await purchaseHarness(receipt(),{localStorage:failing,sessionStorage:failing});replay(h);await flush();assert.equal(purchases(h).length,1);
});
test('other pages and disabled analytics never fetch receipts',async()=>{
  const h=await harness(false,{path:'/order-confirmed',search:'?order='+order});assert.equal(h.calls.length,1);assert.equal(purchases(h).length,0);
  const noOrder=await harness(true,{path:'/order-confirmed'});assert.equal(noOrder.calls.length,1);
  const cartPage=await harness(true,{path:'/cart',search:'?order='+order});assert.equal(cartPage.calls.length,1);
});
