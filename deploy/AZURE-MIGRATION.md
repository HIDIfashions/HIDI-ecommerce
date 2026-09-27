# HIDI Azure migration

Target: Cloudflare -> Azure Container Apps Web -> internal Container Apps API -> Azure SQL. The Web app serves catalogue images from private Azure Blob Storage through `/media/products/...`, allowing Cloudflare to cache public images without making the storage account anonymous. Supabase Auth remains the OTP provider. MSG91 is deferred.

## Resources

Subscription: `91d9572d-0f0b-47fe-802d-0eef36d7c719`; resource group: `rg-hidi-prod`; region: Central India.

| Resource | Name |
| --- | --- |
| SQL server | sql-hidi-prod-0927 |
| Production database | hidi-sql |
| Isolated validation database | hidi-sql-validation |
| Storage account | sthidiprod0927 |
| Media container | product-media |
| Private migration backup container | migration-private |
| Container Apps environment | cae-hidi-prod |
| Registry | acrhidiprod0927 |
| Logging workspace | log-hidi-prod |
| Key Vault | kv-hidi-prod-0927 |
| VNet | vnet-hidi-prod |

Both databases must be created with `Latin1_General_100_BIN2` as the database default collation so Prisma-generated insert table variables match identity columns. Email/search columns have explicit case-insensitive collations. SQL public networking is disabled. SQL and Blob private endpoints have private DNS zones linked to the application VNet. Blob anonymous access and shared-key authentication are disabled. Blob versions and deleted blobs/containers have 30-day retention.

The API, Web app, migration job, and GitHub build have separate managed identities. The build identity has AcrPush on this registry only; its federated subject is restricted to this exact repository identity and migration branch. Runtime apps do not receive database schema permissions. SQL uses Entra authentication; no SQL password is created.

## Code and validation

- Prisma uses SQL Server and the MSSQL driver adapter. Enums use checked strings; JSON uses validated NVARCHAR JSON with explicit encoding/decoding at service boundaries.
- The baseline preserves nullable unique behavior with filtered indexes, exact-case identifiers/tokens, case-insensitive email searches, business constraints, and immutable wallet/audit events.
- PostgreSQL migrations and the previous Prisma schema remain available for rollback analysis.
- `migrate.mjs` imports into empty tables in one transaction, checks field lengths/types, and compares every source and destination row before committing. It preserves user IDs and Supabase auth subjects.
- `validate-prisma.mjs` exercises real Prisma reads, relationships, nullable unique fields, email/ID comparison, wallet locking, and rollback without retaining synthetic rows.
- `media.mjs` uses an allowlist for public Supabase images and repository product assets. It verifies SHA-256 after copying each image before updating SQL references. One archived source image was already absent in the original repository.
- The API validation setting `MIGRATION_READ_ONLY=true` permits only catalogue/review reads and health checks. The Web setting `DEPLOYMENT_STAGE=validation` adds noindex headers. Checkout and account writes must stay blocked until cutover is complete.
- Both production builds pass locally and 198 API tests pass locally and in GitHub Actions. The frontend suite has 88 passes and 7 failures; the same seven failures reproduce on the unchanged production source.

Run `deploy/azure-validate.sh` from an authenticated Azure CLI session after the referenced API image is available. It temporarily assigns the migration identity as SQL Entra administrator and restores the original owner with an EXIT trap. Do not leave the migration identity as administrator after running manual recovery commands.

## Build

`Azure migration build` checks out the complete repository (including original assets), runs the API tests/build, and builds both Docker images on GitHub-hosted runners. Azure registry-side Tasks are denied for this subscription; ordinary image publishing works through scoped GitHub OIDC authentication. Images use full commit SHA tags. No production deployment occurs automatically.

`deploy/public-auth.json` contains only the existing Supabase URL and browser-safe publishable key. It contains no service-role or provider secret.

## Production cutover gates

1. Complete SQL import rehearsal and application smoke checks on the isolated database.
2. Confirm all production payment, shipping, admin, webhook, and feature configurations. The inspected Vercel API configuration listed the Supabase settings and DATABASE_URL; payment/shipping credentials were not present there. Do not claim live payment validation without those credentials.
3. Obtain working Cloudflare access. Its dashboard presented a persistent security verification challenge in this cloud browser. No DNS, WAF, caching, or load-balancer changes have been made.
4. Preserve the existing public-domain privacy gate (`ALLOW_PUBLIC_DOMAIN`). Changing infrastructure must not silently reopen a private store.
5. Freeze writes on every old API entry point, including admin, background jobs, checkout, and provider webhooks; take a fresh coherent snapshot. The rehearsal snapshot is not a cutover snapshot.
6. Import the fresh snapshot into the production `hidi-sql` database, verify exact rows, copy/verify media, configure the runtime principal, and restore the owner as SQL administrator.
7. Set runtime API URLs to the internal Azure API. Configure signed webhook forwarding and provider callback URLs. Forward raw request bytes and required signature headers; never cache webhooks.
8. Route Cloudflare to the validated Web origin with strict TLS. Cache versioned static assets and catalogue media. Bypass cache for auth, account, admin, cart, checkout, payment, and webhook paths. Apply appropriate bot/rate-limit controls while exempting verified provider webhooks from interactive challenges.
9. Enable writes only after confirming the new route and database. A rollback after new SQL writes requires data reconciliation; simply pointing DNS back would lose those new writes.
10. Remove temporary migration privileges and keep private exports restricted. Retain the old database and deployment until the rollback window closes.

Cloudflare origin load balancing across regions requires a second independent deployment; two Web/API containers alone are not two interchangeable origins. Container Apps handles replica distribution and scaling within the environment.

## Rehearsal result so far

The baseline was installed in `hidi-sql-validation` and all 40 tables / 382 rows passed exact row verification before the import transaction committed. The validation-only fixture was corrected from `PUBLISHED` to the application's actual product status `ACTIVE`. A further Prisma driver check is being diagnosed before application deployment. The original SQL administrator was restored automatically after each completed attempt.

A synthetic webhook proxy test now verifies byte-for-byte Razorpay payload forwarding, signature-header forwarding, and `no-store` caching. The expanded local API suite has 199 passing tests.
