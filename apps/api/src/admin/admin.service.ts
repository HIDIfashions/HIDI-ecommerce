import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DelhiveryService } from "../delhivery/delhivery.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const ALLOWED_STATUSES = ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"] as const;
const ACTIVE_RETURN_STATUSES = ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUND_PROCESSING", "EXCHANGE_SHIPPED"];
type ManagedOrderStatus = (typeof ALLOWED_STATUSES)[number];

const NEXT_STATUS: Partial<Record<ManagedOrderStatus, ManagedOrderStatus>> = {
  CONFIRMED: "PACKED",
  PACKED: "SHIPPED",
  SHIPPED: "DELIVERED",
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delhivery: DelhiveryService,
  ) {}

  private serializeOrder(order: any) {
    return {
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
            createdAt: order.payments[0].createdAt,
          }
        : null,
      shipment: order.shipments[0]
        ? {
            status: order.shipments[0].status,
            provider: order.shipments[0].provider,
            awb: order.shipments[0].awb,
            trackingUrl: order.shipments[0].trackingUrl,
            createdAt: order.shipments[0].createdAt,
            updatedAt: order.shipments[0].updatedAt,
          }
        : null,
      returnCount: order.returnRequests?.length ?? 0,
      activeReturnCount: (order.returnRequests ?? []).filter((request: any) => ACTIVE_RETURN_STATUSES.includes(request.status)).length,
      afterSalesStatus: (order.returnRequests ?? []).find((request: any) => ACTIVE_RETURN_STATUSES.includes(request.status))?.status
        ?? order.returnRequests?.[0]?.status
        ?? null,
      returns: (order.returnRequests ?? []).map((request: any) => ({
        id: request.id,
        orderItemId: request.orderItemId,
        type: request.type,
        reason: request.reason,
        detail: request.detail,
        quantity: request.quantity,
        refundDestination: request.refundDestination,
        requestedSize: request.requestedSize,
        refundPaise: request.refundPaise,
        status: request.status,
        adminNote: request.adminNote,
        rejectionReason: request.rejectionReason,
        pickupProvider: request.pickupProvider,
        pickupAwb: request.pickupAwb,
        pickupTrackingUrl: request.pickupTrackingUrl,
        pickupScheduledAt: request.pickupScheduledAt,
        receivedAt: request.receivedAt,
        inventoryDisposition: request.inventoryDisposition,
        refundWalletPaise: request.refundWalletPaise,
        refundCashPaise: request.refundCashPaise,
        refundStatus: request.refundStatus,
        refundProviderId: request.refundProviderId,
        replacementProvider: request.replacementProvider,
        replacementAwb: request.replacementAwb,
        replacementTrackingUrl: request.replacementTrackingUrl,
        replacementShippedAt: request.replacementShippedAt,
        exchangeReservationStatus: request.exchangeReservationStatus,
        createdAt: request.createdAt,
        approvedAt: request.approvedAt,
        processedAt: request.processedAt,
        completedAt: request.completedAt,
      })),
      itemCount: order.items.reduce((sum: number, item: any) => sum + item.quantity, 0),
      items: order.items.map((item: any) => ({
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
    };
  }

  private orderInclude() {
    return {
      items: {
        include: {
          product: {
            select: {
              slug: true,
              images: { orderBy: { position: "asc" as const }, take: 1 },
            },
          },
        },
        orderBy: { id: "asc" as const },
      },
      payments: { orderBy: { createdAt: "desc" as const }, take: 1 },
      shipments: { orderBy: { createdAt: "desc" as const }, take: 1 },
      returnRequests: { orderBy: { createdAt: "desc" as const } },
    };
  }

  async listOrders(query?: string, status?: string) {
    const q = query?.trim();
    const statusFilter = status && status !== "ALL" ? status : undefined;
    const returnsOnly = statusFilter === "RETURNS";

    const orders = await this.prisma.order.findMany({
      where: {
        ...(returnsOnly
          ? { returnRequests: { some: { status: { in: ACTIVE_RETURN_STATUSES } } } }
          : statusFilter
            ? { status: statusFilter as any }
            : {}),
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
      include: this.orderInclude(),
    });

    return { orders: orders.map((order) => this.serializeOrder(order)) };
  }

  async getOrder(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: this.orderInclude(),
    });

    if (!order) throw new NotFoundException("Order not found");
    return { order: this.serializeOrder(order) };
  }

  async checkDelhiveryServiceability(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: { shippingAddress: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    const address = (order.shippingAddress ?? {}) as any;
    const pin = String(address.postalCode ?? "").trim();
    return this.delhivery.checkServiceability(pin);
  }

  async createDelhiveryShipment(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: {
          include: {
            variant: { select: { weightGrams: true } },
          },
        },
        shipments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "PACKED") {
      throw new BadRequestException("Only PACKED orders can be manifested with Delhivery");
    }

    if (order.shipments[0]?.awb) {
      throw new BadRequestException(`This order already has AWB ${order.shipments[0].awb}`);
    }

    const address = (order.shippingAddress ?? {}) as any;
    const customerName = [address.firstName, address.lastName].filter(Boolean).join(" ").trim() || "HIDI Customer";
    const fullAddress = [address.line1, address.line2, address.landmark].filter(Boolean).join(", ");
    const pin = String(address.postalCode ?? "").trim();
    const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const fallbackWeight = Math.max(250, Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || 500));
    const weightGrams = order.items.reduce(
      (sum, item) => sum + (item.variant.weightGrams || fallbackWeight) * item.quantity,
      0,
    );
    const productDescription = order.items
      .map((item) => `${item.productName} (${item.color}, ${item.size}) x${item.quantity}`)
      .join("; ")
      .slice(0, 250);

    const manifested = await this.delhivery.createForwardShipment({
      orderNumber: order.orderNumber,
      customerName,
      phone: order.customerPhone,
      address: fullAddress,
      city: address.city,
      state: address.state,
      pin,
      country: address.countryCode === "IN" || !address.countryCode ? "India" : address.countryCode,
      productDescription,
      quantity,
      weightGrams,
      totalAmountRupees: Math.round(order.totalPaise) / 100,
      paymentMode: "Pre-paid",
    });

    const shipmentData = {
      provider: "DELHIVERY",
      providerOrderId: order.orderNumber,
      awb: manifested.waybill,
      trackingUrl: this.delhivery.publicTrackingUrl(manifested.waybill),
      status: "READY_TO_SHIP" as any,
    };

    try {
      const shipment = order.shipments[0]
        ? await this.prisma.shipment.update({ where: { id: order.shipments[0].id }, data: shipmentData })
        : await this.prisma.shipment.create({ data: { orderId: order.id, ...shipmentData } });

      return { shipment, delhivery: { status: manifested.status, remarks: manifested.remarks } };
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new BadRequestException("Delhivery returned an AWB already assigned to another order");
      }
      throw error;
    }
  }

  async trackDelhivery(orderNumber: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { order: { orderNumber }, provider: "DELHIVERY" },
      orderBy: { createdAt: "desc" },
      select: { awb: true },
    });
    if (!shipment?.awb) throw new BadRequestException("No Delhivery AWB exists for this order");
    return this.delhivery.track(shipment.awb);
  }

  async saveShipment(
    orderNumber: string,
    input: { provider?: string; awb?: string; trackingUrl?: string },
  ) {
    const provider = input.provider?.trim();
    const awb = input.awb?.trim();
    const trackingUrl = input.trackingUrl?.trim();

    if (!provider) throw new BadRequestException("Courier is required");
    if (!awb) throw new BadRequestException("AWB / tracking number is required");
    if (!trackingUrl) throw new BadRequestException("Tracking URL is required");

    try {
      const parsed = new URL(trackingUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("invalid protocol");
    } catch {
      throw new BadRequestException("Enter a valid tracking URL beginning with https:// or http://");
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        status: true,
        shipments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "PACKED") {
      throw new BadRequestException("Shipment details can be prepared only when the order is PACKED");
    }

    const existing = order.shipments[0];
    const data = {
      provider,
      awb,
      trackingUrl,
      status: "READY_TO_SHIP" as any,
    };

    try {
      const shipment = existing
        ? await this.prisma.shipment.update({ where: { id: existing.id }, data })
        : await this.prisma.shipment.create({ data: { orderId: order.id, ...data } });

      return { shipment };
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new BadRequestException("This AWB is already assigned to another order");
      }
      throw error;
    }
  }

  async updateStatus(orderNumber: string, nextStatus: string) {
    if (!ALLOWED_STATUSES.includes(nextStatus as ManagedOrderStatus)) {
      throw new BadRequestException("Unsupported order status");
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        status: true,
        shipments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, provider: true, awb: true, trackingUrl: true },
        },
      },
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

    if (requested === "SHIPPED") {
      const shipment = order.shipments[0];
      if (!shipment?.provider || !shipment?.awb || !shipment?.trackingUrl) {
        throw new BadRequestException("Add courier, AWB and tracking URL before marking this order as shipped");
      }

      return this.prisma.$transaction(async (tx) => {
        await tx.shipment.update({
          where: { id: shipment.id },
          data: { status: "SHIPPED" as any, shippedAt: new Date() },
        });
        return tx.order.update({
          where: { orderNumber },
          data: { status: requested },
        });
      });
    }

    if (requested === "DELIVERED") {
      const shipment = order.shipments[0];
      return this.prisma.$transaction(async (tx) => {
        if (shipment) {
          await tx.shipment.update({
            where: { id: shipment.id },
            data: { status: "DELIVERED" as any, deliveredAt: new Date() },
          });
        }
        return tx.order.update({
          where: { orderNumber },
          data: { status: requested },
        });
      });
    }

    return this.prisma.order.update({
      where: { orderNumber },
      data: { status: requested },
    });
  }
}
