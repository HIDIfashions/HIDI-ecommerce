import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminDashboardController } from '../apps/api/src/admin/admin-dashboard.controller.js';

function matches(row: any, where: any): boolean {
  if (where.NOT && matches(row, where.NOT)) return false;
  if (where.OR && !where.OR.some((part: any) => matches(row, part))) return false;
  if (where.status && row.status !== where.status) return false;
  for (const key of ['name', 'slug', 'sku']) {
    if (where[key]?.contains && !row[key]?.includes(where[key].contains)) return false;
    if (where[key]?.startsWith && !row[key]?.startsWith(where[key].startsWith)) return false;
  }
  if (where.variants?.some && !row.variants.some((variant: any) => matches(variant, where.variants.some))) return false;
  return true;
}

function fixture() {
  const rows = [
    ...Array.from({ length: 8 }, (_, n) => ({ id: `gone_${n}`, name: `Kurta ${n}`, slug: `hidi-internal-deleted-${n}`, status: 'ARCHIVED', variants: [{ sku: 'KURTA-GONE' }] })),
    { id: 'legacy_gone', name: 'Kurta legacy', slug: 'legacy-kurta', status: 'DELETED', variants: [{ sku: 'KURTA-GONE' }] },
    { id: 'archived', name: 'Kurta archived', slug: 'ordinary-archived-kurta', status: 'ARCHIVED', variants: [{ sku: 'KURTA-ARCHIVED' }] },
    { id: 'draft', name: 'Kurta draft', slug: 'draft-kurta', status: 'DRAFT', variants: [{ sku: 'KURTA-DRAFT' }] },
    { id: 'active', name: 'Kurta active', slug: 'active-kurta', status: 'ACTIVE', variants: [{ sku: 'KURTA-ACTIVE' }] },
  ];
  const calls: string[] = [];
  const db: any = {
    product: { findMany: async (args: any) => { calls.push('products'); return rows.filter(row => matches(row, args.where)).slice(0, args.take); } },
    order: { findMany: async () => { calls.push('orders'); return [{ id: 'order_1', orderNumber: 'ORDER-1', status: 'DELIVERED', customerPhone: '9000000000' }]; } },
    user: { findMany: async () => { calls.push('customers'); return [{ id: 'customer_1', firstName: 'Kurta', lastName: 'Customer', phone: '9000000000' }]; } },
  };
  return { controller: new AdminDashboardController(db), calls };
}

test('global admin search excludes deleted products before the six-result limit while retaining ordinary archived products and order history', async () => {
  const f = fixture();
  const result = await f.controller.search({ role: 'OWNER' } as any, 'Kurta');
  assert.deepEqual(result.results.filter(row => row.kind === 'Product').map(row => row.id).sort(), ['active', 'archived', 'draft']);
  assert.equal(result.results.find(row => row.id === 'archived')?.detail, 'ARCHIVED');
  assert.equal(result.results.find(row => row.id === 'order_1')?.href, '/admin/orders/ORDER-1');
  assert.equal(result.results.find(row => row.id === 'customer_1')?.kind, 'Customer');
  assert.deepEqual(f.calls, ['products', 'orders', 'customers']);
});

test('catalogue search preserves SKU matching and cannot disclose orders or customers', async () => {
  const f = fixture();
  const result = await f.controller.search({ role: 'CATALOG' } as any, 'KURTA-ACTIVE');
  assert.deepEqual(result.results.map(row => row.id), ['active']);
  assert.deepEqual(f.calls, ['products']);
  const deleted = await f.controller.search({ role: 'CATALOG' } as any, 'KURTA-GONE');
  assert.deepEqual(deleted.results, []);
});

test('a one-letter search performs no database lookup', async () => {
  const f = fixture();
  assert.deepEqual(await f.controller.search({ role: 'OWNER' } as any, 'K'), { results: [] });
  assert.deepEqual(f.calls, []);
});
