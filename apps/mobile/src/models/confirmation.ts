import type { CheckoutConfirmation } from "../data/checkoutApi";
import type { CheckoutAttempt } from "./checkout";
const ACCEPTED = new Set(["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"]);
export function confirmationPresentation(data: CheckoutConfirmation, expectedOrderNumber: string) {
  if (data.orderNumber !== expectedOrderNumber || data.currency !== "INR" || !Number.isSafeInteger(data.totalPaise) || data.totalPaise < 0 || !Array.isArray(data.items)) {
    throw new Error("This response could not be matched safely to your order. Contact HIDI with the order reference.");
  }
  const accepted = ACCEPTED.has(String(data.status).toUpperCase());
  const status = String(data.status || "UNKNOWN").toUpperCase();
  const paymentStatus = data.payment?.status ? String(data.payment.status).toUpperCase() : null;
  const explicitCod = String(data.payment?.method ?? "").toLowerCase() === "cod";
  return {
    accepted,
    title: accepted ? "Order received." : status === "CANCELLED" ? "Order cancelled." : "Order confirmation is not final yet.",
    paymentCopy: paymentStatus
      ? (explicitCod ? "Cash on delivery. Current payment status: " : "Current payment status: ") + paymentStatus
      : "Payment details are not available in this response. Missing payment data does not mean cash on delivery or a successful payment.",
  };
}
export function mayClearConfirmedAttempt(data: CheckoutConfirmation, attempt: CheckoutAttempt | null): boolean {
  return ACCEPTED.has(String(data.status).toUpperCase()) && attempt !== null && attempt.orderNumber === data.orderNumber && attempt.currency === data.currency && attempt.totalPaise === data.totalPaise;
}
