# Wallet database integration checks

## Run

From the repository root, using Node 24 and the already-installed PGlite:

```sh
node --test tests/wallet-db.integration.mjs
```

The harness first tries the installed `@electric-sql/pglite` package, then the
existing pnpm store entry for version 0.4.3. If it lives elsewhere, supply an
existing module entry path:

```sh
HIDI_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node --test tests/wallet-db.integration.mjs
```

It never installs packages, reads `DATABASE_URL`, connects to a live database,
contacts payment/WhatsApp providers, or persists database files. Every run uses
a fresh in-memory PostgreSQL-compatible PGlite instance and closes it afterward.

The harness requires a `_wallet_ledger` migration and the actual wallet tables,
order column and enabled append-only trigger. It fails rather than skipping or
passing against the older pre-wallet schema.

## Actual coverage

The initial run replayed all seven migrations successfully and passed 27
subtests plus their parent test (28 tests reported by Node).

- RLS is enabled on all five new wallet tables, with no client policies.
- `anon`, `authenticated` and a role relying only on `PUBLIC` each receive
  permission-denied errors for SELECT, INSERT, UPDATE and DELETE: 60 actual
  denied statements. The harness deliberately grants permissive default table
  privileges **before** applying migrations, so this checks that the migration
  revocations work, not merely that a fresh PostgreSQL install happens to be
  private already.
- Verified-subject/customer wallet uniqueness and ledger event, order hold,
  order accrual and provider-refund idempotency constraints are exercised.
- Foreign keys reject missing users, wallets, orders and payments. Audit parent
  deletions are restricted.
- PostgreSQL checks reject negative reserves, wrong currency, invalid wallet
  order amounts, incorrect ledger signs/kinds, invalid hold/accrual states and
  invalid refund amounts. The zero-cash refund marker remains permitted.
- Existing ledger rows cannot be updated or deleted, even through the database
  owner used for backend-style fixture writes. The trigger function is not
  `SECURITY DEFINER`.
- A failed multi-write transaction rolls back account balance, appended ledger
  entries and accrual state together. A failed hold insert also rolls back its
  funds reservation.
- Sequential competing conditional reservation updates cannot reserve beyond
  persisted available funds. Reversals can preserve negative stored balances;
  the actual application `spendablePaise` policy clamps customer-spendable funds
  to zero without discarding the debt from persistence.

## Explicit limits

PGlite exposes a **single connection**. These tests do not prove independent
session row locking, serializable contention/retries, deadlock handling,
distributed worker races, multiple payment webhooks or production performance.
Those require an authorized disposable PostgreSQL staging database and separate
service/concurrency tests.

Most statements intentionally test database invariants directly; they are not
the complete NestJS/Prisma checkout, wallet, refund or maturity services. The
debt-clamping check imports the real pure wallet policy, but no HTTP routes,
authentication middleware or provider callbacks are exercised by this harness.
It does not establish that live data has been migrated or that wallet redemption
is enabled. The append-only check covers UPDATE/DELETE guards, not protection
against a privileged administrator deliberately dropping or truncating tables.

Keep these results separate from UI/visual sign-off in `STOREFRONT-QA.md` and
from service-level wallet tests.
