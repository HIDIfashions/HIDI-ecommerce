import assert from "node:assert/strict";
import test from "node:test";
import { CartsService } from "../apps/api/src/carts/carts.service.js";

function fixture(overrides: { target?: any; existing?: any; item?: any; failDelete?: boolean } = {}) {
  const source = { id: "item-m", cartId: "cart-1", productId: "product-1", variantId: "variant-m", quantity: 2, variant: { color: "Ivory" } };
  const target = overrides.target === null ? null : { id: "variant-l", productId: "product-1", color: "Ivory", active: true, pricePaise: 179900, product: { status: "ACTIVE" }, inventory: { onHand: 8, reserved: 1, safetyStock: 1 }, ...overrides.target };
  let items: any[] = [source, ...(overrides.existing ? [overrides.existing] : [])];
  const writes: any[] = [];
  const db: any = {
    cart: { findUnique: async () => ({ id: "cart-1", sessionId: "session-1", currency: "INR", items: items.map(item => ({ ...item, product: { id: "product-1", slug: "test", name: "Test", images: [] }, variant: { ...(item.variantId === target?.id ? target : { id: "variant-m", pricePaise: 149900, inventory: target?.inventory, color: "Ivory" }), images: [], size: item.variantId === "variant-l" ? "L" : "M" } })) }) },
    cartItem: {
      findFirst: async (input: any) => { assert.deepEqual(input.where, { id: "item-m", cart: { sessionId: "session-1" } }); return "item" in overrides ? overrides.item : source; },
      findUnique: async (input: any) => { assert.deepEqual(input.where, { cartId_variantId: { cartId: "cart-1", variantId: "variant-l" } }); return overrides.existing ?? null; },
      update: async (input: any) => { writes.push(input); items = items.map(item => item.id === input.where.id ? { ...item, ...input.data } : item); },
      delete: async (input: any) => { if (overrides.failDelete) throw new Error("Transaction failure"); items = items.filter(item => item.id !== input.where.id); },
    },
    productVariant: { findUnique: async () => target },
  };
  db.$transaction = async (callback: (tx: any) => Promise<void>, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    const original = structuredClone(items);
    try { await callback(db); } catch (error) { items = original; throw error; }
  };
  return { service: new CartsService(db), writes, items: () => items };
}

test("cart size edit preserves quantity and uses the target server price", async () => {
  const f = fixture();
  const cart = await f.service.changeSize("session-1", "item-m", "variant-l");
  assert.equal(cart.itemCount, 2); assert.equal(cart.subtotalPaise, 359800);
  assert.deepEqual(f.writes[0].data, { variantId: "variant-l", quantity: 2, unitPricePaise: 179900 });
});
test("existing target size merges once without losing items", async () => {
  const f = fixture({ existing: { id: "item-l", variantId: "variant-l", quantity: 1 } });
  const cart = await f.service.changeSize("session-1", "item-m", "variant-l", 2);
  assert.equal(cart.items.length, 1); assert.equal(cart.itemCount, 3); assert.equal(cart.subtotalPaise, 539700);
});
test("same-size edit does not double the current quantity", async () => {
  const f = fixture({ target: { id: "variant-m" } });
  await f.service.changeSize("session-1", "item-m", "variant-m");
  assert.equal(f.items()[0].quantity, 2);
});
test("size editing cannot access another cart session", async () => {
  const f = fixture({ item: null });
  await assert.rejects(() => f.service.changeSize("session-1", "item-m", "variant-l"), /Cart item not found/);
  assert.equal(f.writes.length, 0);
});
test("invalid, inactive, wrong-product and wrong-colour targets do not change the old size", async () => {
  for (const target of [{ active: false }, { productId: "other-product" }, { color: "Wine" }, { product: { status: "DRAFT" } }, { inventory: null }, { inventory: { onHand: 1, reserved: 0, safetyStock: 0 } }]) {
    const f = fixture({ target });
    await assert.rejects(() => f.service.changeSize("session-1", "item-m", "variant-l"));
    assert.equal(f.writes.length, 0); assert.equal(f.items()[0].variantId, "variant-m");
  }
});
test("merged quantity must fit both available inventory and the per-size limit", async () => {
  for (const quantity of [5, 9]) {
    const f = fixture({ existing: { id: "item-l", variantId: "variant-l", quantity } });
    await assert.rejects(() => f.service.changeSize("session-1", "item-m", "variant-l"), /enough stock/);
    assert.equal(f.writes.length, 0);
  }
});
test("invalid quantities and malformed variant IDs fail before writes", async () => {
  for (const quantity of [0, -1, 11, 1.5, NaN]) {
    const f = fixture();
    await assert.rejects(() => f.service.changeSize("session-1", "item-m", "variant-l", quantity));
    assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  await assert.rejects(() => f.service.changeSize("session-1", "item-m", ""));
});
test("failed merge rolls back and preserves the original bag", async () => {
  const f = fixture({ existing: { id: "item-l", variantId: "variant-l", quantity: 1 }, failDelete: true });
  await assert.rejects(() => f.service.changeSize("session-1", "item-m", "variant-l"), /Transaction failure/);
  assert.equal(f.items().length, 2); assert.equal(f.items()[0].variantId, "variant-m"); assert.equal(f.items()[1].quantity, 1);
});
test("a deleted target variant cannot remove the original size", async () => {
  const f = fixture({ target: null });
  await assert.rejects(() => f.service.changeSize("session-1", "item-m", "deleted"));
  assert.equal(f.writes.length, 0); assert.equal(f.items()[0].variantId, "variant-m");
});
test("reserved and safety stock are excluded even when on-hand stock looks sufficient", async () => {
  for (const inventory of [{ onHand: 5, reserved: 4, safetyStock: 0 }, { onHand: 5, reserved: 2, safetyStock: 2 }, { onHand: 1, reserved: 2, safetyStock: 1 }]) {
    const f = fixture({ target: { inventory } });
    await assert.rejects(() => f.service.changeSize("session-1", "item-m", "variant-l"), /enough stock/);
    assert.equal(f.writes.length, 0);
  }
});
test("invalid sessions and non-string variant IDs cannot write", async () => {
  const f = fixture();
  for (const session of ["", "short", "x".repeat(129)]) await assert.rejects(() => f.service.changeSize(session, "item-m", "variant-l"), /Invalid cart session/);
  for (const id of [null, 1, {}, []]) await assert.rejects(() => f.service.changeSize("session-1", "item-m", id as any), /variantId is required/);
  assert.equal(f.writes.length, 0);
});
