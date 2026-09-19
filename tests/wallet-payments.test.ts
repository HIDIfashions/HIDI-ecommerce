import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { PaymentsService } from "../apps/api/src/payments/payments.service.js";

const WEBHOOK_SECRET = "test-only-webhook-secret";
const CHECKOUT_SECRET = "test-only-checkout-secret";
const sign = (secret: string, body: string | Buffer) => createHmac("sha256", secret).update(body).digest("hex");
const checkoutBody = () => ({ razorpay_order_id: "rzp-order-1", razorpay_payment_id: "rzp-payment-1", razorpay_signature: sign(CHECKOUT_SECRET, "rzp-order-1|rzp-payment-1") });

function fixture() {
  const calls: { action: string; input?: any }[] = [];
  let state: any = {
    order: { id: "order-1", orderNumber: "HIDI-TEST-1", userId: "user-1", cartSessionId: "session-1", status: "PENDING_PAYMENT", totalPaise: 200000, walletAppliedPaise: 4000, currency: "INR" },
    payments: [{ id: "payment-1", orderId: "order-1", provider: "RAZORPAY", providerOrderId: "rzp-order-1", providerPaymentId: null, amountPaise: 196000, status: "CREATED" }],
    reservations: [{ id: "reservation-1", orderId: "order-1", variantId: "variant-1", quantity: 1, status: "ACTIVE", expiresAt: new Date(Date.now() + 900000) }],
    inventory: { variantId: "variant-1", onHand: 10, reserved: 1, safetyStock: 0 },
    wallet: { balancePaise: 10000, reservedPaise: 4000, accruedReversed: false },
    hold: { orderId: "order-1", amountPaise: 4000, status: "ACTIVE", expiresAt: new Date(Date.now() + 900000) },
    refunds: [], returnRequests: [], cart: { id: "cart-1", userId: "user-1" }, cartItems: 1,
  };
  let provider: any = { id: "rzp-payment-1", order_id: "rzp-order-1", amount: 196000, currency: "INR", status: "captured", captured: true, method: "upi", amount_refunded: 0, refund_status: null };
  const record = (action: string, value?: unknown) => calls.push({ action, input: value === undefined ? undefined : structuredClone(value) });
  const matches = (row: any, where: any): boolean => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object") {
      if ("in" in value) return (value as any).in.includes(row[key]);
      if ("gte" in value) return row[key] >= (value as any).gte;
    }
    return row[key] === value;
  });
  const mutate = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "decrement" in value) row[key] -= (value as any).decrement;
      else if (value && typeof value === "object" && "increment" in value) row[key] += (value as any).increment;
      else row[key] = value;
    }
    return structuredClone(row);
  };
  const findPayment = (q: any) => {
    const row = state.payments.find((p: any) => matches(p, q.where));
    return row ? { ...structuredClone(row), ...(q.include?.order ? { order: structuredClone(state.order) } : {}) } : null;
  };
  const db: any = {
    walletHold: { findUnique: async (q: any) => state.hold && matches(state.hold, q.where) ? structuredClone(state.hold) : null },
    order: {
      findUnique: async (q: any) => matches(state.order, q.where) ? { ...structuredClone(state.order), reservations: structuredClone(state.reservations).sort((a: any, b: any) => a.variantId.localeCompare(b.variantId)), payments: structuredClone(state.payments) } : null,
      update: async (q: any) => { record("order.update", q); assert.ok(matches(state.order, q.where)); return mutate(state.order, q.data); },
    },
    payment: {
      findFirst: async (q: any) => findPayment(q), findUnique: async (q: any) => findPayment(q),
      update: async (q: any) => { record("payment.update", q); const row = state.payments.find((p: any) => matches(p, q.where)); assert.ok(row); return mutate(row, q.data); },
      updateMany: async (q: any) => { record("payment.updateMany", q); const rows = state.payments.filter((p: any) => matches(p, q.where)); rows.forEach((p: any) => mutate(p, q.data)); return { count: rows.length }; },
    },
    inventory: {
      update: async (q: any) => { record("inventory.update", q); assert.ok(matches(state.inventory, q.where)); return mutate(state.inventory, q.data); },
      updateMany: async (q: any) => { record("inventory.updateMany", q); if (!matches(state.inventory, q.where)) return { count: 0 }; mutate(state.inventory, q.data); return { count: 1 }; },
    },
    inventoryReservation: { update: async (q: any) => { record("reservation.update", q); const row = state.reservations.find((r: any) => matches(r, q.where)); assert.ok(row); return mutate(row, q.data); } },
    returnRequest: {
      findUnique: async (q: any) => structuredClone(state.returnRequests.find((r: any) => matches(r, q.where)) ?? null),
      update: async (q: any) => {
        record("return.update", q);
        const row = state.returnRequests.find((r: any) => matches(r, q.where));
        assert.ok(row);
        return mutate(row, q.data);
      },
    },
    paymentRefund: {
      findUnique: async (q: any) => structuredClone(state.refunds.find((r: any) => matches(r, q.where)) ?? null),
      aggregate: async (q: any) => ({ _sum: { amountPaise: state.refunds.filter((r: any) => matches(r, q.where)).reduce((sum: number, r: any) => sum + r.amountPaise, 0) } }),
      create: async (q: any) => { record("refund.create", q); if (state.refunds.some((r: any) => r.providerRefundId === q.data.providerRefundId)) throw new Error("Duplicate refund identity"); const row = { id: `refund-${state.refunds.length + 1}`, ...q.data }; state.refunds.push(row); return structuredClone(row); },
    },
    cart: { findUnique: async () => structuredClone(state.cart) },
    cartItem: { deleteMany: async (q: any) => { record("cartItem.deleteMany", q); const count = state.cartItems; state.cartItems = 0; return { count }; } },
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join("?"); record("lock", { sql, values });
      if (sql.includes('FROM "Order"')) return [{ id: state.order.id }];
      if (sql.includes('FROM "WalletAccount"')) return [{ id: "wallet-1" }];
      if (sql.includes('FROM "Inventory"')) return [{ ...state.inventory }];
      throw new Error(`Unhandled lock query: ${sql}`);
    },
  };
  db.$transaction = async (callback: (tx: any) => Promise<any>, config: any) => {
    record("transaction", config); const before = structuredClone(state);
    try { return await callback(db); } catch (error) { state = before; throw error; }
  };
  const wallet: any = {
    consume: async (_tx: any, orderId: string) => {
      record("wallet.consume", { orderId });
      if (state.order.walletAppliedPaise === 0) return true;
      if (!state.hold || state.hold.status !== "ACTIVE" || state.hold.expiresAt <= new Date()) return false;
      state.wallet.balancePaise -= state.hold.amountPaise; state.wallet.reservedPaise -= state.hold.amountPaise; state.hold.status = "CONSUMED";
      return true;
    },
    release: async (_tx: any, orderId: string) => {
      record("wallet.release", { orderId });
      if (state.hold?.status === "ACTIVE") { state.wallet.reservedPaise -= state.hold.amountPaise; state.hold.status = "RELEASED"; }
    },
    reverseEarned: async (_tx: any, orderId: string, reason: string) => { record("wallet.reverseEarned", { orderId, reason }); state.wallet.accruedReversed = true; },
    creditReturnRefund: async (_tx: any, orderId: string, requestId: string, amountPaise: number) => {
      record("wallet.creditReturnRefund", { orderId, requestId, amountPaise });
      state.wallet.balancePaise += amountPaise;
      return true;
    },
    restoreRedeemed: async (_tx: any, orderId: string) => {
      record("wallet.restoreRedeemed", { orderId, orderStatus: state.order.status });
      assert.equal(state.order.status, "REFUNDED", "Order must be fully refunded before wallet restoration");
      if (state.hold?.status !== "CONSUMED") return false;
      state.wallet.balancePaise += state.hold.amountPaise; state.hold.status = "REFUNDED"; return true;
    },
  };
  const razorpay: any = {
    verifyCheckoutSignature: (orderId: string, paymentId: string, signature: string) => { record("razorpay.verifyCheckout", { orderId, paymentId }); return signature === sign(CHECKOUT_SECRET, `${orderId}|${paymentId}`); },
    verifyWebhookSignature: (raw: Buffer, signature: string) => { record("razorpay.verifyWebhook"); return signature === sign(WEBHOOK_SECRET, raw); },
    fetchPayment: async (id: string) => { record("razorpay.fetchPayment", { id }); return structuredClone(provider); },
  };
  const service = new PaymentsService(db, razorpay, wallet);
  const webhook = async (payload: any, invalidSignature = false) => {
    const raw = Buffer.from(JSON.stringify(payload));
    return service.handleWebhook(raw, invalidSignature ? "invalid-signature" : sign(WEBHOOK_SECRET, raw), payload);
  };
  const capture = () => webhook({ event: "payment.captured", payload: { payment: { entity: structuredClone(provider) } } });
  const refund = (amount = 10000, id = "rzp-refund-1", changes: Record<string, unknown> = {}, invalidSignature = false) => webhook({ event: "refund.processed", payload: { refund: { entity: { id, payment_id: "rzp-payment-1", amount, currency: "INR", status: "processed", ...changes } } } }, invalidSignature);
  return { service, db, wallet, calls, state: () => state, provider: () => provider, setProvider: (changes: Record<string, unknown>) => { provider = { ...provider, ...changes }; }, webhook, capture, refund };
}

