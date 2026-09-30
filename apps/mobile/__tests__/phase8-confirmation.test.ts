import { confirmationPresentation, mayClearConfirmedAttempt } from "../src/models/confirmation";
import type { CheckoutConfirmation } from "../src/data/checkoutApi";
import type { CheckoutAttempt } from "../src/models/checkout";
const data: CheckoutConfirmation = { orderNumber: "TEST-ORDER", currency: "INR", totalPaise: 224100, status: "CONFIRMED", createdAt: "2026-09-30T00:00:00Z", subtotalPaise: 224100, discountPaise: 0, taxPaise: 0, shippingPaise: 0, walletAppliedPaise: 0, cashPaidPaise: 0, payment: null, items: [] };
const attempt: CheckoutAttempt = { orderNumber: data.orderNumber, totalPaise: data.totalPaise, currency: data.currency, amountPaise: data.totalPaise, walletAppliedPaise: 0, status: "PENDING_PAYMENT", captured: false, provider: "RAZORPAY", methodIntent: "upi", checkoutToken: "fixture", createdAt: 1 };
it("H059 does not infer COD or successful payment from a missing payment object", () => {
  const view = confirmationPresentation(data, data.orderNumber);
  expect(view.accepted).toBe(true); expect(view.paymentCopy).toContain("does not mean cash on delivery");
});
it("H059 only shows accepted order styling for server accepted states", () => {
  const view = confirmationPresentation({ ...data, status: "PENDING_PAYMENT" }, data.orderNumber);
  expect(view.accepted).toBe(false); expect(view.title).toContain("not final");
});
it("AT-05 COD is labeled only when explicitly returned", () => {
  const view = confirmationPresentation({ ...data, payment: { method: "cod", status: "PENDING", amountPaise: 0 } }, data.orderNumber);
  expect(view.paymentCopy).toBe("Cash on delivery. Current payment status: PENDING");
});
it("AT-04 historical order viewing must not erase another unresolved checkout", () => {
  expect(mayClearConfirmedAttempt(data, { ...attempt, orderNumber: "OTHER" })).toBe(false);
  expect(mayClearConfirmedAttempt(data, attempt)).toBe(true);
  expect(mayClearConfirmedAttempt({ ...data, status: "PENDING_PAYMENT" }, attempt)).toBe(false);
});
it.each([{ orderNumber: "OTHER" }, { totalPaise: NaN }, { currency: "USD" }])("H059 refuses unmatched or invalid canonical responses %s", mismatch => {
  expect(() => confirmationPresentation({ ...data, ...mismatch }, data.orderNumber)).toThrow("matched safely");
});
