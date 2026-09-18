import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { WalletAdminService } from "../apps/api/src/wallet/wallet-admin.service.js";
import { WalletController } from "../apps/api/src/wallet/wallet.controller.js";

const details = { reason: "Customer return inspected", reference: "SUPPORT-123" };

function setEnvironment(t: TestContext, key: string, value: string | undefined) {
  const prior = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  t.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
}

function controllerFixture() {
  const calls: unknown[][] = [];
  const wallet = { runMaturationBatch: async (...args: unknown[]) => { calls.push(["batch", ...args]); return { processed: 0 }; } };
  const admin = {
    holdReturn: async (...args: unknown[]) => { calls.push(["hold", ...args]); return { refundIssued: false }; },
    refundWalletOnlyOrder: async (...args: unknown[]) => { calls.push(["refund", ...args]); return { status: "REFUNDED" }; },
  };
  return { calls, controller: new WalletController(wallet as never, {} as never, admin as never) };
}

test("all wallet admin actions reject missing, wrong and non-exact keys before any service call", async (t) => {
  const secret = "private-admin-key-1234";
  setEnvironment(t, "ADMIN_API_KEY", secret);
  const { calls, controller } = controllerFixture();
  const methods = [
    (key: string | undefined) => controller.reconcile(key, { after: "cursor_1", limit: 2 }),
    (key: string | undefined) => controller.returnHold(key, "ORDER-1", details),
    (key: string | undefined) => controller.refundWalletOnly(key, "ORDER-1", details),
  ];
  for (const method of methods) {
    for (const key of [undefined, "", "wrong", "private-admin-key-1235", " " + secret, secret + " ", secret.toUpperCase()]) {
      await assert.rejects(method(key), (error: any) => {
        assert.equal(error.name, "UnauthorizedException");
        assert.equal(error.getStatus(), 401);
        assert.equal(error.message, "Admin access required");
        assert.equal(JSON.stringify(error).includes(secret), false);
        return true;
      });
    }
  }
  assert.deepEqual(calls, []);
});

test("an unset or empty configured admin key fails closed even for a supplied key", async (t) => {
  setEnvironment(t, "ADMIN_API_KEY", undefined);
  const { calls, controller } = controllerFixture();
  for (const configured of [undefined, ""]) {
    if (configured === undefined) delete process.env.ADMIN_API_KEY; else process.env.ADMIN_API_KEY = configured;
    await assert.rejects(controller.reconcile("private-admin-key-1234"), /Admin access required/);
    await assert.rejects(controller.returnHold(undefined, "ORDER-1", details), /Admin access required/);
    await assert.rejects(controller.refundWalletOnly("", "ORDER-1", details), /Admin access required/);
  }
  assert.deepEqual(calls, []);
});

