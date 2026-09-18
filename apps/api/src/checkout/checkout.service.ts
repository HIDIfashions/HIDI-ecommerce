import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { RazorpayService } from "../razorpay/razorpay.service.js";
import type { VerifiedAuthUser } from "../auth/supabase-auth.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { withSerializableRetry } from "../wallet/wallet-transaction.js";

const RESERVATION_MINUTES = 15;
const MAX_PAISE = 2_147_483_647;

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
  walletPaise?: number;
  expectedTotalPaise?: number;
};

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly wallet: WalletService,
  ) {}

  private validate(input: PrepareInput) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new BadRequestException("Checkout details are required");
    if (typeof input.sessionId !== "string" || input.sessionId.length < 8 || input.sessionId.length > 128) throw new BadRequestException("Cart session is required");
    if (typeof input.checkoutToken !== "string" || input.checkoutToken.length < 8 || input.checkoutToken.length > 128) {
      throw new BadRequestException("checkoutToken is required");
    }
    if (typeof input.customerPhone !== "string" || !/^[0-9+ -]{8,16}$/.test(input.customerPhone)) {
      throw new BadRequestException("A valid mobile number is required");
    }
    if (input.walletPaise !== undefined && (!Number.isSafeInteger(input.walletPaise) || input.walletPaise < 0 || input.walletPaise > MAX_PAISE)) throw new BadRequestException("Wallet amount must be nonnegative integer paise within the supported range");
    if (input.expectedTotalPaise !== undefined && (!Number.isSafeInteger(input.expectedTotalPaise) || input.expectedTotalPaise < 0 || input.expectedTotalPaise > MAX_PAISE)) throw new BadRequestException("Expected total must be nonnegative integer paise within the supported range");
    const a = input.shippingAddress;
    if (!a?.firstName || !a.line1 || !a.city || !a.state || !/^\d{6}$/.test(a.postalCode ?? "")) {
      throw new BadRequestException("Complete delivery address with a 6-digit PIN code is required");
    }
  }

  async prepare(input: PrepareInput, auth: VerifiedAuthUser | null = null) {
    this.validate(input);
    const walletPaise = input.walletPaise ?? 0;
    if (walletPaise > 0 && !auth) throw new UnauthorizedException("Sign in before using your wallet");
    if (walletPaise > 0 && !this.wallet.enabled()) throw new BadRequestException("Wallet redemption is not enabled");
    const walletEnabled = this.wallet.enabled();
    const identityWallet = auth ? (walletEnabled ? await this.wallet.ensureWallet(auth) : await this.prisma.walletAccount.findUnique({ where: { authSubject: auth.id } })) : null;
    const walletAccount = walletEnabled ? identityWallet : null;
    const customer = auth && !identityWallet
      ? auth.phoneVerified && auth.phone
        ? await this.prisma.user.upsert({
            where: { phone: auth.phone },
            create: { phone: auth.phone, email: auth.email ?? null },
            update: auth.email ? { email: auth.email } : {},
          })
        : auth.email
          ? await this.prisma.user.upsert({
              where: { email: auth.email },
              create: { email: auth.email },
              update: {},
            })
          : null
      : null;
    if (customer && auth) {
      const binding = await this.prisma.walletAccount.findUnique({ where: { userId: customer.id } });
      if (binding && binding.authSubject !== auth.id) throw new ConflictException("Customer identity requires support review");
    }
    const userId = identityWallet?.userId ?? customer?.id ?? null;
    await this.releaseExpiredReservations(50);

    const existing = await this.prisma.order.findUnique({
      where: { checkoutToken: input.checkoutToken! },
      include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (existing) {
      if (existing.cartSessionId !== input.sessionId || existing.userId !== userId || existing.walletAppliedPaise !== walletPaise) {
        throw new ConflictException("Checkout identity or wallet amount changed. Start a new checkout attempt.");
      }
      const payment = existing.payments[0];
      if (payment && ((payment.providerOrderId && existing.status === "PENDING_PAYMENT") || ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"].includes(existing.status))) return this.checkoutView(existing, payment);
      throw new ConflictException("This checkout attempt has ended. Please retry payment.");
    }

    const orderNumber = this.makeOrderNumber();
    const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);

    const order = await withSerializableRetry(this.prisma, async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { sessionId: input.sessionId! },
        include: { items: { orderBy: { variantId: "asc" }, include: { product: true, variant: { include: { inventory: true } } } } },
      });
      if (!cart || !cart.items.length) throw new BadRequestException("Your bag is empty");
      if (cart.userId && cart.userId !== userId) throw new UnauthorizedException("This bag belongs to another account");
      let subtotalPaise = 0;
      for (const item of cart.items) {
        if (!item.variant.active || item.product.status !== "ACTIVE" || !item.variant.inventory) {
          throw new ConflictException(`${item.product.name} is no longer available`);
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.variant.pricePaise) || item.variant.pricePaise <= 0) throw new ConflictException("Invalid product quantity or price");
        subtotalPaise += item.variant.pricePaise * item.quantity;
      }
      if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise <= 0 || subtotalPaise > MAX_PAISE) throw new BadRequestException("Invalid order total");
      if (input.expectedTotalPaise !== undefined && input.expectedTotalPaise !== subtotalPaise) throw new ConflictException("Product prices changed. Refresh your bag and review the total before paying.");
      if (walletPaise > subtotalPaise) throw new BadRequestException("Wallet amount cannot exceed the order total");
      if (subtotalPaise - walletPaise > 0 && subtotalPaise - walletPaise < 100) throw new BadRequestException("The remaining online payment must be at least ₹1. Use the wallet for the full total or reduce the wallet amount.");

      const created = await tx.order.create({
        data: {
          checkoutToken: input.checkoutToken!,
          cartSessionId: input.sessionId!,
          orderNumber,
          status: "PENDING_PAYMENT",
          userId,
          subtotalPaise,
          totalPaise: subtotalPaise,
          walletAppliedPaise: walletPaise,
          customerEmail: auth?.email ?? input.customerEmail ?? null,
          customerPhone: auth?.phoneVerified && auth.phone ? auth.phone : input.customerPhone!,
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
      // Created order is exclusively owned by this transaction. Every other
      // lifecycle path locks Order first, then Wallet, then sorted Inventory.
      if (walletAccount) {
        await this.wallet.reserve(tx, walletAccount.id, created.id, walletPaise, expiresAt);
        await this.wallet.createAccrual(tx, created, walletAccount.id);
      }
      for (const item of cart.items) {
        const locked = await tx.$queryRaw<Array<{ onHand: number; reserved: number; safetyStock: number }>>`
          SELECT "onHand", "reserved", "safetyStock" FROM "Inventory" WHERE "variantId" = ${item.variantId} FOR UPDATE
        `;
        const inventory = locked[0];
        const available = inventory ? inventory.onHand - inventory.reserved - inventory.safetyStock : 0;
        if (!inventory || available < item.quantity) throw new ConflictException(`Only ${Math.max(0, available)} of ${item.product.name} / ${item.variant.size} remain`);
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
      if (userId && !cart.userId) await tx.cart.update({ where: { id: cart.id }, data: { userId } });
      if (created.totalPaise === walletPaise) {
        if (!await this.wallet.consume(tx, created.id)) throw new ConflictException("Wallet funds changed. Please review your bag and try again.");
        for (const item of cart.items) await tx.inventory.update({ where: { variantId: item.variantId }, data: { onHand: { decrement: item.quantity }, reserved: { decrement: item.quantity } } });
        await tx.inventoryReservation.updateMany({ where: { orderId: created.id, status: "ACTIVE" }, data: { status: "CONSUMED", consumedAt: new Date() } });
        await tx.payment.create({ data: { orderId: created.id, provider: "WALLET", amountPaise: 0, status: "CAPTURED", method: "wallet" } });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        return tx.order.update({ where: { id: created.id }, data: { status: "CONFIRMED" } });
      }
      return created;
    });

    if (order.totalPaise === order.walletAppliedPaise) return this.checkoutView(order, { provider: "WALLET", status: "CAPTURED", amountPaise: 0 });

    try {
      const providerOrder = await this.razorpay.createOrder({
        amountPaise: order.totalPaise - order.walletAppliedPaise,
        receipt: order.orderNumber,
        hidiOrderId: order.id,
      });
      if (providerOrder.amount !== order.totalPaise - order.walletAppliedPaise || providerOrder.currency !== "INR" || !providerOrder.id) throw new ConflictException("Payment provider returned an unexpected order amount");
      const payment = await withSerializableRetry(this.prisma, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;
        const pending = await tx.order.findUnique({ where: { id: order.id } });
        if (!pending || pending.status !== "PENDING_PAYMENT" || expiresAt <= new Date()) throw new ConflictException("Checkout expired before payment was ready. Please start a new attempt.");
        return tx.payment.create({ data: {
          orderId: order.id, providerOrderId: providerOrder.id,
          amountPaise: order.totalPaise - order.walletAppliedPaise, status: "CREATED",
        } });
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
      walletAppliedPaise: order.walletAppliedPaise,
      cashPaidPaise: order.totalPaise - order.walletAppliedPaise,
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
      walletAppliedPaise: order.walletAppliedPaise,
      cashPaidPaise: order.totalPaise - order.walletAppliedPaise,
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
    await withSerializableRetry(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.status !== "PENDING_PAYMENT") return;
      await this.wallet.release(tx, orderId);
      await this.wallet.reverseEarned(tx, orderId, "CHECKOUT_CANCELLED");
      const reservations = await tx.inventoryReservation.findMany({ where: { orderId, status: "ACTIVE" }, orderBy: { variantId: "asc" } });
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
    });
  }

  private checkoutView(order: any, payment: any) {
    const cashDue = order.totalPaise - (order.walletAppliedPaise ?? 0);
    const captured = ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status);
    return {
      hidiOrderId: order.id,
      orderNumber: order.orderNumber,
      amountPaise: cashDue,
      subtotalPaise: order.subtotalPaise,
      totalPaise: order.totalPaise,
      walletAppliedPaise: order.walletAppliedPaise ?? 0,
      status: order.status,
      captured,
      currency: order.currency,
      provider: cashDue === 0 ? "WALLET" : "RAZORPAY",
      ...(cashDue > 0 ? { providerOrderId: payment.providerOrderId, razorpayKeyId: this.razorpay.publicKey() } : {}),
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
