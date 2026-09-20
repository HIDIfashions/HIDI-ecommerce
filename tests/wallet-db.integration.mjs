// Run: node --test tests/wallet-db.integration.mjs (Node 24; no live database).
// Requires an already-installed PGlite. This script never downloads dependencies.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const migrationsDir = path.join(repo, "apps/api/prisma/migrations");
const privateTables = ["WalletAccount", "WalletLedger", "WalletHold", "RewardAccrual", "PaymentRefund", "OrderAuditEvent"];

function resolvePGlite() {
  const configured = process.env.HIDI_PGLITE_MODULE;
  if (configured) {
    if (configured.startsWith("file:")) return configured;
    const candidate = path.resolve(configured);
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
    return pathToFileURL(require.resolve(configured, { paths: [repo] })).href;
  }
  try {
    return pathToFileURL(require.resolve("@electric-sql/pglite", { paths: [repo] })).href;
  } catch {
    const installed = path.join(repo, "node_modules/.pnpm/@electric-sql+pglite@0.4.3/node_modules/@electric-sql/pglite/dist/index.js");
    assert.ok(existsSync(installed), "PGlite is not installed. Set HIDI_PGLITE_MODULE to an existing module path; this harness will not install it.");
    return pathToFileURL(installed).href;
  }
}

function identifier(value) {
  assert.match(value, /^[A-Za-z][A-Za-z0-9_]*$/);
  return `"${value}"`;
}

async function insert(connection, table, fields) {
  const keys = Object.keys(fields);
  return connection.query(
    `INSERT INTO ${identifier(table)} (${keys.map(identifier).join(", ")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`,
    Object.values(fields),
  );
}

async function rejectsCode(operation, code, label) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.code, code, `${label}: ${error.message}`);
    return true;
  }, label);
}

