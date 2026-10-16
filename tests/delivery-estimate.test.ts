import assert from 'node:assert/strict';
import test from 'node:test';
import { courierDateLabel, courierTransitLabel } from '../apps/web/lib/delivery-estimate.js';
const now = new Date('2026-10-16T06:00:00Z');
test('courier transit time is explicitly relative to dispatch', () => {
 assert.equal(courierTransitLabel(1),'Estimated delivery in 1 day after dispatch');assert.equal(courierTransitLabel(6),'Estimated delivery in 6 days after dispatch');assert.equal(courierTransitLabel(0),'Estimated delivery on dispatch day');
 for(const value of [null,undefined,'6',-1,1.5,61,NaN,Infinity])assert.equal(courierTransitLabel(value),null);
});
test('formats courier arrival date in India time', () => assert.match(courierDateLabel('2026-10-21', now)!, /Wed.*21.*Oct|Wed.*Oct.*21/));
test('does not invent dates for missing, invalid or expired estimates', () => {
 for (const value of [undefined, null, '', '2026-02-30', '2026-10-15', 'five days', '2026-13-01']) assert.equal(courierDateLabel(value, now), null);
});
