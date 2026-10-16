import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateRewardPaise,
  parseReturnWindowDays,
  projectRewardPreview,
  summarizeRewardPreview,
  type RewardPreviewOrder,
} from "../apps/api/src/rewards/reward-preview.js";

const NOW = new Date("2026-09-18T12:00:00.000Z");
const deliveredAt = new Date("2026-09-11T12:00:00.000Z");
function order(overrides: Partial<RewardPreviewOrder> = {}): RewardPreviewOrder {
  return {
    orderNumber: "HIDI-TEST-1", status: "DELIVERED", currency: "INR",
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    subtotalPaise: 200_000, discountPaise: 0, shippingPaise: 10_000,
    taxPaise: 0, totalPaise: 210_000,
    payments: [{ status: "CAPTURED", amountPaise: 210_000 }],
    shipments: [{ status: "DELIVERED", deliveredAt }],
    ...overrides,
  };
}

test("₹2,000 earns an illustrative ₹40; only complete ₹100 blocks count", () => {
  assert.equal(estimateRewardPaise(200_000), 4_000);
  assert.equal(estimateRewardPaise(9_999), 0);
  assert.equal(estimateRewardPaise(10_000), 200);
  assert.equal(estimateRewardPaise(19_999), 200);
  assert.equal(estimateRewardPaise(20_000), 400);
  for (const value of [-1, Number.NaN, Infinity, 10000.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(estimateRewardPaise(value), 0);
  }
});

test("return-window config has no permissive or invented default", () => {
  for (const value of [undefined, "", "0", "-1", "1.5", "365.0", "366", "NaN", " 7 ", "007"]) {
    assert.equal(parseReturnWindowDays(value), null, String(value));
  }
  assert.equal(parseReturnWindowDays("7"), 7);
  assert.equal(parseReturnWindowDays("365"), 365);
  assert.equal(projectRewardPreview(order(), null, NOW).reason, "RETURN_WINDOW_NOT_CONFIGURED");
});

test("exact return-window boundary matures estimates, never a wallet balance", () => {
  const before = projectRewardPreview(order(), 7, new Date(NOW.getTime() - 1));
  assert.equal(before.status, "PENDING_ESTIMATE");
  assert.equal(before.reason, "RETURN_WINDOW_OPEN");
  assert.equal(before.eligibleAt, NOW.toISOString());
  const exact = projectRewardPreview(order(), 7, NOW);
  assert.equal(exact.status, "ELIGIBLE_ESTIMATE");
  assert.equal(exact.estimatedRewardPaise, 4_000);
  assert.equal(exact.proposedEligibleMerchandisePaise, 200_000);
  assert.equal("balancePaise" in exact, false);
});

test("illustrative basis subtracts discounts and excludes shipping and separate tax", () => {
  const result = projectRewardPreview(order({
    subtotalPaise: 205_099, discountPaise: 5_100, shippingPaise: 7_500, taxPaise: 1_000,
    totalPaise: 208_499, payments: [{ status: "CAPTURED", amountPaise: 208_499 }],
  }), 7, NOW);
  assert.equal(result.proposedEligibleMerchandisePaise, 199_999);
  assert.equal(result.estimatedRewardPaise, 3_800);
});

test("refunds, partial refunds and return states hold all rewards", () => {
  for (const status of ["RETURN_REQUESTED", "RETURNED", "REFUNDED", "CANCELLED", "PAYMENT_REVIEW", "PENDING_PAYMENT", "UNKNOWN"]) {
    const result = projectRewardPreview(order({ status }), 7, NOW);
    assert.equal(result.status, "HELD", status);
    assert.equal(result.estimatedRewardPaise, 0);
  }
  for (const status of ["REFUNDED", "PARTIALLY_REFUNDED"]) {
    const result = projectRewardPreview(order({ payments: [
      { status: "CAPTURED", amountPaise: 210_000 }, { status, amountPaise: 1 },
    ] }), 7, NOW);
    assert.equal(result.reason, "REFUND_ON_HOLD");
    assert.equal(result.estimatedRewardPaise, 0);
  }
});

test("only exact fully captured payments can produce estimates", () => {
  for (const payments of [[], [{ status: "AUTHORIZED", amountPaise: 210_000 }],
    [{ status: "CAPTURED", amountPaise: 209_999 }], [{ status: "CAPTURED", amountPaise: 210_001 }]]) {
    assert.equal(projectRewardPreview(order({ payments }), 7, NOW).reason, "PAYMENT_NOT_FULLY_CAPTURED");
  }
  const split = projectRewardPreview(order({ payments: [
    { status: "CAPTURED", amountPaise: 110_000 }, { status: "CAPTURED", amountPaise: 100_000 },
    { status: "FAILED", amountPaise: 210_000 },
  ] }), 7, NOW);
  assert.equal(split.status, "ELIGIBLE_ESTIMATE");
});

test("missing, invalid and future delivery dates cannot mature rewards", () => {
  for (const date of [null, "invalid", "2026-09-19T12:00:00Z", "2026-08-31T12:00:00Z"]) {
    const result = projectRewardPreview(order({ shipments: [{ status: "DELIVERED", deliveredAt: date }] }), 7, NOW);
    assert.equal(result.reason, "INVALID_DELIVERY_DATE", String(date));
    assert.equal(result.eligibleAt, null);
  }
  const absent = projectRewardPreview(order({ shipments: [] }), 7, NOW);
  assert.equal(absent.status, "PENDING_ESTIMATE");
  assert.equal(absent.eligibleAt, null);
});

test("all split shipments and order must be delivered; latest delivery controls date", () => {
  const split = [{ status: "DELIVERED", deliveredAt }, { status: "DELIVERED", deliveredAt: "2026-09-12T12:00:00Z" }];
  const result = projectRewardPreview(order({ shipments: split }), 7, NOW);
  assert.equal(result.status, "PENDING_ESTIMATE");
  assert.equal(result.eligibleAt, "2026-09-19T12:00:00.000Z");
  assert.equal(projectRewardPreview(order({ status: "SHIPPED" }), 7, NOW).eligibleAt, null);
  assert.equal(projectRewardPreview(order({ shipments: [split[0], { status: "SHIPPED", deliveredAt: null }] }), 7, NOW).eligibleAt, null);
  for (const status of ["RTO", "CANCELLED", "UNKNOWN"]) {
    assert.equal(projectRewardPreview(order({ shipments: [{ status, deliveredAt: null }] }), 7, NOW).reason, "SHIPMENT_ON_HOLD");
  }
});

test("unsafe amounts, non-INR, future order dates and bounded relation reads fail closed", () => {
  for (const overrides of [
    { subtotalPaise: 200000.5 }, { discountPaise: -1 }, { discountPaise: 210_000 },
    { totalPaise: 1 }, { shippingPaise: Number.NaN }, { taxPaise: Infinity },
  ]) assert.equal(projectRewardPreview(order(overrides), 7, NOW).reason, "INVALID_ORDER_AMOUNTS");
  assert.equal(projectRewardPreview(order({ currency: "USD" }), 7, NOW).reason, "UNSUPPORTED_CURRENCY");
  assert.equal(projectRewardPreview(order({ createdAt: "2026-09-20" }), 7, NOW).reason, "INVALID_ORDER_DATE");
  assert.equal(projectRewardPreview(order({ relationsComplete: false }), 7, NOW).reason, "RELATION_LIMIT_EXCEEDED");
  assert.equal(projectRewardPreview(order({ payments: [{ status: "CAPTURED", amountPaise: 210000.1 }] }), 7, NOW).reason, "INVALID_PAYMENT");
});

test("summary segregates held, pending and eligible estimates", () => {
  const summary = summarizeRewardPreview([
    projectRewardPreview(order(), 7, NOW),
    projectRewardPreview(order({ status: "SHIPPED" }), 7, NOW),
    projectRewardPreview(order({ status: "RETURN_REQUESTED" }), 7, NOW),
  ]);
  assert.deepEqual(summary, { pendingEstimatedPaise: 4_000, eligibleEstimatedPaise: 4_000, heldOrderCount: 1 });
});
