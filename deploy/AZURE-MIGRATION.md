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
- The API validation setting `MIGRATION_READ_ONLY=true` defaults to catalogue/review reads and health checks. The explicit isolated customer-test exception is documented below. The Web setting `DEPLOYMENT_STAGE=validation` adds noindex headers. Checkout and account writes must stay blocked until cutover is complete.
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
- Cloudflare dashboard still presents human verification in the cloud browser. No production DNS/security/cache cutover was performed. The persistent challenge loop has been reported; do not retry or bypass it in this browser.
- Production final export/import, domain TLS and origin protection, checkout/OTP/webhook checks, and live cutover remain pending. Source remains authoritative; do not import the old rehearsal snapshot as final production data.

## Custom preview domain verified: 2026-09-27

The user added DNS-only CNAME `azure-preview.thehidi.com` to the generated Web app hostname and TXT `asuid.azure-preview.thehidi.com`. Both records were verified from Azure Cloud Shell before binding.

- Azure hostname `azure-preview.thehidi.com` is bound with `SniEnabled` to managed certificate `mc-cae-hidi-prod-azure-preview-th-3008`.
- Verified browser URL: `https://azure-preview.thehidi.com/collections/all`. Home and catalogue render; all 16 products are listed and visible product images have loaded successfully from the same-origin Blob media route.
- API `WEB_ORIGIN` now equals `https://azure-preview.thehidi.com`; Web `MEDIA_PUBLIC_BASE_URL` equals `https://azure-preview.thehidi.com/media`. Both runtime updates succeeded.
- Fresh HTTPS checks returned 200 for Web health, proxied SQL readiness, product list (16), catalogue HTML and migrated PNG media. Media retains immutable public cache headers; API retains private/no-store. Validation noindex headers remain present.
- Preview cart POST returned 503 with the catalogue-only message, confirming write protection. This does not validate authenticated customer journeys or payments.
- Source Vercel project `hidi-ecommerce-api-96rn` has only DATABASE_URL, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY under Project; Shared reports no linked variables. Payment/shipping secrets have not been omitted from that source configuration during migration; they are not configured there either.
- Keep preview CNAME DNS-only for managed-certificate issuance and renewal. Production Cloudflare proxy/origin certificate design must be completed separately.
- The bootstrap `azure-preview.sh` still describes initial creation on the generated hostname. Do not recreate existing apps from it after domain binding; use `az containerapp update` to preserve custom domains and the runtime origin values above.
- Main domains and source production data remain unchanged. Final coherent production export/import, configured payment/shipping providers, authenticated flow checks, load testing and coordinated live-domain cutover remain outstanding.

## Limited customer testing deployed: 2026-09-27

- User confirmed all 16 preview products are visible and asked to proceed.
- API image `fea024cd74b9bad97d636b357008f7b1f948afa3`, Actions run `36338395730`, is deployed as healthy running revision `hidi-api--0000004`. Web stays on the previously verified `f66c17b322f92829c8ee5ed0d9f1daa29ae77e4c` image; no Web code changed.
- `MIGRATION_READ_ONLY=true` plus `MIGRATION_CUSTOMER_TESTING=true` permits cart lifecycle and authenticated account/order/wallet reads only. Startup fails if this mode targets any database except `hidi-sql-validation` or if the migration guard is disabled. Controller authentication and ownership checks remain active.
- Checkout, payment/webhook, shipping/admin, return/review submissions, marketing and wallet mutation routes remain blocked. Wallet and review-followup workers are explicitly disabled. Supabase remains the mobile OTP provider; no MSG91 change.
- All 204 API tests and both container builds passed. The separate Quality Gate still reports the same 7 pre-existing frontend test failures (88 pass); this is not a fully green production release.
- HTTPS smoke checks passed against Web -> private API -> Azure SQL: 16 products; cart creation/add, merge duplicate variant, subtotal, quantity update, invalid quantity rejection, session isolation, cross-session item rejection, item removal; missing and invalid bearer tokens rejected with 401; checkout/payment/admin/wallet writes blocked with 503. Synthetic cart items were removed; empty validation carts may remain.
- Browser verified Aara Sage Work Kurta M add-to-bag and quantity 1 -> 2, with total INR 2,580 and complimentary shipping displayed. Screenshot `hidi-azure-bag-tested.jpg` records this result.
- Existing account screen offers mobile OTP. Positive authenticated orders/wallet verification still requires the user's secure test-account sign-in. No successful OTP/login is claimed.
- Production remains on its previous origin. Payment/shipping credentials, final fresh export/import, production TLS/origin restrictions, load validation and coordinated DNS cutover remain pending.

## Authenticated preview checks: 2026-09-28 IST

