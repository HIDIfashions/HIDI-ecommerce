import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { RazorpayService } from "../razorpay/razorpay.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { withSerializableRetry } from "../wallet/wallet-transaction.js";

const PAID_STATES = ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"];
const FULFILLED_STATES = ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"];
const RETURN_STATES = ["RETURN_REQUESTED", "RETURNED", "REFUNDED"];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly wallet: WalletService,
  ) {}

  async verifyCheckout(body: any) {
    const providerOrderId = String(body?.razorpay_order_id ?? "");
    const paymentId = String(body?.razorpay_payment_id ?? "");
    const signature = String(body?.razorpay_signature ?? "");
    if (!providerOrderId || !paymentId || !signature) throw new BadRequestException("Incomplete payment response");
    const payment = await this.prisma.payment.findFirst({ where: { providerOrderId, provider: "RAZORPAY" }, include: { order: true } });
    if (!payment) throw new NotFoundException("Payment order not found");
    if (!this.razorpay.verifyCheckoutSignature(providerOrderId, paymentId, signature)) throw new BadRequestException("Payment signature verification failed");
    const providerPayment = await this.razorpay.fetchPayment(paymentId);
    if (providerPayment.id !== paymentId || providerPayment.order_id !== providerOrderId || providerPayment.amount !== payment.amountPaise || providerPayment.currency !== "INR") throw new BadRequestException("Payment details do not match the HIDI order");
    if (providerPayment.status === "captured") return this.captureOrder(payment.id, paymentId, providerPayment.method, providerPayment);
    if (PAID_STATES.includes(payment.status)) return { success: true, captured: true, orderNumber: payment.order.orderNumber, status: payment.order.status };
    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ["CREATED", "AUTHORIZED", "FAILED"] } },
      data: { providerPaymentId: paymentId, method: providerPayment.method ?? null, status: providerPayment.status === "authorized" ? "AUTHORIZED" : "CREATED", rawReference: providerPayment as any },
    });
    return { success: true, captured: false, orderNumber: payment.order.orderNumber, status: providerPayment.status, message: "Payment is awaiting capture confirmation." };
  }

  async handleWebhook(rawBody: Buffer, signature: string, payload: any) {
    if (!this.razorpay.verifyWebhookSignature(rawBody, signature)) throw new BadRequestException("Invalid Razorpay webhook signature");
    const event = String(payload?.event ?? "");
    const entity = payload?.payload?.payment?.entity;
    if (event === "payment.captured") {
      if (!entity?.id || !entity?.order_id || entity.status !== "captured") throw new BadRequestException("Invalid captured payment payload");
      const payment = await this.prisma.payment.findFirst({ where: { providerOrderId: entity.order_id, provider: "RAZORPAY" } });
      // Provider capture can race local payment registration. A non-2xx
      // response preserves provider retry; acknowledging here would lose it.
      if (!payment) throw new NotFoundException("Captured payment is awaiting local order registration; retry reconciliation");
      if (entity.amount !== payment.amountPaise || entity.currency !== "INR") throw new BadRequestException("Captured payment amount or currency does not match");
      await this.captureOrder(payment.id, entity.id, entity.method, entity);
    }
    if (event === "payment.failed" && entity?.order_id) {
      await this.prisma.payment.updateMany({
        where: { providerOrderId: entity.order_id, provider: "RAZORPAY", status: { in: ["CREATED", "AUTHORIZED"] } },
        data: { status: "FAILED", providerPaymentId: entity.id ?? null, rawReference: entity as any },
      });
      // A retry can use the same provider order: expiry releases the hold.
    }
    if (event === "refund.processed") await this.processRefund(payload?.payload?.refund?.entity);
    return { received: true };
  }

  private async captureOrder(recordId: string, providerPaymentId: string, method?: string, raw?: any) {
    const reference = await this.prisma.payment.findUnique({ where: { id: recordId } });
    if (!reference) throw new NotFoundException("Payment record not found");
    return withSerializableRetry(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${reference.orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: reference.orderId }, include: { reservations: { orderBy: { variantId: "asc" } } } });
      const payment = await tx.payment.findUnique({ where: { id: recordId } });
      if (!order || !payment || payment.orderId !== order.id || payment.provider !== "RAZORPAY") throw new NotFoundException("HIDI payment order not found");
      if (payment.amountPaise !== order.totalPaise - order.walletAppliedPaise) throw new ConflictException("Payment and wallet breakdown no longer match");
      if (PAID_STATES.includes(payment.status)) {
        if (payment.providerPaymentId !== providerPaymentId) throw new ConflictException("A different captured payment already exists; manual payment review is required");
        return { success: true, captured: true, orderNumber: order.orderNumber, status: order.status };
      }
      // Late capture is recorded, but cannot resurrect cancelled/returned orders.
      let reviewRequired = order.status !== "PENDING_PAYMENT" || order.reservations.length === 0;
      if (order.userId) await tx.$queryRaw`SELECT "id" FROM "WalletAccount" WHERE "userId" = ${order.userId} FOR UPDATE`;
      const now = new Date();
      for (const reservation of order.reservations) {
        const locked = await tx.$queryRaw<Array<{ onHand: number; reserved: number; safetyStock: number }>>`
          SELECT "onHand", "reserved", "safetyStock" FROM "Inventory" WHERE "variantId" = ${reservation.variantId} FOR UPDATE
        `;
        const inventory = locked[0];
        if (!inventory || reservation.status !== "ACTIVE" || reservation.expiresAt <= now || inventory.onHand < reservation.quantity || inventory.reserved < reservation.quantity) reviewRequired = true;
      }
      if (!reviewRequired && !await this.wallet.consume(tx, order.id)) reviewRequired = true;
      if (!reviewRequired) {
        for (const reservation of order.reservations) {
          await tx.inventory.update({ where: { variantId: reservation.variantId }, data: { onHand: { decrement: reservation.quantity }, reserved: { decrement: reservation.quantity } } });
          await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "CONSUMED", consumedAt: now } });
        }
      } else {
        await this.wallet.release(tx, order.id);
        await this.wallet.reverseEarned(tx, order.id, "PAYMENT_REVIEW");
        for (const reservation of order.reservations.filter((item) => item.status === "ACTIVE")) {
          await tx.inventory.updateMany({ where: { variantId: reservation.variantId, reserved: { gte: reservation.quantity } }, data: { reserved: { decrement: reservation.quantity } } });
          await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED", releasedAt: now } });
        }
      }
      await tx.payment.update({ where: { id: payment.id }, data: { providerPaymentId, status: "CAPTURED", method: method ?? null, rawReference: raw ?? undefined } });
      const status = reviewRequired ? (RETURN_STATES.includes(order.status) || FULFILLED_STATES.includes(order.status) ? order.status : "PAYMENT_REVIEW") : "CONFIRMED";
      await tx.order.update({ where: { id: order.id }, data: { status: status as any } });
      if (!reviewRequired && order.cartSessionId) {
        const cart = await tx.cart.findUnique({ where: { sessionId: order.cartSessionId } });
        if (cart && (!cart.userId || cart.userId === order.userId)) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }
      return { success: true, captured: true, orderNumber: order.orderNumber, status };
    });
  }

  private async processRefund(entity: any) {
    if (!entity || typeof entity.id !== "string" || typeof entity.payment_id !== "string" || entity.status !== "processed" || entity.currency !== "INR" || !Number.isSafeInteger(entity.amount) || entity.amount <= 0) throw new BadRequestException("Invalid processed refund payload");
    const payment = await this.prisma.payment.findUnique({ where: { providerPaymentId: entity.payment_id } });
    if (!payment || payment.provider !== "RAZORPAY") throw new NotFoundException("Refund payment not found");
    // A signed event is cross-checked against authenticated provider totals.
    const provider = await this.razorpay.fetchPayment(entity.payment_id) as Awaited<ReturnType<RazorpayService["fetchPayment"]>> & { amount_refunded?: number; refund_status?: string | null };
    if (provider.id !== entity.payment_id || provider.order_id !== payment.providerOrderId || provider.currency !== "INR" || provider.amount !== payment.amountPaise || !["captured", "refunded"].includes(provider.status) || !Number.isSafeInteger(provider.amount_refunded) || provider.amount_refunded! < entity.amount || provider.amount_refunded! > payment.amountPaise) throw new BadRequestException("Refund does not match verified provider payment totals");

    const noteReturnRequestId = typeof entity?.notes?.hidi_return_request_id === "string"
      ? entity.notes.hidi_return_request_id
      : null;

    return withSerializableRetry(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${payment.orderId} FOR UPDATE`;
      const current = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!current || current.providerPaymentId !== entity.payment_id || !PAID_STATES.includes(current.status)) throw new ConflictException("Capture must be reconciled before processing this refund");

      const existing = await tx.paymentRefund.findUnique({ where: { providerRefundId: entity.id } });
      if (existing) {
        if (existing.paymentId !== current.id || existing.amountPaise !== entity.amount || existing.status !== "PROCESSED") throw new ConflictException("Refund event identity does not match the recorded refund");
        return;
      }

      const aggregate = await tx.paymentRefund.aggregate({ where: { paymentId: current.id, status: "PROCESSED" }, _sum: { amountPaise: true } });
      const refundedPaise = (aggregate._sum.amountPaise ?? 0) + entity.amount;
      if (refundedPaise > current.amountPaise || refundedPaise > provider.amount_refunded!) throw new ConflictException("Refund total exceeds the confirmed cash payment");

      const linkedReturn = noteReturnRequestId
        ? await tx.returnRequest.findUnique({ where: { id: noteReturnRequestId } })
        : await tx.returnRequest.findUnique({ where: { refundProviderId: entity.id } });

      if (linkedReturn) {
        if (linkedReturn.orderId !== current.orderId || linkedReturn.type !== "RETURN" || linkedReturn.refundCashPaise !== entity.amount) {
          throw new ConflictException("Refund does not match the HIDI return request");
        }
        if (!["REFUND_PROCESSING", "REFUNDED"].includes(linkedReturn.status)) {
          throw new ConflictException("Return request is not ready for this refund");
        }
      }

      await tx.paymentRefund.create({ data: { providerRefundId: entity.id, paymentId: current.id, amountPaise: entity.amount, status: "PROCESSED", processedAt: new Date() } });
      const fullCashRefund = refundedPaise === current.amountPaise && provider.amount_refunded === current.amountPaise;
      await tx.payment.update({ where: { id: current.id }, data: { status: fullCashRefund ? "REFUNDED" : "PARTIALLY_REFUNDED" } });

      if (linkedReturn) {
        if (linkedReturn.refundWalletPaise > 0) {
          await this.wallet.creditReturnRefund(tx, current.orderId, linkedReturn.id, linkedReturn.refundWalletPaise);
        }
        await this.wallet.reverseEarned(tx, current.orderId, `RETURN_REFUNDED:${linkedReturn.id}`);
        await tx.returnRequest.update({
          where: { id: linkedReturn.id },
          data: {
            status: "REFUNDED",
            refundProviderId: entity.id,
            refundStatus: "COMPLETED",
            processedAt: new Date(),
            completedAt: new Date(),
          },
        });
        // Fulfilment remains DELIVERED for a partial item return. The customer/admin
        // UI derives after-sales status from ReturnRequest instead of corrupting the
        // forward-delivery lifecycle.
        return;
      }

      // Legacy/provider-led refunds not linked to an item-level return keep the
      // previous whole-order reconciliation behaviour.
      await this.wallet.reverseEarned(tx, current.orderId, "PAYMENT_REFUNDED");
      await tx.order.update({ where: { id: current.orderId }, data: { status: fullCashRefund ? "REFUNDED" : "RETURN_REQUESTED" } });
      if (fullCashRefund) {
        const hold = await tx.walletHold.findUnique({ where: { orderId: current.orderId } });
        const restored = await this.wallet.restoreRedeemed(tx, current.orderId);
        if (hold?.status === "CONSUMED" && !restored) throw new ConflictException("Wallet refund needs reconciliation before completion");
      }
    });
  }
}
