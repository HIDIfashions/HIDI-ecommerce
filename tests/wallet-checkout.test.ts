import assert from "node:assert/strict";
import test from "node:test";
import { CheckoutService } from "../apps/api/src/checkout/checkout.service.js";
import { CheckoutController } from "../apps/api/src/checkout/checkout.controller.js";

const auth = { id: "trusted-subject", email: "customer@example.test", metadata: {}, phone: null, phoneVerified: false };
const input = (changes: Record<string, unknown> = {}) => ({
  sessionId: "session-12345678", checkoutToken: "checkout-token-12345678", customerEmail: "guest@example.test", customerPhone: "9876543210",
  shippingAddress: { firstName: "Customer", phone: "9876543210", line1: "12 Test Street", city: "Hyderabad", state: "Telangana", postalCode: "500001" },
  expectedTotalPaise: 200000, ...changes,
});

function fixture(options: { enabled?: boolean; gatewayFailure?: boolean; price?: number; quantity?: number; balance?: number; ownedCart?: string } = {}) {
  const calls: { action: string; input?: any }[] = [];
  let state: any = {
    orders: [], payments: [], reservations: [], holds: [],
    wallet: { id: "wallet-1", userId: "user-1", authSubject: auth.id, balancePaise: options.balance ?? 300000, reservedPaise: 0 },
    inventory: { variantId: "variant-1", onHand: 10, reserved: 0, safetyStock: 0 },
    cart: { id: "cart-1", sessionId: "session-12345678", userId: options.ownedCart ?? null, items: [{
      productId: "product-1", variantId: "variant-1", quantity: options.quantity ?? 1,
      product: { id: "product-1", name: "Olive kurta", status: "ACTIVE" },
      variant: { id: "variant-1", active: true, sku: "HIDI-001", size: "L", color: "Olive", pricePaise: options.price ?? 200000, inventory: true },
    }] },
  };
  const record = (action: string, value?: unknown) => calls.push({ action, input: value === undefined ? undefined : structuredClone(value) });
  const mutate = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in value) row[key] += (value as any).increment;
      else if (value && typeof value === "object" && "decrement" in value) row[key] -= (value as any).decrement;
      else row[key] = value;
    }
    return row;
  };
  const db: any = {
    walletAccount: { findUnique: async (q: any) => { record("walletAccount.findUnique", q); return Object.entries(q.where).every(([key, value]) => state.wallet[key] === value) ? structuredClone(state.wallet) : null; } },
    user: { upsert: async (q: any) => { record("user.upsert", q); return { id: "user-1" }; } },
    order: {
      findUnique: async (q: any) => {
        const [key, value] = Object.entries(q.where)[0];
        const order = state.orders.find((item: any) => item[key] === value);
        if (!order) return null;
        return { ...order, payments: state.payments.filter((p: any) => p.orderId === order.id) };
      },
      create: async (q: any) => {
        record("order.create", q);
        const order = { id: `order-${state.orders.length + 1}`, currency: "INR", discountPaise: 0, shippingPaise: 0, taxPaise: 0, createdAt: new Date(), ...q.data };
        state.orders.push(order); return { ...order };
      },
      update: async (q: any) => { record("order.update", q); return { ...mutate(state.orders.find((o: any) => o.id === q.where.id), q.data) }; },
      updateMany: async (q: any) => {
        record("order.updateMany", q);
        const rows = state.orders.filter((o: any) => o.id === q.where.id && (!q.where.status || o.status === q.where.status));
        rows.forEach((o: any) => mutate(o, q.data)); return { count: rows.length };
      },
    },
    payment: { create: async (q: any) => { record("payment.create", q); const row = { id: `payment-${state.payments.length + 1}`, provider: "RAZORPAY", ...q.data }; state.payments.push(row); return { ...row }; } },
    cart: {
      findUnique: async (q: any) => q.where.sessionId === state.cart.sessionId ? structuredClone(state.cart) : null,
      update: async (q: any) => { record("cart.update", q); return mutate(state.cart, q.data); },
    },
    cartItem: { deleteMany: async (q: any) => { record("cartItem.deleteMany", q); const count = state.cart.items.length; state.cart.items = []; return { count }; } },
    inventory: { update: async (q: any) => { record("inventory.update", q); return mutate(state.inventory, q.data); } },
    inventoryReservation: {
      findMany: async (q: any) => {
        // The janitor query is intentionally exercised, but fixtures start fresh.
        if (q.where.expiresAt) return [];
        return structuredClone(state.reservations.filter((r: any) => r.orderId === q.where.orderId && r.status === q.where.status));
      },
      create: async (q: any) => { record("reservation.create", q); const row = { id: `reservation-${state.reservations.length + 1}`, status: "ACTIVE", ...q.data }; state.reservations.push(row); return row; },
      updateMany: async (q: any) => {
        record("reservation.updateMany", q);
        const rows = state.reservations.filter((r: any) => r.orderId === q.where.orderId && r.status === q.where.status);
        rows.forEach((r: any) => mutate(r, q.data)); return { count: rows.length };
      },
    },
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      record("lock", { sql: parts.join("?"), values });
      if (parts.join("").includes('FROM "Order"')) return state.orders.filter((o: any) => o.id === values[0]).map((o: any) => ({ id: o.id }));
      return [{ ...state.inventory }];
    },
  };
  db.$transaction = async (callback: (tx: any) => Promise<any>, config: any) => {
    record("transaction", config); const before = structuredClone(state);
    try { return await callback(db); } catch (error) { state = before; throw error; }
  };
  const wallet: any = {
    enabled: () => options.enabled !== false,
    ensureWallet: async (verified: any) => { record("wallet.ensure", verified); return { ...state.wallet }; },
    reserve: async (_tx: any, walletId: string, orderId: string, amount: number, expiresAt: Date) => {
      record("wallet.reserve", { walletId, orderId, amount, expiresAt });
      if (amount > state.wallet.balancePaise - state.wallet.reservedPaise) throw new Error("Insufficient wallet balance");
      if (!amount) return;
      state.wallet.reservedPaise += amount;
      state.holds.push({ orderId, amountPaise: amount, status: "ACTIVE", expiresAt });
    },
    createAccrual: async (_tx: any, order: any, walletId: string) => record("wallet.accrue", { order, walletId }),
    consume: async (_tx: any, orderId: string) => {
      record("wallet.consume", { orderId });
      const hold = state.holds.find((h: any) => h.orderId === orderId);
      if (!hold || hold.status !== "ACTIVE" || hold.expiresAt < new Date()) return false;
      state.wallet.balancePaise -= hold.amountPaise; state.wallet.reservedPaise -= hold.amountPaise; hold.status = "CONSUMED";
      return true;
    },
    release: async (_tx: any, orderId: string) => {
      record("wallet.release", { orderId });
      const hold = state.holds.find((h: any) => h.orderId === orderId && h.status === "ACTIVE");
      if (hold) { state.wallet.reservedPaise -= hold.amountPaise; hold.status = "RELEASED"; }
    },
    reverseEarned: async (_tx: any, orderId: string, reason: string) => record("wallet.reverseEarned", { orderId, reason }),
  };
  const razorpay: any = {
    createOrder: async (q: any) => { record("razorpay.createOrder", q); if (options.gatewayFailure) throw new Error("Gateway unavailable"); return { id: "rzp-order-1", amount: q.amountPaise, currency: "INR" }; },
    publicKey: () => { record("razorpay.publicKey"); return "rzp_test_key"; },
  };
  return { service: new CheckoutService(db, razorpay, wallet), db, wallet, razorpay, calls, state: () => state };
}

