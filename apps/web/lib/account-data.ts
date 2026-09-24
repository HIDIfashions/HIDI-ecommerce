import { BROWSER_API_URL } from "@/lib/browser-api";
import { getAccessToken } from "@/lib/supabase-auth";

export type AccountCustomer = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type AccountReturnRequest = {
  id: string;
  type: string;
  reason: string;
  quantity: number;
  refundDestination?: string | null;
  requestedSize?: string | null;
  refundPaise: number;
  status: string;
  pickupProvider?: string | null;
  pickupAwb?: string | null;
  pickupTrackingUrl?: string | null;
  refundWalletPaise?: number;
  refundCashPaise?: number;
  refundStatus?: string | null;
  replacementProvider?: string | null;
  replacementAwb?: string | null;
  replacementTrackingUrl?: string | null;
  rejectionReason?: string | null;
  completedAt?: string | null;
  createdAt: string;
};

export type AccountOrderItem = {
  id: string;
  productName: string;
  slug: string;
  image?: string | null;
  size: string;
  color: string;
  quantity: number;
  returnableQuantity: number;
  unitPricePaise?: number;
  discountPaise?: number;
  totalPaise: number;
  exchangeSizes: string[];
  returnRequests: AccountReturnRequest[];
};

export type AccountOrder = {
  orderNumber: string;
  status: string;
  afterSales?: { id: string; type: string; status: string; createdAt: string } | null;
  createdAt: string;
  deliveredAt?: string | null;
  returnWindowEndsAt?: string | null;
  canReturnOrExchange?: boolean;
  subtotalPaise?: number;
  discountPaise?: number;
  shippingPaise?: number;
  taxPaise?: number;
  totalPaise: number;
  walletAppliedPaise?: number;
  cashPayablePaise?: number;
  paymentStatus?: string | null;
  shippingAddress?: Record<string, unknown> | null;
  shipment?: {
    provider?: string | null;
    awb?: string | null;
    trackingUrl?: string | null;
    status?: string | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
  } | null;
  itemCount: number;
  items: AccountOrderItem[];
};

export type AccountOrdersPayload = {
  customer: AccountCustomer;
  orders: AccountOrder[];
};

async function authenticatedJson(path: string) {
  const token = await getAccessToken();
  if (!token) throw new Error("Please sign in to view your HIDI account.");
  const response = await fetch(`${BROWSER_API_URL}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? "Unable to load your HIDI account.");
  return payload;
}

export async function fetchAccountOrders(): Promise<AccountOrdersPayload> {
  return authenticatedJson("/account/orders");
}

export async function fetchAccountOrder(orderNumber: string): Promise<{ customer: AccountCustomer; order: AccountOrder }> {
  return authenticatedJson(`/account/orders/${encodeURIComponent(orderNumber)}`);
}

export function accountTitleCase(value?: string | null) {
  if (!value) return "Pending";
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
