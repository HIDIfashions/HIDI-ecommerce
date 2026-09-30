jest.mock("../src/network/apiClient", () => ({ hidiRequest: jest.fn() }));
jest.mock("../src/storage/cartStorage", () => ({ cartStorage: { sessionId: jest.fn(async () => "test-session") } }));
jest.mock("../src/storage/checkoutStorage", () => ({ checkoutStorage: { checkoutToken: jest.fn(), saveAttempt: jest.fn() } }));
import { createCheckoutAttempt, classifySavedAttempt } from "../src/data/checkoutApi";
import { hidiRequest } from "../src/network/apiClient";
import { cartStorage } from "../src/storage/cartStorage";
import { checkoutStorage } from "../src/storage/checkoutStorage";
import type { CheckoutAttempt } from "../src/models/checkout";
const attempt: CheckoutAttempt = { checkoutToken: "demo", orderNumber: "TEST-1", provider: "RAZORPAY", amountPaise: 129000, totalPaise: 129000, walletAppliedPaise: 0, currency: "INR", status: "PENDING_PAYMENT", captured: true, createdAt: 1, methodIntent: "upi" };
const confirmation = { orderNumber: "TEST-1", totalPaise: 129000, currency: "INR", status: "PENDING_PAYMENT", payment: { status: "CREATED" } };
beforeEach(() => jest.clearAllMocks());
it("H053/H054 missing bridge blocks before session allocation or any POST", async () => {
  await expect(createCheckoutAttempt({} as never)).rejects.toThrow("No payment attempt");
  expect(cartStorage.sessionId).not.toHaveBeenCalled(); expect(checkoutStorage.checkoutToken).not.toHaveBeenCalled(); expect(hidiRequest).not.toHaveBeenCalled();
});
it("AT-04 ignores stale captured=true in local state when the server is pending", async () => {
  (hidiRequest as jest.Mock).mockResolvedValue(confirmation);
  expect((await classifySavedAttempt(attempt)).state).toBe("pending");
  expect(hidiRequest).toHaveBeenCalledTimes(1);
});
it("AT-04 server confirmed state recovers the same order without a new attempt", async () => {
  (hidiRequest as jest.Mock).mockResolvedValue({ ...confirmation, status: "CONFIRMED", payment: { status: "CAPTURED" } });
  expect((await classifySavedAttempt({ ...attempt, captured: false })).state).toBe("confirmed");
  expect(checkoutStorage.checkoutToken).not.toHaveBeenCalled(); expect(checkoutStorage.saveAttempt).not.toHaveBeenCalled();
});
it.each([{ orderNumber: "OTHER" }, { currency: "USD" }, { totalPaise: 1 }])("AT-09 mismatched order context fails closed: %s", async mismatch => {
  (hidiRequest as jest.Mock).mockResolvedValue({ ...confirmation, ...mismatch });
  await expect(classifySavedAttempt(attempt)).rejects.toThrow("matched safely");
});
