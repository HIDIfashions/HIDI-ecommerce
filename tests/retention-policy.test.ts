import assert from "node:assert/strict";
import test from "node:test";
import { DAY_MS, isRetentionHoldout, isRetentionQuietTime, previewRetention, RETENTION_CONSENT_VERSION, type RetentionSnapshot } from "../apps/api/src/retention/retention-policy.js";

const now = new Date("2026-09-20T06:00:00Z"); // 11:30 IST
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const profileId = Array.from({ length: 100 }, (_, i) => `customer-${i}`).find((id) => !isRetentionHoldout(id))!;
const holdoutId = Array.from({ length: 100 }, (_, i) => `customer-${i}`).find(isRetentionHoldout)!;

function snapshot(overrides: Partial<RetentionSnapshot> = {}): RetentionSnapshot {
  return {
    profileId, enabled: true, whatsappOptIn: true, personalizationOptIn: true,
    consentVersion: RETENTION_CONSENT_VERSION, phoneVerified: true, now,
    events: [
      { productId: "p1", variantId: null, kind: "DETAIL_VIEW", episodeKey: "episode-1", createdAt: ago(26) },
      { productId: "p1", variantId: null, kind: "DETAIL_VIEW", episodeKey: "episode-1", createdAt: ago(25) },
    ],
    products: [{ id: "p1", slug: "olive-kurta", name: "Olive kurta", active: true, variants: [
      { id: "v1", active: true, available: 3, pricePaise: 149900 },
      { id: "v2", active: true, available: 0, pricePaise: 139900 },
    ] }],
    carts: [], purchases: [], deliveries: [], ...overrides,
  };
}

test("qualified repeat interest previews current in-stock price without sending", () => {
  const result = previewRetention(snapshot());
  assert.equal(result.reason, "ELIGIBLE_DRY_RUN_ONLY");
  assert.equal(result.sendingEnabled, false);
  assert.equal(result.candidate?.pricePaise, 149900);
  assert.equal(result.candidate?.episodeKey, "browse:episode-1");
});

test("feature is fail-closed and independent marketing/personalization consents are required", () => {
  assert.equal(previewRetention(snapshot({ enabled: false })).reason, "FEATURE_DISABLED");
  assert.equal(previewRetention(snapshot({ whatsappOptIn: false })).reason, "NO_WHATSAPP_MARKETING_CONSENT");
  assert.equal(previewRetention(snapshot({ personalizationOptIn: false })).reason, "NO_PERSONALIZATION_CONSENT");
  assert.equal(previewRetention(snapshot({ consentVersion: "old" })).reason, "CONSENT_RECONFIRMATION_REQUIRED");
  assert.equal(previewRetention(snapshot({ phoneVerified: false })).reason, "VERIFIED_PHONE_REQUIRED");
});

test("one ordinary detail view and rapid refreshes are not meaningful interest", () => {
  const one = snapshot().events.slice(0, 1);
  assert.equal(previewRetention(snapshot({ events: one })).reason, "NO_MEANINGFUL_IN_STOCK_INTEREST");
  assert.equal(previewRetention(snapshot({ events: [...one, { ...one[0], createdAt: new Date(one[0].createdAt.getTime() + 60_000) }] })).reason, "NO_MEANINGFUL_IN_STOCK_INTEREST");
});

test("selected size qualifies alone but only its own current stock is accepted", () => {
  const event = { ...snapshot().events[0], kind: "SIZE_SELECT", variantId: "v1" };
  assert.equal(previewRetention(snapshot({ events: [event] })).reason, "ELIGIBLE_DRY_RUN_ONLY");
  assert.equal(previewRetention(snapshot({ events: [{ ...event, variantId: "v2" }] })).reason, "NO_MEANINGFUL_IN_STOCK_INTEREST");
});

test("latest interaction restarts the 24-hour inactivity delay", () => {
  assert.equal(previewRetention(snapshot({ events: [...snapshot().events, { ...snapshot().events[0], createdAt: ago(1) }] })).reason, "WAITING_24_HOURS");
});

test("any completed purchase after activity suppresses queued recovery", () => {
  assert.equal(previewRetention(snapshot({ purchases: [{ productId: "other", createdAt: ago(2) }] })).reason, "PURCHASED_SINCE_ACTIVITY");
});

