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

Both databases must be created with `Latin1_General_100_BIN2` as the database default collation so Prisma-generated insert table variables match identity columns. Email/search columns have explicit case-insensitive collations. SQL public networking is disabled. SQL and Blob private endpoints have private DNS zones linked to the application VNet. Blob anonymous access and shared-key authentication are disabled. The storage account public network is disabled; application access uses the private endpoint. Blob versions and deleted blobs/containers have 30-day retention.

The API, Web app, migration job, and GitHub build have separate managed identities. The build identity has AcrPush on this registry only; its federated subject is restricted to this exact repository identity and migration branch. Runtime apps do not receive database schema permissions. SQL uses Entra authentication; no SQL password is created.

## Code and validation

- Prisma uses SQL Server and the MSSQL driver adapter. Enums use checked strings; JSON uses validated NVARCHAR JSON with explicit encoding/decoding at service boundaries.
- The baseline preserves nullable unique behavior with filtered indexes, exact-case identifiers/tokens, case-insensitive email searches, business constraints, and immutable wallet/audit events.
- PostgreSQL migrations and the previous Prisma schema remain available for rollback analysis.
- `migrate.mjs` imports into empty tables in one transaction, checks field lengths/types, and compares every source and destination row before committing. It preserves user IDs and Supabase auth subjects.
- `validate-prisma.mjs` exercises real Prisma reads, relationships, nullable unique fields, email/ID comparison, wallet locking, and rollback without retaining synthetic rows.
- `media.mjs` uses an allowlist for public Supabase images and repository product assets. It verifies SHA-256 after copying each image before updating SQL references. One archived source image was already absent in the original repository.
- The API validation setting `MIGRATION_READ_ONLY=true` permits only catalogue/review reads and health checks. The Web setting `DEPLOYMENT_STAGE=validation` adds noindex headers. Checkout and account writes must stay blocked until cutover is complete.
- Both production container builds and all 199 API tests pass in GitHub Actions. The frontend suite has 88 passes and 7 failures; the same seven failures reproduce on the unchanged production source.

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
8. Route Cloudflare to the validated Web origin with strict TLS. Restrict production origin access to Cloudflare so direct requests cannot bypass edge protections. Cache versioned static assets and catalogue media. Bypass cache for auth, account, admin, cart, checkout, payment, and webhook paths. Apply appropriate bot/rate-limit controls while exempting verified provider webhooks from interactive challenges.
9. Enable writes only after confirming the new route and database. A rollback after new SQL writes requires data reconciliation; simply pointing DNS back would lose those new writes.
10. Remove temporary migration privileges and keep private exports restricted. Retain the old database and deployment until the rollback window closes.

Cloudflare origin load balancing across regions requires a second independent deployment; two Web/API containers alone are not two interchangeable origins. Container Apps handles replica distribution and scaling within the environment.

## Verified rehearsal result

On 2026-09-27, execution `job-hidi-validation-xxkxmpl` succeeded against `hidi-sql-validation`:

- SQL baseline installed with matching database/ID collation.
- All 40 tables / 382 rows passed exact row verification before the import committed.
- Real Prisma checks passed: 16 active products with relationships, multiple nullable unique values, case-insensitive emails, case-sensitive identity IDs, wallet insert/row locking, and transaction rollback.
- API runtime permissions were created without DDL permission.
- 48 catalogue images were copied to private Blob Storage and verified by SHA-256 before SQL image references changed. One previously missing archived image retained its old reference.
- The original SQL administrator was restored after the job.

Both deployed applications use image commit `f66c17b322f92829c8ee5ed0d9f1daa29ae77e4c` (Actions run `36330630729`), with ready revisions `hidi-api--0000001` and `hidi-web--0000001`. The manual migration job was reset to its read-only database check command after repair; it no longer has the repair command configured. Both image builds and all 199 API tests passed in GitHub Actions. The extra test verifies exact Razorpay webhook bytes, signature forwarding, and no-store caching.

The first rehearsal exposed a database default-collation mismatch in Prisma's generated insert table variables. Azure SQL cannot alter database collation in place; the corrected databases were created with the required collation and the complete import/check sequence was repeated successfully. The superseded targets `hidi` and `hidi-validation` were deleted after the new deployment passed its checks, avoiding duplicate database charges. The only application databases remaining are `hidi-sql` and `hidi-sql-validation`.


## Runtime identity correction

The first API startup failed SQL login because the contained user SID was derived from the managed identity object ID. Azure SQL service-principal SIDs must use the application/client ID. Repair execution `job-hidi-validation-7ufcq9z` recreated only the runtime SQL user with its client ID, re-applied the same DML grants/append-only restrictions, and restored the original administrator. The checked-in migration now requires `API_CLIENT_ID` and rejects an existing mismatched SID rather than silently retaining it. After restarting the API, Web -> internal API -> SQL readiness returned HTTP 200.

## Preview smoke checks

The isolated preview host is `hidi-web.delightfulstone-4c9a3791.centralindia.azurecontainerapps.io`. The API uses internal ingress only. Both applications scale between one and two replicas after the 2026-09-27 resume verification.

Verified over HTTPS on 2026-09-27:

- Web health and proxied API SQL readiness: HTTP 200.
- Product API: HTTP 200, 16 active products.
- Server-rendered `/collections/all`: HTTP 200.
- Migrated product image through the Web media route: HTTP 200 with `public, max-age=31536000, immutable`. HTTP 200 was verified again after disabling storage public networking, confirming private-endpoint access.
- Validation responses include `X-Robots-Tag: noindex, nofollow`.
- A POST to the cart proxy returns HTTP 503, confirming the migration write guard.

The cloud browser rejected the direct Azure hostname with `ERR_BLOCKED_BY_CLIENT`; these are HTTP-level and Azure runtime checks, not a completed visual browser review. The production domain and old Vercel/Supabase deployment have not been switched. The production `hidi-sql` database remains empty; this preview uses `hidi-sql-validation`. No real OTP, live payment, shipping, admin write, or checkout transaction has been sent during validation.

Before the fresh cutover export is uploaded, use a controlled authenticated upload path to the private migration container. Its public network is now disabled. Do not enable anonymous Blob access or shared keys.

## Resume verification: 2026-09-27 17:08 UTC

- Both apps now have minimum 1 / maximum 2 replicas, preventing scale-to-zero cold starts. Both revision `--0000002` deployments report Succeeded and ready. Application image remains `f66c17b322f92829c8ee5ed0d9f1daa29ae77e4c`.
- Fresh HTTP checks passed for Web health, Web -> API -> SQL readiness, all 16 catalogue products, the rendered collection page, and one migrated Blob image (HTTP 200, immutable public cache header).
- Preview cart POST still returns 503 with no-store; validation writes remain disabled. No live transactions were attempted.
- Azure confirmed SQL and Blob public networking disabled; Blob anonymous/shared-key access disabled; API ingress internal.
- Azure API environment names confirm no Razorpay or Delhivery configuration is present. Production payment/shipping configuration and end-to-end validation remain outstanding.
- Cloudflare dashboard still presents human verification in the cloud browser. No DNS/security/cache cutover was performed. Request manual verification in that same cloud browser before continuing.
- Production final export/import, domain TLS and origin protection, checkout/OTP/webhook checks, and live cutover remain pending. Source remains authoritative; do not import the old rehearsal snapshot as final production data.
