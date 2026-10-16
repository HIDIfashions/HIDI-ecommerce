import assert from 'node:assert/strict';
import test from 'node:test';
import { DelhiveryService } from '../apps/api/src/delhivery/delhivery.service.js';

test('B2C transit query uses the approved origin and existing server-side token without inventing pickup dates', async (t) => {
 const saved={...process.env};process.env.DELHIVERY_API_TOKEN='isolated-courier-token';process.env.DELHIVERY_BASE_URL='https://track.delhivery.com';delete process.env.DELHIVERY_ORIGIN_PIN;delete process.env.DELHIVERY_TRANSPORT_MODE;
 let calls=0;
 t.mock.method(globalThis,'fetch',async (url:any,options:any)=>{
  calls++;const request=new URL(url);assert.equal(request.origin,'https://track.delhivery.com');assert.equal(request.pathname,'/api/dc/expected_tat');assert.equal(request.searchParams.get('origin_pin'),'500081');assert.equal(request.searchParams.get('destination_pin'),'500089');assert.equal(request.searchParams.get('mot'),'S');assert.equal(request.searchParams.get('pdt'),'B2C');assert(!request.searchParams.has('expected_pickup_date'));assert.equal(options.headers.Authorization,'Token isolated-courier-token');assert(options.signal instanceof AbortSignal);assert.equal(options.redirect,'error');
  return new Response(JSON.stringify({success:true,data:{tat:1}}),{status:200});
 });
 try{assert.equal(await new DelhiveryService().estimateTransitDays('500089'),1);assert.equal(calls,1);}finally{process.env=saved;}
});

test('transit failures and malformed values retain availability without fabricating a timeframe', async (t) => {
 const saved={...process.env};process.env.DELHIVERY_API_TOKEN='isolated-courier-token';delete process.env.DELHIVERY_ORIGIN_PIN;delete process.env.DELHIVERY_TRANSPORT_MODE;
 let response:any={success:true,data:{tat:6}},status=200,fail=false;
 t.mock.method(globalThis,'fetch',async ()=>{if(fail)throw new DOMException('Timed out','TimeoutError');return new Response(JSON.stringify(response),{status});});
 try{
  const service=new DelhiveryService();assert.equal(await service.estimateTransitDays('110001'),6);
  for(const tat of [undefined,null,'6',-1,1.5,61]){response={success:true,data:{tat}};assert.equal(await service.estimateTransitDays('110001'),null);}
  response={success:false,data:{tat:1}};assert.equal(await service.estimateTransitDays('110001'),null);
  response={success:true,data:{tat:1}};for(const code of [401,429,500]){status=code;assert.equal(await service.estimateTransitDays('110001'),null);}
  status=200;fail=true;assert.equal(await service.estimateTransitDays('110001'),null);
  assert.equal(await service.estimateTransitDays('invalid'),null);
  delete process.env.DELHIVERY_API_TOKEN;assert.equal(await service.estimateTransitDays('110001'),null);
 }finally{process.env=saved;}
});