test("removed, inactive and sold-out products cannot be promoted", () => {
  assert.equal(previewRetention(snapshot({ products: [] })).reason, "NO_MEANINGFUL_IN_STOCK_INTEREST");
  const product = snapshot().products[0];
  assert.equal(previewRetention(snapshot({ products: [{ ...product, active: false }] })).reason, "NO_MEANINGFUL_IN_STOCK_INTEREST");
  assert.equal(previewRetention(snapshot({ products: [{ ...product, variants: product.variants.map((v) => ({ ...v, available: 0 })) }] })).reason, "NO_MEANINGFUL_IN_STOCK_INTEREST");
});

test("same abandonment is not contacted twice, including pending deliveries", () => {
  for (const status of ["SENT", "QUEUED", "SENDING"]) {
    assert.equal(previewRetention(snapshot({ deliveries: [{ episodeKey: "browse:episode-1", category: "MARKETING", status, sentAt: ago(5) }] })).reason, "EPISODE_ALREADY_CONTACTED");
  }
});

test("two marketing sends across campaigns block a third in rolling seven days", () => {
  const deliveries = [1, 2].map((value) => ({ episodeKey: `other-${value}`, category: "MARKETING", status: "SENT", sentAt: ago(value * 24) }));
  assert.equal(previewRetention(snapshot({ deliveries })).reason, "WEEKLY_PROMOTIONAL_CAP");
  assert.equal(previewRetention(snapshot({ deliveries: deliveries.map((d) => ({ ...d, category: "TRANSACTIONAL" })) })).reason, "ELIGIBLE_DRY_RUN_ONLY");
  assert.equal(previewRetention(snapshot({ deliveries: deliveries.map((d) => ({ ...d, sentAt: new Date(now.getTime() - 8 * DAY_MS) })) })).reason, "ELIGIBLE_DRY_RUN_ONLY");
});

test("owned cart takes priority over browsing even if cart is not yet due", () => {
  const carts = [{ id: "cart1", updatedAt: ago(1), expiresAt: null, items: [{ productId: "p1", variantId: "v1", quantity: 1, createdAt: ago(2), updatedAt: ago(1) }] }];
  const result = previewRetention(snapshot({ carts }));
  assert.equal(result.candidate?.kind, "CART");
  assert.equal(result.reason, "WAITING_24_HOURS");
});

test("cart quantity stock and expiration are checked live", () => {
  const cart = { id: "cart1", updatedAt: ago(25), expiresAt: null, items: [{ productId: "p1", variantId: "v1", quantity: 4, createdAt: ago(26), updatedAt: ago(25) }] };
  assert.equal(previewRetention(snapshot({ carts: [cart] })).reason, "CART_ITEMS_UNAVAILABLE");
  assert.equal(previewRetention(snapshot({ carts: [{ ...cart, expiresAt: ago(1) }] })).candidate?.kind, "BROWSE");
});

test("courtesy hours use India time with exact boundary handling", () => {
  assert.equal(isRetentionQuietTime(new Date("2026-09-20T03:29:59Z")), true);
  assert.equal(isRetentionQuietTime(new Date("2026-09-20T03:30:00Z")), false);
  assert.equal(isRetentionQuietTime(new Date("2026-09-20T14:29:59Z")), false);
  assert.equal(isRetentionQuietTime(new Date("2026-09-20T14:30:00Z")), true);
  assert.equal(previewRetention(snapshot({ now: new Date("2026-09-20T15:00:00Z") })).reason, "QUIET_HOURS_IST");
});

test("holdout is stable and cannot accidentally send", () => {
  assert.ok(holdoutId);
  assert.equal(isRetentionHoldout(holdoutId), true);
  const result = previewRetention(snapshot({ profileId: holdoutId }));
  assert.equal(result.reason, "EXPERIMENT_HOLDOUT");
  assert.equal(result.sendingEnabled, false);
});

test("interest older than seven days is not recovered", () => {
  const events = snapshot().events.map((event) => ({ ...event, createdAt: new Date(event.createdAt.getTime() - 8 * DAY_MS) }));
  assert.equal(previewRetention(snapshot({ events })).reason, "ACTIVITY_EXPIRED");
});

test("events from separate abandonment episodes are not combined", () => {
  const events = snapshot().events.map((event, index) => ({ ...event, episodeKey: `separate-${index}` }));
  assert.equal(previewRetention(snapshot({ events })).reason, "NO_MEANINGFUL_IN_STOCK_INTEREST");
});
