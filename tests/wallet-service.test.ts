import assert from "node:assert/strict";
import test from "node:test";
import type { VerifiedAuthUser } from "../apps/api/src/auth/supabase-auth.service.js";
import type { PrismaService } from "../apps/api/src/prisma/prisma.service.js";
import { WalletService } from "../apps/api/src/wallet/wallet.service.js";
import { withSerializableRetry } from "../apps/api/src/wallet/wallet-transaction.js";

const auth: VerifiedAuthUser = { id: "auth-owner", email: "owner@example.com", metadata: {} };

/** In-memory behavioural doubles; real Postgres locking is an integration gate. */
function harness() {
  const wallets: any[] = [{ id: "wallet-1", userId: "user-1", authSubject: auth.id, currency: "INR", balancePaise: 10_000, reservedPaise: 0 }];
  const orders: any[] = [{
    id: "order-1", orderNumber: "HIDI-1", userId: "user-1", status: "PENDING_PAYMENT", currency: "INR",
    createdAt: new Date("2020-01-01"), subtotalPaise: 200_000, discountPaise: 0,
    shippingPaise: 0, taxPaise: 0, totalPaise: 200_000, walletAppliedPaise: 4_000,
    payments: [{ id: "payment-1", status: "CAPTURED", amountPaise: 196_000, refunds: [] }],
    shipments: [{ status: "DELIVERED", deliveredAt: new Date("2020-01-05") }],
  }];
  const holds: any[] = [];
  const ledger: any[] = [];
  const accruals: any[] = [];
  const returnRequests: any[] = [];
  const locks: string[] = [];
  const userLookups: unknown[] = [];
  let writes = 0;
  const byWhere = (rows: any[], where: any) => rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value));
  const update = (rows: any[], args: any) => {
    const row = byWhere(rows, args.where);
    assert.ok(row, "fixture row exists");
    for (const [key, value] of Object.entries(args.data) as [string, any][]) {
      if (value && typeof value === "object" && "increment" in value) row[key] += value.increment;
      else if (value && typeof value === "object" && "decrement" in value) row[key] -= value.decrement;
      else row[key] = value;
    }
    writes += 1;
    return { ...row };
  };
  const tx: any = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes('FROM "Order"')) { locks.push(`order:${values[0]}`); return orders.filter((o) => o.id === values[0]).map((o) => ({ id: o.id })); }
      assert.ok(sql.includes('FROM "WalletAccount"'));
      locks.push(`wallet:${values[0]}`);
      return wallets.filter((w) => w.id === values[0]).map((w) => ({ ...w }));
    },
    user: { upsert: async (args: any) => { userLookups.push(args); return { id: "user-1", email: args.where.email }; } },
    order: { findUnique: async (args: any) => {
      const order = byWhere(orders, args.where);
      return order ? { ...order, rewardAccrual: accruals.find((a) => a.orderId === order.id) ?? null, walletHold: holds.find((h) => h.orderId === order.id) ?? null } : null;
    } },
    walletAccount: {
      findUnique: async (args: any) => byWhere(wallets, args.where) ?? null,
      create: async (args: any) => { writes += 1; const row = { id: `wallet-${wallets.length + 1}`, balancePaise: 0, reservedPaise: 0, ...args.data }; wallets.push(row); return row; },
      update: async (args: any) => update(wallets, args),
    },
    walletHold: {
      findUnique: async (args: any) => byWhere(holds, args.where) ?? null,
      create: async (args: any) => { assert.equal(holds.some((h) => h.orderId === args.data.orderId), false); writes += 1; const row = { id: `hold-${holds.length + 1}`, ...args.data }; holds.push(row); return row; },
      update: async (args: any) => update(holds, args),
    },
    walletLedger: {
      findUnique: async (args: any) => byWhere(ledger, args.where) ?? null,
      create: async (args: any) => { assert.equal(ledger.some((l) => l.eventKey === args.data.eventKey), false, "event key is unique"); writes += 1; const row = { id: `entry-${ledger.length + 1}`, createdAt: new Date(), ...args.data }; ledger.push(row); return row; },
      findMany: async (args: any) => ledger.filter((l) => l.walletId === args.where.walletId).slice().reverse().slice(0, args.take).map((l) => ({ ...l, order: { orderNumber: "HIDI-1" } })),
    },
    returnRequest: {
      findFirst: async (args: any) => returnRequests.find((request) =>
        request.orderId === args.where.orderId && (!args.where.status?.in || args.where.status.in.includes(request.status)),
      ) ?? null,
    },
    rewardAccrual: {
      findUnique: async (args: any) => byWhere(accruals, args.where) ?? null,
      create: async (args: any) => { writes += 1; const row = { id: `accrual-${accruals.length + 1}`, ...args.data }; accruals.push(row); return row; },
      update: async (args: any) => update(accruals, args),
      aggregate: async (args: any) => {
        const relationFilter = args.where.order?.returnRequests;
        const rows = accruals.filter((a) => {
          if (a.walletId !== args.where.walletId || a.status !== args.where.status) return false;
          if (!relationFilter) return true;
          const activeForOrder = returnRequests.some((request) =>
            request.orderId === a.orderId &&
            (!relationFilter.some?.status?.in || relationFilter.some.status.in.includes(request.status)),
          );
          if (relationFilter.none) {
            const disallowed = returnRequests.some((request) =>
              request.orderId === a.orderId &&
              (!relationFilter.none.status?.in || relationFilter.none.status.in.includes(request.status)),
            );
            return !disallowed;
          }
          if (relationFilter.some) return activeForOrder;
          return true;
        });
        return { _sum: { rewardPaise: rows.reduce((sum, a) => sum + a.rewardPaise, 0) } };
      },
      findMany: async (args: any) => accruals.filter((a) => args.where.status.in.includes(a.status) && (!args.where.id || a.id > args.where.id.gt)).slice(0, args.take),
    },
  };
  const prisma = { ...tx, $transaction: async (callback: any) => callback(tx) } as PrismaService;
  return { tx, prisma, service: new WalletService(prisma), wallets, orders, holds, ledger, accruals, returnRequests, locks, userLookups, writes: () => writes };
}

