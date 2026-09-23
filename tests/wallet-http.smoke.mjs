// Run after building @hidi/api. Uses in-process HTTP injection, never live DB/PG.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const requireApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
requireApi("reflect-metadata");
const { Module, Global } = requireApi("@nestjs/common");
const { NestFactory } = requireApi("@nestjs/core");
const { FastifyAdapter } = requireApi("@nestjs/platform-fastify");
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skippedDirs = new Set(["node_modules", ".git", ".next", "coverage"]);

async function findBuiltFile(fileName, directory = repoRoot) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirs.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findBuiltFile(fileName, fullPath);
      if (nested) return nested;
    } else if (
      entry.isFile() &&
      entry.name === fileName &&
      fullPath.split(path.sep).includes("dist")
    ) {
      return fullPath;
    }
  }
  return null;
}

async function importBuilt(fileName) {
  const found = await findBuiltFile(fileName);
  if (!found) throw new Error(`Built API module not found anywhere under ${repoRoot}: ${fileName}`);
  console.log(`Resolved built module ${fileName}: ${path.relative(repoRoot, found)}`);
  return import(pathToFileURL(found).href);
}

const { PrismaService } = await importBuilt("prisma.service.js");
const { WalletModule } = await importBuilt("wallet.module.js");
const { CheckoutModule } = await importBuilt("checkout.module.js");
const { PaymentsModule } = await importBuilt("payments.module.js");

test("compiled Nest modules wire wallet and checkout HTTP guards without live services", async (t) => {
  const previous = { wallet: process.env.HIDI_WALLET_ENABLED, worker: process.env.HIDI_WALLET_WORKER_ENABLED, key: process.env.ADMIN_API_KEY };
  process.env.HIDI_WALLET_ENABLED = "false";
  process.env.HIDI_WALLET_WORKER_ENABLED = "false";
  process.env.ADMIN_API_KEY = "hidi-isolated-http-test-key";
  let dbCalls = 0;
  const forbidden = () => { dbCalls += 1; throw new Error("HTTP guard test must not query a database"); };
  const fakeDb = { $transaction: forbidden, order: { findUnique: forbidden }, walletAccount: { findUnique: forbidden } };
  class TestDatabaseModule {}
  Global()(TestDatabaseModule);
  Module({ providers: [{ provide: PrismaService, useValue: fakeDb }], exports: [PrismaService] })(TestDatabaseModule);
  class TestRootModule {}
  Module({ imports: [TestDatabaseModule, WalletModule, CheckoutModule, PaymentsModule] })(TestRootModule);
  let app;
  try {
    app = await NestFactory.create(TestRootModule, new FastifyAdapter(), { logger: false, abortOnError: false, rawBody: true });
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const inject = (options) => app.getHttpAdapter().getInstance().inject(options);
    for (const url of ["/v1/wallet/admin/reconcile", "/v1/wallet/admin/orders/example/return-hold", "/v1/wallet/admin/orders/example/refund-wallet-only"]) {
      await t.test("missing admin key denied: " + url, async () => {
        const response = await inject({ method: "POST", url, payload: {} });
        assert.equal(response.statusCode, 401);
        assert.ok(!response.body.includes(process.env.ADMIN_API_KEY));
      });
    }
    await t.test("wallet GET cannot use anonymous or non-Bearer identity", async () => {
      assert.equal((await inject({ method: "GET", url: "/v1/wallet" })).statusCode, 401);
      assert.equal((await inject({ method: "GET", url: "/v1/wallet", headers: { authorization: "Basic invalid" } })).statusCode, 401);
    });
    await t.test("guest wallet spending is rejected by compiled checkout path", async () => {
      const response = await inject({ method: "POST", url: "/v1/checkout/prepare", payload: {
        sessionId: "test-session-123", checkoutToken: "test-checkout-123", walletPaise: 100,
        customerPhone: "9000000000", shippingAddress: { firstName: "Test", line1: "Synthetic address", city: "Test", state: "Test", postalCode: "500001", phone: "9000000000" },
      } });
      assert.equal(response.statusCode, 401);
    });
    assert.equal(dbCalls, 0);
  } finally {
    await app?.close();
    for (const [key, value] of [["HIDI_WALLET_ENABLED", previous.wallet], ["HIDI_WALLET_WORKER_ENABLED", previous.worker], ["ADMIN_API_KEY", previous.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
