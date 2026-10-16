import assert from "node:assert/strict";
import { test } from "node:test";
import { clampOrderQuantity, normalizeWhatsAppNumber, productUrl, shareProduct, whatsappOrderUrl } from "./product-sharing.ts";

test("WhatsApp requires a valid international number, never a generic share URL", () => {
  assert.equal(normalizeWhatsAppNumber("+91 (98765) 43210"), "919876543210");
  for (const value of [undefined, "", "00001234567", "1234", "919876543210abc", "+91+9876543210", "1234567890123456"]) {
    assert.equal(normalizeWhatsAppNumber(value), null);
    assert.equal(whatsappOrderUrl({ slug: "a", name: "A", priceText: "₹900" }, value ?? ""), null);
  }
});

test("quantity remains within whole-unit stock, including empty or invalid inventory", () => {
  assert.equal(clampOrderQuantity(3, 2), 2);
  assert.equal(clampOrderQuantity(1, 0), 0);
  assert.equal(clampOrderQuantity(1, -4), 0);
  assert.equal(clampOrderQuantity(0, 5), 1);
  assert.equal(clampOrderQuantity(2.7, 3), 2);
  assert.equal(clampOrderQuantity(4, 2.5), 2);
  assert.equal(clampOrderQuantity(NaN, 3), 1);
  assert.equal(clampOrderQuantity(1, NaN), 0);
});

test("WhatsApp message carries the exact selected SKU, size, colour and quantity", () => {
  const result = new URL(whatsappOrderUrl({
    slug: "olive cotton", name: "Olive Cotton Set", priceText: "₹1,499",
    sku: "HIDI-001-OL-L", color: "Olive", size: "L", quantity: 2,
  }, "+91 9876543210"));
  assert.equal(result.origin, "https://wa.me");
  assert.equal(result.pathname, "/919876543210");
  const message = result.searchParams.get("text");
  assert.match(message, /SKU: HIDI-001-OL-L/);
  assert.match(message, /Unit price shown: ₹1,499/);
  assert.match(message, /Colour: Olive\nSize: L\nQuantity: 2/);
  assert.match(message, /\/products\/olive%20cotton/);
  assert.match(message, /confirm the final price, availability and delivery/);
  assert.doesNotMatch(message, /order confirmed|stock reserved|24×7/i);
});

test("product URLs escape slugs", () => {
  assert.equal(productUrl("a/b?colour=green"), "/products/a%2Fb%3Fcolour%3Dgreen");
});

test("share cancellation is quiet, while unavailable native share falls back to clipboard", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let copied = "";
  const clipboard = { writeText: async (value) => { copied = value; } };
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
      share: async () => { throw new DOMException("Cancelled", "AbortError"); }, clipboard,
    } });
    assert.equal(await shareProduct({ slug: "olive", name: "Olive" }), "cancelled");
    assert.equal(copied, "");
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
      share: async () => { throw new Error("Unsupported"); }, clipboard,
    } });
    assert.equal(await shareProduct({ slug: "olive", name: "Olive" }), "copied");
    assert.equal(copied, "/products/olive");
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    assert.equal(await shareProduct({ slug: "olive", name: "Olive" }), "unsupported");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
});