async function enabledTest(fn: () => Promise<void>) {
  const previous = process.env.HIDI_WALLET_ENABLED;
  process.env.HIDI_WALLET_ENABLED = "true";
  try { await fn(); } finally {
    if (previous === undefined) delete process.env.HIDI_WALLET_ENABLED;
    else process.env.HIDI_WALLET_ENABLED = previous;
  }
}

test("wallet ownership follows verified Auth subject, never email or body identity", async () => enabledTest(async () => {
  const h = harness();
  assert.equal((await h.service.ensureWallet({ ...auth, email: "changed@example.com" })).id, "wallet-1");
  assert.equal(h.userLookups.length, 0, "existing stable-subject wallet does not relink by email");
  await assert.rejects(h.service.ensureWallet({ ...auth, id: "different-auth-subject" }), /support review/);
  assert.equal(h.wallets.length, 1);
}));

test("GET summary is read-only, shows exact ledger not estimates and bounded history", async () => enabledTest(async () => {
  const h = harness();
  for (let index = 0; index < 25; index += 1) h.ledger.push({ id: `l${index}`, walletId: "wallet-1", kind: "EARN", deltaPaise: 200, createdAt: new Date() });
  const result = await h.service.getSummary(auth);
  assert.equal(result.availablePaise, 10_000);
  assert.equal(result.policy.returnWindowDays, 7);
  assert.equal(result.policy.redemptionCapPaise, null);
  assert.equal(result.history.length, 20);
  assert.equal(result.historyTruncated, true);
  assert.equal(h.writes(), 0);
  const none = await h.service.getSummary({ ...auth, id: "new-auth" });
  assert.equal(none.balancePaise, 0);
  assert.equal(h.wallets.length, 1);
}));

