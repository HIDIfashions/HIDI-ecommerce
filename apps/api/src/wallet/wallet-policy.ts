export const WALLET_POLICY_VERSION = "hidi-wallet-v1-7d-no-cap";
export const WALLET_RETURN_WINDOW_DAYS = 7;
export const WALLET_DAY_MS = 86_400_000;
export const WALLET_MAX_PAISE = 2_147_483_647;

export type WalletOrderAmounts = {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  walletAppliedPaise: number;
};

export function validPaise(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= WALLET_MAX_PAISE;
}

export function validOrderAmounts(order: WalletOrderAmounts): boolean {
  return [order.subtotalPaise, order.discountPaise, order.shippingPaise, order.taxPaise, order.totalPaise, order.walletAppliedPaise].every(validPaise)
    && order.discountPaise <= order.subtotalPaise
    && order.walletAppliedPaise <= order.totalPaise
    && order.totalPaise === order.subtotalPaise - order.discountPaise + order.shippingPaise + order.taxPaise;
}

export function walletRewardBasis(order: WalletOrderAmounts): number {
  if (!validOrderAmounts(order)) throw new Error("Invalid wallet order amounts");
  return Math.max(0, order.subtotalPaise - order.discountPaise - order.walletAppliedPaise);
}

export function walletEarnPaise(basisPaise: number): number {
  if (!validPaise(basisPaise)) throw new Error("Invalid rewards earning amount");
  return Math.floor(basisPaise / 10_000) * 200;
}

export function spendablePaise(balancePaise: number, reservedPaise: number): number {
  if (!Number.isSafeInteger(balancePaise) || !validPaise(reservedPaise)) throw new Error("Invalid wallet balances");
  return Math.max(0, balancePaise - reservedPaise);
}

export type MaturityInput = {
  currency: string;
  status: string;
  createdAt: Date;
  totalPaise: number;
  walletAppliedPaise: number;
  payments: { status: string; amountPaise: number; refunds?: { status: string; amountPaise: number }[] }[];
  shipments: { status: string; deliveredAt: Date | null }[];
  hold: { status: string; amountPaise: number } | null;
};

export type MaturityDecision = {
  status: "PENDING" | "HELD" | "ELIGIBLE" | "REVERSE";
  reason: string;
  eligibleAt: Date | null;
};

/** Only verified order data belongs here; this function never changes funds. */
export function walletMaturity(input: MaturityInput, returnWindowDays: number, now: Date): MaturityDecision {
  const result = (status: MaturityDecision["status"], reason: string, eligibleAt: Date | null = null): MaturityDecision => ({ status, reason, eligibleAt });
  if (["RETURN_REQUESTED", "RETURNED", "REFUNDED", "CANCELLED"].includes(input.status)) return result("REVERSE", "ORDER_CANCELLED_OR_RETURNED");
  if (input.payments.some((payment) => ["REFUNDED", "PARTIALLY_REFUNDED"].includes(payment.status)
    || payment.refunds?.some((refund) => refund.status === "PROCESSED" && refund.amountPaise > 0))) {
    return result("REVERSE", "PAYMENT_REFUNDED");
  }
  if (input.payments.some((payment) => payment.refunds?.some((refund) => !validPaise(refund.amountPaise)
    || !["PROCESSED", "FAILED"].includes(refund.status)))) return result("HELD", "REFUND_REQUIRES_RECONCILIATION");
  if (input.currency !== "INR" || !validPaise(input.totalPaise) || !validPaise(input.walletAppliedPaise)
    || input.walletAppliedPaise > input.totalPaise || input.totalPaise === 0) return result("HELD", "INVALID_ORDER_AMOUNTS");
  if (input.status === "PAYMENT_REVIEW") return result("REVERSE", "PAYMENT_REVIEW");
  if (!["PENDING_PAYMENT", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"].includes(input.status)) return result("HELD", "UNKNOWN_ORDER_STATUS");
  if (returnWindowDays !== WALLET_RETURN_WINDOW_DAYS) return result("HELD", "UNSUPPORTED_POLICY");
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(input.createdAt.getTime()) || input.createdAt > now) return result("HELD", "INVALID_ORDER_DATE");
  if (input.payments.some((payment) => !validPaise(payment.amountPaise)
    || !["CREATED", "AUTHORIZED", "CAPTURED", "FAILED"].includes(payment.status))) return result("HELD", "INVALID_PAYMENT");
  const cashCaptured = input.payments.filter((payment) => payment.status === "CAPTURED").reduce((sum, payment) => sum + payment.amountPaise, 0);
  if (!Number.isSafeInteger(cashCaptured) || cashCaptured !== input.totalPaise - input.walletAppliedPaise) return result("PENDING", "PAYMENT_NOT_FULLY_CAPTURED");
  if (input.walletAppliedPaise > 0 && (!input.hold || input.hold.status !== "CONSUMED" || input.hold.amountPaise !== input.walletAppliedPaise)) {
    return result("HELD", "WALLET_PAYMENT_NOT_CONSUMED");
  }
  if (input.walletAppliedPaise === 0 && input.hold && input.hold.amountPaise !== 0) return result("HELD", "WALLET_PAYMENT_MISMATCH");
  if (input.shipments.some((shipment) => ["RTO", "CANCELLED"].includes(shipment.status))) return result("REVERSE", "SHIPMENT_RETURNED_OR_CANCELLED");
  if (input.shipments.length > 1) return result("HELD", "MULTI_SHIPMENT_REQUIRES_ITEM_RECONCILIATION");
  const shipment = input.shipments[0];
  if (!shipment || input.status !== "DELIVERED" || shipment.status !== "DELIVERED") {
    return result("PENDING", "AWAITING_COMPLETE_DELIVERY");
  }
  const deliveredAt = shipment.deliveredAt;
  if (!deliveredAt || !Number.isFinite(deliveredAt.getTime()) || deliveredAt < input.createdAt || deliveredAt > now) return result("HELD", "INVALID_DELIVERY_DATE");
  const eligibleAt = new Date(deliveredAt.getTime() + returnWindowDays * WALLET_DAY_MS);
  return eligibleAt <= now ? result("ELIGIBLE", "RETURN_WINDOW_CLOSED", eligibleAt) : result("PENDING", "RETURN_WINDOW_OPEN", eligibleAt);
}
