import assert from "node:assert/strict";
import test from "node:test";
import {
  spendablePaise, validOrderAmounts, walletEarnPaise, walletMaturity, walletRewardBasis,
  WALLET_RETURN_WINDOW_DAYS, type MaturityInput,
} from "../apps/api/src/wallet/wallet-policy.js";

const NOW = new Date("2026-09-18T12:00:00Z");
function payable(overrides: Partial<MaturityInput> = {}): MaturityInput {
  return {
    currency: "INR", status: "DELIVERED", createdAt: new Date("2026-09-01T12:00:00Z"),
    totalPaise: 200_000, walletAppliedPaise: 0,
    payments: [{ status: "CAPTURED", amountPaise: 200_000, refunds: [] }],
    shipments: [{ status: "DELIVERED", deliveredAt: new Date("2026-09-11T12:00:00Z") }],
    hold: null, ...overrides,
  };
}

test("exact earning rule uses complete ₹100 after discounts and wallet, no shipping reward", () => {
  const amounts = { subtotalPaise: 200_000, discountPaise: 0, shippingPaise: 10_000, taxPaise: 0, totalPaise: 210_000, walletAppliedPaise: 0 };
  assert.equal(walletRewardBasis(amounts), 200_000);
  assert.equal(walletEarnPaise(walletRewardBasis(amounts)), 4_000);
  assert.equal(walletEarnPaise(9_999), 0);
  assert.equal(walletEarnPaise(10_000), 200);
  assert.equal(walletEarnPaise(19_999), 200);
  assert.equal(walletRewardBasis({ ...amounts, walletAppliedPaise: 40_000 }), 160_000);
  assert.equal(walletRewardBasis({ ...amounts, walletAppliedPaise: 210_000 }), 0);
  assert.equal(walletEarnPaise(0), 0);
  assert.throws(() => walletEarnPaise(10000.1));
  assert.throws(() => walletRewardBasis({ ...amounts, discountPaise: -1 }));
  assert.equal(validOrderAmounts({ ...amounts, totalPaise: 1 }), false);
});

test("all available rewards can pay the full order; reserved balance and debt are not spendable", () => {
  assert.equal(spendablePaise(100_000, 0), 100_000);
  assert.equal(spendablePaise(100_000, 100_000), 0);
  assert.equal(spendablePaise(100_000, 20_000), 80_000);
  assert.equal(spendablePaise(-4_000, 0), 0);
  assert.equal(spendablePaise(1_000, 2_000), 0);
});

test("rewards mature exactly seven elapsed days after actual delivery, never before", () => {
  assert.equal(WALLET_RETURN_WINDOW_DAYS, 7);
  assert.equal(walletMaturity(payable(), 7, new Date(NOW.getTime() - 1)).status, "PENDING");
  const exact = walletMaturity(payable(), 7, NOW);
  assert.equal(exact.status, "ELIGIBLE");
  assert.equal(exact.eligibleAt?.toISOString(), NOW.toISOString());
  assert.equal(walletMaturity(payable(), 0, NOW).reason, "UNSUPPORTED_POLICY");
});

test("split, missing, future and premature delivery timestamps cannot mature", () => {
  assert.equal(walletMaturity(payable({ shipments: [] }), 7, NOW).status, "PENDING");
  assert.equal(walletMaturity(payable({ shipments: [payable().shipments[0], payable().shipments[0]] }), 7, NOW).status, "HELD");
  for (const deliveredAt of [null, new Date("invalid"), new Date("2026-09-19"), new Date("2026-08-31")]) {
    assert.equal(walletMaturity(payable({ shipments: [{ status: "DELIVERED", deliveredAt }] }), 7, NOW).reason, "INVALID_DELIVERY_DATE");
  }
  assert.equal(walletMaturity(payable({ status: "SHIPPED" }), 7, NOW).status, "PENDING");
});

test("cash capture must equal external payable and wallet tender must be consumed", () => {
  const mixed = payable({ walletAppliedPaise: 4_000, payments: [{ status: "CAPTURED", amountPaise: 196_000 }], hold: { status: "CONSUMED", amountPaise: 4_000 } });
  assert.equal(walletMaturity(mixed, 7, NOW).status, "ELIGIBLE");
  assert.equal(walletMaturity({ ...mixed, hold: null }, 7, NOW).status, "HELD");
  assert.equal(walletMaturity({ ...mixed, hold: { status: "ACTIVE", amountPaise: 4_000 } }, 7, NOW).status, "HELD");
  assert.equal(walletMaturity({ ...mixed, payments: [{ status: "CAPTURED", amountPaise: 200_000 }] }, 7, NOW).status, "PENDING");
  const onlyWallet = payable({ walletAppliedPaise: 200_000, payments: [{ status: "CAPTURED", amountPaise: 0 }], hold: { status: "CONSUMED", amountPaise: 200_000 } });
  assert.equal(walletMaturity(onlyWallet, 7, NOW).status, "ELIGIBLE");
});

test("any recorded refund, return or payment review reverses rewards; refund-in-progress holds", () => {
  for (const status of ["RETURN_REQUESTED", "RETURNED", "REFUNDED", "CANCELLED", "PAYMENT_REVIEW"]) {
    assert.equal(walletMaturity(payable({ status }), 7, NOW).status, "REVERSE", status);
  }
  for (const status of ["REFUNDED", "PARTIALLY_REFUNDED"]) {
    assert.equal(walletMaturity(payable({ payments: [{ status, amountPaise: 200_000 }] }), 7, NOW).status, "REVERSE");
  }
  assert.equal(walletMaturity(payable({ payments: [{ status: "CAPTURED", amountPaise: 200_000, refunds: [{ status: "PROCESSED", amountPaise: 1 }] }] }), 7, NOW).status, "REVERSE");
  assert.equal(walletMaturity(payable({ payments: [{ status: "CAPTURED", amountPaise: 200_000, refunds: [{ status: "PENDING", amountPaise: 1 }] }] }), 7, NOW).status, "HELD");
  assert.equal(walletMaturity(payable({ shipments: [{ status: "RTO", deliveredAt: null }] }), 7, NOW).status, "REVERSE");
});