test("wallet migration and SQL persistence invariants in isolated PGlite", async (t) => {
  const migrationNames = readdirSync(migrationsDir).filter((name) => existsSync(path.join(migrationsDir, name, "migration.sql"))).sort();
  assert.ok(migrationNames.some((name) => name.endsWith("_wallet_ledger")), "Wallet ledger migration is required; do not pass against the old schema.");
  const { PGlite } = await import(resolvePGlite());
  const db = new PGlite(); // No directory/path: all data exists only in this process.
  await db.waitReady;
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE wallet_public_probe NOLOGIN;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, wallet_public_probe;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO PUBLIC, anon, authenticated;
  `);
  // Deliberately permissive defaults ensure the migrations' REVOKEs are tested,
  // rather than obtaining a misleading pass from already-private fresh tables.
  for (const name of migrationNames) {
    await db.exec(readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8"));
  }
  t.diagnostic(`Replayed ${migrationNames.length} migrations into a fresh in-memory database.`);
  t.diagnostic("PGlite has one connection: conditional SQL/rollback is tested; independent-session contention is NOT tested.");

  async function user(key) {
    const id = `user-${key}`;
    await insert(db, "User", { id, email: `${key}@wallet.example.test`, updatedAt: new Date() });
    return id;
  }
  async function wallet(key, balancePaise = 0, reservedPaise = 0) {
    const userId = await user(key);
    const id = `wallet-${key}`;
    await insert(db, "WalletAccount", { id, authSubject: `subject-${key}`, userId, balancePaise, reservedPaise, updatedAt: new Date() });
    return { id, userId };
  }
  async function order(key, userId = null) {
    const id = `order-${key}`;
    await insert(db, "Order", {
      id, orderNumber: `QA-${key}`, userId, subtotalPaise: 10_000, totalPaise: 10_000,
      customerPhone: "0000000000", shippingAddress: JSON.stringify({ fixture: true }), updatedAt: new Date(),
    });
    return id;
  }
  async function payment(key, orderId) {
    const id = `payment-${key}`;
    await insert(db, "Payment", { id, orderId, amountPaise: 10_000, updatedAt: new Date() });
    return id;
  }
  const ledgerFields = (id, walletId, overrides = {}) => ({ id, walletId, kind: "EARN", deltaPaise: 200, eventKey: `event-${id}`, ...overrides });
  const holdFields = (id, walletId, orderId, overrides = {}) => ({ id, walletId, orderId, amountPaise: 200, expiresAt: new Date(Date.now() + 600_000), ...overrides });
  const accrualFields = (id, walletId, orderId, overrides = {}) => ({ id, walletId, orderId, basisPaise: 10_000, rewardPaise: 200, returnWindowDays: 7, policyVersion: "qa-v1", updatedAt: new Date(), ...overrides });
  const refundFields = (id, paymentId, overrides = {}) => ({ id, paymentId, providerRefundId: `provider-${id}`, amountPaise: 200, processedAt: new Date(), ...overrides });

  await t.test("new wallet schema, indexes and append-only trigger actually exist", async () => {
    const tables = await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])`, [privateTables]);
    assert.equal(tables.rows.length, privateTables.length);
    assert.ok(tables.rows.every((row) => row.relrowsecurity === true));
    const policies = await db.query(`SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1::text[])`, [privateTables]);
    assert.deepEqual(policies.rows, [], "private wallet tables must not gain public policies");
    const triggers = await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid = '"WalletLedger"'::regclass AND NOT tgisinternal AND tgenabled <> 'D'`);
    assert.ok(triggers.rows.some((row) => row.tgname === "WalletLedger_immutable"), "append-only trigger must exist and be enabled");
    const auditTriggers = await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid = '"OrderAuditEvent"'::regclass AND NOT tgisinternal AND tgenabled <> 'D'`);
    assert.ok(auditTriggers.rows.some((row) => row.tgname === "OrderAuditEvent_immutable"), "order audit trigger must exist and be enabled");
    const columns = await db.query(`SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'walletAppliedPaise'`);
    assert.equal(columns.rows.length, 1);
    assert.equal(columns.rows[0].is_nullable, "NO");
    assert.match(columns.rows[0].column_default, /^0/);
  });

  for (const role of ["anon", "authenticated", "wallet_public_probe"]) {
    for (const table of privateTables) {
      await t.test(`${role} cannot SELECT/INSERT/UPDATE/DELETE ${table}`, async () => {
        for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          const grants = await db.query("SELECT has_table_privilege($1, $2, $3) AS allowed", [role, identifier(table), operation]);
          assert.equal(grants.rows[0].allowed, false);
        }
        await db.exec(`SET ROLE ${identifier(role)}`);
        try {
          const statements = [
            `SELECT * FROM ${identifier(table)}`,
            `INSERT INTO ${identifier(table)} DEFAULT VALUES`,
            `UPDATE ${identifier(table)} SET "id" = "id" WHERE false`,
            `DELETE FROM ${identifier(table)} WHERE false`,
          ];
          for (const statement of statements) await rejectsCode(() => db.query(statement), "42501", `${role}: ${statement}`);
        } finally { await db.exec("RESET ROLE"); }
      });
    }
  }

  await t.test("wallet identity is unique by verified subject and customer user", async () => {
    const first = await wallet("identity");
    const secondUser = await user("identity-second");
    await rejectsCode(() => insert(db, "WalletAccount", { id: "wallet-duplicate-subject", authSubject: "subject-identity", userId: secondUser, updatedAt: new Date() }), "23505", "duplicate subject");
    await rejectsCode(() => insert(db, "WalletAccount", { id: "wallet-duplicate-user", authSubject: "new-subject", userId: first.userId, updatedAt: new Date() }), "23505", "duplicate customer wallet");
  });

  await t.test("ledger events, order holds/accruals and provider refunds have idempotency uniqueness", async () => {
    const account = await wallet("idempotency");
    const orderId = await order("idempotency", account.userId);
    const paymentId = await payment("idempotency", orderId);
    await insert(db, "WalletLedger", ledgerFields("ledger-once", account.id));
    await rejectsCode(() => insert(db, "WalletLedger", ledgerFields("ledger-twice", account.id, { eventKey: "event-ledger-once" })), "23505", "same event cannot post twice");
    await insert(db, "WalletHold", holdFields("hold-once", account.id, orderId));
    await rejectsCode(() => insert(db, "WalletHold", holdFields("hold-twice", account.id, orderId)), "23505", "one hold per order");
    await insert(db, "RewardAccrual", accrualFields("accrual-once", account.id, orderId));
    await rejectsCode(() => insert(db, "RewardAccrual", accrualFields("accrual-twice", account.id, orderId)), "23505", "one accrual per order");
    await insert(db, "PaymentRefund", refundFields("refund-once", paymentId));
    await rejectsCode(() => insert(db, "PaymentRefund", refundFields("refund-twice", paymentId, { providerRefundId: "provider-refund-once" })), "23505", "provider refund cannot apply twice");
  });

  await t.test("foreign keys reject orphan wallet records and prevent deletion of audit parents", async () => {
    const account = await wallet("fk");
    const orderId = await order("fk", account.userId);
    await rejectsCode(() => insert(db, "WalletAccount", { id: "orphan-wallet", authSubject: "orphan", userId: "missing-user", updatedAt: new Date() }), "23503", "wallet user FK");
    const cases = [
      ["WalletLedger", ledgerFields("orphan-ledger-wallet", "missing-wallet")],
      ["WalletLedger", ledgerFields("orphan-ledger-order", account.id, { orderId: "missing-order" })],
      ["WalletHold", holdFields("orphan-hold-wallet", "missing-wallet", orderId)],
      ["WalletHold", holdFields("orphan-hold-order", account.id, "missing-order")],
      ["RewardAccrual", accrualFields("orphan-accrual-wallet", "missing-wallet", orderId)],
      ["RewardAccrual", accrualFields("orphan-accrual-order", account.id, "missing-order")],
      ["PaymentRefund", refundFields("orphan-refund", "missing-payment")],
    ];
    for (const [table, fields] of cases) await rejectsCode(() => insert(db, table, fields), "23503", `${table} FK`);
    await insert(db, "WalletLedger", ledgerFields("retained-audit", account.id, { orderId }));
    await rejectsCode(() => db.query('DELETE FROM "WalletAccount" WHERE "id" = $1', [account.id]), "23503", "wallet with audit entries cannot be deleted");
    await rejectsCode(() => db.query('DELETE FROM "Order" WHERE "id" = $1', [orderId]), "23503", "order with audit entries cannot be deleted");
    await rejectsCode(() => db.query('DELETE FROM "User" WHERE "id" = $1', [account.userId]), "23503", "wallet owner cannot be deleted");
  });

  await t.test("wallet/order constraints reject negative reserves, non-INR and invalid applied values", async () => {
    const account = await wallet("amount-checks");
    const orderId = await order("amount-checks", account.userId);
    await rejectsCode(() => db.query('UPDATE "WalletAccount" SET "reservedPaise" = -1 WHERE "id" = $1', [account.id]), "23514", "negative reserved funds");
    await rejectsCode(() => db.query('UPDATE "WalletAccount" SET "currency" = \'USD\' WHERE "id" = $1', [account.id]), "23514", "wrong wallet currency");
    for (const amount of [-1, 10_001]) await rejectsCode(() => db.query('UPDATE "Order" SET "walletAppliedPaise" = $1 WHERE "id" = $2', [amount, orderId]), "23514", "wallet payment bounds");
    const result = await db.query('SELECT "walletAppliedPaise" FROM "Order" WHERE "id" = $1', [orderId]);
    assert.equal(result.rows[0].walletAppliedPaise, 0);
  });

  await t.test("ledger signs and event kinds are checked by PostgreSQL", async () => {
    const account = await wallet("signs");
    for (const [kind, delta] of [["EARN", 200], ["REFUND_REDEEM", 200], ["RETURN_REFUND", 200], ["REDEEM", -200], ["REVERSE_EARN", -200]]) {
      await insert(db, "WalletLedger", ledgerFields(`valid-${kind}`, account.id, { kind, deltaPaise: delta }));
      await rejectsCode(() => insert(db, "WalletLedger", ledgerFields(`bad-sign-${kind}`, account.id, { kind, deltaPaise: -delta })), "23514", `${kind} wrong sign`);
      await rejectsCode(() => insert(db, "WalletLedger", ledgerFields(`zero-${kind}`, account.id, { kind, deltaPaise: 0 })), "23514", `${kind} zero entry`);
    }
    await rejectsCode(() => insert(db, "WalletLedger", ledgerFields("unknown-kind", account.id, { kind: "MANUAL_MAGIC_CREDIT" })), "23514", "unknown entry kind");
  });

  await t.test("hold/accrual/refund amount and state constraints reject invalid persistence", async () => {
    const account = await wallet("states");
    const orderId = await order("states", account.userId);
    const paymentId = await payment("states", orderId);
    for (const override of [{ amountPaise: 0 }, { amountPaise: -1 }, { status: "UNKNOWN" }]) {
      await rejectsCode(() => insert(db, "WalletHold", holdFields("invalid-hold", account.id, orderId, override)), "23514", "hold state/amount");
    }
    for (const override of [{ basisPaise: -1 }, { rewardPaise: -1 }, { returnWindowDays: 0 }, { returnWindowDays: 366 }, { status: "UNKNOWN" }]) {
      await rejectsCode(() => insert(db, "RewardAccrual", accrualFields("invalid-accrual", account.id, orderId, override)), "23514", "accrual policy bounds");
    }
    for (const override of [{ amountPaise: -1 }, { status: "PENDING" }]) {
      await rejectsCode(() => insert(db, "PaymentRefund", refundFields("invalid-refund", paymentId, override)), "23514", "refund state/amount");
    }
    await insert(db, "PaymentRefund", refundFields("zero-cash-refund", paymentId, { amountPaise: 0 }));
    const zero = await db.query('SELECT "amountPaise" FROM "PaymentRefund" WHERE "id" = \'zero-cash-refund\'');
    assert.equal(zero.rows[0].amountPaise, 0, "zero cash refund marker is allowed for wallet-only orders");
  });

  await t.test("ledger is append-only even for the database owner running the backend writes", async () => {
    const account = await wallet("immutable");
    await insert(db, "WalletLedger", ledgerFields("immutable-entry", account.id));
    const before = await db.query('SELECT * FROM "WalletLedger" WHERE "id" = \'immutable-entry\'');
    for (const statement of [
      'UPDATE "WalletLedger" SET "deltaPaise" = 999 WHERE "id" = \'immutable-entry\'',
      'DELETE FROM "WalletLedger" WHERE "id" = \'immutable-entry\'',
    ]) await assert.rejects(() => db.query(statement), (error) => error.code === "P0001" && /append-only/.test(error.message));
    assert.deepEqual((await db.query('SELECT * FROM "WalletLedger" WHERE "id" = \'immutable-entry\'')).rows, before.rows);
    const functionSecurity = await db.query("SELECT prosecdef FROM pg_proc WHERE proname = 'hidi_wallet_ledger_immutable'");
    assert.equal(functionSecurity.rows.length, 1);
    assert.equal(functionSecurity.rows[0].prosecdef, false, "immutability function must not introduce SECURITY DEFINER");
  });

  await t.test("order operations timeline is private, idempotent and append-only", async () => {
    const userId = await user("order-audit");
    const orderId = await order("order-audit", userId);
    const event = {
      id: "audit-order-created",
      orderId,
      eventType: "ORDER_CREATED",
      actorType: "SYSTEM",
      entityType: "ORDER",
      entityId: orderId,
      toStatus: "PENDING_PAYMENT",
      eventKey: "audit:qa:order-created",
      source: "QA",
    };
    await insert(db, "OrderAuditEvent", event);
    await rejectsCode(
      () => insert(db, "OrderAuditEvent", { ...event, id: "audit-order-created-duplicate" }),
      "23505",
      "audit event key idempotency",
    );
    const before = await db.query('SELECT * FROM "OrderAuditEvent" WHERE "id" = \'audit-order-created\'');
    for (const statement of [
      'UPDATE "OrderAuditEvent" SET "eventType" = \'ALTERED\' WHERE "id" = \'audit-order-created\'',
      'DELETE FROM "OrderAuditEvent" WHERE "id" = \'audit-order-created\'',
    ]) await assert.rejects(() => db.query(statement), (error) => error.code === "P0001" && /append-only/.test(error.message));
    assert.deepEqual((await db.query('SELECT * FROM "OrderAuditEvent" WHERE "id" = \'audit-order-created\'')).rows, before.rows);
    await rejectsCode(() => db.query('DELETE FROM "Order" WHERE "id" = $1', [orderId]), "23503", "audited order cannot be deleted");
    const functionSecurity = await db.query("SELECT prosecdef FROM pg_proc WHERE proname = 'hidi_order_audit_immutable'");
    assert.equal(functionSecurity.rows.length, 1);
    assert.equal(functionSecurity.rows[0].prosecdef, false, "audit immutability function must not introduce SECURITY DEFINER");
  });

  await t.test("a failed multi-write transaction rolls back balance, ledger and accrual together", async () => {
    const account = await wallet("rollback");
    const orderId = await order("rollback", account.userId);
    await insert(db, "RewardAccrual", accrualFields("rollback-accrual", account.id, orderId));
    await rejectsCode(() => db.transaction(async (tx) => {
      await tx.query('UPDATE "WalletAccount" SET "balancePaise" = "balancePaise" + 200 WHERE "id" = $1', [account.id]);
      await insert(tx, "WalletLedger", ledgerFields("rollback-first-entry", account.id, { orderId }));
      await tx.query('UPDATE "RewardAccrual" SET "status" = \'CREDITED\', "creditedAt" = CURRENT_TIMESTAMP WHERE "id" = \'rollback-accrual\'');
      await insert(tx, "WalletLedger", ledgerFields("rollback-duplicate-entry", account.id, { eventKey: "event-rollback-first-entry" }));
    }), "23505", "duplicate event aborts entire transaction");
    assert.equal((await db.query('SELECT "balancePaise" FROM "WalletAccount" WHERE "id" = $1', [account.id])).rows[0].balancePaise, 0);
    assert.deepEqual((await db.query('SELECT "id" FROM "WalletLedger" WHERE "walletId" = $1', [account.id])).rows, []);
    const accrual = (await db.query('SELECT "status", "creditedAt" FROM "RewardAccrual" WHERE "id" = \'rollback-accrual\'')).rows[0];
    assert.equal(accrual.status, "PENDING");
    assert.equal(accrual.creditedAt, null);
  });

  await t.test("conditional reservations cannot consume more than the persisted available balance", async () => {
    const account = await wallet("reserve", 1_000);
    async function reserve(amount) {
      return db.query(`UPDATE "WalletAccount" SET "reservedPaise" = "reservedPaise" + $1
        WHERE "id" = $2 AND $1 > 0 AND "balancePaise" - "reservedPaise" >= $1
        RETURNING "balancePaise", "reservedPaise"`, [amount, account.id]);
    }
    assert.equal((await reserve(700)).rows.length, 1);
    assert.equal((await reserve(400)).rows.length, 0, "second request must use remaining funds, not its stale starting balance");
    assert.equal((await reserve(300)).rows.length, 1);
    assert.equal((await reserve(1)).rows.length, 0);
    assert.equal((await reserve(-1)).rows.length, 0);
    const state = (await db.query('SELECT "balancePaise", "reservedPaise" FROM "WalletAccount" WHERE "id" = $1', [account.id])).rows[0];
    assert.deepEqual(state, { balancePaise: 1_000, reservedPaise: 1_000 });
  });

  await t.test("failed hold creation also rolls back its conditional funds reservation", async () => {
    const account = await wallet("hold-rollback", 1_000);
    await rejectsCode(() => db.transaction(async (tx) => {
      const reserved = await tx.query(`UPDATE "WalletAccount" SET "reservedPaise" = "reservedPaise" + 700
        WHERE "id" = $1 AND "balancePaise" - "reservedPaise" >= 700 RETURNING "id"`, [account.id]);
      assert.equal(reserved.rows.length, 1);
      await insert(tx, "WalletHold", holdFields("bad-hold-transaction", account.id, "missing-order"));
    }), "23503", "orphan hold aborts reservation");
    assert.equal((await db.query('SELECT "reservedPaise" FROM "WalletAccount" WHERE "id" = $1', [account.id])).rows[0].reservedPaise, 0);
  });

  await t.test("compensating reversals may preserve debt; business policy clamps spendable, not stored balance", async () => {
    const account = await wallet("debt", 100, 50);
    await db.transaction(async (tx) => {
      await tx.query('UPDATE "WalletAccount" SET "balancePaise" = "balancePaise" - 200 WHERE "id" = $1', [account.id]);
      await insert(tx, "WalletLedger", ledgerFields("debt-reversal", account.id, { kind: "REVERSE_EARN", deltaPaise: -200 }));
    });
    const state = (await db.query('SELECT "balancePaise", "reservedPaise", "balancePaise" - "reservedPaise" AS available FROM "WalletAccount" WHERE "id" = $1', [account.id])).rows[0];
    assert.deepEqual(state, { balancePaise: -100, reservedPaise: 50, available: -150 });
    // This imports the actual pure application policy, rather than hiding debt
    // with a SQL GREATEST() expression in the test or adding an invalid DB CHECK.
    const { spendablePaise } = await import(pathToFileURL(path.join(repo, "apps/api/src/wallet/wallet-policy.ts")).href);
    assert.equal(spendablePaise(state.balancePaise, state.reservedPaise), 0);
    assert.equal(spendablePaise(1_000, 300), 700);
  });
});
