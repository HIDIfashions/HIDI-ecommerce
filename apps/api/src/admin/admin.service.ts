import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const ALLOWED_STATUSES = ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"] as const;
type ManagedOrderStatus = (typeof ALLOWED_STATUSES)[number];

const NEXT_STATUS: Partial<Record<ManagedOrderStatus, ManagedOrderStatus>> = {
  CONFIRMED: "PACKED",
  PACKED: "SHIPPED",
  SHIPPED: "DELIVERED",
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(query?: string, status?: string) {
    const q = query?.trim();
    const statusFilter = status && status !== "ALL" ? status : undefined;

    const orders = await this.prisma.order.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter as any } : {}),
        ...(q
          ? {
              OR: [
                { orderNumber: { contains: q, mode: "insensitive" } },
                { customerEmail: { contains: q, mode: "insensitive" } },
                { customerPhone: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        items: {
          include: {
            product: {
              select: {
                slug: true,
                images: { orderBy: { position: "asc" }, take: 1 },
              },
            },
          },
          orderBy: { id: "asc" },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        shipments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return {
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        subtotalPaise: order.subtotalPaise,
        shippingPaise: order.shippingPaise,
        discountPaise: order.discountPaise,
        taxPaise: order.taxPaise,
        totalPaise: order.totalPaise,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        shippingAddress: order.shippingAddress,
        payment: order.payments[0]
          ? {
              status: order.payments[0].status,
              method: order.payments[0].method,
              provider: order.payments[0].provider,
              providerPaymentId: order.payments[0].providerPaymentId,
            }
          : null,
        shipment: order.shipments[0]
          ? {
              status: order.shipments[0].status,
              provider: order.shipments[0].provider,
              awb: order.shipments[0].awb,
              trackingUrl: order.shipments[0].trackingUrl,
            }
          : null,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        items: order.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          slug: item.product.slug,
          image: item.product.images[0]?.url ?? null,
          sku: item.sku,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          unitPricePaise: item.unitPricePaise,
          totalPaise: item.totalPaise,
        })),
      })),
    };
  }

  async updateStatus(orderNumber: string, nextStatus: string) {
    if (!ALLOWED_STATUSES.includes(nextStatus as ManagedOrderStatus)) {
      throw new BadRequestException("Unsupported order status");
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true, status: true },
    });

    if (!order) throw new NotFoundException("Order not found");

    const current = order.status as ManagedOrderStatus;
    const requested = nextStatus as ManagedOrderStatus;

    if (current === requested) {
      return this.prisma.order.findUnique({ where: { orderNumber } });
    }

    if (NEXT_STATUS[current] !== requested) {
      throw new BadRequestException(`Order can move from ${order.status} only to ${NEXT_STATUS[current] ?? "no further status"}`);
    }

    return this.prisma.order.update({
      where: { orderNumber },
      data: { status: requested },
    });
  }
}
