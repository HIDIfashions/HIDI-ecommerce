import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DelhiveryService } from "../delhivery/delhivery.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { appendOrderAudit } from "../audit/order-audit.js";

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
      activeReturnQuantity: (order.returnRequests ?? []).filter((request: any) => ACTIVE_RETURN_STATUSES.includes(request.status)).reduce((sum: number, request: any) => sum + request.quantity, 0),
      afterSalesStatus: (order.returnRequests ?? []).find((request: any) => ACTIVE_RETURN_STATUSES.includes(request.status))?.status
        ?? order.returnRequests?.[0]?.status
        ?? null,
      afterSalesType: (order.returnRequests ?? []).find((request: any) => ACTIVE_RETURN_STATUSES.includes(request.status))?.type
        ?? order.returnRequests?.[0]?.type
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
      auditEvents: (order.auditEvents ?? []).map((event: any) => ({
        id: event.id,
        eventType: event.eventType,
        actorType: event.actorType,
        actorId: event.actorId,
        entityType: event.entityType,
        entityId: event.entityId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        amountPaise: event.amountPaise,
        correlationId: event.correlationId,
        source: event.source,
        metadata: event.metadata,
        createdAt: event.createdAt,
      })),
    };
  }

  private orderInclude(includeAudit = false) {
    const base = {
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
    return includeAudit
      ? {
          ...base,
          auditEvents: {
            orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
            take: 200,
          },
        }
      : base;
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
      include: this.orderInclude(false),
    });

    return { orders: orders.map((order) => this.serializeOrder(order)) };
  }

  async getOrder(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: this.orderInclude(true),
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
      return await this.prisma.$transaction(async (tx) => {
        const shipment = order.shipments[0]
          ? await tx.shipment.update({ where: { id: order.shipments[0].id }, data: shipmentData })
          : await tx.shipment.create({ data: { orderId: order.id, ...shipmentData } });

        await appendOrderAudit(tx, {
          orderId: order.id,
          eventType: "SHIPMENT_PREPARED",
          actorType: "ADMIN",
          actorId: "HIDI_ADMIN",
          entityType: "SHIPMENT",
          entityId: shipment.id,
          toStatus: "READY_TO_SHIP",
          eventKey: `shipment:${manifested.waybill}:prepared`,
          source: "ADMIN_PORTAL",
          metadata: {
            provider: "DELHIVERY",
            awb: manifested.waybill,
            trackingUrl: shipmentData.trackingUrl,
          },
        });

        return { shipment, delhivery: { status: manifested.status, remarks: manifested.remarks } };
      });
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
      return await this.prisma.$transaction(async (tx) => {
        const shipment = existing
          ? await tx.shipment.update({ where: { id: existing.id }, data })
          : await tx.shipment.create({ data: { orderId: order.id, ...data } });

        await appendOrderAudit(tx, {
          orderId: order.id,
          eventType: "SHIPMENT_PREPARED",
          actorType: "ADMIN",
          actorId: "HIDI_ADMIN",
          entityType: "SHIPMENT",
          entityId: shipment.id,
          toStatus: "READY_TO_SHIP",
          eventKey: `shipment:${awb}:prepared`,
          source: "ADMIN_PORTAL",
          metadata: { provider, awb, trackingUrl },
        });

        return { shipment };
      });
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

    const shipment = order.shipments[0];
    if (requested === "SHIPPED" && (!shipment?.provider || !shipment?.awb || !shipment?.trackingUrl)) {
      throw new BadRequestException("Add courier, AWB and tracking URL before marking this order as shipped");
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      if (requested === "SHIPPED" && shipment) {
        await tx.shipment.update({
          where: { id: shipment.id },
          data: { status: "SHIPPED" as any, shippedAt: now },
        });
      }

      if (requested === "DELIVERED" && shipment) {
        await tx.shipment.update({
          where: { id: shipment.id },
          data: { status: "DELIVERED" as any, deliveredAt: now },
        });
      }

      const updated = await tx.order.update({
        where: { orderNumber },
        data: { status: requested },
      });

      await appendOrderAudit(tx, {
        orderId: order.id,
        eventType: `ORDER_${requested}`,
        actorType: "ADMIN",
        actorId: "HIDI_ADMIN",
        entityType: "ORDER",
        entityId: order.id,
        fromStatus: current,
        toStatus: requested,
        eventKey: `order:${order.id}:status:${requested}`,
        source: "ADMIN_PORTAL",
        metadata: shipment
          ? { shipmentId: shipment.id, provider: shipment.provider, awb: shipment.awb }
          : undefined,
      });

      return updated;
    });
  }

}
