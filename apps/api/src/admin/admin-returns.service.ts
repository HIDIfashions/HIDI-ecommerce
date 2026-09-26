import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryMovementType, type Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RazorpayService } from "../razorpay/razorpay.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { withSerializableRetry } from "../wallet/wallet-transaction.js";
import { allocateOriginalTenderRefund } from "./return-refund-policy.js";
import { appendOrderAudit } from "../audit/order-audit.js";
import type { AdminActor } from "./admin-auth.js";

const ACTIONS = new Set([
  "APPROVE",
  "REJECT",
  "SCHEDULE_PICKUP",
  "MARK_RECEIVED",
  "ISSUE_REFUND",
  "SHIP_EXCHANGE",
  "COMPLETE_EXCHANGE",
]);

const ACTIVE_RETURN_STATUSES = ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUND_PROCESSING", "EXCHANGE_SHIPPED"];

type ReturnActionInput = {
  action?: unknown;
  note?: unknown;
  rejectionReason?: unknown;
  inventoryDisposition?: unknown;
  provider?: unknown;
  awb?: unknown;
  trackingUrl?: unknown;
};

@Injectable()
export class AdminReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly razorpay: RazorpayService,
  ) {}

  async update(requestId: string, body: ReturnActionInput, actor: AdminActor) {
    const action = typeof body?.action === "string" ? body.action.trim().toUpperCase() : "";
    if (!ACTIONS.has(action)) throw new BadRequestException("Unsupported return action");

    if (action === "ISSUE_REFUND") return this.issueRefund(requestId, body, actor);
    if (action === "COMPLETE_EXCHANGE") return this.completeExchange(requestId, body, actor);

    return withSerializableRetry(this.prisma, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ReturnRequest" WHERE "id" = ${requestId} FOR UPDATE
      `;
      if (!locked[0]) throw new NotFoundException("Return request not found");

      const request = await tx.returnRequest.findUnique({
        where: { id: requestId },
        include: {
          order: true,
          orderItem: true,
        },
      });
      if (!request) throw new NotFoundException("Return request not found");

      if (action === "APPROVE") {
        if (request.status !== "REQUESTED") throw new ConflictException("Only a newly requested return can be approved");

        let exchangeReservationStatus = request.exchangeReservationStatus;
        let exchangeReservedAt = request.exchangeReservedAt;

        if (request.type === "EXCHANGE") {
          if (!request.requestedVariantId) throw new ConflictException("Exchange replacement variant is missing");
          const rows = await tx.$queryRaw<Array<{ id: string; onHand: number; reserved: number; safetyStock: number }>>`
            SELECT "id", "onHand", "reserved", "safetyStock"
            FROM "Inventory"
            WHERE "variantId" = ${request.requestedVariantId}
            FOR UPDATE
          `;
          const inventory = rows[0];
          const available = inventory ? inventory.onHand - inventory.reserved - inventory.safetyStock : 0;
          if (!inventory || available < request.quantity) {
            throw new ConflictException("Replacement stock is no longer available. Reject the request or arrange another size.");
          }
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { reserved: { increment: request.quantity } },
          });
          exchangeReservationStatus = "ACTIVE";
          exchangeReservedAt = new Date();
        }

        const updated = await tx.returnRequest.update({
          where: { id: request.id },
          data: {
            status: "APPROVED",
            approvedAt: new Date(),
            adminNote: this.note(body.note),
            exchangeReservationStatus,
            exchangeReservedAt,
          },
        });
        await appendOrderAudit(tx, {
          orderId: request.orderId,
          eventType: request.type === "EXCHANGE" ? "EXCHANGE_APPROVED" : "RETURN_APPROVED",
          actorType: "ADMIN",
          actorId: actor.id,
          entityType: "RETURN_REQUEST",
          entityId: request.id,
          fromStatus: request.status,
          toStatus: "APPROVED",
          eventKey: `return:${request.id}:approved`,
          source: "ADMIN_PORTAL",
          metadata: request.type === "EXCHANGE"
            ? { requestedVariantId: request.requestedVariantId, quantity: request.quantity, exchangeReservationStatus }
            : { quantity: request.quantity },
        });
        return updated;
      }

      if (action === "REJECT") {
        if (!["REQUESTED", "APPROVED"].includes(request.status)) {
          throw new ConflictException("This request can only be rejected before pickup is scheduled");
        }
        const reason = this.requiredText(body.rejectionReason, "Rejection reason", 300);
        if (request.type === "EXCHANGE" && request.exchangeReservationStatus === "ACTIVE" && request.requestedVariantId) {
          await this.releaseExchangeReservation(tx, request.requestedVariantId, request.quantity);
        }
        const updated = await tx.returnRequest.update({
          where: { id: request.id },
          data: {
            status: "REJECTED",
            rejectionReason: reason,
            adminNote: this.note(body.note),
            processedAt: new Date(),
            completedAt: new Date(),
            exchangeReservationStatus: request.exchangeReservationStatus === "ACTIVE" ? "RELEASED" : request.exchangeReservationStatus,
          },
        });
        await appendOrderAudit(tx, {
          orderId: request.orderId,
          eventType: request.type === "EXCHANGE" ? "EXCHANGE_REJECTED" : "RETURN_REJECTED",
          actorType: "ADMIN",
          actorId: actor.id,
          entityType: "RETURN_REQUEST",
          entityId: request.id,
          fromStatus: request.status,
          toStatus: "REJECTED",
          eventKey: `return:${request.id}:rejected`,
          source: "ADMIN_PORTAL",
          metadata: { reason },
        });
        return updated;
      }

      if (action === "SCHEDULE_PICKUP") {
        if (request.status !== "APPROVED") throw new ConflictException("Approve the request before scheduling pickup");
        const provider = this.requiredText(body.provider, "Pickup provider", 80);
        const pickupAwb = this.optionalText(body.awb, 120);
        const pickupTrackingUrl = this.optionalUrl(body.trackingUrl);
        const updated = await tx.returnRequest.update({
          where: { id: request.id },
          data: {
            status: "PICKUP_SCHEDULED",
            pickupProvider: provider,
            pickupAwb,
            pickupTrackingUrl,
            pickupScheduledAt: new Date(),
            adminNote: this.note(body.note),
          },
        });
        await appendOrderAudit(tx, {
          orderId: request.orderId,
          eventType: request.type === "EXCHANGE" ? "EXCHANGE_PICKUP_SCHEDULED" : "RETURN_PICKUP_SCHEDULED",
          actorType: "ADMIN",
          actorId: actor.id,
          entityType: "RETURN_REQUEST",
          entityId: request.id,
          fromStatus: request.status,
          toStatus: "PICKUP_SCHEDULED",
          eventKey: `return:${request.id}:pickup-scheduled`,
          source: "ADMIN_PORTAL",
          metadata: { provider, awb: pickupAwb, trackingUrl: pickupTrackingUrl },
        });
        return updated;
      }

      if (action === "MARK_RECEIVED") {
        if (!["APPROVED", "PICKUP_SCHEDULED"].includes(request.status)) {
          throw new ConflictException("Only approved or pickup-scheduled items can be received");
        }
        const disposition = typeof body.inventoryDisposition === "string"
          ? body.inventoryDisposition.trim().toUpperCase()
          : "";
        if (!["RESTOCK", "DAMAGED"].includes(disposition)) {
          throw new BadRequestException("Choose RESTOCK or DAMAGED after inspection");
        }

        if (disposition === "RESTOCK") {
          const rows = await tx.$queryRaw<Array<{ id: string; onHand: number }>>`
            SELECT "id", "onHand"
            FROM "Inventory"
            WHERE "variantId" = ${request.orderItem.variantId}
            FOR UPDATE
          `;
          const inventory = rows[0];
          if (!inventory) throw new ConflictException("Original item inventory is missing");
          await tx.inventory.update({
            where: { id: inventory.id },
            data: {
              onHand: { increment: request.quantity },
              movements: {
                create: {
                  type: InventoryMovementType.RETURN_RESTOCK,
                  delta: request.quantity,
                  onHandBefore: inventory.onHand,
                  onHandAfter: inventory.onHand + request.quantity,
                  reason: "Customer return restocked",
                  note: this.note(body.note),
                  reference: `RETURN:${request.id}`,
                  actor: actor.id,
                },
              },
            },
          });
        }

        const updated = await tx.returnRequest.update({
          where: { id: request.id },
          data: {
            status: "RECEIVED",
            receivedAt: new Date(),
            inventoryDisposition: disposition,
            adminNote: this.note(body.note),
          },
        });
        await appendOrderAudit(tx, {
          orderId: request.orderId,
          eventType: request.type === "EXCHANGE" ? "EXCHANGE_RECEIVED" : "RETURN_RECEIVED",
          actorType: "ADMIN",
          actorId: actor.id,
          entityType: "RETURN_REQUEST",
          entityId: request.id,
          fromStatus: request.status,
          toStatus: "RECEIVED",
          eventKey: `return:${request.id}:received`,
          source: "ADMIN_PORTAL",
          metadata: {
            inventoryDisposition: disposition,
            quantity: request.quantity,
            originalVariantId: request.orderItem.variantId,
            inventoryRestocked: disposition === "RESTOCK",
          },
        });
        return updated;
      }

      if (action === "SHIP_EXCHANGE") {
        if (request.type !== "EXCHANGE") throw new ConflictException("This request is not an exchange");
        if (request.status !== "RECEIVED") throw new ConflictException("Receive and inspect the original item before shipping an exchange");
        if (request.exchangeReservationStatus !== "ACTIVE" || !request.requestedVariantId) {
          throw new ConflictException("Replacement stock is not reserved");
        }

        const provider = this.requiredText(body.provider, "Courier", 80);
        const awb = this.requiredText(body.awb, "AWB / tracking number", 120);
        const trackingUrl = this.optionalUrl(body.trackingUrl);

        const rows = await tx.$queryRaw<Array<{ id: string; onHand: number; reserved: number }>>`
          SELECT "id", "onHand", "reserved"
          FROM "Inventory"
          WHERE "variantId" = ${request.requestedVariantId}
          FOR UPDATE
        `;
        const inventory = rows[0];
        if (!inventory || inventory.onHand < request.quantity || inventory.reserved < request.quantity) {
          throw new ConflictException("Reserved exchange stock requires reconciliation");
        }

        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            onHand: { decrement: request.quantity },
            reserved: { decrement: request.quantity },
          },
        });

        const updated = await tx.returnRequest.update({
          where: { id: request.id },
          data: {
            status: "EXCHANGE_SHIPPED",
            exchangeReservationStatus: "CONSUMED",
            replacementProvider: provider,
            replacementAwb: awb,
            replacementTrackingUrl: trackingUrl,
            replacementShippedAt: new Date(),
            adminNote: this.note(body.note),
          },
        });
        await appendOrderAudit(tx, {
          orderId: request.orderId,
          eventType: "EXCHANGE_SHIPPED",
          actorType: "ADMIN",
          actorId: actor.id,
          entityType: "RETURN_REQUEST",
          entityId: request.id,
          fromStatus: request.status,
          toStatus: "EXCHANGE_SHIPPED",
          eventKey: `return:${request.id}:exchange-shipped`,
          source: "ADMIN_PORTAL",
          metadata: {
            provider,
            awb,
            trackingUrl,
            requestedVariantId: request.requestedVariantId,
            quantity: request.quantity,
          },
        });
        return updated;
      }

      throw new BadRequestException("Unsupported return action");
    }).then(async (updated: any) => {
      if (updated.status === "REJECTED") {
        await this.wallet.reconcileOrder(updated.orderId).catch(() => undefined);
      }
      return updated;
    });
  }

  private async issueRefund(requestId: string, body: ReturnActionInput, actor: AdminActor) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id: requestId },
      include: {
        order: {
          include: {
            payments: {
              where: { provider: "RAZORPAY", status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { refunds: true },
            },
            walletHold: true,
            returnRequests: {
              where: {
                type: "RETURN",
                refundDestination: "ORIGINAL",
                status: { in: ["REFUND_PROCESSING", "REFUNDED"] },
              },
              select: {
                id: true,
                refundWalletPaise: true,
                refundCashPaise: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (!request) throw new NotFoundException("Return request not found");
    if (request.type !== "RETURN") throw new ConflictException("Exchange requests do not receive a cash refund");
    if (request.status === "REFUNDED") return request;
    if (request.status !== "RECEIVED") throw new ConflictException("Receive and inspect the item before issuing a refund");
    if (request.refundPaise <= 0) throw new ConflictException("Refund amount is invalid");

    if (request.refundDestination === "WALLET") {
      return withSerializableRetry(this.prisma, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${request.id} FOR UPDATE`;
        const current = await tx.returnRequest.findUnique({ where: { id: request.id } });
        if (!current || current.status !== "RECEIVED") throw new ConflictException("Return status changed. Refresh and try again.");
        await this.wallet.creditReturnRefund(tx, request.orderId, request.id, request.refundPaise);
        await this.wallet.reverseEarned(tx, request.orderId, `RETURN_REFUNDED:${request.id}`);
        const refunded = await tx.returnRequest.update({
          where: { id: request.id },
          data: {
            status: "REFUNDED",
            refundWalletPaise: request.refundPaise,
            refundCashPaise: 0,
            refundStatus: "COMPLETED",
            processedAt: new Date(),
            completedAt: new Date(),
            adminNote: this.note(body.note),
          },
        });
        await appendOrderAudit(tx, {
          orderId: request.orderId,
          eventType: "RETURN_REFUNDED",
          actorType: "ADMIN",
          actorId: actor.id,
          entityType: "RETURN_REQUEST",
          entityId: request.id,
          fromStatus: current.status,
          toStatus: "REFUNDED",
          amountPaise: request.refundPaise,
          eventKey: `return:${request.id}:refunded`,
          source: "ADMIN_PORTAL",
          metadata: { destination: "WALLET", walletPaise: request.refundPaise, cashPaise: 0 },
        });
        return refunded;
      });
    }

    if (request.refundDestination !== "ORIGINAL") throw new ConflictException("Refund destination is missing");

    const total = request.order.totalPaise;
    if (!Number.isSafeInteger(total) || total <= 0) throw new ConflictException("Order total requires reconciliation");

    const payment = request.order.payments[0];
    const alreadyRefunded = payment
      ? payment.refunds
          .filter((refund) => refund.status === "PROCESSED")
          .reduce((sum, refund) => sum + refund.amountPaise, 0)
      : 0;
    const priorOriginalWalletRefunds = request.order.returnRequests
      .filter((entry) => entry.id !== request.id)
      .reduce((sum, entry) => sum + entry.refundWalletPaise, 0);

    let walletShare: number;
    let cashShare: number;
    try {
      const allocation = allocateOriginalTenderRefund({
        refundPaise: request.refundPaise,
        orderTotalPaise: total,
        walletAppliedPaise: request.order.walletAppliedPaise,
        walletAlreadyRefundedPaise: priorOriginalWalletRefunds,
        cashPaidPaise: payment?.amountPaise ?? 0,
        cashAlreadyRefundedPaise: alreadyRefunded,
      });
      walletShare = allocation.walletPaise;
      cashShare = allocation.cashPaise;
    } catch (error) {
      throw new ConflictException(error instanceof Error ? error.message : "Refund allocation requires reconciliation");
    }

    if (cashShare <= 0) {
      return withSerializableRetry(this.prisma, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${request.id} FOR UPDATE`;
        const current = await tx.returnRequest.findUnique({ where: { id: request.id } });
        if (!current || current.status !== "RECEIVED") {
          throw new ConflictException("Return status changed. Refresh and try again.");
        }
        await this.wallet.creditReturnRefund(tx, request.orderId, request.id, request.refundPaise);
        await this.wallet.reverseEarned(tx, request.orderId, `RETURN_REFUNDED:${request.id}`);
        const refunded = await tx.returnRequest.update({
          where: { id: request.id },
          data: {
            status: "REFUNDED",
            refundWalletPaise: request.refundPaise,
            refundCashPaise: 0,
            refundStatus: "COMPLETED",
            processedAt: new Date(),
            completedAt: new Date(),
            adminNote: this.note(body.note),
          },
        });
        await appendOrderAudit(tx, {
          orderId: request.orderId,
          eventType: "RETURN_REFUNDED",
          actorType: "ADMIN",
          actorId: actor.id,
          entityType: "RETURN_REQUEST",
          entityId: request.id,
          fromStatus: current.status,
          toStatus: "REFUNDED",
          amountPaise: request.refundPaise,
          eventKey: `return:${request.id}:refunded`,
          source: "ADMIN_PORTAL",
          metadata: { destination: "WALLET", walletPaise: request.refundPaise, cashPaise: 0 },
        });
        return refunded;
      });
    }

    if (!payment?.providerPaymentId) throw new ConflictException("Captured Razorpay payment is missing");
    if (alreadyRefunded + cashShare > payment.amountPaise) {
      throw new ConflictException("Refund exceeds the remaining captured payment");
    }

    await withSerializableRetry(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${request.id} FOR UPDATE`;
      const current = await tx.returnRequest.findUnique({ where: { id: request.id } });
      if (!current || current.status !== "RECEIVED") throw new ConflictException("Return status changed. Refresh and try again.");
      await tx.returnRequest.update({
        where: { id: request.id },
        data: {
          status: "REFUND_PROCESSING",
          refundWalletPaise: walletShare,
          refundCashPaise: cashShare,
          refundStatus: "INITIATING",
          adminNote: this.note(body.note),
        },
      });
      await appendOrderAudit(tx, {
        orderId: request.orderId,
        eventType: "REFUND_INITIATED",
        actorType: "ADMIN",
        actorId: actor.id,
        entityType: "RETURN_REQUEST",
        entityId: request.id,
        fromStatus: current.status,
        toStatus: "REFUND_PROCESSING",
        amountPaise: request.refundPaise,
        eventKey: `return:${request.id}:refund-initiated`,
        source: "ADMIN_PORTAL",
        metadata: {
          destination: "ORIGINAL",
          walletPaise: walletShare,
          cashPaise: cashShare,
          provider: "RAZORPAY",
          providerPaymentId: payment.providerPaymentId,
        },
      });
    });

    let providerRefund;
    try {
      providerRefund = await this.razorpay.createRefund(payment.providerPaymentId, {
        amountPaise: cashShare,
        returnRequestId: request.id,
        orderNumber: request.order.orderNumber,
      });
    } catch (error) {
      // The provider did not return a refund identity. The admin can safely retry.
      const reverted = await this.prisma.returnRequest.updateMany({
        where: { id: request.id, status: "REFUND_PROCESSING", refundProviderId: null },
        data: { status: "RECEIVED", refundStatus: "FAILED" },
      });
      if (reverted.count > 0) {
        await appendOrderAudit(this.prisma, {
          orderId: request.orderId,
          eventType: "REFUND_PROVIDER_FAILED",
          actorType: "SYSTEM",
          entityType: "RETURN_REQUEST",
          entityId: request.id,
          fromStatus: "REFUND_PROCESSING",
          toStatus: "RECEIVED",
          amountPaise: request.refundPaise,
          source: "RAZORPAY_API",
          metadata: {
            cashPaise: cashShare,
            error: error instanceof Error ? error.message.slice(0, 500) : "Provider refund request failed",
          },
        });
      }
      throw error;
    }

    if (providerRefund.payment_id !== payment.providerPaymentId || providerRefund.amount !== cashShare || providerRefund.currency !== "INR") {
      // A provider refund identity exists, so never move the request back to RECEIVED:
      // retrying could create a second refund. Force an operations review instead.
      const flagged = await this.prisma.returnRequest.updateMany({
        where: { id: request.id, status: "REFUND_PROCESSING" },
        data: {
          refundProviderId: providerRefund.id,
          refundStatus: "REVIEW_REQUIRED",
          adminNote: [this.note(body.note), "Provider refund response needs reconciliation before any retry."].filter(Boolean).join("\n"),
        },
      });
      if (flagged.count > 0) {
        await appendOrderAudit(this.prisma, {
          orderId: request.orderId,
          eventType: "REFUND_REVIEW_REQUIRED",
          actorType: "SYSTEM",
          entityType: "RETURN_REQUEST",
          entityId: request.id,
          fromStatus: "REFUND_PROCESSING",
          toStatus: "REFUND_PROCESSING",
          amountPaise: request.refundPaise,
          eventKey: `refund:${providerRefund.id}:review-required`,
          source: "RAZORPAY_API",
          metadata: {
            providerRefundId: providerRefund.id,
            expectedCashPaise: cashShare,
            providerAmountPaise: providerRefund.amount,
            providerCurrency: providerRefund.currency,
          },
        });
      }
      throw new ConflictException("Razorpay refund needs reconciliation. Do not retry until the provider refund is reviewed.");
    }

    // A webhook may have completed the request before this API call returns.
    // Update only while it is still processing so we never overwrite COMPLETED.
    const accepted = await this.prisma.returnRequest.updateMany({
      where: { id: request.id, status: "REFUND_PROCESSING" },
      data: {
        refundProviderId: providerRefund.id,
        refundStatus: providerRefund.status === "processed" ? "PROCESSING_WEBHOOK" : "PROCESSING",
      },
    });
    if (accepted.count > 0) {
      await appendOrderAudit(this.prisma, {
        orderId: request.orderId,
        eventType: "REFUND_PROVIDER_ACCEPTED",
        actorType: "PROVIDER",
        actorId: "RAZORPAY",
        entityType: "RETURN_REQUEST",
        entityId: request.id,
        fromStatus: "REFUND_PROCESSING",
        toStatus: "REFUND_PROCESSING",
        amountPaise: request.refundPaise,
        eventKey: `refund:${providerRefund.id}:accepted`,
        source: "RAZORPAY_API",
        metadata: {
          providerRefundId: providerRefund.id,
          providerPaymentId: payment.providerPaymentId,
          providerStatus: providerRefund.status,
          cashPaise: cashShare,
          walletPaise: walletShare,
        },
      });
    }
    return this.prisma.returnRequest.findUniqueOrThrow({ where: { id: request.id } });
  }

  private async completeExchange(requestId: string, body: ReturnActionInput, actor: AdminActor) {
    const updated = await withSerializableRetry(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${requestId} FOR UPDATE`;
      const request = await tx.returnRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundException("Return request not found");
      if (request.type !== "EXCHANGE" || request.status !== "EXCHANGE_SHIPPED") {
        throw new ConflictException("Only a shipped exchange can be completed");
      }
      const completed = await tx.returnRequest.update({
        where: { id: request.id },
        data: {
          status: "EXCHANGED",
          processedAt: new Date(),
          completedAt: new Date(),
          adminNote: this.note(body.note),
        },
      });
      await appendOrderAudit(tx, {
        orderId: request.orderId,
        eventType: "EXCHANGE_COMPLETED",
        actorType: "ADMIN",
        actorId: actor.id,
        entityType: "RETURN_REQUEST",
        entityId: request.id,
        fromStatus: request.status,
        toStatus: "EXCHANGED",
        eventKey: `return:${request.id}:exchanged`,
        source: "ADMIN_PORTAL",
      });
      return completed;
    });
    await this.wallet.reconcileOrder(updated.orderId).catch(() => undefined);
    return updated;
  }

  private async releaseExchangeReservation(tx: Prisma.TransactionClient, variantId: string, quantity: number) {
    const rows = await tx.$queryRaw<Array<{ id: string; reserved: number }>>`
      SELECT "id", "reserved" FROM "Inventory" WHERE "variantId" = ${variantId} FOR UPDATE
    `;
    const inventory = rows[0];
    if (!inventory || inventory.reserved < quantity) throw new ConflictException("Exchange reservation requires reconciliation");
    await tx.inventory.update({
      where: { id: inventory.id },
      data: { reserved: { decrement: quantity } },
    });
  }

  private requiredText(value: unknown, label: string, max: number) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new BadRequestException(`${label} is required`);
    return text.slice(0, max);
  }

  private optionalText(value: unknown, max: number) {
    const text = typeof value === "string" ? value.trim() : "";
    return text ? text.slice(0, max) : null;
  }

  private note(value: unknown) {
    return this.optionalText(value, 600);
  }

  private optionalUrl(value: unknown) {
    const text = this.optionalText(value, 500);
    if (!text) return null;
    try {
      const url = new URL(text);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error("invalid");
      return text;
    } catch {
      throw new BadRequestException("Enter a valid tracking URL");
    }
  }

  static activeStatuses() {
    return ACTIVE_RETURN_STATUSES;
  }
}