- Customer mobile sign-in completed through the existing Supabase flow. Fresh browser evidence shows the authenticated account with two migrated orders / three pieces. An order-detail page displayed its existing packed/paid state, correct line item and totals. No order or payment was created.
- The Web Dockerfile did not accept `NEXT_PUBLIC_WALLET_ENABLED`, leaving wallet UI hidden. Added an explicit build argument (default false); the Azure workflow now passes true. The API keeps `HIDI_WALLET_ENABLED=false`, its migration route guard, and workers disabled, so this change displays recorded balances without enabling redemption or credits.
- Both images built successfully in Actions run `36344553424` at commit `aa3734b0c52dadad361e3a55f90bd4a798d12a8e`; Web is deployed as revision `hidi-web--0000004`. API stays on `fea024cd74b9bad97d636b357008f7b1f948afa3` / `hidi-api--0000004`.
- After reloading the deployed Web, the authenticated session persisted. Overview wallet panel and `/account/rewards` successfully show recorded, pending and reserved amounts (all zero for this test account), with redemption explicitly paused. Screenshot `hidi-azure-account-verified.jpg` captures the authenticated overview.
- Bounded read concurrency check from Azure Cloud Shell: 40 HTTPS requests alternating catalogue and readiness, four workers, 40/40 HTTP 200; median 159.5 ms, p95 414 ms, max 502 ms. This is a smoke test, not production capacity certification.
- Attempt to list Key Vault secret metadata was denied with `ForbiddenByRbac`; the signed-in owner lacks a vault data-plane role. No grants were added and no secrets were read. Provider credential inventory is therefore unverified beyond the already inspected application settings.
- Razorpay India merchant login is open in browser tab 18. A stale indexed Login action was rejected by automatic approval review as unselected Google authentication. A read-only DOM check established the actual India Login link; semantic navigation then opened the method-selection page without authenticating. Secure-form inspection later timed out, so merchant login requires a manual handoff. No provider keys were generated/rotated and no merchant/payment settings were changed.
- Production gates still include provider credentials and test-mode checkout/shipping/webhooks, unresolved pre-existing frontend Quality Gate failures, production Cloudflare TLS/origin routing, and the final coherent export/import and coordinated cutover.

## User-directed scope update: 2026-09-28 01:17 IST

- User explicitly requested skipping Razorpay testing and stated Razorpay is used in test mode only. Do not request Razorpay login or run payment tests unless the user reopens that step. Do not switch Razorpay to live mode.
- Razorpay test-mode status is user-reported; no merchant configuration or configured keys have been verified by this agent. Azure checkout remains disabled, and skipped payment validation must not be represented as a pass.
- Continue next with Delhivery configuration, then remaining migration work. Delhivery One is open at its existing-account login; connected application settings inspected so far contain no Delhivery credentials.


## Testing-domain move and latency check: 2026-09-28

The user requested moving the testing domain `thidigk.thehidi.com` to Azure. This is a validation-domain switch, not a production database cutover. User updated the CNAME and TXT record in Cloudflare; public DNS verified the direct Azure Web FQDN and exact verification ID. Keep this managed-certificate CNAME DNS-only for issuance and renewal.

Same-client sequential HTTP checks from Azure Cloud Shell (five samples per route): Vercel catalogue API total ms [2604,1747,1728,1700,1715], Azure [153,271,100,90,122]; Vercel Shop All HTML [2232,2006,2072,1961,1964], Azure [186,161,149,206,138]. Median API 1728 vs 122 ms; median HTML 2006 vs 161 ms. These are server HTTP timings from one location, not browser Core Web Vitals or capacity certification. Vercel direct API three samples 2478,1876,1866 ms localize much of the old delay to its upstream backend path; application/database attribution remains unprofiled.

The first catalogue image is an unoptimized 1,991,424-byte PNG. Azure first request took 3319 ms, repeat requests 101 and 117 ms; do not attribute the first-request delay to a specific component without profiling. Responsive image variants and first-request media overhead remain performance follow-ups.

Completed: Azure managed certificate `mc-cae-hidi-prod-thidigk-thehidi--4091` bound with SniEnabled. Both preview and testing hostnames remain bound. Web SITE_URL is `https://thidigk.thehidi.com`; MEDIA_PUBLIC_BASE_URL is `https://thidigk.thehidi.com/media`. API WEB_ORIGIN allows `https://thidigk.thehidi.com,https://azure-preview.thehidi.com`. Ready revisions `hidi-web--0000005` and `hidi-api--0000005` match latest; application images unchanged.

Post-switch verification: TLS-valid HTTPS requests to /healthz, /api/store/health/ready, /api/store/products and /collections/all all returned 200. Products count 16, no x-vercel-id, validation noindex headers present, API private/no-store preserved. Three timed catalogue API requests took 117,179,292 ms; Shop All HTML 283,194,195 ms. Fresh browser navigation rendered the 16-style catalogue with images. Existing product records may retain the Azure preview media host; both hosts serve the same Azure Web and Blob media. Production root/www DNS and production database cutover remain pending. Razorpay testing remains skipped per user; checkout and payment writes still disabled by migration guard.
