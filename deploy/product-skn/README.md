# Product SKN installation

Each product receives a durable five-digit identifier from 10000 through 99999.
Changing description, colour, size or price keeps the SKN. Variant SKUs, stock
and order snapshots remain unchanged. The additive objects are
`dbo.HidiProductSKN` and `dbo.HidiProductSknSequence`. The mapping has a unique
Product ID, unique `CHAR(5)` SKN, trusted five-ASCII-digit/range check and sequence
default. Product IDs use the actual database default collation; SKN validation
uses binary collation. No global database collation changes are required.

The migration backfills existing products in creation-time/ID order under a
temporary insertion lock, without changing Product columns or existing rows.
The API allocates missing mappings inside Serializable product transactions.
Lazy allocation covers products created by a retained old revision during
rollout. Product creation, variants and mapping commit together; failure rolls
them back together. Sequence values consumed by rollback can leave gaps and
are never recycled. Existing Prisma models and generated clients are retained.

There is no Product foreign key on the mapping table, so archived, tombstoned
or future hard-deleted products retain number reservations. Never delete these
reservations, restart/recycle the sequence or reuse a product ID for a different
product. Five digits support 90,000 reserved codes; exhaustion fails allocation
instead of returning a duplicate. Restoring an old application image leaves the
additive table and reservations in place.

## Read-only private preflight

Capture fresh stable ready API resource JSON privately as
`$HIDI_SKN_PRIVATE_DIR/hidi-api.json`; include `hidi-web.json` to guard both apps.
It must contain the immutable active image and current settings, not an earlier
deployment snapshot. Only the bounded report is exported.

```bash
export HIDI_SKN_PRIVATE_DIR="$RUNNER_TEMP/hidi-product-skn-private"
export HIDI_SKN_SCHEMA_REPORT="evidence/product-skn/schema-ddl.json"
python3 deploy/product-skn/schema-check.py --checkDdl
```

The check connects through the retained API revision and existing managed
identity over the private network. It compares application state before and
after execution and never opens SQL publicly. It returns booleans, aggregate
counts and database/settings hashes; no product contents, tokens, identity
names, private configuration or terminal transcript are emitted. Taxonomy
readiness is checked separately.

`--checkDdl` succeeds when inspection finishes even if `ddlAuthorized=false` or
`featureReady=false`; these are findings. DDL capability needs existing database
CREATE TABLE and dbo schema ALTER, without Product ALTER. Sequence creation is
a schema permission: CREATE SEQUENCE, ALTER or CONTROL on dbo authorizes it;
DATABASE CREATE SEQUENCE is not a valid permission scope.
The retained API identity is intentionally DML-only. An existing authorized SQL
owner must apply the migration if that identity lacks DDL. Do not add runtime
schema grants, change the SQL Entra administrator or expose SQL networking as
a workaround.

## Owner migration and backups

Verify the captured database/server in the existing owner session. Confirm the
database is online and save a **fresh** PITR checkpoint: observation time,
earliest restore point and enabled retention policy. The restore point must
precede the migration. The saved seven-day checkpoint from 2026-10-10 08:47 UTC
is historical evidence only; image/source backups do not back up SQL.

Retain the source backup commit, immutable API/web rollback images, fresh SQL
checkpoint and `sha256sum deploy/product-skn/migration.sql`. An existing owner
executes that exact complete file against the freshly verified captured database
through an already authorized private SQL route. The file manages its own
transaction; do not split it or wrap it in an unrelated transaction. It verifies
the existing baseline, serializes attempts, installs/backfills additive objects
and preserves Product columns. Partial or incompatible existing objects fail
without repair, sequence restart, identity changes or permission grants.

Save the bounded final result and owner verification of the value check/default
definitions. Runtime DML metadata can hide definitions; the report then sets
`ownerDefinitionVerificationRequired=true`, requiring separate owner evidence
before activation. This migration never widens metadata visibility.

The guarded CLI can execute the migration only when the **existing retained
private identity already has effective DDL permission** and a fresh successful
SQL PITR checkpoint is available. It never grants that permission. Checkpoint
JSON must contain `passed: true`, `readOnly: true`, `databaseOnline: true`,
`databaseHash`, `apiImage`, `apiSettingsHash`, `pitrRetentionDays`,
`earliestRestoreDateUtc` and `capturedAtUtc`. The database/app hashes must match
the fresh capture; retention must be enabled, the restore point must precede
the checkpoint, and the checkpoint must be no more than 15 minutes old.

