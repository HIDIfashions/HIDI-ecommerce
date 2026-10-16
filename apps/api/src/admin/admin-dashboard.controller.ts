import { BadRequestException, Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminGuard, CurrentAdmin, RequireAdminPermissions, type AdminActor } from './admin-auth.js';
import { ACTIVE_RETURNS, SALES_STATUSES, cleanQuery, pageNumber, reportingRange, safeNumber, salesSeries, changePercent } from './dashboard-rules.js';
import { deletedProductPredicate } from './products/product-input.js';

const ORDER_SELECT = {
  id: true, orderNumber: true, status: true, totalPaise: true, createdAt: true,
  customerEmail: true, customerPhone: true,
  items: { select: { quantity: true } },
  shipments: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { provider: true, awb: true, status: true, shippedAt: true, deliveredAt: true, updatedAt: true } },
  payments: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { status: true } },
} as const;
function validate<T>(fn: () => T): T {
  try { return fn(); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid filters'); }
}

/** Read-only projections over existing Azure SQL tables. Business writes stay in audited controllers. */
@Controller('admin/dashboard')
@UseGuards(AdminGuard)
export class AdminDashboardController {
  constructor(private readonly db: PrismaService) {}

  @Get('overview')
  @Header('Cache-Control', 'private, no-store')
  @RequireAdminPermissions('order:read', 'inventory:read')
  async overview(@Query('from') from?: string, @Query('to') to?: string) {
    const range = validate(() => reportingRange(from, to));
    const { start, end, previousStart } = range;
    // CAST before SUM avoids SQL Server's 32-bit SUM(int) overflow. Parameters never enter SQL text.
    const [daily, pipeline, pendingReturns, lowStock, recentOrders, bestsellers, refunds] = await Promise.all([
      this.db.$queryRaw<{ day: string; orders: bigint; salesPaise: bigint }[]>`
        SELECT CONVERT(char(10), DATEADD(minute, 330, [createdAt]), 23) AS [day],
          COUNT_BIG(*) AS [orders], SUM(CAST([totalPaise] AS bigint)) AS [salesPaise]
        FROM [dbo].[Order]
        WHERE [createdAt] >= ${previousStart} AND [createdAt] < ${end}
          AND [status] IN ('CONFIRMED','PACKED','SHIPPED','DELIVERED','RETURN_REQUESTED','RETURNED','REFUNDED')
        GROUP BY CONVERT(char(10), DATEADD(minute, 330, [createdAt]), 23)
        ORDER BY [day]`,
      this.db.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.returnRequest.count({ where: { status: { in: ACTIVE_RETURNS } } }),
      this.db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT_BIG(*) AS [count] FROM [dbo].[Inventory] i
        INNER JOIN [dbo].[ProductVariant] v ON v.[id] = i.[variantId]
        INNER JOIN [dbo].[Product] p ON p.[id] = v.[productId]
        WHERE v.[active] = 1 AND p.[status] = 'ACTIVE'
          AND (i.[onHand] - i.[reserved] - i.[safetyStock]) <= i.[reorderLevel]`,
      this.db.order.findMany({ where: { status: { in: SALES_STATUSES } }, select: ORDER_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 8 }),
      this.db.$queryRaw<{ productId: string; name: string; quantity: bigint; salesPaise: bigint }[]>`
        SELECT TOP (5) i.[productId], MAX(i.[productName]) AS [name],
          SUM(CAST(i.[quantity] AS bigint)) AS [quantity], SUM(CAST(i.[totalPaise] AS bigint)) AS [salesPaise]
        FROM [dbo].[OrderItem] i INNER JOIN [dbo].[Order] o ON o.[id] = i.[orderId]
        WHERE o.[createdAt] >= ${start} AND o.[createdAt] < ${end}
          AND o.[status] IN ('CONFIRMED','PACKED','SHIPPED','DELIVERED','RETURN_REQUESTED','RETURNED','REFUNDED')
        GROUP BY i.[productId] ORDER BY [quantity] DESC, i.[productId]`,
      this.db.$queryRaw<{ total: bigint | null }[]>`
        SELECT SUM(CAST([amountPaise] AS bigint)) AS [total] FROM [dbo].[PaymentRefund]
        WHERE [processedAt] >= ${start} AND [processedAt] < ${end} AND [status] = 'PROCESSED'`,
    ]);
    const series = salesSeries(daily, range);
    const salesPaise = series.reduce((sum, row) => sum + row.salesPaise, 0);
    const previousSalesPaise = series.reduce((sum, row) => sum + row.previousSalesPaise, 0);
    const orders = series.reduce((sum, row) => sum + row.orders, 0);
    const previousOrders = series.reduce((sum, row) => sum + row.previousOrders, 0);
    return {
      asOf: new Date().toISOString(), timeZone: 'Asia/Kolkata', period: { from: range.from, to: range.to, days: range.days },
      metrics: { salesPaise, previousSalesPaise, salesChange: changePercent(salesPaise, previousSalesPaise), orders, ordersChange: changePercent(orders, previousOrders), aovPaise: orders ? Math.round(salesPaise / orders) : 0, processedCashRefundsPaise: safeNumber(refunds[0]?.total), pendingReturns, lowStock: safeNumber(lowStock[0]?.count) },
      series, pipeline: pipeline.map(p => ({ status: p.status, count: p._count._all })),
      recentOrders: recentOrders.map(o => ({ ...o, itemCount: o.items.reduce((sum, item) => sum + item.quantity, 0), items: undefined })),
      bestsellers: bestsellers.map(p => ({ ...p, quantity: safeNumber(p.quantity), salesPaise: safeNumber(p.salesPaise) })),
      definitions: {
        sales: 'Booked order value, including shipping and tax and after discounts; includes returned/refunded orders before refunds; excludes pending-payment, payment-review and cancelled orders. Not cash collected or accounting revenue.',
        refunds: 'Cash refunds marked PROCESSED by processing date; wallet credits are excluded. Refunds may relate to earlier order cohorts.',
        queues: 'Current all-time workload. No date filter applies to queues or recent orders.',
        comparison: 'Previous equal-length calendar period; today is incomplete. Historical booked value reflects the current order status.',
      },
    };
  }

  @Get('queue')
  @Header('Cache-Control', 'private, no-store')
  @RequireAdminPermissions('order:read')
  async queue(@Query('kind') kind = 'orders', @Query('status') status = 'ALL', @Query('q') query?: string, @Query('page') pageValue?: string) {
    const q = validate(() => cleanQuery(query));
    const page = validate(() => pageNumber(pageValue));
    const take = 25, skip = (page - 1) * take;
    if (!['orders', 'deliveries', 'returns'].includes(kind)) throw new BadRequestException('Unknown queue');
    const orderSearch = q ? { OR: [{ orderNumber: { contains: q } }, { customerEmail: { contains: q } }, { customerPhone: { contains: q } }, { shipments: { some: { awb: { contains: q } } } }] } : {};
    if (kind === 'returns') {
      if (!['ALL', ...ACTIVE_RETURNS, 'REFUNDED', 'EXCHANGED', 'COMPLETED', 'REJECTED', 'CANCELLED'].includes(status)) throw new BadRequestException('Invalid return status');
      const where = { ...(status === 'ALL' ? { status: { in: ACTIVE_RETURNS } } : { status }), ...(q ? { order: orderSearch } : {}) };
      const [total, rows] = await Promise.all([
        this.db.returnRequest.count({ where }),
        this.db.returnRequest.findMany({ where, skip, take, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, type: true, status: true, reason: true, quantity: true, refundPaise: true, refundStatus: true, createdAt: true, order: { select: { orderNumber: true, customerPhone: true } }, orderItem: { select: { productName: true, size: true } } } }),
      ]);
      return { kind, page, pageSize: take, total, rows, asOf: new Date().toISOString() };
    }
    const allowed = kind === 'deliveries' ? ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] : ['PENDING_PAYMENT', ...SALES_STATUSES, 'CANCELLED', 'PAYMENT_REVIEW'];
    if (status !== 'ALL' && !allowed.includes(status)) throw new BadRequestException('Invalid order status');
    const where = { ...orderSearch, ...(status !== 'ALL' ? { status } : kind === 'deliveries' ? { status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED'] } } : {}) };
    const [total, rows] = await Promise.all([
      this.db.order.count({ where }),
      this.db.order.findMany({ where, select: ORDER_SELECT, skip, take, orderBy: [{ createdAt: kind === 'deliveries' ? 'asc' : 'desc' }, { id: 'asc' }] }),
    ]);
    return { kind, page, pageSize: take, total, rows: rows.map(o => ({ ...o, itemCount: o.items.reduce((sum, item) => sum + item.quantity, 0), items: undefined })), asOf: new Date().toISOString() };
  }

  @Get('search')
  @Header('Cache-Control', 'private, no-store')
  async search(@CurrentAdmin() actor: AdminActor, @Query('q') query?: string) {
    const q = validate(() => cleanQuery(query));
    if (q.length < 2) return { results: [] };
    // All existing roles can read catalogue. CATALOG must never receive order/customer data.
    const canReadOrders = ['OWNER', 'OPERATIONS', 'SUPPORT'].includes(actor.role);
    const [products, orders, customers] = await Promise.all([
      this.db.product.findMany({ where: { NOT: deletedProductPredicate(), OR: [{ name: { contains: q } }, { slug: { contains: q } }, { variants: { some: { sku: { contains: q } } } }] }, select: { id: true, name: true, status: true }, orderBy: { name: 'asc' }, take: 6 }),
      canReadOrders ? this.db.order.findMany({ where: { OR: [{ orderNumber: { contains: q } }, { customerEmail: { contains: q } }, { customerPhone: { contains: q } }, { shipments: { some: { awb: { contains: q } } } }] }, select: { id: true, orderNumber: true, customerPhone: true, status: true }, orderBy: { createdAt: 'desc' }, take: 6 }) : Promise.resolve([]),
      canReadOrders ? this.db.user.findMany({ where: { OR: [{ email: { contains: q } }, { phone: { contains: q } }, { firstName: { contains: q } }, { lastName: { contains: q } }] }, select: { id: true, firstName: true, lastName: true, email: true, phone: true }, orderBy: { createdAt: 'desc' }, take: 4 }) : Promise.resolve([]),
    ]);
    return { results: [
      ...orders.map(o => ({ id: o.id, kind: 'Order', title: o.orderNumber, detail: `${o.status} · ${o.customerPhone}`, href: `/admin/orders/${encodeURIComponent(o.orderNumber)}` })),
      ...customers.filter(c => c.phone || c.email).map(c => ({ id: c.id, kind: 'Customer', title: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.phone || c.email || 'Customer', detail: 'View orders · ' + (c.phone || c.email), href: `/admin/orders?q=${encodeURIComponent(c.phone || c.email || '')}` })),
      ...products.map(p => ({ id: p.id, kind: 'Product', title: p.name, detail: p.status, href: `/admin/products/${encodeURIComponent(p.id)}` })),
    ] };
  }
}
