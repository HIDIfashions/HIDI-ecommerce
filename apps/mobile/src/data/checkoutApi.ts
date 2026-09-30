import type { ApiCart } from "../models/cart";
import type { CheckoutAddress, CheckoutAttempt, CheckoutContact } from "../models/checkout";
import { buildPrepareCheckoutPayload, classifyPaymentState } from "../models/checkout";
import { hidiRequest } from "../network/apiClient";
import { hidiEndpoints } from "../network/endpoints";
import { cartStorage } from "../storage/cartStorage";
import { checkoutStorage } from "../storage/checkoutStorage";
import { assertPaymentHandoffAvailable } from "../spec/releaseGates";
export type CheckoutPrepareResponse = {
  hidiOrderId?: string; orderNumber: string; amountPaise: number; subtotalPaise?: number; totalPaise: number;
  walletAppliedPaise?: number; status: string; captured: boolean; currency: string;
  provider: "RAZORPAY" | "WALLET"; providerOrderId?: string; razorpayKeyId?: string; reservationMinutes?: number;
};
export type CheckoutConfirmation = {
  orderNumber: string; status: string; createdAt: string; currency: string; subtotalPaise: number; discountPaise: number;
  shippingPaise: number; taxPaise: number; totalPaise: number; walletAppliedPaise: number; cashPaidPaise: number;
  customerEmail?: string | null; customerPhone?: string | null;
  payment?: { status: string; method?: string | null; amountPaise: number } | null;
  items: Array<{ id: string; productName: string; slug: string; image?: string | null; size: string; color: string; quantity: number; unitPricePaise: number; totalPaise: number }>;
};
export async function createCheckoutAttempt(input: { cart: ApiCart; contact: CheckoutContact; address: CheckoutAddress; accessToken?: string; methodIntent: "upi" | "card" }) {
  // Fail before token allocation, cart mutation or an order/stock reservation.
  assertPaymentHandoffAvailable();
  const [sessionId, checkoutToken] = await Promise.all([cartStorage.sessionId(), checkoutStorage.checkoutToken()]);
  const payload = buildPrepareCheckoutPayload({ sessionId, checkoutToken, contact: input.contact, address: input.address, cart: input.cart, walletPaise: 0 });
  const response = await hidiRequest<CheckoutPrepareResponse>(hidiEndpoints.prepareCheckout, { method: "POST", ...(input.accessToken ? { accessToken: input.accessToken } : {}), body: JSON.stringify(payload), timeoutMs: 25000 });
  const attempt: CheckoutAttempt = {
    checkoutToken, orderNumber: response.orderNumber, provider: response.provider, amountPaise: response.amountPaise,
    totalPaise: response.totalPaise, walletAppliedPaise: response.walletAppliedPaise ?? 0, currency: response.currency,
    status: response.status, captured: response.captured, createdAt: Date.now(), methodIntent: input.methodIntent,
    ...(response.hidiOrderId ? { hidiOrderId: response.hidiOrderId } : {}),
    ...(response.providerOrderId ? { providerOrderId: response.providerOrderId } : {}),
    ...(response.razorpayKeyId ? { razorpayKeyId: response.razorpayKeyId } : {}),
    ...(response.reservationMinutes !== undefined ? { reservationMinutes: response.reservationMinutes } : {}),
  };
  await checkoutStorage.saveAttempt(attempt); return attempt;
}
export async function getCheckoutConfirmation(orderNumber: string) {
  const sessionId = await cartStorage.sessionId();
  return hidiRequest<CheckoutConfirmation>(hidiEndpoints.confirmation(orderNumber, sessionId), { timeoutMs: 15000 });
}
export async function classifySavedAttempt(attempt: CheckoutAttempt) {
  const confirmation = await getCheckoutConfirmation(attempt.orderNumber);
  if (confirmation.orderNumber !== attempt.orderNumber || confirmation.currency !== attempt.currency || confirmation.totalPaise !== attempt.totalPaise) {
    throw new Error("Order status could not be matched safely. Keep this order reference and contact HIDI; do not create another payment.");
  }
  const paymentStatus = confirmation.payment?.status;
  return { confirmation, state: classifyPaymentState({ orderStatus: confirmation.status, ...(paymentStatus ? { paymentStatus } : {}) }) };
}
export async function verifyRazorpayPayment(input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  return hidiRequest<{ success: boolean; captured: boolean; orderNumber?: string; status?: string; message?: string }>(hidiEndpoints.paymentVerify, { method: "POST", body: JSON.stringify(input), timeoutMs: 20000 });
}
