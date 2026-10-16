import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../apps/web/app/api/store/[...path]/route.js';

test('Razorpay proxy preserves signed bytes and signature, and disables caching', async () => {
  const previousFetch=globalThis.fetch;
  const previousUrl=process.env.INTERNAL_API_URL;
  process.env.INTERNAL_API_URL='https://api.internal.invalid/v1';
  const raw='{\n  "event": "payment.captured", "fixture": true\n}';
  let forwarded: RequestInit | undefined;
  globalThis.fetch=async (url,init) => {
    assert.equal(String(url),'https://api.internal.invalid/v1/payments/razorpay/webhook');
    forwarded=init;
    return Response.json({ok:true});
  };
  try {
    const response=await POST(new Request('https://preview.invalid/api/store/payments/razorpay/webhook',{
      method:'POST',headers:{'content-type':'application/json','x-razorpay-signature':'synthetic-signature'},body:raw,
    }) as any,{params:Promise.resolve({path:['payments','razorpay','webhook']})});
    assert.equal(new TextDecoder().decode(forwarded!.body as ArrayBuffer),raw);
    assert.equal(new Headers(forwarded!.headers).get('x-razorpay-signature'),'synthetic-signature');
    assert.equal(forwarded!.cache,'no-store');
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(response.status,200);
  }finally{
    globalThis.fetch=previousFetch;
    if(previousUrl===undefined)delete process.env.INTERNAL_API_URL;else process.env.INTERNAL_API_URL=previousUrl;
  }
});
