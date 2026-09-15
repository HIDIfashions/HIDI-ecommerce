import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { RazorpayService } from "../razorpay/razorpay.service.js";

const RESERVATION_MINUTES = 15;

type AddressInput = {
  firstName: string;
  lastName?: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode?: string;
};

type PrepareInput = {
  sessionId?: string;
  checkoutToken?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: AddressInput;
};

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
  ) {}

  private validate(input: PrepareInput) {
    if (!input.sessionId || input.sessionId.length < 8) throw new BadRequestException("Cart session is required");
    if (!input.checkoutToken || input.checkoutToken.length < 8 || input.checkoutToken.length > 128) {
      throw new BadRequestException("checkoutToken is required");
    }
    if (!input.customerPhone || !/^[0-9+ -]{8,16}$/.test(input.customerPhone)) {
      throw new BadRequestException("A valid mobile number is required");
    }
    const a = input.shippingAddress;
    if (!a?.firstName || !a.line1 || !a.city || !a.state || !/^\d{6}$/.test(a.postalCode ?? "")) {
      throw new BadRequestException("Complete delivery address with a 6-digit PIN code is required");
    }
  }

  async prepare(input: PrepareInput) {
    this.validate(input);
    await this.releaseExpiredReservations(50);

    const existing = await this.prisma.order.findUnique({
      where: { checkoutToken: input.checkoutToken! },
      include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (existing?.payments[0]?.providerOrderId && existing.status === "PENDING_PAYMENT") {
      return this.checkoutView(existing, existing.payments[0]);
    }
    if (existing) throw new ConflictException("This checkout attempt has ended. Please retry payment.");

    const cart = await this.prisma.cart.findUnique({
      where: { sessionId: input.sessionId! },
      include: {
        items: {
          include: {
            product: true,
            variant: { include: { inventory: true } },
          },
        },
      },
    });
    if (!cart || cart.items.length === 0) throw new BadRequestException("Your bag is empty");

    const orderNumber = this.makeOrderNumber();
    const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);

    const order = await this.prisma.$transaction(async (tx) => {
      let subtotalPaise = 0;
      for (const item of cart.items) {
        if (!item.variant.active || item.product.status !== "ACTIVE" || !item.variant.inventory) {
          throw new ConflictException(`${item.product.name} is no longer available`);
        }
        const locked = await tx.$queryRaw<Array<{ id: string; onHand: number; reserved: number; safetyStock: number }>>`
          SELECT "id", "onHand", "reserved", "safetyStock"
          FROM "Inventory"
          WHERE "variantId" = ${item.variantId}
          FOR UPDATE
        `;
        const inventory = locked[0];
        if (!inventory) throw new ConflictException("Inventory changed. Please refresh your bag.");
        const available = inventory.onHand - inventory.reserved - inventory.safetyStock;
        if (available < item.quantity) {
          throw new ConflictException(`Only ${Math.max(0, available)} of ${item.product.name} / ${item.variant.size} remain`);
        }
        subtotalPaise += item.variant.pricePaise * item.quantity;
      }

      const created = await tx.order.create({
        data: {
          checkoutToken: input.checkoutToken!,
          cartSessionId: input.sessionId!,
          orderNumber,
          status: "PENDING_PAYMENT",
          subtotalPaise,
          totalPaise: subtotalPaise,
          customerEmail: input.customerEmail || null,
          customerPhone: input.customerPhone!,
          shippingAddress: { ...input.shippingAddress!, countryCode: input.shippingAddress?.countryCode ?? "IN" },
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              productName: item.product.name,
              sku: item.variant.sku,
              size: item.variant.size,
              color: item.variant.color,
              quantity: item.quantity,
              unitPricePaise: item.variant.pricePaise,
              totalPaise: item.variant.pricePaise * item.quantity,
            })),
          },
        },
      });

      for (const item of cart.items) {
        await tx.inventory.update({
          where: { variantId: item.variantId },
          data: { reserved: { increment: item.quantity } },
        });
        await tx.inventoryReservation.create({
          data: {
            orderId: created.id,
            variantId: item.variantId,
            quantity: item.quantity,
            expiresAt,
          },
        });
      }
      return created;
    }, { isolationLevel: "Serializable" });

    try {
      const providerOrder = await this.razorpay.createOrder({
        amountPaise: order.totalPaise,
        receipt: order.orderNumber,
        hidiOrderId: order.id,
      });
      const payment = await this.prisma.payment.create({
        data: {
          orderId: order.id,
          providerOrderId: providerOrder.id,
          amountPaise: order.totalPaise,
          status: "CREATED",
        },
      });
      return this.checkoutView(order, payment);
    } catch (error) {
      await this.releaseOrder(order.id, "CANCELLED");
      throw error;
    }
  }

  async orders(sessionId?: string) {
    if (!sessionId || sessionId.length < 8) {
      throw new BadRequestException("Cart session is required");
    }

    const orders = await this.prisma.order.findMany({
      where: {
        cartSessionId: sessionId,
        status: { not: "CANCELLED" },
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: {
              include: { images: { orderBy: { position: "asc" }, take: 1 } },
            },
          },
          orderBy: { id: "asc" },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return orders.map((order) => ({
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      totalPaise: order.totalPaise,
      paymentStatus: order.payments[0]?.status ?? null,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        slug: item.product.slug,
        image: item.product.images[0]?.url ?? null,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        totalPaise: item.totalPaise,
      })),
    }));
  }

  async confirmation(orderNumber: string, sessionId?: string) {
    if (!orderNumber || !sessionId || sessionId.length < 8) {
      throw new BadRequestException("Order and cart session are required");
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: {
          include: {
            product: {
              include: { images: { orderBy: { position: "asc" }, take: 1 } },
            },
          },
          orderBy: { id: "asc" },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!order || order.cartSessionId !== sessionId) {
      throw new NotFoundException("Order not found");
    }

    const payment = order.payments[0] ?? null;
    const address = order.shippingAddress as any;

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      currency: order.currency,
      subtotalPaise: order.subtotalPaise,
      discountPaise: order.discountPaise,
      shippingPaise: order.shippingPaise,
      taxPaise: order.taxPaise,
      totalPaise: order.totalPaise,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      shippingAddress: address,
      payment: payment ? {
        status: payment.status,
        method: payment.method,
        amountPaise: payment.amountPaise,
      } : null,
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        slug: item.product.slug,
        image: item.product.images[0]?.url ?? null,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        totalPaise: item.totalPaise,
      })),
    };
  }

  async releaseExpiredReservations(limit = 100) {
    const expired = await this.prisma.inventoryReservation.findMany({
      where: { status: "ACTIVE", expiresAt: { lt: new Date() }, order: { status: "PENDING_PAYMENT" } },
      orderBy: { expiresAt: "asc" },
      take: limit,
      select: { orderId: true },
      distinct: ["orderId"],
    });
    for (const item of expired) {
      try { await this.releaseOrder(item.orderId, "CANCELLED"); } catch { /* another API instance may have released it */ }
    }
  }

  async releaseOrder(orderId: string, orderStatus: "CANCELLED" = "CANCELLED") {
    await this.prisma.$transaction(async (tx) => {
      const reservations = await tx.inventoryReservation.findMany({ where: { orderId, status: "ACTIVE" } });
      for (const reservation of reservations) {
        const locked = await tx.$queryRaw<Array<{ reserved: number }>>`
          SELECT "reserved" FROM "Inventory" WHERE "variantId" = ${reservation.variantId} FOR UPDATE
        `;
        if (locked[0]) {
          await tx.inventory.update({
            where: { variantId: reservation.variantId },
            data: { reserved: Math.max(0, locked[0].reserved - reservation.quantity) },
          });
        }
      }
      if (reservations.length) {
        await tx.inventoryReservation.updateMany({
          where: { orderId, status: "ACTIVE" },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
      }
      await tx.order.updateMany({
        where: { id: orderId, status: "PENDING_PAYMENT" },
        data: { status: orderStatus },
      });
    }, { isolationLevel: "Serializable" });
  }

  private checkoutView(order: any, payment: any) {
    return {
      hidiOrderId: order.id,
      orderNumber: order.orderNumber,
      amountPaise: order.totalPaise,
      currency: order.currency,
      provider: "RAZORPAY",
      providerOrderId: payment.providerOrderId,
      razorpayKeyId: this.razorpay.publicKey(),
      reservationMinutes: RESERVATION_MINUTES,
    };
  }

  private makeOrderNumber() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const token = randomBytes(3).toString("hex").toUpperCase();
    return `HIDI-${y}${m}${day}-${token}`;
  }
}
