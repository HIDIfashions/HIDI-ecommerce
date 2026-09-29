const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("../apps/web/node_modules/typescript");
const moduleValue = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../apps/web/lib/checkout-phone.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { module: moduleValue, exports: moduleValue.exports, Date });
const { localMobileDigits, localOtpDigits, validLocalMobile, proofMatches } = moduleValue.exports;

test("phone entry limits to ten local digits and normalizes a pasted +91 number", () => {
  assert.equal(localMobileDigits("+91 98765-43210"), "9876543210");
  assert.equal(localMobileDigits("919876543210"), "9876543210");
  assert.equal(localMobileDigits("9876543210123"), "9876543210");
  assert.equal(localMobileDigits("98a76"), "9876");
  assert.equal(validLocalMobile("9876543210"), true);
  for (const phone of ["987654321", "98765432100", "1234567890", "98765 3210"]) assert.equal(validLocalMobile(phone), false);
});
test("OTP allows only six digits; leading zeros are preserved", () => {
  assert.equal(localOtpDigits("01 23x45"), "012345");
  assert.equal(localOtpDigits("1234567"), "123456");
});
test("proof is valid only for the exact current phone, unexpired and with the opaque grant format", () => {
  const now = Date.now(), phone = "+919876543210", token = "11111111-2222-4333-8444-555555555555." + "a".repeat(43);
  const proof = { phone, token, expiresAt: new Date(now + 1000).toISOString() };
  assert.equal(proofMatches(proof, phone, now), true);
  assert.equal(proofMatches(proof, "+919876543211", now), false);
  assert.equal(proofMatches(proof, phone, now + 1000), false);
  assert.equal(proofMatches({ ...proof, token: "verified" }, phone, now), false);
  assert.equal(proofMatches({ ...proof, expiresAt: "bad" }, phone, now), false);
  assert.equal(proofMatches(null, phone, now), false);
});