test("exact admin key delegates only intended arguments and is never returned or logged", async (t) => {
  const secret = "private-admin-key-1234";
  setEnvironment(t, "ADMIN_API_KEY", secret);
  const logs = (["log", "info", "warn", "error", "debug"] as const).map((method) => t.mock.method(console, method, () => undefined));
  const { calls, controller } = controllerFixture();
  const results = [
    await controller.reconcile(secret, { after: "cursor_1", limit: 2 }),
    await controller.returnHold(secret, "ORDER-1", details),
    await controller.refundWalletOnly(secret, "ORDER-1", details),
  ];
  await assert.rejects(controller.reconcile("wrong-secret"), /Admin access required/);
  assert.deepEqual(calls, [["batch", "cursor_1", 2], ["hold", "ORDER-1", details], ["refund", "ORDER-1", details]]);
  assert.equal(JSON.stringify({ results, calls }).includes(secret), false);
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

type FakeState = {
  order: any;
  refunds: any[];
  balancePaise: number;
  reward: { status: string; amountPaise: number };
  ledger: { kind: string; deltaPaise: number }[];
};

/** A copy-on-transaction fake: rejected callbacks discard EVERY staged write. */
function adminFixture(options: { order?: Record<string, unknown>; failAt?: string; refuseRestore?: boolean; missing?: boolean } = {}) {
  let state: FakeState = {
    order: {
      id: "order-1", orderNumber: "ORDER-1", userId: "user-1", currency: "INR", status: "DELIVERED",
      totalPaise: 100_000, walletAppliedPaise: 100_000, notes: "Original note",
      payments: [{ id: "payment-1", provider: "WALLET", amountPaise: 0, status: "CAPTURED" }],
      walletHold: { id: "hold-1", walletId: "wallet-1", amountPaise: 100_000, status: "CONSUMED" },
      ...options.order,
    },
    refunds: [], balancePaise: 20_000, reward: { status: "PENDING", amountPaise: 0 }, ledger: [],
  };
  const writeAttempts: string[] = [];
  const transactions: unknown[] = [];
  let commits = 0;
  const drafts = new WeakMap<object, FakeState>();
  function write(operation: string) {
    writeAttempts.push(operation);
    if (operation === options.failAt) throw new Error("simulated atomic operation failure");
  }
  const db = {
    $transaction: async (callback: (tx: any) => Promise<unknown>, config: unknown) => {
      transactions.push(config);
      const draft = structuredClone(state);
      const tx = {
        $queryRaw: async () => options.missing ? [] : [{ id: draft.order.id }],
        order: {
          findUniqueOrThrow: async () => structuredClone(draft.order),
          update: async ({ data }: any) => { write("order.update"); Object.assign(draft.order, data); return structuredClone(draft.order); },
        },
        paymentRefund: {
          findUnique: async ({ where }: any) => draft.refunds.find((entry) => entry.providerRefundId === where.providerRefundId) ?? null,
          create: async ({ data }: any) => { write("refund.create"); draft.refunds.push({ id: "refund-1", ...data }); return draft.refunds.at(-1); },
        },
        payment: {
          update: async ({ where, data }: any) => {
            write("payment.update");
            const payment = draft.order.payments.find((entry: any) => entry.id === where.id);
            Object.assign(payment, data);
            return structuredClone(payment);
          },
        },
      };
      drafts.set(tx, draft);
      const result = await callback(tx);
      state = draft;
      commits += 1;
      return result;
    },
  };
  const wallet = {
    reverseEarned: async (tx: object, orderId: string, _reason: string) => {
      const draft = drafts.get(tx)!;
      assert.equal(orderId, draft.order.id);
      write("wallet.reverseEarned");
      if (draft.reward.status === "REVERSED") return false;
      if (draft.reward.status === "CREDITED") {
        draft.balancePaise -= draft.reward.amountPaise;
        draft.ledger.push({ kind: "REVERSE_EARN", deltaPaise: -draft.reward.amountPaise });
      }
      draft.reward.status = "REVERSED";
      return true;
    },
    restoreRedeemed: async (tx: object, orderId: string) => {
      const draft = drafts.get(tx)!;
      assert.equal(orderId, draft.order.id);
      write("wallet.restoreRedeemed");
      // Preserve the real WalletService contract: refund evidence must already
      // be staged inside this SAME transaction before credit can be restored.
      if (options.refuseRestore || draft.order.status !== "REFUNDED" || draft.order.walletHold.status !== "CONSUMED") return false;
      assert.equal(draft.order.payments[0].status, "REFUNDED");
      assert.equal(draft.refunds.length, 1);
      draft.balancePaise += draft.order.walletAppliedPaise;
      draft.ledger.push({ kind: "REFUND_REDEEM", deltaPaise: draft.order.walletAppliedPaise });
      draft.order.walletHold.status = "REFUNDED";
      return true;
    },
  };
  return {
    service: new WalletAdminService(db as never, wallet as never), writeAttempts, transactions,
    snapshot: () => structuredClone(state), seed: (change: (draft: FakeState) => void) => change(state), commits: () => commits,
  };
}

test("wallet support actions require valid reason/reference and reject extra fields before any transaction", async () => {
  const bodies: unknown[] = [undefined, null, [], "invalid", {}, { reason: "short", reference: "ABC" },
    { reason: "        ", reference: "ABC" }, { reason: "x".repeat(501), reference: "ABC" },
    { reason: details.reason, reference: "AB" }, { reason: details.reason, reference: "   " },
    { reason: details.reason, reference: "x".repeat(101) }, { ...details, amountPaise: 999_999 },
    { ...details, userId: "someone-else" }, { ...details, reason: 123 }, { ...details, reference: {} }];
  for (const body of bodies) {
    const fixture = adminFixture();
    await assert.rejects(fixture.service.holdReturn("ORDER-1", body), { name: "BadRequestException" });
    await assert.rejects(fixture.service.refundWalletOnlyOrder("ORDER-1", body), { name: "BadRequestException" });
    assert.deepEqual(fixture.writeAttempts, []);
    assert.deepEqual(fixture.transactions, []);
  }
});

test("wallet support actions reject unknown orders without writing", async () => {
  const fixture = adminFixture({ missing: true });
  await assert.rejects(fixture.service.holdReturn("ORDER-UNKNOWN", details), { name: "NotFoundException" });
  await assert.rejects(fixture.service.refundWalletOnlyOrder("ORDER-UNKNOWN", details), { name: "NotFoundException" });
  assert.deepEqual(fixture.writeAttempts, []);
  assert.equal(fixture.commits(), 0);
});

for (const [label, patch] of [
  ["cash-only", { walletAppliedPaise: 0, payments: [{ id: "cash-1", provider: "RAZORPAY", amountPaise: 100_000, status: "CAPTURED" }] }],
  ["split payment", { walletAppliedPaise: 40_000, payments: [{ id: "cash-1", provider: "RAZORPAY", amountPaise: 60_000, status: "CAPTURED" }] }],
  ["non-wallet provider", { payments: [{ id: "cash-1", provider: "RAZORPAY", amountPaise: 0, status: "CAPTURED" }] }],
  ["nonzero cash amount", { payments: [{ id: "payment-1", provider: "WALLET", amountPaise: 100, status: "CAPTURED" }] }],
  ["multiple payments", { payments: [{ id: "p1", provider: "WALLET", amountPaise: 0, status: "CAPTURED" }, { id: "p2", provider: "WALLET", amountPaise: 0, status: "CAPTURED" }] }],
  ["no payment", { payments: [] }],
  ["zero order total", { totalPaise: 0, walletAppliedPaise: 0 }],
  ["missing wallet hold", { walletHold: null }],
  ["mismatched wallet hold", { walletHold: { amountPaise: 99_999, status: "CONSUMED" } }],
  ["uncaptured payment", { payments: [{ id: "payment-1", provider: "WALLET", amountPaise: 0, status: "PENDING" }] }],
  ["unconsumed wallet hold", { walletHold: { amountPaise: 100_000, status: "ACTIVE" } }],
  ["pending order", { status: "PENDING_PAYMENT" }],
  ["cancelled order", { status: "CANCELLED" }],
] as const) {
  test(`wallet-only refund rejects ${label} without any staged writes`, async () => {
    const fixture = adminFixture({ order: patch });
    const before = fixture.snapshot();
    await assert.rejects(fixture.service.refundWalletOnlyOrder("ORDER-1", details), { name: "ConflictException" });
    assert.deepEqual(fixture.writeAttempts, []);
    assert.deepEqual(fixture.snapshot(), before);
    assert.equal(fixture.commits(), 0);
  });
}

test("full wallet refund stages refund evidence then restores tender once; repeated requests are idempotent", async () => {
  const fixture = adminFixture();
  const first = await fixture.service.refundWalletOnlyOrder("ORDER-1", { reason: "  Customer return inspected  ", reference: "  SUPPORT-123  " });
  assert.deepEqual(first, { orderNumber: "ORDER-1", status: "REFUNDED", restoredPaise: 100_000, alreadyProcessed: false });
  const state = fixture.snapshot();
  assert.equal(state.balancePaise, 120_000);
  assert.deepEqual(state.ledger, [{ kind: "REFUND_REDEEM", deltaPaise: 100_000 }]);
  assert.equal(state.order.status, "REFUNDED");
  assert.equal(state.order.walletHold.status, "REFUNDED");
  assert.equal(state.refunds[0].providerRefundId, "wallet-full-refund:order-1");
  assert.equal(state.refunds[0].amountPaise, 0);
  assert.equal(state.refunds[0].status, "PROCESSED");
  assert.deepEqual(state.order.payments[0].rawReference, { source: "ADMIN_WALLET_FULL_REFUND", reference: "SUPPORT-123", reason: "Customer return inspected" });
  assert.match(state.order.notes, /^Original note\nWALLET_REFUND: SUPPORT-123: Customer return inspected$/);
  const writesBeforeRepeat = [...fixture.writeAttempts];
  const second = await fixture.service.refundWalletOnlyOrder("ORDER-1", details);
  assert.deepEqual(second, { ...first, alreadyProcessed: true });
  assert.deepEqual(fixture.snapshot(), state);
  assert.deepEqual(fixture.writeAttempts, writesBeforeRepeat);
  for (const config of fixture.transactions) assert.deepEqual(config, { isolationLevel: "Serializable", timeout: 15_000 });
});

test("a pre-existing refund with inconsistent order/payment/hold status needs reconciliation and never credits", async () => {
  for (const field of ["order", "payment", "hold"] as const) {
    const fixture = adminFixture();
    fixture.seed((state) => {
      state.refunds.push({ providerRefundId: "wallet-full-refund:order-1", status: "PROCESSED", amountPaise: 0 });
      state.order.status = field === "order" ? "DELIVERED" : "REFUNDED";
      state.order.payments[0].status = field === "payment" ? "CAPTURED" : "REFUNDED";
      state.order.walletHold.status = field === "hold" ? "CONSUMED" : "REFUNDED";
    });
    const before = fixture.snapshot();
    await assert.rejects(fixture.service.refundWalletOnlyOrder("ORDER-1", details), /require reconciliation/);
    assert.deepEqual(fixture.writeAttempts, []);
    assert.deepEqual(fixture.snapshot(), before);
  }
});

for (const failAt of ["refund.create", "payment.update", "order.update", "wallet.reverseEarned", "wallet.restoreRedeemed"]) {
  test(`full wallet refund rolls back all staged state if ${failAt} fails`, async () => {
    const fixture = adminFixture({ failAt });
    const before = fixture.snapshot();
    await assert.rejects(fixture.service.refundWalletOnlyOrder("ORDER-1", details), /simulated atomic operation failure/);
    assert.deepEqual(fixture.snapshot(), before);
    assert.equal(fixture.commits(), 0);
  });
}

test("failed tender restoration is not treated as success and rolls back refund evidence", async () => {
  const fixture = adminFixture({ refuseRestore: true });
  const before = fixture.snapshot();
  await assert.rejects(fixture.service.refundWalletOnlyOrder("ORDER-1", details), { name: "ConflictException" });
  assert.deepEqual(fixture.snapshot(), before);
  assert.equal(fixture.commits(), 0);
});

test("return hold reverses earned reward, preserves redeemed tender and cash payment, and issues no refund", async () => {
  const fixture = adminFixture({ order: {
    walletAppliedPaise: 30_000,
    payments: [{ id: "payment-1", provider: "RAZORPAY", amountPaise: 70_000, status: "CAPTURED" }],
    walletHold: { id: "hold-1", amountPaise: 30_000, status: "CONSUMED" },
  } });
  fixture.seed((state) => { state.reward = { status: "CREDITED", amountPaise: 1_400 }; });
  const result = await fixture.service.holdReturn("ORDER-1", details);
  assert.equal(result.refundIssued, false);
  const state = fixture.snapshot();
  assert.equal(state.order.status, "RETURN_REQUESTED");
  assert.equal(state.reward.status, "REVERSED");
  assert.equal(state.balancePaise, 18_600);
  assert.deepEqual(state.ledger, [{ kind: "REVERSE_EARN", deltaPaise: -1_400 }]);
  assert.deepEqual(state.refunds, []);
  assert.equal(state.order.payments[0].status, "CAPTURED");
  assert.equal(state.order.walletHold.status, "CONSUMED");
  assert.equal(fixture.writeAttempts.includes("wallet.restoreRedeemed"), false);
  const notes = state.order.notes;
  await fixture.service.holdReturn("ORDER-1", details);
  assert.equal(fixture.snapshot().balancePaise, 18_600);
  assert.equal(fixture.snapshot().ledger.length, 1);
  assert.equal(fixture.snapshot().order.notes, notes);
});

test("return hold rejects terminal or unpaid order states without any writes", async () => {
  for (const status of ["PENDING_PAYMENT", "CANCELLED", "REFUNDED", "RETURNED"]) {
    const fixture = adminFixture({ order: { status } });
    await assert.rejects(fixture.service.holdReturn("ORDER-1", details), { name: "ConflictException" });
    assert.deepEqual(fixture.writeAttempts, []);
  }
});

test("return hold rollback also reverses its staged earning reversal when order update fails", async () => {
  const fixture = adminFixture({ failAt: "order.update" });
  fixture.seed((state) => { state.reward = { status: "CREDITED", amountPaise: 2_000 }; });
  const before = fixture.snapshot();
  await assert.rejects(fixture.service.holdReturn("ORDER-1", details), /simulated atomic operation failure/);
  assert.deepEqual(fixture.snapshot(), before);
  assert.equal(fixture.commits(), 0);
});