test("full-wallet checkout is confirmed atomically without gateway creation or public-key lookup", async () => {
  const f = fixture();
  const result = await f.service.prepare(input({ walletPaise: 200000 }), auth);
  assert.equal(result.provider, "WALLET"); assert.equal(result.status, "CONFIRMED"); assert.equal(result.captured, true); assert.equal(result.amountPaise, 0);
  assert.equal("razorpayKeyId" in result, false); assert.equal("providerOrderId" in result, false);
  assert.equal(f.calls.some((c) => c.action.startsWith("razorpay.")), false);
  assert.equal(f.state().payments[0].provider, "WALLET"); assert.equal(f.state().payments[0].amountPaise, 0);
  assert.equal(f.state().wallet.balancePaise, 100000); assert.equal(f.state().wallet.reservedPaise, 0);
  assert.equal(f.state().inventory.onHand, 9); assert.equal(f.state().inventory.reserved, 0); assert.equal(f.state().reservations[0].status, "CONSUMED");
  assert.equal(f.state().cart.items.length, 0);
});

test("full-wallet retry returns the original order without double debit, payment, or stock consumption", async () => {
  const f = fixture(); const payload = input({ walletPaise: 200000 });
  const first = await f.service.prepare(payload, auth); const second = await f.service.prepare(payload, auth);
  assert.equal(second.hidiOrderId, first.hidiOrderId); assert.equal(second.captured, true);
  assert.equal(f.state().orders.length, 1); assert.equal(f.state().payments.length, 1);
  assert.equal(f.calls.filter((c) => c.action === "wallet.consume").length, 1);
  assert.equal(f.calls.some((c) => c.action.startsWith("razorpay.")), false);
  assert.equal(f.state().wallet.balancePaise, 100000); assert.equal(f.state().inventory.onHand, 9);
});

