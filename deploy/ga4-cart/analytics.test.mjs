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
async function harness(enabled=true){
  const events=[],calls=[];
  let next=()=>Promise.resolve(response());
  const native=function(...args){calls.push({self:this,args});if(String(args[0]).endsWith('/api/hidi/analytics-config'))return Promise.resolve(response({enabled,ga4MeasurementId:'G-Z45WSHLDHG'}));return next(...args);};
  const sandbox={URL,URLSearchParams,Request,Response,Promise,setTimeout,clearTimeout,queueMicrotask,console,
    location:{href:origin+'/',origin,pathname:'/',search:''},history:{pushState(){},replaceState(){}},
    sessionStorage:{getItem(){return null;},setItem(){}},addEventListener(){},dispatchEvent(){},
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
