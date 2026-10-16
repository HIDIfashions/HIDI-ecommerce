import assert from 'node:assert/strict';
import test from 'node:test';
import { courierDateLabel } from '../apps/web/lib/delivery-estimate.js';
const now = new Date('2026-10-16T06:00:00Z');
test('formats courier arrival date in India time', () => assert.match(courierDateLabel('2026-10-21', now)!, /Wed.*21.*Oct|Wed.*Oct.*21/));
test('does not invent dates for missing, invalid or expired estimates', () => {
 for (const value of [undefined, null, '', '2026-02-30', '2026-10-15', 'five days', '2026-13-01']) assert.equal(courierDateLabel(value, now), null);
});
