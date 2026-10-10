import assert from 'node:assert/strict';
import test from 'node:test';
import { shippingQuote } from '../apps/api/src/checkout/shipping-policy.js';
import { sanitizeCheckoutPhone } from '../apps/web/lib/checkout-phone.js';
test('empty cart has no shipping charge',()=>assert.deepEqual(shippingQuote(0),{shippingPaise:0,totalPaise:0}));
for(const invalid of [-1,0.5,NaN,Infinity,2147483648]) test(`reject invalid shipping subtotal ${invalid}`,()=>assert.throws(()=>shippingQuote(invalid)));
test('phone sanitation covers typing, paste, duplicate plus, punctuation and length',()=>{
  for(const [raw,expected] of [['+91 (987) 654-3210','+919876543210'],['abc9876543210','9876543210'],['++91+9876543210','+919876543210'],['98+76543210','9876543210'],['+12345678901234567890','+123456789012345'],['','']]) assert.equal(sanitizeCheckoutPhone(raw),expected);
});