test("capture updates the exact matching payment record, consumes wallet and inventory once, and clears the correct cart", async () => {
  const f = fixture();
  f.state().payments.unshift({ id: "unrelated-attempt", orderId: "order-1", provider: "RAZORPAY", providerOrderId: "rzp-old-order", providerPaymentId: null, amountPaise: 196000, status: "FAILED" });
  await f.capture();
  assert.equal(f.state().payments[0].status, "FAILED"); assert.equal(f.state().payments[0].providerPaymentId, null);
  assert.equal(f.state().payments[1].status, "CAPTURED"); assert.equal(f.state().payments[1].providerPaymentId, "rzp-payment-1");
  assert.equal(f.state().order.status, "CONFIRMED"); assert.equal(f.state().inventory.onHand, 9); assert.equal(f.state().inventory.reserved, 0);
  assert.equal(f.state().wallet.balancePaise, 6000); assert.equal(f.state().wallet.reservedPaise, 0); assert.equal(f.state().hold.status, "CONSUMED");
  assert.equal(f.state().reservations[0].status, "CONSUMED"); assert.equal(f.state().cartItems, 0);
  const locks = f.calls.filter((c) => c.action === "lock");
  assert.match(locks[0].input.sql, /FROM "Order"/); assert.match(locks[1].input.sql, /FROM "WalletAccount"/); assert.match(locks[2].input.sql, /FROM "Inventory"/);
});

