import test from "node:test";
import assert from "node:assert/strict";
import { ProductInputError, parseVariantEdit } from "../apps/api/src/admin/products/product-input.ts";

const base = {
  pricePaise: 169900,
  mrpPaise: 199900,
  weightGrams: 420,
  active: true,
  expectedUpdatedAt: "2026-09-26T00:00:00.000Z",
};

test("HIDI Fit accepts verified variant measurements in millimetres", () => {
  const result = parseVariantEdit({
    ...base,
    bustMm: 1016,
    waistMm: 965,
    hipMm: 1067,
    shoulderMm: 381,
    sleeveLengthMm: 559,
    garmentLengthMm: 1143,
  });

  assert.equal(result.bustMm, 1016);
  assert.equal(result.waistMm, 965);
  assert.equal(result.hipMm, 1067);
  assert.equal(result.shoulderMm, 381);
  assert.equal(result.sleeveLengthMm, 559);
  assert.equal(result.garmentLengthMm, 1143);
});

test("HIDI Fit keeps measurements optional for existing products", () => {
  const result = parseVariantEdit(base);
  assert.equal(result.bustMm, null);
  assert.equal(result.waistMm, null);
  assert.equal(result.hipMm, null);
  assert.equal(result.shoulderMm, null);
  assert.equal(result.sleeveLengthMm, null);
  assert.equal(result.garmentLengthMm, null);
});

test("HIDI Fit rejects implausible garment measurements", () => {
  assert.throws(
    () => parseVariantEdit({ ...base, bustMm: 9999 }),
    (error: unknown) => error instanceof ProductInputError && /Garment bust/.test(error.message),
  );
});