test("mixed checkout reserves wallet funds and charges only the exact cash remainder", async () => {
  const f = fixture(); const result = await f.service.prepare(input({ walletPaise: 4000 }), auth);
  assert.equal(result.provider, "RAZORPAY"); assert.equal(result.amountPaise, 196000); assert.equal(result.totalPaise, 200000); assert.equal(result.walletAppliedPaise, 4000);
  assert.equal(f.calls.find((c) => c.action === "razorpay.createOrder")!.input.amountPaise, 196000);
  assert.equal(f.state().payments[0].amountPaise, 196000); assert.equal(f.state().payments[0].status, "CREATED");
  assert.equal(f.state().wallet.balancePaise, 300000); assert.equal(f.state().wallet.reservedPaise, 4000);
  assert.equal(f.state().inventory.onHand, 10); assert.equal(f.state().inventory.reserved, 1);
  assert.equal(f.state().orders[0].userId, "user-1"); assert.equal(f.state().cart.userId, "user-1");
});

test("anonymous wallet use is rejected before any database, wallet or gateway action", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.prepare(input({ walletPaise: 4000, userId: "user-1", authSubject: auth.id, customerEmail: auth.email })), /Sign in/);
  assert.deepEqual(f.calls, []);
});

test("disabled wallet rejects redemption but still permits normal cash checkout", async () => {
  const f = fixture({ enabled: false });
  await assert.rejects(() => f.service.prepare(input({ walletPaise: 4000 }), auth), /not enabled/);
  assert.deepEqual(f.calls, []);
  const result = await f.service.prepare(input(), auth);
  assert.equal(result.amountPaise, 200000); assert.equal(result.walletAppliedPaise, 0);
  assert.equal(f.calls.some((c) => c.action.startsWith("wallet.")), false);
  assert.equal(f.state().orders[0].userId, "user-1");
});

test("disabled wallet still uses the stable verified subject binding when account email changes", async () => {
  const f = fixture({ enabled: false });
  await f.service.prepare(input(), { ...auth, email: "new-email@example.test" });
  assert.equal(f.state().orders[0].userId, "user-1"); assert.equal(f.state().orders[0].customerEmail, "new-email@example.test");
  assert.equal(f.calls.some((c) => c.action === "user.upsert" || c.action === "wallet.ensure"), false);
  assert.deepEqual(f.calls.find((c) => c.action === "walletAccount.findUnique")!.input.where, { authSubject: auth.id });
});

test("disabled wallet cannot attach a verified subject to another subject's email-linked account", async () => {
  const f = fixture({ enabled: false }); f.state().wallet.authSubject = "another-subject";
  await assert.rejects(() => f.service.prepare(input(), auth), /identity requires support review/);
  assert.equal(f.state().orders.length, 0); assert.equal(f.calls.some((c) => c.action.startsWith("razorpay.")), false);
});

test("body-supplied account and wallet identity cannot replace verified auth identity", async () => {
  const f = fixture();
  await f.service.prepare(input({ walletPaise: 4000, userId: "victim-user", authSubject: "victim-subject", walletId: "victim-wallet", customerEmail: "victim@example.test" }), auth);
  assert.equal(f.calls.find((c) => c.action === "wallet.ensure")!.input.id, auth.id);
  assert.equal(f.calls.find((c) => c.action === "wallet.reserve")!.input.walletId, "wallet-1");
  assert.equal(f.state().orders[0].userId, "user-1"); assert.equal(f.state().orders[0].customerEmail, auth.email);
});

test("guest checkout ignores forged body identity and does not attach an account", async () => {
  const f = fixture(); await f.service.prepare(input({ userId: "victim-user", authSubject: auth.id, walletId: "victim-wallet" }));
  assert.equal(f.state().orders[0].userId, null); assert.equal(f.state().cart.userId, null);
  assert.equal(f.calls.some((c) => c.action === "wallet.ensure"), false);
});

test("checkout controller rejects an invalid supplied bearer token instead of falling back to guest", async () => {
  let called = false;
  const controller = new CheckoutController({ prepare: async () => { called = true; } } as any, { requireUser: async () => { throw new Error("Invalid supplied token"); } } as any);
  await assert.rejects(() => controller.prepare(input(), "Bearer invalid"), /Invalid supplied token/);
  assert.equal(called, false);
});

