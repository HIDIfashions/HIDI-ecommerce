import { createHash } from "node:crypto";

export const RETENTION_CONSENT_VERSION = "hidi-retention-v1";
export const DAY_MS = 86_400_000;
export const EVENT_RETENTION_DAYS = 30;
export const ABANDONMENT_DELAY_MS = DAY_MS;
export const EPISODE_GAP_MS = 7 * DAY_MS;

export type InterestEvent = {
  productId: string;
  variantId: string | null;
  kind: string;
  episodeKey: string;
  createdAt: Date;
};
export type RetentionProduct = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  variants: { id: string; active: boolean; available: number; pricePaise: number }[];
};
export type OwnedCart = {
  id: string;
  updatedAt: Date;
  expiresAt: Date | null;
  items: { productId: string; variantId: string; quantity: number; createdAt: Date; updatedAt: Date }[];
};
export type RetentionDeliverySnapshot = {
  episodeKey: string;
  category: string;
  status: string;
  sentAt: Date | null;
};
export type RetentionSnapshot = {
  profileId: string;
  enabled: boolean;
  whatsappOptIn: boolean;
  personalizationOptIn: boolean;
  consentVersion: string;
  phoneVerified: boolean;
  now: Date;
  events: InterestEvent[];
  products: RetentionProduct[];
  carts: OwnedCart[];
  purchases: { productId?: string; createdAt: Date }[];
  deliveries: RetentionDeliverySnapshot[];
};
export type RetentionCandidate = {
  kind: "CART" | "BROWSE";
  episodeKey: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productPath: string;
  pricePaise: number;
  lastActivityAt: Date;
  dueAt: Date;
};
export type RetentionDecision = {
  sendingEnabled: false;
  eligibleForFutureSend: boolean;
  reason: string;
  candidate: RetentionCandidate | null;
};

/** A stable 10% experiment holdout, independent of mutable profile details. */
export function isRetentionHoldout(profileId: string): boolean {
  const value = createHash("sha256").update(`hidi-retention-v1:${profileId}`).digest().readUInt32BE(0);
  return value % 100 < 10;
}

