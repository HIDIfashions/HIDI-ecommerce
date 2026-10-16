import assert from "node:assert/strict";
import test from "node:test";
import { encodeCode128B } from "../apps/web/lib/code128.js";

test("Code 128B emits the expected symbols and width for AB", () => {
  const encoded = encodeCode128B("AB");
  assert.deepEqual(encoded.symbols, [104, 33, 34, 102, 106]);
  assert.equal(encoded.checksum, 102);
  assert.equal(encoded.width, 77);
  assert.ok(encoded.bars.length > 10);
});

test("Code 128B rejects non-ASCII data", () => {
  assert.throws(() => encodeCode128B("HIDI ₹"), /printable ASCII/);
});
