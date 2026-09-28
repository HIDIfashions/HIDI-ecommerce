import assert from "node:assert/strict";
import test from "node:test";
import { migrationPreviewPolicy } from "../apps/api/src/migration-preview.js";

const validation = { MIGRATION_READ_ONLY: "true", MIGRATION_CUSTOMER_TESTING: "true", AZURE_SQL_DATABASE: "hidi-sql-validation" };

test("customer testing fails closed outside the isolated guarded database", () => {
  for (const database of [undefined, "hidi-sql", "hidi-sql-validation-copy"]) {
    assert.throws(() => migrationPreviewPolicy({ ...validation, AZURE_SQL_DATABASE: database }));
  }
  assert.throws(() => migrationPreviewPolicy({ ...validation, MIGRATION_READ_ONLY: "false" }));
});

test("catalogue preview still rejects account reads and all cart writes by default", () => {
  const policy = migrationPreviewPolicy({ MIGRATION_READ_ONLY: "true" });
  assert.equal(policy.allows("GET", "/v1/products?limit=16"), true);
  assert.equal(policy.allows("GET", "/v1/health/ready"), true);
  for (const [method, path] of [["GET", "/v1/account/orders"], ["GET", "/v1/wallet"], ["POST", "/v1/carts/test-session/items"]]) {
    assert.equal(policy.allows(method, path), false);
  }
});

test("customer preview permits account reads and session-scoped cart lifecycle", () => {
  const policy = migrationPreviewPolicy(validation);
  for (const [method, path] of [
    ["GET", "/v1/account/orders"], ["GET", "/v1/account/orders/HIDI-123"],
    ["GET", "/v1/wallet"], ["GET", "/v1/rewards/summary"], ["GET", "/v1/retention/preferences"],
    ["GET", "/v1/carts/test-session"], ["POST", "/v1/carts/test-session/items"],
    ["PATCH", "/v1/carts/test-session/items/item1"], ["DELETE", "/v1/carts/test-session/items/item1"],
  ]) assert.equal(policy.allows(method, path), true, `${method} ${path}`);
});

test("customer preview permits only explicit staff reads behind the existing AdminGuard", () => {
  const policy = migrationPreviewPolicy(validation);
  for (const path of ["me", "staff", "dashboard/overview?from=2026-09-01", "dashboard/queue?kind=returns", "dashboard/search?q=test", "orders", "orders/HIDI-123", "products", "products/options", "products/product-1", "inventory", "inventory/receipts", "inventory/variant-1/history"]) {
    for (const method of ["GET", "HEAD"]) assert.equal(policy.allows(method, `/v1/admin/${path}`), true, `${method} ${path}`);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(policy.allows(method, `/v1/admin/${path}`), false, `${method} ${path}`);
    assert.equal(migrationPreviewPolicy({ MIGRATION_READ_ONLY: "true" }).allows("GET", `/v1/admin/${path}`), false);
  }
});

test("customer preview blocks financial, notification, admin writes and route-confusion requests", () => {
  const policy = migrationPreviewPolicy(validation);
  for (const [method, path] of [
    ["POST", "/v1/checkout"], ["POST", "/v1/payments/razorpay/webhook"],
    ["POST", "/v1/wallet/admin/reconcile"], ["PATCH", "/v1/admin/orders/HIDI-123/status"],
    ["POST", "/v1/admin/orders/HIDI-123/delhivery/manifest"],
    ["GET", "/v1/admin/orders/HIDI-123/delhivery/track"],
    ["GET", "/v1/admin/orders/HIDI-123/delhivery/serviceability"],
    ["POST", "/v1/admin/staff"], ["PATCH", "/v1/admin/returns/test-request"],
    ["GET", "/v1/admin/dashboard/unknown"], ["GET", "/v1/admin/orders/../staff"],
    ["GET", "/v1/admin/orders%2fHIDI-123"], ["GET", "/v1/admin/orders/HIDI-123/"],
    ["POST", "/v1/account/orders/HIDI-123/returns"], ["PATCH", "/v1/retention/preferences"],
    ["POST", "/v1/marketing/newsletter"], ["POST", "/v1/retention/events"],
    ["POST", "/v1/whatsapp/webhook"], ["POST", "/v1/products"],
    ["PUT", "/v1/carts/test-session/items/item1"], ["POST", "/v1/carts/test-session/items/../checkout"],
    ["POST", "/v1/carts/test-session%2f..%2fcheckout/items"], ["POST", "/v1/carts/short/items"],
    ["POST", "/v1/carts/test-session/items/"], ["GET", "/v1/wallet/admin/reconcile?preview=true"],
  ]) assert.equal(policy.allows(method, path), false, `${method} ${path}`);
});

test("normal production behavior is unchanged when migration restrictions are disabled", () => {
  assert.equal(migrationPreviewPolicy({}).allows("POST", "/v1/checkout"), true);
});
