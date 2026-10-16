import { decodeJson } from "../prisma/json.js";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { VerifiedAuthUser } from "../auth/supabase-auth.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { withSerializableRetry } from "../wallet/wallet-transaction.js";
import { appendOrderAudit } from "../audit/order-audit.js";
import { ReviewsService } from "../reviews/reviews.service.js";

const RETURN_WINDOW_DAYS = 7;
const RETURN_REASONS = new Set([
  "SIZE_FIT",
  "DAMAGED_DEFECTIVE",
  "WRONG_ITEM",
  "DIFFERENT_FROM_DESCRIPTION",
  "QUALITY_NOT_EXPECTED",
  "CHANGED_MIND",
  "OTHER",
]);
const ACTIVE_RETURN_STATUSES = ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUND_PROCESSING", "EXCHANGE_SHIPPED"];

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly reviews: ReviewsService,
  ) {}

  private async customer(authUser: VerifiedAuthUser) {
    const firstName = typeof authUser.metadata.first_name === "string" ? authUser.metadata.first_name : null;
    const lastName = typeof authUser.metadata.last_name === "string" ? authUser.metadata.last_name : null;

    const wallet = await this.prisma.walletAccount.findUnique({
      where: { authSubject: authUser.id }, select: { userId: true },
    });

    let user;
    if (wallet) {
      user = await this.prisma.user.findUniqueOrThrow({ where: { id: wallet.userId } });
    } else if (authUser.phoneVerified && authUser.phone) {
      user = await this.prisma.user.upsert({
        where: { phone: authUser.phone },
        create: { phone: authUser.phone, email: authUser.email ?? null, firstName, lastName },
        update: authUser.email ? { email: authUser.email } : {},
      });
    } else if (authUser.email) {
      user = await this.prisma.user.upsert({
        where: { email: authUser.email },
        create: { email: authUser.email, firstName, lastName },
        update: {},
      });
    } else {
      throw new ConflictException("A verified mobile number or email address is required");
    }

    const linkedWallet = await this.prisma.walletAccount.findUnique({ where: { userId: user.id }, select: { authSubject: true } });
    if (linkedWallet && linkedWallet.authSubject !== authUser.id) {
      throw new ConflictException("This account requires support review before linking order history");
    }

    const claimFilter = authUser.phoneVerified && authUser.phone
      ? { customerPhone: authUser.phone }
      : authUser.email
        ? { customerEmail: { equals: authUser.email } }
        : null;

    if (claimFilter) {
      const unclaimed = await this.prisma.order.findMany({
        where: { userId: null, ...claimFilter },
        select: { id: true },
      });

      if (unclaimed.length) {
        await this.prisma.order.updateMany({
          where: { id: { in: unclaimed.map((order) => order.id) }, userId: null, ...claimFilter },
          data: { userId: user.id },
        });
      }
    }

    return user;
  }

  async orders(authUser: VerifiedAuthUser) {
    const user = await this.customer(authUser);
    const orders = await this.prisma.order.findMany({
      where: { userId: user.id, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { orderBy: { position: "asc" }, take: 1 },
                variants: {
                  where: { active: true },
                  include: { inventory: true },
                  orderBy: [{ color: "asc" }, { size: "asc" }],
                },
              },
            },
            variant: {
              include: { images: { orderBy: { position: "asc" }, take: 1 } },
            },
            returnRequests: { orderBy: { createdAt: "desc" } },
            review: true,
          },
          orderBy: { id: "asc" },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        shipments: { orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }] },
      },
    });

    return {
      customer: {
        email: authUser.email ?? user.email,
        phone: authUser.phone ?? user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      orders: orders.map((order) => {
        const deliveredAt = order.shipments.find((shipment) => shipment.deliveredAt)?.deliveredAt
          ?? (order.status === "DELIVERED" ? order.updatedAt : null);
        const returnWindowEndsAt = deliveredAt
          ? new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000)
          : null;
        const canReturnOrExchange = order.status === "DELIVERED"
          && !!returnWindowEndsAt
          && returnWindowEndsAt.getTime() > Date.now();

        const allRequests = order.items
          .flatMap((item) => item.returnRequests)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const activeAfterSales = allRequests.find((request) => ACTIVE_RETURN_STATUSES.includes(request.status));
        const latestAfterSales = activeAfterSales ?? allRequests[0] ?? null;

        return {
          orderNumber: order.orderNumber,
          status: order.status,
          afterSales: latestAfterSales ? {
            id: latestAfterSales.id,
            type: latestAfterSales.type,
            status: latestAfterSales.status,
            createdAt: latestAfterSales.createdAt,
          } : null,
          createdAt: order.createdAt,
          deliveredAt,
          returnWindowEndsAt,
          canReturnOrExchange,
          subtotalPaise: order.subtotalPaise,
          discountPaise: order.discountPaise,
          shippingPaise: order.shippingPaise,
          taxPaise: order.taxPaise,
          totalPaise: order.totalPaise,
          walletAppliedPaise: order.walletAppliedPaise,
          cashPayablePaise: order.totalPaise - order.walletAppliedPaise,
          paymentStatus: order.payments[0]?.status ?? null,
          shippingAddress: decodeJson(order.shippingAddress),
          shipment: order.shipments[0] ? {
            provider: order.shipments[0].provider,
            awb: order.shipments[0].awb,
            trackingUrl: order.shipments[0].trackingUrl,
            status: order.shipments[0].status,
            shippedAt: order.shipments[0].shippedAt,
            deliveredAt: order.shipments[0].deliveredAt,
          } : null,
          itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          items: order.items.map((item) => {
            const exchangeSizes = Array.from(new Set(
              item.product.variants
                .filter((variant) => {
                  if (variant.color !== item.color || !variant.inventory) return false;
                  const available = Math.max(0, variant.inventory.onHand - variant.inventory.reserved - variant.inventory.safetyStock);
                  return available > 0;
                })
                .map((variant) => variant.size),
            ));
            return {
              id: item.id,
              productName: item.productName,
              slug: item.product.slug,
              image: item.variant.images[0]?.url ?? item.product.images[0]?.url ?? null,
              size: item.size,
              color: item.color,
              quantity: item.quantity,
              returnableQuantity: Math.max(0, item.quantity - item.returnRequests
                .filter((request) => !["REJECTED", "CANCELLED"].includes(request.status))
                .reduce((sum, request) => sum + request.quantity, 0)),
              unitPricePaise: item.unitPricePaise,
              discountPaise: item.discountPaise,
              totalPaise: item.totalPaise,
              exchangeSizes,
              review: item.review ? {
                id: item.review.id,
                rating: item.review.rating,
                title: item.review.title,
                body: item.review.body,
                createdAt: item.review.createdAt,
              } : null,
              returnRequests: item.returnRequests.map((request) => ({
                id: request.id,
                type: request.type,
                reason: request.reason,
                quantity: request.quantity,
                refundDestination: request.refundDestination,
                requestedSize: request.requestedSize,
                refundPaise: request.refundPaise,
                status: request.status,
                pickupProvider: request.pickupProvider,
                pickupAwb: request.pickupAwb,
                pickupTrackingUrl: request.pickupTrackingUrl,
                refundWalletPaise: request.refundWalletPaise,
                refundCashPaise: request.refundCashPaise,
                refundStatus: request.refundStatus,
                replacementProvider: request.replacementProvider,
                replacementAwb: request.replacementAwb,
                replacementTrackingUrl: request.replacementTrackingUrl,
                rejectionReason: request.rejectionReason,
                completedAt: request.completedAt,
                createdAt: request.createdAt,
              })),
            };
          }),
        };
      }),
    };
  }

  async order(authUser: VerifiedAuthUser, orderNumber: string) {
    const payload = await this.orders(authUser);
    const order = payload.orders.find((entry) => entry.orderNumber === orderNumber);
    if (!order) throw new NotFoundException("Order not found");
    return { customer: payload.customer, order };
  }

  async submitReview(
    authUser: VerifiedAuthUser,
    orderNumber: string,
    orderItemId: string,
    body: { rating?: unknown; title?: unknown; body?: unknown },
  ) {
    const user = await this.customer(authUser);
    return this.reviews.submitAccountReview(user.id, orderNumber, orderItemId, body);
  }

  async createReturnRequest(
    authUser: VerifiedAuthUser,
    orderNumber: string,
    body: {
      orderItemId?: unknown;
      type?: unknown;
      reason?: unknown;
      quantity?: unknown;
      refundDestination?: unknown;
      requestedSize?: unknown;
      detail?: unknown;
    },
  ) {
    const user = await this.customer(authUser);
    const type = body.type === "RETURN" || body.type === "EXCHANGE" ? body.type : null;
    const reason = typeof body.reason === "string" ? body.reason.trim().toUpperCase() : "";
    const orderItemId = typeof body.orderItemId === "string" ? body.orderItemId.trim() : "";
    const quantity = Number(body.quantity ?? 1);
    const detail = typeof body.detail === "string" ? body.detail.trim().slice(0, 600) : null;

    if (!type || !orderItemId || !RETURN_REASONS.has(reason)) {
      throw new BadRequestException("Choose return or exchange and select a valid reason");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new BadRequestException("Invalid return quantity");
    }

    const refundDestination = type === "RETURN"
      ? body.refundDestination === "WALLET" || body.refundDestination === "ORIGINAL"
        ? body.refundDestination
        : null
      : null;
    if (type === "RETURN" && !refundDestination) throw new BadRequestException("Choose how you want the refund");
    if (refundDestination === "WALLET") await this.wallet.ensureWallet(authUser);

    return withSerializableRetry(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WITH (UPDLOCK, HOLDLOCK, ROWLOCK) WHERE "orderNumber" = ${orderNumber} `;
      const order = await tx.order.findFirst({
        where: { orderNumber, userId: user.id },
        include: {
          items: { include: { returnRequests: true } },
          shipments: { orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }] },
        },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (order.status !== "DELIVERED") throw new ConflictException("Returns and exchanges are available after delivery");

      const deliveredAt = order.shipments.find((shipment) => shipment.deliveredAt)?.deliveredAt ?? order.updatedAt;
      const deadline = new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      if (deadline.getTime() <= Date.now()) throw new ConflictException("The 7-day return and exchange window has closed");

      const item = order.items.find((entry) => entry.id === orderItemId);
      if (!item) throw new NotFoundException("Order item not found");

      const active = item.returnRequests.find((request) => ACTIVE_RETURN_STATUSES.includes(request.status));
      if (active) throw new ConflictException("A return or exchange request is already active for this item");

      const alreadyHandled = item.returnRequests
        .filter((request) => !["REJECTED", "CANCELLED"].includes(request.status))
        .reduce((sum, request) => sum + request.quantity, 0);
      const remaining = Math.max(0, item.quantity - alreadyHandled);
      if (quantity > remaining) throw new BadRequestException(`Only ${remaining} item(s) remain eligible for return or exchange`);

      let requestedSize: string | null = null;
      let requestedVariantId: string | null = null;
      if (type === "EXCHANGE") {
        requestedSize = typeof body.requestedSize === "string" ? body.requestedSize.trim().toUpperCase() : "";
        if (!requestedSize) throw new BadRequestException("Choose the replacement size");
        const replacement = await tx.productVariant.findFirst({
          where: { productId: item.productId, color: item.color, size: requestedSize, active: true },
          include: { inventory: true },
        });
        const available = replacement?.inventory
          ? Math.max(0, replacement.inventory.onHand - replacement.inventory.reserved - replacement.inventory.safetyStock)
          : 0;
        if (!replacement || available < quantity) throw new ConflictException("The selected replacement size is not currently available");
        requestedVariantId = replacement.id;
      }

      const refundPaise = type === "RETURN"
        ? Math.floor((item.totalPaise * quantity) / item.quantity)
        : 0;

      const created = await tx.returnRequest.create({
        data: {
          orderId: order.id,
          orderItemId: item.id,
          type,
          reason,
          quantity,
          refundDestination,
          requestedVariantId,
          requestedSize,
          refundPaise,
          detail: detail || null,
          status: "REQUESTED",
        },
        select: {
          id: true,
          type: true,
          reason: true,
          quantity: true,
          refundDestination: true,
          requestedSize: true,
          refundPaise: true,
          status: true,
          createdAt: true,
        },
      });

      await this.wallet.holdForReturn(tx, order.id, created.id);
      await appendOrderAudit(tx, {
        orderId: order.id,
        eventType: type === "RETURN" ? "RETURN_REQUESTED" : "EXCHANGE_REQUESTED",
        actorType: "CUSTOMER",
        actorId: authUser.id,
        entityType: "RETURN_REQUEST",
        entityId: created.id,
        toStatus: "REQUESTED",
        amountPaise: type === "RETURN" ? refundPaise : null,
        eventKey: `return:${created.id}:requested`,
        source: "CUSTOMER_ACCOUNT",
        metadata: {
          orderItemId: item.id,
          productName: item.productName,
          sku: item.sku,
          quantity,
          reason,
          refundDestination,
          requestedSize,
        },
      });
      return created;
    });
  }

  async cancelReturnRequest(authUser: VerifiedAuthUser, orderNumber: string, requestId: string) {
    const user = await this.customer(authUser);
    const updated = await withSerializableRetry(this.prisma, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Order" WITH (UPDLOCK, HOLDLOCK, ROWLOCK) WHERE "orderNumber" = ${orderNumber} 
      `;
      if (!locked[0]) throw new NotFoundException("Order not found");

      const request = await tx.returnRequest.findFirst({
        where: {
          id: requestId,
          order: { orderNumber, userId: user.id },
        },
      });
      if (!request) throw new NotFoundException("Return request not found");
      if (request.status !== "REQUESTED") {
        throw new ConflictException("Only a newly requested return or exchange can be cancelled online");
      }

      const cancelled = await tx.returnRequest.update({
        where: { id: request.id },
        data: {
          status: "CANCELLED",
          processedAt: new Date(),
          completedAt: new Date(),
        },
      });
      await appendOrderAudit(tx, {
        orderId: request.orderId,
        eventType: request.type === "RETURN" ? "RETURN_CANCELLED" : "EXCHANGE_CANCELLED",
        actorType: "CUSTOMER",
        actorId: authUser.id,
        entityType: "RETURN_REQUEST",
        entityId: request.id,
        fromStatus: request.status,
        toStatus: "CANCELLED",
        eventKey: `return:${request.id}:cancelled`,
        source: "CUSTOMER_ACCOUNT",
      });
      return cancelled;
    });

    // Cancellation is already durable. Reward reconciliation is a follow-up
    // calculation and the normal worker can retry it if the database is busy.
    await this.wallet.reconcileOrder(updated.orderId).catch(() => undefined);
    return updated;
  }

  async ownsOrder(authUser: VerifiedAuthUser, orderNumber: string) {
    const user = await this.customer(authUser);
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, userId: user.id },
      select: { id: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    return true;
  }
}

