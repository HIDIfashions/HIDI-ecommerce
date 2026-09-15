import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { RazorpayService } from "../razorpay/razorpay.service.js";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
  ) {}

  async verifyCheckout(body: any) {
    const providerOrderId = String(body?.razorpay_order_id ?? "");
    const paymentId = String(body?.razorpay_payment_id ?? "");
    const signature = String(body?.razorpay_signature ?? "");
    if (!providerOrderId || !paymentId || !signature) throw new BadRequestException("Incomplete payment response");

    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException("Payment order not found");
    if (!this.razorpay.verifyCheckoutSignature(payment.providerOrderId!, paymentId, signature)) {
      throw new BadRequestException("Payment signature verification failed");
    }

    const providerPayment = await this.razorpay.fetchPayment(paymentId);
    if (providerPayment.order_id !== payment.providerOrderId || providerPayment.amount !== payment.amountPaise || providerPayment.currency !== "INR") {
      throw new BadRequestException("Payment details do not match the HIDI order");
    }

    if (providerPayment.status === "captured") {
      return this.captureOrder(payment.orderId, paymentId, providerPayment.method, providerPayment);
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: paymentId,
        method: providerPayment.method ?? null,
        status: providerPayment.status === "authorized" ? "AUTHORIZED" : "CREATED",
        rawReference: providerPayment as any,
      },
    });
    return {
      success: true,
      captured: false,
      orderNumber: payment.order.orderNumber,
      status: providerPayment.status,
      message: "Payment received and is awaiting capture confirmation.",
    };
  }

  async handleWebhook(rawBody: Buffer, signature: string, payload: any) {
    if (!this.razorpay.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException("Invalid Razorpay webhook signature");
    }
    const event = String(payload?.event ?? "");
    const entity = payload?.payload?.payment?.entity;
    if (event === "payment.captured" && entity?.id && entity?.order_id) {
      const payment = await this.prisma.payment.findFirst({ where: { providerOrderId: entity.order_id } });
      if (payment && entity.amount === payment.amountPaise && entity.currency === "INR") {
        await this.captureOrder(payment.orderId, entity.id, entity.method, entity);
      }
    }
    if (event === "payment.failed" && entity?.order_id) {
      await this.prisma.payment.updateMany({
        where: { providerOrderId: entity.order_id, status: { in: ["CREATED", "AUTHORIZED"] } },
        data: { status: "FAILED", providerPaymentId: entity.id ?? null, rawReference: entity as any },
      });
    }
    return { received: true };
  }

  private async captureOrder(orderId: string, paymentId: string, method?: string, raw?: any) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { payments: true, reservations: true },
      });
      if (!order) throw new NotFoundException("HIDI order not found");
      if (order.status === "CONFIRMED" || order.status === "PACKED" || order.status === "SHIPPED" || order.status === "DELIVERED") {
        return { success: true, captured: true, orderNumber: order.orderNumber, status: order.status };
      }

      const payment = order.payments.find((p) => p.providerOrderId);
      if (!payment) throw new NotFoundException("Payment record not found");

      let reviewRequired = false;
      for (const reservation of order.reservations) {
        if (reservation.status === "CONSUMED") continue;
        const locked = await tx.$queryRaw<Array<{ onHand: number; reserved: number; safetyStock: number }>>`
          SELECT "onHand", "reserved", "safetyStock"
          FROM "Inventory"
          WHERE "variantId" = ${reservation.variantId}
          FOR UPDATE
        `;
        const inventory = locked[0];
        if (!inventory) { reviewRequired = true; continue; }
        if (reservation.status === "ACTIVE") {
          if (inventory.onHand < reservation.quantity || inventory.reserved < reservation.quantity) reviewRequired = true;
        } else {
          const available = inventory.onHand - inventory.reserved - inventory.safetyStock;
          if (available < reservation.quantity) reviewRequired = true;
        }
      }

      if (!reviewRequired) {
        for (const reservation of order.reservations) {
          if (reservation.status === "CONSUMED") continue;
          const data = reservation.status === "ACTIVE"
            ? { onHand: { decrement: reservation.quantity }, reserved: { decrement: reservation.quantity } }
            : { onHand: { decrement: reservation.quantity } };
          await tx.inventory.update({ where: { variantId: reservation.variantId }, data });
          await tx.inventoryReservation.update({
            where: { id: reservation.id },
            data: { status: "CONSUMED", consumedAt: new Date() },
          });
        }
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: paymentId,
          status: "CAPTURED",
          method: method ?? null,
          rawReference: raw ?? undefined,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: reviewRequired ? "PAYMENT_REVIEW" : "CONFIRMED" },
      });
      if (!reviewRequired && order.cartSessionId) {
        const cart = await tx.cart.findUnique({ where: { sessionId: order.cartSessionId } });
        if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }

      return {
        success: true,
        captured: true,
        orderNumber: order.orderNumber,
        status: reviewRequired ? "PAYMENT_REVIEW" : "CONFIRMED",
      };
    }, { isolationLevel: "Serializable" });
  }
}
