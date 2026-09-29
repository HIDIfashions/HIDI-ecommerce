import type { ApiCart } from "./cart";

export type CheckoutContact = {
  phone: string;
  email?: string;
  verified: boolean;
  source: "session" | "guest";
};

export type CheckoutAddress = {
  id: string;
  firstName: string;
  lastName?: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: "IN";
  isDefault?: boolean;
};

export type DeliverySelection = {
  methodId: "standard";
  label: string;
  serviceable: boolean;
  pin: string;
  city?: string | null;
  stateCode?: string | null;
  feePaise: number;
  checkedAt: number;
};

export type CheckoutAttempt = {
  checkoutToken: string;
  orderNumber: string;
  hidiOrderId?: string;
  provider: "RAZORPAY" | "WALLET";
  providerOrderId?: string;
  razorpayKeyId?: string;
  amountPaise: number;
  totalPaise: number;
  walletAppliedPaise: number;
  currency: string;
  status: string;
  captured: boolean;
  createdAt: number;
  reservationMinutes?: number;
  methodIntent?: "upi" | "card" | "cod";
};

export type CheckoutResumeState = {
  contact: CheckoutContact | null;
  address: CheckoutAddress | null;
  delivery: DeliverySelection | null;
  attempt: CheckoutAttempt | null;
};

export type AddressFieldErrors = Partial<Record<keyof CheckoutAddress, string>>;

export function sanitizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeCheckoutPhone(raw: string) {
  const digits = sanitizeDigits(raw);
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return "+91" + local;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validateCheckoutAddress(input: Partial<CheckoutAddress>): AddressFieldErrors {
  const errors: AddressFieldErrors = {};
  if (!cleanText(input.firstName)) errors.firstName = "Enter the recipient name.";
  if (!normalizeCheckoutPhone(cleanText(input.phone ?? ""))) errors.phone = "Enter a valid Indian mobile number.";
  if (cleanText(input.line1).length < 5) errors.line1 = "Add house, flat or street details.";
  if (!/^\d{6}$/.test(cleanText(input.postalCode))) errors.postalCode = "Enter a 6-digit PIN code.";
  if (!cleanText(input.city)) errors.city = "Enter the city.";
  if (!cleanText(input.state)) errors.state = "Enter the state.";
  return errors;
}

export function hasAddressErrors(errors: AddressFieldErrors) {
  return Object.keys(errors).length > 0;
}

export function addressSummary(address: CheckoutAddress) {
  return [
    address.firstName + (address.lastName ? " " + address.lastName : ""),
    address.line1,
    address.line2,
    address.landmark ? "Landmark: " + address.landmark : "",
    [address.city, address.state, address.postalCode].filter(Boolean).join(" · "),
  ].filter(Boolean).join("\n");
}

export function makeCheckoutToken(prefix = "checkout") {
  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return prefix + "-" + Date.now().toString(36) + "-" + random.slice(0, 20);
}

export function checkoutSubtotal(cart: ApiCart | null) {
  return cart?.subtotalPaise ?? 0;
}

export function classifyPaymentState(input: { orderStatus?: string | null; paymentStatus?: string | null; captured?: boolean }) {
  const order = String(input.orderStatus ?? "").toUpperCase();
  const payment = String(input.paymentStatus ?? "").toUpperCase();
  if (input.captured || ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"].includes(order) || ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(payment)) return "confirmed" as const;
  if (["FAILED", "CANCELLED"].includes(payment) || ["CANCELLED"].includes(order)) return "failed" as const;
  return "pending" as const;
}

export function buildPrepareCheckoutPayload(input: {
  sessionId: string;
  checkoutToken: string;
  contact: CheckoutContact;
  address: CheckoutAddress;
  cart: ApiCart;
  walletPaise?: number;
}) {
  const cleanEmail = input.contact.email?.trim();
  return {
    sessionId: input.sessionId,
    checkoutToken: input.checkoutToken,
    ...(cleanEmail ? { customerEmail: cleanEmail } : {}),
    customerPhone: input.contact.phone,
    expectedTotalPaise: input.cart.subtotalPaise,
    walletPaise: input.walletPaise ?? 0,
    shippingAddress: {
      firstName: input.address.firstName.trim(),
      lastName: input.address.lastName?.trim() || "",
      phone: input.address.phone.trim(),
      line1: input.address.line1.trim(),
      line2: input.address.line2?.trim() || "",
      city: input.address.city.trim(),
      state: input.address.state.trim(),
      postalCode: input.address.postalCode.trim(),
      countryCode: "IN",
    },
  };
}