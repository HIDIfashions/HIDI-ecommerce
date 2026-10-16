import assert from "node:assert/strict";
import test from "node:test";
import { allocateOriginalTenderRefund } from "../apps/api/src/admin/return-refund-policy.js";

test("cash-only return goes entirely back to cash", () => {
  assert.deepEqual(allocateOriginalTenderRefund({
    refundPaise: 50_000,
    orderTotalPaise: 100_000,
    walletAppliedPaise: 0,
    walletAlreadyRefundedPaise: 0,
    cashPaidPaise: 100_000,
    cashAlreadyRefundedPaise: 0,
  }), { walletPaise: 0, cashPaise: 50_000 });
});

test("wallet-only return goes entirely back to wallet", () => {
  assert.deepEqual(allocateOriginalTenderRefund({
    refundPaise: 50_000,
    orderTotalPaise: 100_000,
    walletAppliedPaise: 100_000,
    walletAlreadyRefundedPaise: 0,
    cashPaidPaise: 0,
    cashAlreadyRefundedPaise: 0,
  }), { walletPaise: 50_000, cashPaise: 0 });
});

test("split tender preserves the original ratio for a partial item return", () => {
  assert.deepEqual(allocateOriginalTenderRefund({
    refundPaise: 50_000,
    orderTotalPaise: 100_000,
    walletAppliedPaise: 25_000,
    walletAlreadyRefundedPaise: 0,
    cashPaidPaise: 75_000,
    cashAlreadyRefundedPaise: 0,
  }), { walletPaise: 12_500, cashPaise: 37_500 });
});

test("later returns consume remaining tender and absorb rounding without over-refunding", () => {
  const first = allocateOriginalTenderRefund({
    refundPaise: 33_333,
    orderTotalPaise: 100_000,
    walletAppliedPaise: 33_333,
    walletAlreadyRefundedPaise: 0,
    cashPaidPaise: 66_667,
    cashAlreadyRefundedPaise: 0,
  });
  const second = allocateOriginalTenderRefund({
    refundPaise: 66_667,
    orderTotalPaise: 100_000,
    walletAppliedPaise: 33_333,
    walletAlreadyRefundedPaise: first.walletPaise,
    cashPaidPaise: 66_667,
    cashAlreadyRefundedPaise: first.cashPaise,
  });
  assert.equal(first.walletPaise + second.walletPaise, 33_333);
  assert.equal(first.cashPaise + second.cashPaise, 66_667);
  assert.equal(first.walletPaise + first.cashPaise, 33_333);
  assert.equal(second.walletPaise + second.cashPaise, 66_667);
});

test("refund allocation rejects inconsistent or exhausted tender balances", () => {
  assert.throws(() => allocateOriginalTenderRefund({
    refundPaise: 10_000,
    orderTotalPaise: 100_000,
    walletAppliedPaise: 20_000,
    walletAlreadyRefundedPaise: 0,
    cashPaidPaise: 70_000,
    cashAlreadyRefundedPaise: 0,
  }), /tender total/);

  assert.throws(() => allocateOriginalTenderRefund({
    refundPaise: 20_001,
    orderTotalPaise: 100_000,
    walletAppliedPaise: 20_000,
    walletAlreadyRefundedPaise: 20_000,
    cashPaidPaise: 80_000,
    cashAlreadyRefundedPaise: 60_000,
  }), /enough refundable balance/);
});
