import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { WalletService } from "./wallet.service.js";
import { withSerializableRetry } from "./wallet-transaction.js";

function actionDetails(body: unknown): { reason: string; reference: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Reason and support reference are required");
  const data = body as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["reason", "reference"].includes(key))) throw new BadRequestException("Unsupported wallet action field");
  if (typeof data.reason !== "string" || data.reason.trim().length < 8 || data.reason.length > 500
    || typeof data.reference !== "string" || data.reference.trim().length < 3 || data.reference.length > 100) {
    throw new BadRequestException("Provide a clear reason (8–500 characters) and support reference (3–100 characters)");
  }
  return { reason: data.reason.trim(), reference: data.reference.trim() };
}

/** Private support operations: never called by the customer browser. */
@Injectable()
export class WalletAdminService {
  constructor(private readonly prisma: PrismaService, private readonly wallet: WalletService) {}

  async holdReturn(orderNumber: string, body: unknown) {
    const details = actionDetails(body);
    return withSerializableRetry(this.prisma, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Order" WHERE "orderNumber" = ${orderNumber} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException("Order not found");
      const order = await tx.order.findUniqueOrThrow({ where: { id: rows[0].id } });
      if (!["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "RETURN_REQUESTED"].includes(order.status)) {
        throw new ConflictException("This order cannot enter return review");
      }
      const reason = `RETURN_REQUESTED: ${details.reference}: ${details.reason}`;
      await this.wallet.reverseEarned(tx, order.id, reason);
      if (order.status !== "RETURN_REQUESTED") {
        await tx.order.update({ where: { id: order.id }, data: {
          status: "RETURN_REQUESTED",
          notes: [order.notes, reason].filter(Boolean).join("\n"),
        } });
      }
      return { orderNumber, status: "RETURN_REQUESTED", refundIssued: false,
        notice: "Earning is blocked/reversed. This action does not refund cash or restore redeemed credit." };
    });
  }

  async refundWalletOnlyOrder(orderNumber: string, body: unknown) {
    const details = actionDetails(body);
    return withSerializableRetry(this.prisma, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Order" WHERE "orderNumber" = ${orderNumber} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException("Order not found");
      const order = await tx.order.findUniqueOrThrow({ where: { id: rows[0].id }, include: { payments: true, walletHold: true } });
      if (order.totalPaise <= 0 || order.walletAppliedPaise !== order.totalPaise
        || order.payments.length !== 1 || order.payments[0].provider !== "WALLET"
        || order.payments[0].amountPaise !== 0 || !order.walletHold
        || order.walletHold.amountPaise !== order.walletAppliedPaise) {
        throw new ConflictException("Only a fully wallet-paid order can be refunded here; cash refunds require the payment provider");
      }
      const payment = order.payments[0];
      const refundKey = `wallet-full-refund:${order.id}`;
      const existing = await tx.paymentRefund.findUnique({ where: { providerRefundId: refundKey } });
      if (existing) {
        if (existing.paymentId !== payment.id || existing.amountPaise !== 0 || existing.status !== "PROCESSED"
          || order.status !== "REFUNDED" || payment.status !== "REFUNDED" || order.walletHold.status !== "REFUNDED") {
          throw new ConflictException("Refund records require reconciliation");
        }
        return { orderNumber, status: "REFUNDED", restoredPaise: order.walletAppliedPaise, alreadyProcessed: true };
      }
      if (!["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "RETURN_REQUESTED", "RETURNED"].includes(order.status)
        || payment.status !== "CAPTURED" || order.walletHold.status !== "CONSUMED") {
        throw new ConflictException("Order payment is not eligible for this refund");
      }
      await tx.paymentRefund.create({ data: {
        paymentId: payment.id, providerRefundId: refundKey, amountPaise: 0,
        status: "PROCESSED", processedAt: new Date(),
      } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", rawReference: {
        source: "ADMIN_WALLET_FULL_REFUND", reference: details.reference, reason: details.reason,
      } } });
      await tx.order.update({ where: { id: order.id }, data: {
        status: "REFUNDED", notes: [order.notes, `WALLET_REFUND: ${details.reference}: ${details.reason}`].filter(Boolean).join("\n"),
      } });
      await this.wallet.reverseEarned(tx, order.id, "FULL_WALLET_REFUND");
      const restored = await this.wallet.restoreRedeemed(tx, order.id);
      if (!restored) throw new ConflictException("Wallet refund could not be reconciled; no changes were committed");
      // Physical goods must be received/inspected through inventory operations;
      // refunding money is not evidence that stock is back in the warehouse.
      return { orderNumber, status: "REFUNDED", restoredPaise: order.walletAppliedPaise, alreadyProcessed: false };
    });
  }
}