test("duplicate capture webhook and signed checkout verification do not double-consume wallet or stock", async () => {
  const f = fixture(); await f.capture(); await f.capture(); const result = await f.service.verifyCheckout(checkoutBody());
  assert.equal(result.captured, true); assert.equal(result.status, "CONFIRMED");
  assert.equal(f.calls.filter((c) => c.action === "wallet.consume").length, 1);
  assert.equal(f.calls.filter((c) => c.action === "inventory.update").length, 1);
  assert.equal(f.state().wallet.balancePaise, 6000); assert.equal(f.state().inventory.onHand, 9);
});

test("capture before local payment registration returns non-2xx and succeeds safely on retry", async () => {
  const f = fixture();
  const record = f.state().payments.pop();
  await assert.rejects(() => f.capture(), (error: any) => error.getStatus?.() === 404 && /awaiting local order registration/.test(error.message));
  assert.equal(f.calls.some((call) => call.action === "transaction" || call.action === "wallet.consume"), false);
  assert.equal(f.state().inventory.onHand, 10);
  assert.equal(f.state().wallet.balancePaise, 10000);
  f.state().payments.push(record);
  assert.deepEqual(await f.capture(), { received: true });
  await f.capture();
  assert.equal(f.state().order.status, "CONFIRMED");
  assert.equal(f.calls.filter((call) => call.action === "wallet.consume").length, 1);
  assert.equal(f.state().inventory.onHand, 9);
});

test("a different payment id cannot replace a recorded captured payment", async () => {
  const f = fixture(); await f.capture(); f.setProvider({ id: "second-provider-payment" });
  await assert.rejects(() => f.capture(), /different captured payment/);
  assert.equal(f.state().payments[0].providerPaymentId, "rzp-payment-1"); assert.equal(f.state().wallet.balancePaise, 6000);
});