test("wallet summary excludes stale active-return accruals from pending and exposes them as held", async () => enabledTest(async () => {
  const h = harness();
  h.accruals.push(
    { id: "accrual-clean", orderId: "order-1", walletId: "wallet-1", rewardPaise: 8_600, status: "PENDING" },
    { id: "accrual-return", orderId: "order-return", walletId: "wallet-1", rewardPaise: 3_600, status: "PENDING" },
  );
  h.returnRequests.push({ id: "return-old", orderId: "order-return", status: "REQUESTED" });
  const result = await h.service.getSummary(auth);
  assert.equal(result.pendingPaise, 8_600);
  assert.equal(result.heldPaise, 3_600);
  assert.equal(h.writes(), 0, "summary stays read-only while correcting presentation");
}));

test("reservation then consumption debit once and lock order before wallet", async () => enabledTest(async () => {
  const h = harness();
  const expires = new Date(Date.now() + 60_000);
  await h.service.reserve(h.tx, "wallet-1", "order-1", 4_000, expires);
  await h.service.reserve(h.tx, "wallet-1", "order-1", 4_000, expires);
  assert.equal(h.wallets[0].reservedPaise, 4_000);
  assert.equal(h.holds.length, 1);
  assert.deepEqual(h.locks.slice(0, 2), ["order:order-1", "wallet:wallet-1"]);
  assert.equal(await h.service.consume(h.tx, "order-1"), true);
  assert.equal(await h.service.consume(h.tx, "order-1"), true);
  assert.equal(h.wallets[0].balancePaise, 6_000);
  assert.equal(h.wallets[0].reservedPaise, 0);
  assert.equal(h.ledger.length, 1);
  assert.equal(h.ledger[0].kind, "REDEEM");
  assert.equal(h.ledger[0].deltaPaise, -4_000);
}));

test("no cap supports full-wallet order and creates no earning on wallet-funded spend", async () => enabledTest(async () => {
  const h = harness();
  h.wallets[0].balancePaise = 200_000;
  h.orders[0].walletAppliedPaise = 200_000;
  h.orders[0].payments = [{ status: "CAPTURED", amountPaise: 0, provider: "WALLET", refunds: [] }];
  await h.service.reserve(h.tx, "wallet-1", "order-1", 200_000, new Date(Date.now() + 60_000));
  assert.equal(await h.service.consume(h.tx, "order-1"), true);
  assert.equal(h.wallets[0].balancePaise, 0);
  assert.equal(await h.service.createAccrual(h.tx, h.orders[0], "wallet-1"), null);
  assert.equal(h.accruals.length, 0);
}));

test("insufficient, released and expired holds cannot spend or silently reacquire", async () => enabledTest(async () => {
  const h = harness();
  h.wallets[0].balancePaise = 3_000;
  await assert.rejects(h.service.reserve(h.tx, "wallet-1", "order-1", 4_000, new Date(Date.now() + 60_000)), /balance changed/);
  h.wallets[0].balancePaise = 10_000;
  await h.service.reserve(h.tx, "wallet-1", "order-1", 4_000, new Date(Date.now() + 60_000));
  h.holds[0].expiresAt = new Date(Date.now() - 1);
  assert.equal(await h.service.consume(h.tx, "order-1"), false);
  assert.equal(await h.service.release(h.tx, "order-1"), true);
  assert.equal(await h.service.release(h.tx, "order-1"), false);
  assert.equal(await h.service.consume(h.tx, "order-1"), false);
  assert.equal(h.wallets[0].balancePaise, 10_000);
  assert.equal(h.wallets[0].reservedPaise, 0);
  assert.equal(h.ledger.length, 0);
}));

test("late debt invalidating held funds cannot be spent by another capture", async () => enabledTest(async () => {
  const h = harness();
  await h.service.reserve(h.tx, "wallet-1", "order-1", 4_000, new Date(Date.now() + 60_000));
  h.wallets[0].balancePaise = 3_000;
  assert.equal(await h.service.consume(h.tx, "order-1"), false);
  assert.equal(h.wallets[0].balancePaise, 3_000);
  assert.equal(h.wallets[0].reservedPaise, 4_000);
}));

