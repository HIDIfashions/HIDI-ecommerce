import assert from 'node:assert/strict';
import test from 'node:test';
import { amounts } from '../apps/api/src/checkout/offers-engine.js';
for (const subtotal of [100, 9900, 149899, 149900, 500000]) {
 for (const kind of ['NONE', 'PERCENT15']) test(`offer ${kind} keeps shipping zero at ${subtotal}`, () => {
  const quote = amounts(subtotal, {kind});
  assert.equal(quote.shippingPaise, 0);
  assert.equal(quote.totalPaise, quote.subtotalPaise - quote.discountPaise);
 });
}
test('one rupee dress also has zero shipping', () => {
 const quote = amounts(400000, {kind:'DRESS1'}, {pricePaise:99900});
 assert.equal(quote.shippingPaise, 0);assert.equal(quote.totalPaise, 400100);
});