for (const condition of ["expired inventory reservation", "released inventory reservation", "expired wallet hold", "released wallet hold", "missing inventory reservations"]) {
  test(`late capture with ${condition} records cash for review without consuming stock or wallet`, async () => {
    const f = fixture();
    if (condition === "expired inventory reservation") f.state().reservations[0].expiresAt = new Date(Date.now() - 1);
    if (condition === "released inventory reservation") { f.state().reservations[0].status = "RELEASED"; f.state().inventory.reserved = 0; }
    if (condition === "expired wallet hold") f.state().hold.expiresAt = new Date(Date.now() - 1);
    if (condition === "released wallet hold") { f.state().hold.status = "RELEASED"; f.state().wallet.reservedPaise = 0; }
    if (condition === "missing inventory reservations") f.state().reservations = [];
    await f.capture();
    assert.equal(f.state().order.status, "PAYMENT_REVIEW"); assert.equal(f.state().payments[0].status, "CAPTURED");
    assert.equal(f.state().inventory.onHand, 10); assert.equal(f.state().wallet.balancePaise, 10000);
    assert.equal(f.state().wallet.reservedPaise, 0); assert.equal(f.state().cartItems, 1);
    assert.equal(f.calls.some((c) => c.action === "inventory.update"), false);
    assert.equal(f.state().wallet.accruedReversed, true);
  });
}

for (const orderStatus of ["CANCELLED", "RETURN_REQUESTED", "RETURNED", "REFUNDED"]) {
  test(`captured cash cannot resurrect a ${orderStatus} order or spend its wallet`, async () => {
    const f = fixture(); f.state().order.status = orderStatus;
    await f.capture();
    assert.equal(f.state().order.status, orderStatus === "CANCELLED" ? "PAYMENT_REVIEW" : orderStatus);
    assert.equal(f.state().payments[0].status, "CAPTURED"); assert.equal(f.state().wallet.balancePaise, 10000); assert.equal(f.state().inventory.onHand, 10);
    assert.equal(f.calls.some((c) => c.action === "wallet.consume"), false);
  });
}

test("invalid webhook and checkout signatures cannot update a payment or reach provider lookup", async () => {
  const f = fixture();
  await assert.rejects(() => f.webhook({ event: "payment.captured", payload: { payment: { entity: f.provider() } } }, true), /signature/);
  await assert.rejects(() => f.service.verifyCheckout({ ...checkoutBody(), razorpay_signature: "bad-signature" }), /signature/);
  assert.equal(f.calls.some((c) => c.action === "transaction" || c.action === "razorpay.fetchPayment"), false);
  assert.equal(f.state().payments[0].status, "CREATED"); assert.equal(f.state().inventory.onHand, 10);
});

test("provider identity, amount and currency mismatches are rejected before capture", async () => {
  for (const changes of [{ id: "wrong-payment" }, { order_id: "wrong-order" }, { amount: 196001 }, { currency: "USD" }]) {
    const f = fixture(); f.setProvider(changes);
    await assert.rejects(() => f.service.verifyCheckout(checkoutBody()), /do not match/);
    assert.equal(f.state().payments[0].status, "CREATED"); assert.equal(f.state().wallet.balancePaise, 10000);
  }
  const f = fixture(); f.setProvider({ currency: "USD" });
  await assert.rejects(() => f.capture(), /currency does not match/);
  assert.equal(f.state().order.status, "PENDING_PAYMENT");
});

test("payment/wallet cash breakdown mismatch aborts the capture transaction", async () => {
  const f = fixture(); f.state().order.walletAppliedPaise = 5000;
  await assert.rejects(() => f.capture(), /breakdown no longer match/);
  assert.equal(f.state().payments[0].status, "CREATED"); assert.equal(f.state().wallet.reservedPaise, 4000); assert.equal(f.state().inventory.onHand, 10);
});

test("failed or authorized messages after capture cannot downgrade paid state", async () => {
  const f = fixture(); await f.capture();
  await f.webhook({ event: "payment.failed", payload: { payment: { entity: f.provider() } } });
  f.setProvider({ status: "authorized", captured: false });
  const result = await f.service.verifyCheckout(checkoutBody());
  assert.equal(result.captured, true); assert.equal(f.state().payments[0].status, "CAPTURED"); assert.equal(f.state().order.status, "CONFIRMED");
});

