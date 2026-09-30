const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let ts;
try { ts = require(require.resolve('typescript', { paths: [path.join(root, 'apps/api'), path.join(root, 'apps/web')] })); }
catch { ts = require('/usr/local/lib/node_modules/typescript'); }
function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, emitDecoratorMetadata: false } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (!(name in imports)) throw new Error('Unexpected import: ' + name);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const rules = load('apps/api/src/admin/dashboard-rules.ts');
const permissions = new Map();
const noop = () => () => {};
class BadRequestException extends Error {}
const { AdminDashboardController: Controller } = load('apps/api/src/admin/admin-dashboard.controller.ts', {
  '@nestjs/common': { BadRequestException, Controller: noop, Get: noop, Header: noop, Query: noop, UseGuards: noop },
  '../prisma/prisma.service.js': {},
  './admin-auth.js': { AdminGuard: class {}, CurrentAdmin: noop, RequireAdminPermissions: (...values) => (_target, key) => { permissions.set(key, values); } },
  './dashboard-rules.js': rules,
});
const now = new Date('2026-09-28T12:00:00Z');
test('IST midnight boundaries and exclusive end are correct', () => {
  assert.equal(rules.istDate(new Date('2026-09-27T18:30:00Z')), '2026-09-28');
  assert.equal(rules.istDate(new Date('2026-09-27T18:29:59Z')), '2026-09-27');
  const range = rules.reportingRange('2026-09-28', '2026-09-28', now);
  assert.equal(range.start.toISOString(), '2026-09-27T18:30:00.000Z');
  assert.equal(range.end.toISOString(), '2026-09-28T18:30:00.000Z');
  assert.equal(range.previousStart.toISOString(), '2026-09-26T18:30:00.000Z');
});
test('report defaults, leap days and 90-day limit', () => {
  assert.equal(rules.reportingRange(undefined, undefined, now).days, 30);
  assert.equal(rules.reportingRange('2024-02-29', '2024-02-29', now).days, 1);
  for (const args of [['2025-02-29', '2025-03-01'], ['2026-09-28', '2026-09-27'], ['2026-09-29', '2026-09-29'], ['2026-01-01', '2026-09-28'], ['28/09/2026', '2026-09-28']]) assert.throws(() => rules.reportingRange(...args, now));
});
test('search and pagination reject abusive input without building SQL', () => {
  assert.equal(rules.cleanQuery('  HIDI-100  '), 'HIDI-100');
  assert.equal(rules.cleanQuery("x' OR 1=1 --"), "x' OR 1=1 --");
  assert.throws(() => rules.cleanQuery('a'.repeat(101)));
  assert.throws(() => rules.cleanQuery('a\u0000b'));
  assert.equal(rules.pageNumber(), 1); assert.equal(rules.pageNumber('4'), 4);
  for (const n of ['0', '-1', '1.2', '100001', '1 OR 1=1', 'NaN']) assert.throws(() => rules.pageNumber(n));
});
test('daily series fills gaps, aligns prior period and serializes bigint money', () => {
  const range = rules.reportingRange('2026-09-27', '2026-09-28', now);
  const result = rules.salesSeries([{ day: '2026-09-25', orders: 2n, salesPaise: 40000n }, { day: '2026-09-28', orders: 9n, salesPaise: 3000000000n }], range);
  assert.deepEqual(result[0], { day: '2026-09-27', orders: 0, salesPaise: 0, previousSalesPaise: 40000, previousOrders: 2 });
  assert.equal(result[1].salesPaise, 3000000000); assert.doesNotThrow(() => JSON.stringify(result));
  assert.throws(() => rules.safeNumber(9007199254740992n));
  assert.equal(rules.changePercent(100, 0), null); assert.equal(rules.changePercent(150, 100), 50);
  assert.equal(rules.stockAvailable({ onHand: 4, reserved: 5, safetyStock: 1 }), 0);
});
function fakeDb() {
  const calls = [];
  const db = { calls,
    $queryRaw: async (parts, ...args) => { const sql = parts.join('?'); calls.push({ name: 'sql', sql, args });
      if (sql.includes('GROUP BY CONVERT')) return [{ day: '2026-09-27', orders: 1200n, salesPaise: 3000000000n }, { day: '2026-09-26', orders: 1000n, salesPaise: 2000000000n }];
      if (sql.includes('Inventory')) return [{ count: 3n }];
      if (sql.includes('OrderItem')) return [{ productId: 'p1', name: 'Test product', quantity: 100n, salesPaise: 999900n }];
      if (sql.includes('PaymentRefund')) return [{ total: 299900n }];
      throw new Error('Unknown test query');
    },
    order: { groupBy: async arg => { calls.push({ name: 'groupBy', arg }); return [{ status: 'CONFIRMED', _count: { _all: 250 } }]; }, count: async arg => { calls.push({ name: 'order.count', arg }); return 53; }, findMany: async arg => { calls.push({ name: 'order.findMany', arg }); return [{ id: 'o1', orderNumber: 'HIDI-TEST', status: 'CONFIRMED', customerPhone: '9999999999', items: [{ quantity: 2 }], shipments: [], payments: [] }]; } },
    returnRequest: { count: async arg => { calls.push({ name: 'return.count', arg }); return 7; }, findMany: async arg => { calls.push({ name: 'return.findMany', arg }); return [{ id: 'r1' }, { id: 'r2' }]; } },
    product: { findMany: async arg => { calls.push({ name: 'product.findMany', arg }); return [{ id: 'p1', name: 'Test product', status: 'ACTIVE' }]; } },
    user: { findMany: async arg => { calls.push({ name: 'user.findMany', arg }); return [{ id: 'u1', firstName: 'Test', lastName: 'Customer', phone: '9999999999', email: null }]; } },
  }; return db;
}
test('overview uses database totals, not its recent eight-row preview', async () => {
  const db = fakeDb(); const out = await new Controller(db).overview('2026-09-27', '2026-09-27');
  assert.equal(out.metrics.orders, 1200); assert.equal(out.metrics.salesPaise, 3000000000); assert.equal(out.metrics.salesChange, 50);
  assert.equal(out.metrics.aovPaise, 2500000); assert.equal(out.metrics.pendingReturns, 7); assert.equal(out.metrics.lowStock, 3);
  assert.equal(out.recentOrders.length, 1); assert.equal(out.recentOrders[0].itemCount, 2);
  assert.equal(out.metrics.processedCashRefundsPaise, 299900); assert.doesNotThrow(() => JSON.stringify(out));
  assert.deepEqual(db.calls.find(c => c.name === 'groupBy').arg, { by: ['status'], _count: { _all: true } });
  for (const c of db.calls.filter(c => c.name === 'sql' && c.args.length)) assert(c.args.every(a => a instanceof Date));
  assert(db.calls.some(c => c.sql?.includes('SUM(CAST([totalPaise] AS bigint))')));
  assert(out.definitions.sales.includes('Not cash collected')); assert(out.definitions.refunds.includes('wallet credits are excluded'));
});
test('queue pagination is database-backed, stable and delivery workload ignores report dates', async () => {
  const db = fakeDb(); const result = await new Controller(db).queue('deliveries', 'ALL', ' HIDI ', '2');
  assert.equal(result.total, 53); assert.equal(result.pageSize, 25);
  const query = db.calls.find(c => c.name === 'order.findMany').arg;
  assert.equal(query.skip, 25); assert.equal(query.take, 25);
  assert.deepEqual(query.where.status.in, ['CONFIRMED', 'PACKED', 'SHIPPED']);
  assert.deepEqual(query.orderBy, [{ createdAt: 'asc' }, { id: 'asc' }]);
  assert.equal(query.where.OR[0].orderNumber.contains, 'HIDI'); assert(!('createdAt' in query.where));
});
test('returns are item-level requests and include in-progress states', async () => {
  const db = fakeDb(); const result = await new Controller(db).queue('returns');
  assert.equal(result.rows.length, 2); assert.equal(result.total, 7);
  const where = db.calls.find(c => c.name === 'return.findMany').arg.where;
  assert(where.status.in.includes('REFUND_PROCESSING')); assert(where.status.in.includes('EXCHANGE_SHIPPED'));
  assert(!db.calls.some(c => c.name === 'order.findMany'));
});
test('invalid queue filters fail before accessing records', async () => {
  const controller = new Controller(fakeDb());
  await assert.rejects(controller.queue('unknown'), BadRequestException);
  await assert.rejects(controller.queue('deliveries', 'FAILED'), BadRequestException);
  await assert.rejects(controller.queue('returns', 'NOT_A_STATUS'), BadRequestException);
});
test('catalogue role never queries customers or orders in global search', async () => {
  const db = fakeDb(); const result = await new Controller(db).search({ role: 'CATALOG' }, 'test');
  assert.deepEqual(result.results.map(r => r.kind), ['Product']);
  assert.equal(db.calls.length, 1); assert.equal(db.calls[0].name, 'product.findMany');
});
test('owner global search resolves products, orders and customer-order navigation', async () => {
  const db = fakeDb(); const result = await new Controller(db).search({ role: 'OWNER' }, 'test');
  assert.deepEqual(result.results.map(r => r.kind), ['Order', 'Customer', 'Product']);
  assert.equal(result.results[1].href, '/admin/orders?q=9999999999');
  assert.equal(result.results[2].href, '/admin/products/p1');
  const emptyDb = fakeDb(); assert.deepEqual(await new Controller(emptyDb).search({ role: 'OWNER' }, 'a'), { results: [] }); assert.equal(emptyDb.calls.length, 0);
});
test('guarded endpoints retain required existing permissions', () => {
  assert.deepEqual(permissions.get('overview'), ['order:read', 'inventory:read']);
  assert.deepEqual(permissions.get('queue'), ['order:read']);
  const source = fs.readFileSync(path.join(root, 'apps/api/src/admin/admin-dashboard.controller.ts'), 'utf8');
  assert(source.includes('@UseGuards(AdminGuard)')); assert(!source.includes('$queryRawUnsafe'));
  assert(!/\.(create|update|delete|upsert|executeRaw)\(/.test(source));
});
test('CSV neutralizes spreadsheet formulas and escapes quotes', async () => {
  const client = load('apps/web/components/admin/admin-client.ts', { react: {} });
  const originalURL = URL.createObjectURL, originalRevoke = URL.revokeObjectURL, originalDocument = global.document;
  let blob, clicked = false;
  URL.createObjectURL = value => { blob = value; return 'blob:test'; }; URL.revokeObjectURL = () => {};
  global.document = { createElement: () => ({ click() { clicked = true; }, remove() {} }), body: { appendChild() {} } };
  try {
    client.downloadCsv('test.csv', [['=1+1', '+cmd', '@cmd', ' -1', 'A "quoted" name', 125]]);
    const csv = await blob.text(); assert(clicked); assert(csv.includes('"\'=1+1"')); assert(csv.includes('"\'+cmd"')); assert(csv.includes('A ""quoted"" name')); assert(csv.includes('"125"'));
  } finally { URL.createObjectURL = originalURL; URL.revokeObjectURL = originalRevoke; global.document = originalDocument; }
});
test('BFF has an explicit resource allowlist and no public cache or browser secret', () => {
  const source = fs.readFileSync(path.join(root, 'apps/web/app/api/admin/dashboard/[resource]/route.ts'), 'utf8');
  assert(source.includes('isAdminRequest(request)')); assert(source.includes('adminApiHeaders(request)'));
  assert(source.includes('hasOwnProperty.call(routes, resource)')); assert(source.includes('private, no-store'));
  assert(!source.includes('NEXT_PUBLIC_ADMIN')); assert(source.includes('AbortSignal.timeout(20000)'));
});
