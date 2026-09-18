/**
 * Illustrative rewards projection only: no credit, debit, balance or redemption.
 * The final programme's qualifying spend, tax treatment, expiry and offer
 * stacking still require business approval before an actual ledger is built.
 */
export const REWARD_PREVIEW_ORDER_LIMIT = 100;
export const REWARD_PREVIEW_RELATION_LIMIT = 20;
const DAY_MS = 86_400_000;

export type RewardPreviewOrder = {
  orderNumber: string;
  status: string;
  currency: string;
  createdAt: Date | string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  payments: { status: string; amountPaise: number }[];
  shipments: { status: string; deliveredAt: Date | string | null }[];
  /** False if the caller deliberately bounded relation reads. */
  relationsComplete?: boolean;
};

export type RewardPreviewReason =
  | "RETURN_WINDOW_NOT_CONFIGURED"
  | "RELATION_LIMIT_EXCEEDED"
  | "UNSUPPORTED_CURRENCY"
  | "INVALID_ORDER_AMOUNTS"
  | "INVALID_ORDER_DATE"
  | "ORDER_ON_HOLD"
  | "REFUND_ON_HOLD"
  | "PAYMENT_NOT_FULLY_CAPTURED"
  | "INVALID_PAYMENT"
  | "INVALID_DELIVERY_DATE"
  | "SHIPMENT_ON_HOLD"
  | "AWAITING_DELIVERY"
  | "RETURN_WINDOW_OPEN"
  | "RETURN_WINDOW_ENDED";

export type RewardPreviewEntry = {
  orderNumber: string;
  status: "HELD" | "PENDING_ESTIMATE" | "ELIGIBLE_ESTIMATE";
  reason: RewardPreviewReason;
  proposedEligibleMerchandisePaise: number;
  estimatedRewardPaise: number;
  eligibleAt: string | null;
};

export function parseReturnWindowDays(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d{0,2}$/.test(value)) return null;
  const days = Number(value);
  return days <= 365 ? days : null;
}

function isAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function timestamp(value: Date | string | null): number {
  if (value === null) return Number.NaN;
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** ₹2 (200 paise) for each COMPLETE ₹100 (10,000 paise). */
export function estimateRewardPaise(merchandisePaise: number): number {
  if (!isAmount(merchandisePaise)) return 0;
  return Math.floor(merchandisePaise / 10_000) * 200;
}

export function projectRewardPreview(
  order: RewardPreviewOrder,
  returnWindowDays: number | null,
  now: Date,
): RewardPreviewEntry {
  const base: RewardPreviewEntry = {
    orderNumber: order.orderNumber,
    status: "HELD",
    reason: "ORDER_ON_HOLD",
    proposedEligibleMerchandisePaise: 0,
    estimatedRewardPaise: 0,
    eligibleAt: null,
  };
  const hold = (reason: RewardPreviewReason): RewardPreviewEntry => ({ ...base, reason });
  if (returnWindowDays === null || !Number.isInteger(returnWindowDays) || returnWindowDays < 1 || returnWindowDays > 365) {
    return hold("RETURN_WINDOW_NOT_CONFIGURED");
  }
  if (order.relationsComplete === false) return hold("RELATION_LIMIT_EXCEEDED");
  if (order.currency !== "INR") return hold("UNSUPPORTED_CURRENCY");
  const amounts = [order.subtotalPaise, order.discountPaise, order.shippingPaise, order.taxPaise, order.totalPaise];
  const merchandisePaise = order.subtotalPaise - order.discountPaise;
  const expectedTotal = merchandisePaise + order.shippingPaise + order.taxPaise;
  if (amounts.some((amount) => !isAmount(amount)) || merchandisePaise < 0
    || !Number.isSafeInteger(expectedTotal) || order.totalPaise !== expectedTotal || order.totalPaise === 0) {
    return hold("INVALID_ORDER_AMOUNTS");
  }
  const nowMs = now.getTime();
  const createdMs = timestamp(order.createdAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(createdMs) || createdMs > nowMs) return hold("INVALID_ORDER_DATE");
  if (!["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"].includes(order.status)) return hold("ORDER_ON_HOLD");
  if (order.payments.some((payment) => ["REFUNDED", "PARTIALLY_REFUNDED"].includes(payment.status))) {
    return hold("REFUND_ON_HOLD");
  }
  if (order.payments.some((payment) => !isAmount(payment.amountPaise)
    || !["CREATED", "AUTHORIZED", "CAPTURED", "FAILED"].includes(payment.status))) return hold("INVALID_PAYMENT");
  const capturedPaise = order.payments.filter((payment) => payment.status === "CAPTURED")
    .reduce((sum, payment) => sum + payment.amountPaise, 0);
  if (!Number.isSafeInteger(capturedPaise) || capturedPaise !== order.totalPaise) return hold("PAYMENT_NOT_FULLY_CAPTURED");
  if (order.shipments.some((shipment) => !["PENDING", "READY_TO_SHIP", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(shipment.status))) {
    return hold("SHIPMENT_ON_HOLD");
  }
  const deliveryDates = order.shipments.map((shipment) => timestamp(shipment.deliveredAt));
  if (order.shipments.some((shipment, index) => {
    const deliveredMs = deliveryDates[index];
    return (shipment.status === "DELIVERED" && shipment.deliveredAt === null)
      || (shipment.deliveredAt !== null && (!Number.isFinite(deliveredMs) || deliveredMs < createdMs || deliveredMs > nowMs));
  })) return hold("INVALID_DELIVERY_DATE");

  const estimated = {
    ...base,
    status: "PENDING_ESTIMATE" as const,
    reason: "AWAITING_DELIVERY" as const,
    proposedEligibleMerchandisePaise: merchandisePaise,
    estimatedRewardPaise: estimateRewardPaise(merchandisePaise),
  };
  if (order.status !== "DELIVERED" || order.shipments.length === 0
    || order.shipments.some((shipment) => shipment.status !== "DELIVERED")) return estimated;
  // Split shipments never mature until the latest actual delivery + the window.
  const eligibleMs = Math.max(...deliveryDates) + returnWindowDays * DAY_MS;
  const eligibleAt = new Date(eligibleMs).toISOString();
  return {
    ...estimated,
    status: eligibleMs <= nowMs ? "ELIGIBLE_ESTIMATE" : "PENDING_ESTIMATE",
    reason: eligibleMs <= nowMs ? "RETURN_WINDOW_ENDED" : "RETURN_WINDOW_OPEN",
    eligibleAt,
  };
}

export function summarizeRewardPreview(entries: RewardPreviewEntry[]) {
  return {
    pendingEstimatedPaise: entries.filter((entry) => entry.status === "PENDING_ESTIMATE")
      .reduce((sum, entry) => sum + entry.estimatedRewardPaise, 0),
    eligibleEstimatedPaise: entries.filter((entry) => entry.status === "ELIGIBLE_ESTIMATE")
      .reduce((sum, entry) => sum + entry.estimatedRewardPaise, 0),
    heldOrderCount: entries.filter((entry) => entry.status === "HELD").length,
  };
}