test("capture does not clear a cart subsequently owned by a different account", async () => {
  const f = fixture(); f.state().cart.userId = "another-user";
  await f.capture(); assert.equal(f.state().order.status, "CONFIRMED"); assert.equal(f.state().cartItems, 1);
});

test("signed partial refund is provider-verified and deduplicated, reverses earning but not redeemed tender", async () => {
  const f = fixture(); await f.capture(); f.setProvider({ amount_refunded: 10000, refund_status: "partial" });
  await f.refund(); await f.refund();
  assert.equal(f.state().refunds.length, 1); assert.equal(f.state().refunds[0].amountPaise, 10000);
  assert.equal(f.state().payments[0].status, "PARTIALLY_REFUNDED"); assert.equal(f.state().order.status, "RETURN_REQUESTED");
  assert.equal(f.calls.filter((c) => c.action === "wallet.reverseEarned").length, 1);
  assert.equal(f.calls.some((c) => c.action === "wallet.restoreRedeemed"), false);
  assert.equal(f.state().wallet.balancePaise, 6000); assert.equal(f.state().hold.status, "CONSUMED");
  assert.ok(f.calls.some((c) => c.action === "razorpay.fetchPayment" && c.input.id === "rzp-payment-1"));
});

test("item-level return refund closes ReturnRequest without overwriting delivered fulfilment", async () => {
  const f = fixture();
  await f.capture();
  f.state().order.status = "DELIVERED";
  f.state().returnRequests.push({
    id: "return-1",
    orderId: "order-1",
    type: "RETURN",
    status: "REFUND_PROCESSING",
    refundCashPaise: 10000,
    refundWalletPaise: 0,
    refundProviderId: null,
  });
  f.setProvider({ amount_refunded: 10000, refund_status: "partial" });
  await f.refund(10000, "rzp-return-refund-1", { notes: { hidi_return_request_id: "return-1" } });
  assert.equal(f.state().order.status, "DELIVERED");
  assert.equal(f.state().payments[0].status, "PARTIALLY_REFUNDED");
  assert.equal(f.state().returnRequests[0].status, "REFUNDED");
  assert.equal(f.state().returnRequests[0].refundStatus, "COMPLETED");
  assert.equal(f.state().returnRequests[0].refundProviderId, "rzp-return-refund-1");
  assert.equal(f.calls.filter((call) => call.action === "wallet.reverseEarned").length, 1);
  assert.equal(f.calls.some((call) => call.action === "wallet.restoreRedeemed"), false);
});

test("all cash refunded across multiple events restores original wallet tender once", async () => {
  const f = fixture(); await f.capture();
  f.setProvider({ amount_refunded: 10000, refund_status: "partial" }); await f.refund(10000, "refund-part-1");
  f.setProvider({ amount_refunded: 196000, refund_status: "full", status: "refunded" }); await f.refund(186000, "refund-part-2"); await f.refund(186000, "refund-part-2");
  assert.equal(f.state().refunds.length, 2); assert.equal(f.state().payments[0].status, "REFUNDED"); assert.equal(f.state().order.status, "REFUNDED");
  assert.equal(f.state().wallet.balancePaise, 10000); assert.equal(f.state().hold.status, "REFUNDED");
  assert.equal(f.calls.filter((c) => c.action === "wallet.restoreRedeemed").length, 1);
  assert.equal(f.calls.find((c) => c.action === "wallet.restoreRedeemed")!.input.orderStatus, "REFUNDED");
  assert.equal(f.state().inventory.onHand, 9, "Refund accounting does not pretend returned garments have passed inventory inspection");
});

test("failed wallet restoration rolls back the full-refund accounting transaction for safe retry", async () => {
  const f = fixture(); await f.capture(); f.setProvider({ amount_refunded: 196000, status: "refunded", refund_status: "full" });
  f.wallet.restoreRedeemed = async () => false;
  await assert.rejects(() => f.refund(196000), /Wallet refund needs reconciliation/);
  assert.equal(f.state().refunds.length, 0); assert.equal(f.state().payments[0].status, "CAPTURED"); assert.equal(f.state().order.status, "CONFIRMED");
  assert.equal(f.state().wallet.balancePaise, 6000); assert.equal(f.state().hold.status, "CONSUMED");
});