test("mature reward posts once; any refund reverses once even after rewards spent", async () => enabledTest(async () => {
  const h = harness();
  h.orders[0].walletAppliedPaise = 0;
  h.orders[0].payments[0].amountPaise = 200_000;
  h.orders[0].status = "DELIVERED";
  await h.service.createAccrual(h.tx, h.orders[0], "wallet-1");
  assert.equal(h.accruals[0].rewardPaise, 4_000);
  assert.equal((await h.service.reconcileOrder("order-1")).status, "CREDITED");
  assert.equal((await h.service.reconcileOrder("order-1")).status, "UNCHANGED");
  assert.equal(h.wallets[0].balancePaise, 14_000);
  assert.equal(h.ledger.filter((l) => l.kind === "EARN").length, 1);
  h.wallets[0].balancePaise = 1_000; // previously spent rewards
  h.orders[0].payments[0].refunds = [{ status: "PROCESSED", amountPaise: 1 }];
  assert.equal((await h.service.reconcileOrder("order-1")).status, "REVERSED");
  assert.equal((await h.service.reconcileOrder("order-1")).status, "UNCHANGED");
  assert.equal(h.wallets[0].balancePaise, -3_000);
  const summary = await h.service.getSummary(auth);
  assert.equal(summary.availablePaise, 0);
  assert.equal(summary.debtPaise, 3_000);
  assert.equal(h.ledger.filter((l) => l.kind === "REVERSE_EARN").length, 1);
}));

test("return before maturity permanently suppresses accrual without inventing a debit", async () => enabledTest(async () => {
  const h = harness();
  await h.service.createAccrual(h.tx, h.orders[0], "wallet-1");
  await h.service.reverseEarned(h.tx, "order-1", "RETURN_REQUESTED");
  await h.service.reverseEarned(h.tx, "order-1", "DUPLICATE_RETURN_REQUEST");
  assert.equal(h.accruals[0].status, "REVERSED");
  assert.equal(h.wallets[0].balancePaise, 10_000);
  assert.equal(h.ledger.length, 0);
}));

test("active item return holds reward maturity and release lets normal reconciliation resume", async () => enabledTest(async () => {
  const h = harness();
  h.orders[0].walletAppliedPaise = 0;
  h.orders[0].payments[0].amountPaise = 200_000;
  h.orders[0].status = "DELIVERED";
  await h.service.createAccrual(h.tx, h.orders[0], "wallet-1");
  h.returnRequests.push({ id: "return-1", orderId: "order-1", status: "REQUESTED" });
  assert.equal((await h.service.reconcileOrder("order-1")).status, "HELD");
  assert.equal(h.accruals[0].status, "HELD");
  h.returnRequests[0].status = "REJECTED";
  assert.equal((await h.service.reconcileOrder("order-1")).status, "CREDITED");
  assert.equal(h.wallets[0].balancePaise, 14_000);
}));

test("return refund wallet credit is idempotent and uses an immutable request key", async () => enabledTest(async () => {
  const h = harness();
  const first = await h.service.creditReturnRefund(h.tx, "order-1", "return-1", 2_500);
  const second = await h.service.creditReturnRefund(h.tx, "order-1", "return-1", 2_500);
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(h.wallets[0].balancePaise, 12_500);
  assert.equal(h.ledger.filter((entry) => entry.kind === "RETURN_REFUND").length, 1);
  assert.equal(h.ledger.find((entry) => entry.kind === "RETURN_REFUND")?.eventKey, "wallet:return-refund:return-1");
}));

test("redeemed wallet funds restore only once after a full cash refund, never a partial", async () => enabledTest(async () => {
  const h = harness();
  await h.service.reserve(h.tx, "wallet-1", "order-1", 4_000, new Date(Date.now() + 60_000));
  await h.service.consume(h.tx, "order-1");
  h.orders[0].status = "REFUNDED";
  h.orders[0].payments[0].refunds = [{ status: "PROCESSED", amountPaise: 100_000 }];
  assert.equal(await h.service.restoreRedeemed(h.tx, "order-1"), false);
  assert.equal(h.wallets[0].balancePaise, 6_000);
  h.orders[0].payments[0].refunds.push({ status: "PROCESSED", amountPaise: 96_000 });
  assert.equal(await h.service.restoreRedeemed(h.tx, "order-1"), true);
  assert.equal(await h.service.restoreRedeemed(h.tx, "order-1"), false);
  assert.equal(h.wallets[0].balancePaise, 10_000);
  assert.equal(h.holds[0].status, "REFUNDED");
  assert.equal(h.ledger.filter((l) => l.kind === "REFUND_REDEEM").length, 1);
}));