```bash
export HIDI_SKN_SQL_CHECKPOINT="evidence/product-skn/sql-checkpoint.json"
export HIDI_SKN_MIGRATION_SHA256="$(sha256sum deploy/product-skn/migration.sql | cut -d ' ' -f 1)"
export HIDI_SKN_SCHEMA_REPORT="evidence/product-skn/owner-migration.json"
python3 deploy/product-skn/schema-check.py --migrate-owner
```

The helper checks the reviewed file hash locally and in the private runtime,
rechecks DDL rights and checkpoint freshness immediately before execution,
applies the complete transaction and verifies the installed default/check
definitions. Its bounded owner evidence includes `definitionsVerified: true`,
`ownerSchemaHash`, `migrationSha256`, PITR proof hash, database hash and app
capture binding. A DML identity's later read-only report includes
`expectedOwnerSchemaHash`; matching verified owner evidence resolves hidden
definitions without adding VIEW DEFINITION grants. The main release must take
fresh image backups before invoking owner mode.

Refresh the captured ready resource JSON after installation, then run:

```bash
export HIDI_SKN_SCHEMA_REPORT="evidence/product-skn/schema-ready.json"
python3 deploy/product-skn/schema-check.py --verify
```

`--verify` fails if columns, indexes, trusted check, sequence default/bounds,
runtime SELECT/INSERT, product coverage, valid values or capacity is missing.
The release also requires owner definition evidence when visibility is restricted
and separate taxonomy checks. An old application can briefly create unmapped
products during rollout; the new transactional allocator handles these safely.

### Resume after an external SQL-owner installation

After an existing SQL owner applies the exact migration and verifies its trusted
value check and sequence default, rerun **Product SKN and photo mapping guarded
Azure release** with `workflow_dispatch`. If the runtime cannot see those
definitions, supply `owner_definition_report` as a JSON object with exactly these
eight fields:

```json
{
  "passed": true,
  "definitionsVerified": true,
  "databaseHash": "<schema-ready.json databaseHash>",
  "ownerSchemaHash": "<schema-ready.json expectedOwnerSchemaHash>",
  "migrationSha256": "<sha256sum of the exact installed migration.sql>",
  "apiImage": "<schema-ready.json apiImage>",
  "apiSettingsHash": "<schema-ready.json apiSettingsHash>",
  "verifiedAtUtc": "<owner verification time, UTC ISO 8601 ending Z>"
}
```

The SQL owner must verify the captured database and installed definitions before
attesting. Copy the target fields from the latest bounded `schema-ready.json`
artifact; they must match the new capture. This is an owner verification receipt,
not a way to supply permissions. The receipt expires after 24 hours, is limited
to 8,192 UTF-8 bytes, and rejects mismatched hashes, extra or duplicate fields.
The release imports it with `release.py owner-evidence`, checks it again before
rollout, and prepares only missing taxonomy references. It does not grant
runtime DDL or change SQL authentication/networking. A failed schema check still
blocks activation regardless of the receipt.

User steps and photo filename examples are in [USAGE.md](USAGE.md).

## Disposable regression

The test creates/drops random databases only on `127.0.0.1`. Azure and other hosts
are refused; no Blob/provider/live-app writes occur.

```bash
export SKN_TEST_SQL_HOST=127.0.0.1
export SKN_TEST_SQL_PASSWORD=Disposable-CI-Only_2026!
pnpm --filter @hidi/api build
node tests/product-skn.sqlserver.mjs
```

For a local metadata/proof guard check without starting SQL Server, the same
script supports `--metadata-only` with the loopback fixture environment.

Use the existing CI SQL Server service pattern:

```yaml
services:
  sqlserver:
    image: mcr.microsoft.com/mssql/server:2022-latest
    env:
      ACCEPT_EULA: Y
      MSSQL_SA_PASSWORD: Disposable-CI-Only_2026!
    ports: [1433:1433]
env:
  SKN_TEST_SQL_HOST: 127.0.0.1
  SKN_TEST_SQL_PASSWORD: Disposable-CI-Only_2026!
```

The regression covers ordered backfill, reinstall, concurrent same/different
Product ID allocation, actual retained Prisma/service creation, replay,
archive/hard-delete reservations, failed variants and transaction rollback,
ASCII/range/uniqueness constraints, DML-only runtime permissions, capacity
exhaustion, incompatible schema rejection and migration rollback.
