/** Shared, deterministic rules for HIDI reporting. All money is integer paise. */
export const SALES_STATUSES = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'];
export const ACTIVE_RETURNS = ['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'RECEIVED', 'REFUND_PROCESSING', 'EXCHANGE_SHIPPED'];
export const DAY = 86_400_000;
const IST_OFFSET = 330 * 60_000;
export function istDate(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET).toISOString().slice(0, 10);
}
function dateOnly(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use dates in YYYY-MM-DD format.');
  const utc = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date.');
  return utc;
}
export function reportingRange(from?: string, to?: string, now = new Date()) {
  const last = to || istDate(now);
  const endDay = dateOnly(last);
  const first = from || new Date(endDay - 29 * DAY).toISOString().slice(0, 10);
  const startDay = dateOnly(first);
  const days = (endDay - startDay) / DAY + 1;
  if (days < 1 || days > 90) throw new Error('Choose a reporting period of 1–90 days.');
  if (last > istDate(now)) throw new Error('Future reporting dates are not supported.');
  const start = new Date(startDay - IST_OFFSET);
  const end = new Date(endDay + DAY - IST_OFFSET);
  return { from: first, to: last, start, end, previousStart: new Date(start.getTime() - days * DAY), days };
}
export function pageNumber(value?: string): number {
  if (value === undefined) return 1;
  if (!/^\d+$/.test(value)) throw new Error('Invalid page.');
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error('Invalid page.');
  return page;
}
export function cleanQuery(value?: string): string {
  const q = (value || '').trim();
  if (q.length > 100 || /[\x00-\x1f\x7f]/.test(q)) throw new Error('Search must be at most 100 characters without control characters.');
  return q;
}
export function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n)) throw new Error('Reporting value is outside the safe integer range.');
  return n;
}
export function changePercent(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;
}
export function salesSeries(rows: { day: string; orders: unknown; salesPaise: unknown }[], range: ReturnType<typeof reportingRange>) {
  const byDay = new Map(rows.map(row => [row.day, row]));
  return Array.from({ length: range.days }, (_, i) => {
    const day = istDate(new Date(range.start.getTime() + i * DAY));
    const previousDay = istDate(new Date(range.previousStart.getTime() + i * DAY));
    const row = byDay.get(day), previous = byDay.get(previousDay);
    return { day, orders: safeNumber(row?.orders), salesPaise: safeNumber(row?.salesPaise), previousSalesPaise: safeNumber(previous?.salesPaise), previousOrders: safeNumber(previous?.orders) };
  });
}
export function stockAvailable(stock: { onHand: number; reserved: number; safetyStock: number }) {
  return Math.max(0, stock.onHand - stock.reserved - stock.safetyStock);
}