test("explicit wallet-only full refund restores its original tender without gateway money", async () => enabledTest(async () => {
  const h = harness();
  h.wallets[0].balancePaise = 200_000;
  h.orders[0].walletAppliedPaise = 200_000;
  h.orders[0].payments[0].amountPaise = 0;
  await h.service.reserve(h.tx, "wallet-1", "order-1", 200_000, new Date(Date.now() + 60_000));
  await h.service.consume(h.tx, "order-1");
  assert.equal(await h.service.restoreRedeemed(h.tx, "order-1"), false, "admin must explicitly confirm full refund");
  h.orders[0].status = "REFUNDED";
  assert.equal(await h.service.restoreRedeemed(h.tx, "order-1"), true);
  assert.equal(h.wallets[0].balancePaise, 200_000);
}));

test("kill switch blocks new spend/earning but preserves liabilities, release and reversals", async () => enabledTest(async () => {
  const h = harness();
  await h.service.reserve(h.tx, "wallet-1", "order-1", 4_000, new Date(Date.now() + 60_000));
  await h.service.createAccrual(h.tx, h.orders[0], "wallet-1");
  process.env.HIDI_WALLET_ENABLED = "false";
  assert.equal(await h.service.consume(h.tx, "order-1"), false);
  assert.equal(await h.service.createAccrual(h.tx, h.orders[0], "wallet-1"), null);
  await assert.rejects(h.service.ensureWallet(auth), /temporarily unavailable/);
  await assert.rejects(h.service.reserve(h.tx, "wallet-1", "order-1", 4_000, new Date(Date.now() + 60_000)), /temporarily unavailable/);
  const summary = await h.service.getSummary(auth);
  assert.equal(summary.enabled, false);
  assert.equal(summary.balancePaise, 10_000);
  assert.equal(summary.reservedPaise, 4_000);
  assert.equal(summary.availablePaise, 0);
  assert.equal(await h.service.release(h.tx, "order-1"), true);
  assert.equal(await h.service.reverseEarned(h.tx, "order-1", "REFUND"), true);
}));

test("batch is bounded, resumable and rejects malformed cursors", async () => enabledTest(async () => {
  const h = harness();
  h.orders[0].walletAppliedPaise = 0;
  h.orders[0].payments[0].amountPaise = 200_000;
  h.orders[0].status = "DELIVERED";
  await h.service.createAccrual(h.tx, h.orders[0], "wallet-1");
  h.orders.push({ ...h.orders[0], id: "order-2" });
  await h.service.createAccrual(h.tx, h.orders[1], "wallet-1");
  const first = await h.service.runMaturationBatch(undefined, 1);
  assert.equal(first.processed, 1);
  assert.equal(first.credited, 1);
  assert.equal(first.nextCursor, "accrual-1");
  const second = await h.service.runMaturationBatch(first.nextCursor!, 1);
  assert.equal(second.processed, 1);
  assert.equal(second.nextCursor, null);
  await assert.rejects(h.service.runMaturationBatch("bad'cursor"), /Invalid wallet reconciliation cursor/);
  await assert.rejects(h.service.runMaturationBatch(123 as any), /Invalid wallet reconciliation cursor/);
  await assert.rejects(h.service.runMaturationBatch(undefined, 101), /batch limit/);
}));

test("serializable helper retries only known conflicts and keeps external work out", async () => {
  let attempts = 0;
  const prisma = { $transaction: async (fn: any, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    attempts += 1;
    if (attempts < 3) throw { code: "P2034" };
    return fn({});
  } } as PrismaService;
  assert.equal(await withSerializableRetry(prisma, async () => "ok"), "ok");
  assert.equal(attempts, 3);
  attempts = 0;
  const bad = { $transaction: async () => { attempts += 1; throw new Error("Not a serialization failure"); } } as unknown as PrismaService;
  await assert.rejects(withSerializableRetry(bad, async () => true), /Not a serialization failure/);
  assert.equal(attempts, 1);
});
