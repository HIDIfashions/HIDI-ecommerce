jest.mock("@react-native-community/netinfo", () => ({ fetch: jest.fn() }));

import { screenRegistry } from "../src/spec/screenRegistry";
import {
  buildPrepareCheckoutPayload,
  classifyPaymentState,
  hasAddressErrors,
  makeCheckoutToken,
  normalizeCheckoutPhone,
  validateCheckoutAddress,
} from "../src/models/checkout";
import type { ApiCart } from "../src/models/cart";

const cart: ApiCart = {
  id: "cart-1",
  sessionId: "mobile-session-123",
  currency: "INR",
  itemCount: 1,
  subtotalPaise: 129000,
  items: [{
    id: "line-1",
    quantity: 1,
    unitPricePaise: 129000,
    lineTotalPaise: 129000,
    product: { id: "p1", slug: "aara-sage", name: "Aara Sage", image: null },
    variant: { id: "v1", sku: "AARA-M", size: "M", color: "Sage", available: 3 },
  }],
};

const address = {
  id: "addr-1",
  firstName: "Ananya",
  lastName: "",
  phone: "+919876543210",
  line1: "Flat 12, HIDI Street",
  line2: "Banjara Hills",
  city: "Hyderabad",
  state: "Telangana",
  postalCode: "500034",
  countryCode: "IN" as const,
};

describe("Phase 3 H045-H060 checkout contracts", () => {
  it("contains exactly the 16 Phase 3 P0 screens", () => {
    const phase3 = screenRegistry.filter((screen) => screen.phase === 3);
    expect(phase3.map((screen) => screen.id)).toEqual(
      Array.from({ length: 16 }, (_, index) => "H" + String(index + 45).padStart(3, "0")),
    );
    expect(phase3.every((screen) => screen.priority === "P0")).toBe(true);
  });

  it("normalizes Indian checkout phone without creating a marketing account", () => {
    expect(normalizeCheckoutPhone("98765 43210")).toBe("+919876543210");
    expect(normalizeCheckoutPhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeCheckoutPhone("12345")).toBeNull();
  });

  it("preserves field-level address validation for H048", () => {
    const errors = validateCheckoutAddress({ ...address, line1: "", postalCode: "500", phone: "111" });
    expect(hasAddressErrors(errors)).toBe(true);
    expect(errors.line1).toContain("house");
    expect(errors.postalCode).toContain("6-digit");
    expect(errors.phone).toContain("valid Indian mobile");
    expect(hasAddressErrors(validateCheckoutAddress(address))).toBe(false);
  });

  it("builds a prepare payload with canonical subtotal in paise", () => {
    const token = makeCheckoutToken("test-checkout");
    const payload = buildPrepareCheckoutPayload({
      sessionId: cart.sessionId,
      checkoutToken: token,
      contact: { phone: "+919876543210", email: "a@example.com", verified: false, source: "guest" },
      address,
      cart,
    });
    expect(payload.expectedTotalPaise).toBe(129000);
    expect(payload.customerPhone).toBe("+919876543210");
    expect(payload.shippingAddress.postalCode).toBe("500034");
    expect(payload.checkoutToken).toBe(token);
  });

  it("classifies payment states without treating pending as failure", () => {
    expect(classifyPaymentState({ orderStatus: "PENDING_PAYMENT", paymentStatus: "CREATED" })).toBe("pending");
    expect(classifyPaymentState({ orderStatus: "CONFIRMED", paymentStatus: "CAPTURED" })).toBe("confirmed");
    expect(classifyPaymentState({ orderStatus: "PENDING_PAYMENT", paymentStatus: "FAILED" })).toBe("failed");
  });
});