test("capture replay after a fully refunded order does not resurrect it or debit restored wallet funds", async () => {
  const f = fixture(); await f.capture(); f.setProvider({ amount_refunded: 196000, status: "refunded", refund_status: "full" }); await f.refund(196000);
  f.setProvider({ status: "captured" }); await f.capture();
  assert.equal(f.state().order.status, "REFUNDED"); assert.equal(f.state().payments[0].status, "REFUNDED");
  assert.equal(f.state().wallet.balancePaise, 10000); assert.equal(f.calls.filter((c) => c.action === "wallet.consume").length, 1);
});

test("refunds require a valid signature and cannot invent provider-confirmed refunded cash", async () => {
  const f = fixture(); await f.capture();
  f.setProvider({ amount_refunded: 10000 });
  await assert.rejects(() => f.refund(10000, "bad-signature-refund", {}, true), /signature/);
  f.setProvider({ amount_refunded: 0 }); await assert.rejects(() => f.refund(), /provider payment totals/);
  assert.equal(f.state().refunds.length, 0); assert.equal(f.calls.some((c) => c.action === "wallet.restoreRedeemed"), false);
  assert.equal(f.state().payments[0].status, "CAPTURED");
});

test("refund event identity cannot be reused with another amount", async () => {
  const f = fixture(); await f.capture(); f.setProvider({ amount_refunded: 20000 });
  await f.refund(10000, "refund-same-id");
  await assert.rejects(() => f.refund(11000, "refund-same-id"), /identity does not match/);
  assert.equal(f.state().refunds.length, 1); assert.equal(f.state().refunds[0].amountPaise, 10000);
});

test("refund currency, malformed money and overflow are rejected without ledger changes", async () => {
  for (const [amount, changes] of [
    [10000, { currency: "USD" }], [-1, {}], [0, {}], [0.5, {}], [Number.MAX_SAFE_INTEGER + 1, {}], [196001, {}], [10000, { status: "pending" }],
  ] as [number, Record<string, unknown>][]) {
    const f = fixture(); await f.capture(); f.setProvider({ amount_refunded: 196000 });
    await assert.rejects(() => f.refund(amount, "invalid-refund", changes));
    assert.equal(f.state().refunds.length, 0); assert.equal(f.state().payments[0].status, "CAPTURED"); assert.equal(f.state().wallet.balancePaise, 6000);
  }
});

test("cumulative refunds cannot exceed cash captured even if a new event id is supplied", async () => {
  const f = fixture(); await f.capture(); f.setProvider({ amount_refunded: 196000 });
  await f.refund(100000, "refund-1");
  await assert.rejects(() => f.refund(100000, "refund-2"), /exceeds/);
  assert.equal(f.state().refunds.length, 1); assert.equal(f.state().payments[0].status, "PARTIALLY_REFUNDED");
  assert.equal(f.calls.some((c) => c.action === "wallet.restoreRedeemed"), false);
});

test("refund arriving before capture is reconciled cannot create money or mark the order refunded", async () => {
  const f = fixture(); f.state().payments[0].providerPaymentId = "rzp-payment-1"; f.setProvider({ amount_refunded: 10000 });
  await assert.rejects(() => f.refund(), /Capture must be reconciled/);
  assert.equal(f.state().refunds.length, 0); assert.equal(f.state().wallet.balancePaise, 10000); assert.equal(f.state().order.status, "PENDING_PAYMENT");
});

test("a wallet-consumption error rolls capture back with inventory and payment still untouched", async () => {
  const f = fixture(); f.wallet.consume = async () => { throw new Error("Wallet reconciliation failed"); };
  await assert.rejects(() => f.capture(), /Wallet reconciliation failed/);
  assert.equal(f.state().order.status, "PENDING_PAYMENT"); assert.equal(f.state().payments[0].status, "CREATED");
  assert.equal(f.state().inventory.onHand, 10); assert.equal(f.state().inventory.reserved, 1); assert.equal(f.state().wallet.balancePaise, 10000);
});