/** Proposed HIDI courtesy hours: 09:00 inclusive to 20:00 exclusive in India. */
export function isRetentionQuietTime(now: Date): boolean {
  const local = new Date(now.getTime() + 330 * 60_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return minutes < 9 * 60 || minutes >= 20 * 60;
}

function decision(reason: string, candidate: RetentionCandidate | null = null): RetentionDecision {
  return { sendingEnabled: false, eligibleForFutureSend: reason === "ELIGIBLE_DRY_RUN_ONLY", reason, candidate };
}

function candidateFor(
  snapshot: RetentionSnapshot,
  kind: "CART" | "BROWSE",
  productId: string,
  variantId: string | null,
  episodeKey: string,
  lastActivityAt: Date,
  quantity = 1,
): RetentionCandidate | null {
  const product = snapshot.products.find((item) => item.id === productId && item.active);
  if (!product) return null;
  const variants = product.variants.filter((item) => item.active && item.available >= quantity && (!variantId || item.id === variantId));
  if (!variants.length) return null;
  // This is a fresh price snapshot, never a price supplied by the browser.
  const pricePaise = Math.min(...variants.map((item) => item.pricePaise));
  return {
    kind, episodeKey, productId, variantId, productName: product.name,
    productPath: `/products/${encodeURIComponent(product.slug)}`,
    pricePaise, lastActivityAt, dueAt: new Date(lastActivityAt.getTime() + ABANDONMENT_DELAY_MS),
  };
}

function evaluateCandidate(snapshot: RetentionSnapshot, candidate: RetentionCandidate): RetentionDecision {
  const { now, deliveries } = snapshot;
  if (snapshot.purchases.some((purchase) => purchase.createdAt >= candidate.lastActivityAt)) return decision("PURCHASED_SINCE_ACTIVITY", candidate);
  if (deliveries.some((delivery) => delivery.episodeKey === candidate.episodeKey && ["SENT", "QUEUED", "SENDING"].includes(delivery.status))) {
    return decision("EPISODE_ALREADY_CONTACTED", candidate);
  }
  if (now < candidate.dueAt) return decision("WAITING_24_HOURS", candidate);
  if (now.getTime() - candidate.lastActivityAt.getTime() > 7 * DAY_MS) return decision("ACTIVITY_EXPIRED", candidate);
  const weeklyCount = deliveries.filter((delivery) => delivery.category === "MARKETING" && delivery.status === "SENT" && delivery.sentAt && delivery.sentAt > new Date(now.getTime() - 7 * DAY_MS) && delivery.sentAt <= now).length;
  if (weeklyCount >= 2) return decision("WEEKLY_PROMOTIONAL_CAP", candidate);
  if (isRetentionHoldout(snapshot.profileId)) return decision("EXPERIMENT_HOLDOUT", candidate);
  if (isRetentionQuietTime(now)) return decision("QUIET_HOURS_IST", candidate);
  return decision("ELIGIBLE_DRY_RUN_ONLY", candidate);
}

/** Pure dry-run policy: no transport, reservation, queue, or side effects. */
export function previewRetention(snapshot: RetentionSnapshot): RetentionDecision {
  if (!snapshot.enabled) return decision("FEATURE_DISABLED");
  if (!snapshot.whatsappOptIn) return decision("NO_WHATSAPP_MARKETING_CONSENT");
  if (!snapshot.personalizationOptIn) return decision("NO_PERSONALIZATION_CONSENT");
  if (snapshot.consentVersion !== RETENTION_CONSENT_VERSION) return decision("CONSENT_RECONFIRMATION_REQUIRED");
  if (!snapshot.phoneVerified) return decision("VERIFIED_PHONE_REQUIRED");

  // An owned, non-empty bag takes priority even before its reminder is due.
  // Do not recover anonymous/session-only carts by accepting browser identity claims.
  const carts = snapshot.carts.filter((cart) => cart.items.length && (!cart.expiresAt || cart.expiresAt > snapshot.now)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  if (carts.length) {
    const cart = carts[0];
    const lastActivityAt = new Date(Math.max(cart.updatedAt.getTime(), ...cart.items.map((item) => item.updatedAt.getTime())));
    const firstItemAt = Math.min(...cart.items.map((item) => item.createdAt.getTime()));
    const episodeKey = `cart:${cart.id}:${firstItemAt}`;
    for (const item of cart.items) {
      const candidate = candidateFor(snapshot, "CART", item.productId, item.variantId, episodeKey, lastActivityAt, item.quantity);
      if (candidate) return evaluateCandidate(snapshot, candidate);
    }
    return decision("CART_ITEMS_UNAVAILABLE");
  }

  const sorted = [...snapshot.events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const seen = new Set<string>();
  for (const latest of sorted) {
    if (seen.has(latest.productId)) continue;
    seen.add(latest.productId);
    const episode = sorted.filter((event) => event.productId === latest.productId && event.episodeKey === latest.episodeKey);
    const views = episode.filter((event) => event.kind === "DETAIL_VIEW");
    const repeatedVisits = views.length >= 2 && views[0].createdAt.getTime() - views[views.length - 1].createdAt.getTime() >= 30 * 60_000;
    const selection = episode.find((event) => event.kind === "SIZE_SELECT" && event.variantId);
    if (!repeatedVisits && !selection) continue;
    const candidate = candidateFor(snapshot, "BROWSE", latest.productId, selection?.variantId ?? null, `browse:${latest.episodeKey}`, latest.createdAt);
    if (!candidate) continue;
    return evaluateCandidate(snapshot, candidate);
  }
  return decision("NO_MEANINGFUL_IN_STOCK_INTEREST");
}
