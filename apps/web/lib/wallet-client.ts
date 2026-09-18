import { getAccessToken, getStoredSession } from "@/lib/supabase-auth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";
export const walletEnabled = process.env.NEXT_PUBLIC_WALLET_ENABLED === "true";
export const WALLET_UPDATED_EVENT = "hidi-wallet-updated";

export type WalletSummary = {
  enabled: boolean;
  currency: "INR";
  balancePaise: number;
  reservedPaise: number;
  availablePaise: number;
  debtPaise: number;
  pendingPaise: number;
  heldPaise: number;
  history: Array<{ id: string; kind: string; deltaPaise: number; createdAt: string; orderNumber?: string | null }>;
  historyTruncated: boolean;
  policy: { pointsPerComplete100Rupees: number; paisePerPoint: number; returnWindowDays: number; redemptionCapPaise: null; expiry: null; basis: string };
};

export function walletAccountId(): string | null {
  try { return getStoredSession()?.user?.id ?? null; } catch { return null; }
}

export function formatWalletPaise(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
}

export function walletAmountPaise(input: string, availablePaise: number, totalPaise: number): number | null {
  const text = input.trim();
  if (!/^\d+(?:\.\d{0,2})?$/.test(text)) return null;
  const [rupees, decimals = ""] = text.split(".");
  const amount = Number(rupees) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > availablePaise || amount > totalPaise) return null;
  return amount;
}

export function parseWalletSummary(data: unknown): WalletSummary {
  const value = data as WalletSummary | null;
  const nonnegative = [value?.reservedPaise, value?.availablePaise, value?.debtPaise, value?.pendingPaise, value?.heldPaise];
  if (!value || typeof value.enabled !== "boolean" || value.currency !== "INR" || !Number.isSafeInteger(value.balancePaise) ||
      nonnegative.some((amount) => !Number.isSafeInteger(amount) || (amount as number) < 0) ||
      !Array.isArray(value.history) || typeof value.historyTruncated !== "boolean" ||
      value.history.some((item) => !item || typeof item.id !== "string" || typeof item.kind !== "string" ||
        !Number.isSafeInteger(item.deltaPaise) || typeof item.createdAt !== "string" || Number.isNaN(Date.parse(item.createdAt))) ||
      value.policy?.pointsPerComplete100Rupees !== 2 || value.policy.paisePerPoint !== 100 ||
      value.policy.returnWindowDays !== 7 || value.policy.redemptionCapPaise !== null || value.policy.expiry !== null) {
    throw new Error("Your wallet is temporarily unavailable. Please try again.");
  }
  return value;
}

export async function getWalletSummary(expectedUserId: string, signal: AbortSignal): Promise<WalletSummary | null> {
  const current = () => walletEnabled && !signal.aborted && walletAccountId() === expectedUserId;
  if (!current()) throw new Error("Please sign in again to view your wallet.");
  const token = await getAccessToken();
  if (!current() || !token) throw new Error("Your sign-in changed. Please reload your wallet.");
  const response = await fetch(`${API}/wallet`, { cache: "no-store", signal, headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => null);
  if (!current()) throw new Error("Your sign-in changed. Please reload your wallet.");
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(typeof data?.message === "string" ? data.message : "We couldn’t load your wallet. Please try again.");
  return parseWalletSummary(data);
}

export type PreparedCheckout = {
  provider: "WALLET" | "RAZORPAY";
  captured: boolean;
  orderNumber: string;
  status: string;
  amountPaise: number;
  totalPaise: number;
  subtotalPaise: number;
  walletAppliedPaise: number;
  currency: string;
  razorpayKeyId?: string;
  providerOrderId?: string;
};

export function parsePreparedCheckout(data: unknown): PreparedCheckout {
  const source = data as Partial<PreparedCheckout> | null;
  // Existing cash-only API deployments did not include wallet/provider fields.
  const value = source && {
    ...source,
    provider: source.provider ?? "RAZORPAY",
    captured: source.captured ?? false,
    walletAppliedPaise: source.walletAppliedPaise ?? 0,
    totalPaise: source.totalPaise ?? source.amountPaise,
    subtotalPaise: source.subtotalPaise ?? source.totalPaise ?? source.amountPaise,
    currency: source.currency ?? "INR",
    status: source.status ?? "PENDING_PAYMENT",
  };
  if (!value || typeof value.orderNumber !== "string" || !value.orderNumber || typeof value.captured !== "boolean" || typeof value.status !== "string" ||
      [value.amountPaise, value.totalPaise, value.subtotalPaise, value.walletAppliedPaise].some((amount) => !Number.isSafeInteger(amount) || (amount as number) < 0) ||
      value.amountPaise! + value.walletAppliedPaise !== value.totalPaise || value.currency !== "INR" ||
      (value.provider !== "WALLET" && value.provider !== "RAZORPAY") ||
      (value.provider === "WALLET" && (value.captured !== true || value.amountPaise !== 0 || value.walletAppliedPaise !== value.totalPaise)) ||
      (value.provider === "RAZORPAY" && (value.amountPaise! <= 0 || typeof value.razorpayKeyId !== "string" || typeof value.providerOrderId !== "string"))) {
    throw new Error("We couldn’t confirm the payment details. Please retry this checkout before starting a new order.");
  }
  return value as PreparedCheckout;
}

export function checkoutFingerprint(input: { userId: string | null; sessionId: string; cartSignature: string; walletPaise: number; details: Record<string, string> }) {
  return JSON.stringify({ ...input, details: Object.fromEntries(Object.entries(input.details).sort(([a], [b]) => a.localeCompare(b))) });
}