for (const change of [
  { label: "a different cart session", payload: { sessionId: "other-session-12345" }, differentUser: false },
  { label: "a different wallet amount", payload: { walletPaise: 5000 }, differentUser: false },
  { label: "a different account", payload: {}, differentUser: true },
]) {
  test(`checkout-token retry rejects ${change.label} without returning the provider order`, async () => {
    const f = fixture(); await f.service.prepare(input({ walletPaise: 4000 }), auth);
    if (change.differentUser) f.wallet.ensureWallet = async () => ({ id: "wallet-other", userId: "user-other" });
    const gatewayCalls = f.calls.filter((c) => c.action.startsWith("razorpay.")).length;
    await assert.rejects(() => f.service.prepare(input({ walletPaise: 4000, ...change.payload }), change.differentUser ? { ...auth, id: "another-subject", email: "other@example.test" } : auth), /identity or wallet amount changed/);
    assert.equal(f.calls.filter((c) => c.action.startsWith("razorpay.")).length, gatewayCalls);
    assert.equal(f.state().orders.length, 1);
  });
}

test("gateway failure releases wallet and inventory holds and cancels the order idempotently", async () => {
  const f = fixture({ gatewayFailure: true });
  await assert.rejects(() => f.service.prepare(input({ walletPaise: 4000 }), auth), /Gateway unavailable/);
  assert.equal(f.state().orders[0].status, "CANCELLED"); assert.equal(f.state().holds[0].status, "RELEASED");
  assert.equal(f.state().reservations[0].status, "RELEASED"); assert.equal(f.state().wallet.balancePaise, 300000);
  assert.equal(f.state().wallet.reservedPaise, 0); assert.equal(f.state().inventory.reserved, 0); assert.equal(f.state().inventory.onHand, 10);
  assert.equal(f.calls.filter((c) => c.action === "wallet.reverseEarned").length, 1);
  await f.service.releaseOrder("order-1");
  assert.equal(f.calls.filter((c) => c.action === "wallet.release").length, 1);
  assert.equal(f.state().wallet.reservedPaise, 0);
});

test("insufficient wallet or stock rolls back both order creation and wallet reservation", async () => {
  for (const stockFailure of [false, true]) {
    const f = fixture({ balance: stockFailure ? 300000 : 0 });
    if (stockFailure) f.state().inventory.onHand = 0;
    await assert.rejects(() => f.service.prepare(input({ walletPaise: 4000 }), auth), stockFailure ? /remain/ : /Insufficient wallet/);
    assert.equal(f.state().orders.length, 0); assert.equal(f.state().holds.length, 0); assert.equal(f.state().wallet.reservedPaise, 0);
    assert.equal(f.calls.some((c) => c.action.startsWith("razorpay.")), false);
  }
});

test("wallet amount and expected-total validation reject invalid money before gateway creation", async () => {
  for (const changes of [{ walletPaise: -1 }, { walletPaise: 0.5 }, { walletPaise: Number.MAX_SAFE_INTEGER + 1 }, { walletPaise: 2147483648 }, { expectedTotalPaise: 2147483648 }, { walletPaise: 200001 }, { walletPaise: 199950 }, { expectedTotalPaise: 199999 }]) {
    const f = fixture(); await assert.rejects(() => f.service.prepare(input(changes), auth));
    assert.equal(f.state().orders.length, 0); assert.equal(f.calls.some((c) => c.action.startsWith("razorpay.")), false);
  }
});

test("provider order amount or currency mismatch cancels and releases both reservations", async () => {
  for (const provider of [{ id: "provider-order", amount: 196001, currency: "INR" }, { id: "provider-order", amount: 196000, currency: "USD" }]) {
    const f = fixture(); f.razorpay.createOrder = async () => provider;
    await assert.rejects(() => f.service.prepare(input({ walletPaise: 4000 }), auth), /unexpected order amount/);
    assert.equal(f.state().orders[0].status, "CANCELLED"); assert.equal(f.state().wallet.reservedPaise, 0); assert.equal(f.state().inventory.reserved, 0); assert.equal(f.state().payments.length, 0);
  }
});

test("checkout cancelled while awaiting the provider cannot publish a usable payment order", async () => {
  const f = fixture();
  f.razorpay.createOrder = async () => { await f.service.releaseOrder("order-1"); return { id: "provider-order", amount: 196000, currency: "INR" }; };
  await assert.rejects(() => f.service.prepare(input({ walletPaise: 4000 }), auth), /expired before payment was ready/);
  assert.equal(f.state().payments.length, 0); assert.equal(f.state().orders[0].status, "CANCELLED");
  assert.equal(f.state().wallet.reservedPaise, 0); assert.equal(f.state().inventory.reserved, 0);
});

test("a verified customer can adopt the same browser-session cart at purchase", async () => {
  const f = fixture({ ownedCart: "other-user" });
  const result = await f.service.prepare(input({ walletPaise: 4000 }), auth);
  assert.equal(result.provider, "RAZORPAY");
  assert.equal(f.state().orders.length, 1);
  assert.equal(f.state().orders[0].userId, "user-1");
  assert.equal(f.state().cart.userId, "user-1");
  assert.equal(f.state().wallet.reservedPaise, 4000);
});
