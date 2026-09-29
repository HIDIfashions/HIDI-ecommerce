import { resolveHidiMediaUrl } from "../network/config";

export type ReturnRequestStatus =
  | "REQUESTED"
  | "APPROVED"
  | "PICKUP_SCHEDULED"
  | "RECEIVED"
  | "REFUND_PROCESSING"
  | "REFUNDED"
  | "EXCHANGE_SHIPPED"
  | "REJECTED"
  | "CANCELLED"
  | string;

export type AfterSalesType = "RETURN" | "EXCHANGE";

export type OrderReturnRequest = {
  id: string;
  type: AfterSalesType | string;
  reason: string;
  quantity: number;
  refundDestination?: string | null;
  requestedSize?: string | null;
  refundPaise: number;
  status: ReturnRequestStatus;
  pickupProvider?: string | null;
  pickupAwb?: string | null;
  pickupTrackingUrl?: string | null;
  refundWalletPaise?: number | null;
  refundCashPaise?: number | null;
  refundStatus?: string | null;
  replacementProvider?: string | null;
  replacementAwb?: string | null;
  replacementTrackingUrl?: string | null;
  rejectionReason?: string | null;
  completedAt?: string | null;
  createdAt: string;
};

export type OrderItem = {
  id: string;
  productName: string;
  slug: string;
  image?: string | null;
  size: string;
  color: string;
  quantity: number;
  returnableQuantity: number;
  unitPricePaise: number;
  discountPaise?: number | null;
  totalPaise: number;
  exchangeSizes: string[];
  review?: { id: string; rating: number; title?: string | null; body?: string | null; createdAt: string } | null;
  returnRequests: OrderReturnRequest[];
};

export type OrderShipment = {
  provider?: string | null;
  awb?: string | null;
  trackingUrl?: string | null;
  status?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
};

export type AccountOrder = {
  orderNumber: string;
  status: string;
  afterSales?: { id: string; type: string; status: string; createdAt: string } | null;
  createdAt: string;
  deliveredAt?: string | null;
  returnWindowEndsAt?: string | null;
  canReturnOrExchange: boolean;
  subtotalPaise: number;
  discountPaise?: number | null;
  shippingPaise?: number | null;
  taxPaise?: number | null;
  totalPaise: number;
  walletAppliedPaise?: number | null;
  cashPayablePaise?: number | null;
  paymentStatus?: string | null;
  shippingAddress?: Record<string, unknown> | null;
  shipment?: OrderShipment | null;
  itemCount: number;
  items: OrderItem[];
};

export type AccountOrdersPayload = {
  customer: { email?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null };
  orders: AccountOrder[];
};

export type AfterSalesDraft = {
  orderNumber: string;
  orderItemId: string;
  type: AfterSalesType;
  quantity: number;
  reason: string;
  detail?: string;
  refundDestination?: "ORIGINAL" | "WALLET";
  requestedSize?: string;
};

export const RETURN_REASONS = [
  { code: "SIZE_FIT", label: "Size / fit did not work" },
  { code: "DAMAGED_DEFECTIVE", label: "Damaged or defective" },
  { code: "WRONG_ITEM", label: "Wrong item received" },
  { code: "DIFFERENT_FROM_DESCRIPTION", label: "Different from description" },
  { code: "QUALITY_NOT_EXPECTED", label: "Quality not as expected" },
  { code: "CHANGED_MIND", label: "Changed my mind" },
  { code: "OTHER", label: "Other" },
] as const;

export function orderImage(item: OrderItem) {
  return resolveHidiMediaUrl(item.image);
}

export function formatStatus(value?: string | null) {
  const raw = String(value ?? "").replace(/_/g, " ").trim();
  if (!raw) return "Status unavailable";
  return raw.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function shortDate(value?: string | Date | null) {
  if (!value) return "Not available";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function requestAmountPaise(request?: OrderReturnRequest | null) {
  if (!request) return 0;
  const wallet = Number(request.refundWalletPaise ?? 0);
  const cash = Number(request.refundCashPaise ?? 0);
  return wallet + cash || Number(request.refundPaise ?? 0);
}

export function latestRequest(order: AccountOrder) {
  return order.items
    .flatMap((item) => item.returnRequests.map((request) => ({ item, request })))
    .sort((a, b) => new Date(b.request.createdAt).getTime() - new Date(a.request.createdAt).getTime())[0] ?? null;
}

export function findRequest(order: AccountOrder, requestId?: string) {
  if (!requestId) return latestRequest(order);
  return order.items
    .flatMap((item) => item.returnRequests.map((request) => ({ item, request })))
    .find((entry) => entry.request.id === requestId) ?? null;
}

export function eligibleReturnItems(order: AccountOrder) {
  return order.items.filter((item) => order.canReturnOrExchange && item.returnableQuantity > 0);
}

export function orderHasMixedShipments(order: AccountOrder) {
  return Boolean(order.shipment && order.items.length > 1 && ["SHIPPED", "DELIVERED", "IN_TRANSIT"].includes(String(order.shipment.status ?? "").toUpperCase()));
}

export function needsRefundAttention(request?: OrderReturnRequest | null) {
  const status = String(request?.refundStatus ?? request?.status ?? "").toUpperCase();
  return status.includes("FAILED") || status.includes("ATTENTION") || status.includes("DELAY");
}

export function evidenceRequired(reason: string) {
  return reason === "DAMAGED_DEFECTIVE" || reason === "WRONG_ITEM";
}
