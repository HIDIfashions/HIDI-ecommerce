# HIDI Azure migration

Target: Cloudflare -> Azure Container Apps Web -> internal Container Apps API -> Azure SQL. The Web app serves catalogue images from private Azure Blob Storage through `/media/products/...`, allowing Cloudflare to cache public images without making the storage account anonymous. Customer sign-in supports HIDI-owned SMS OTP sessions through MSG91. Activation requires approved DLT sender/content mapping and a server-side MSG91 key. WhatsApp setup is paused.

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
- Checkout, payment/webhook, shipping/admin, return/review submissions, marketing and wallet mutation routes remain blocked. Wallet and review-followup workers are explicitly disabled. At that checkpoint Supabase remained the mobile OTP provider; later WhatsApp OTP app readiness is documented below.
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

## Customer phone OTP app readiness: 2026-09-29 UTC

- Added HIDI-owned customer auth endpoints for phone OTP request/verify, access-token validation, rotating refresh tokens and logout. Firebase Phone Auth is verified server-side by validating Firebase ID tokens against Google's SecureToken certificates before issuing HIDI sessions.
- The storefront account flow now calls `/v1/auth/otp/request`, `/v1/auth/otp/verify`, `/v1/auth/refresh` and `/v1/auth/logout`; it no longer calls Supabase directly for customer phone sign-in. Supabase bearer validation remains as a compatibility fallback for existing admin/staff paths.
- The SQL Server schema defines `CustomerAuthOtp` and `CustomerAuthSession`; deployment must apply and verify the auth migration before sign-in is ready. Refresh sessions preserve the resolved auth subject so existing wallet/retention identities can continue linking after the customer auth migration.
- Production Firebase OTP requires `HIDI_AUTH_SECRET`, `CUSTOMER_OTP_PROVIDER=firebase`, API-side `FIREBASE_PROJECT_ID`, and browser-side `NEXT_PUBLIC_FIREBASE_*` web app config. WhatsApp delivery remains available only as an optional fallback through Meta WhatsApp Cloud API or Twilio when `CUSTOMER_OTP_PROVIDER=whatsapp`.
- Firebase project `hidi-dee0f` now has Web app `HIDI Storefront` and Phone provider enabled. Authorised domains include `thehidi.com`, `www.thehidi.com`, `thidigk.thehidi.com`, and `azure-preview.thehidi.com`. A fictitious Firebase test phone number is configured for no-SMS smoke testing; do not use it as a customer account.
- The existing Azure update script preserves the active OTP provider during image rollout. Use the provider configuration helper for an intentional switch. `HIDI_AUTH_SECRET` must remain configured as a server-side Container App secret/env var.
- `Azure Firebase auth readiness` uses the existing private migration job with an execution-only template override. It applies only the auth migration to `hidi-sql-validation`, verifies columns/indexes/foreign keys and runtime DML permissions, records the migration checksum, and restores the prior SQL administrator. It does not import customer data or change production DNS/database. An always-run recovery step also restores the administrator if setup is interrupted.
- The readiness job preserves an existing signing secret, or creates a server-only Container Apps secret if none exists. Web Firebase values remain compiled into the image and are mirrored in runtime environment configuration. Validation customer testing permits only explicit auth config/request/verify/refresh/logout routes; checkout and payment writes remain blocked.
- Azure image rollout `36652881599` succeeded at commit `4e4bf31`. Auth migration run `36652881598` stopped before database/admin changes because the deployment identity lacks `Microsoft.App/jobs/read` on `job-hidi-validation`. Environment-only setup is now a separate step; the migration still requires an authorized migration operator. No role grants or production database cutover were performed.
- Browser auth and commerce calls using the store proxy now stay on the current storefront origin instead of the compiled production hostname. This keeps validation sign-in on the isolated Azure API while the production domain remains private. The pull-request quality build has an explicit fixture API URL, matching the Azure build's fail-closed server configuration.

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


## Restored approved logo fixes: 2026-09-28

The Azure migration branch predated the Sept 27 storefront logo fixes (source commits 6f71aa9, bd8cc9d and f6668ea on feature/premium-storefront-v1). Header and footer still referenced hidi-logo-gold-inline.svg. Restored the exact approved hidi-logo-header.svg smooth vector asset with readable tagline, switched both references, and ported the original responsive header lockup sizing into the migration branch's existing hotfix.css. No wholesale storefront merge or backend changes were made.

Commit 55ccceee2ad2479c1bf8634120498ddd23e46132 passed Azure build run 36349814341 (source/tests and both containers). Only Web was deployed, ready revision hidi-web--0000006. Live SVG SHA256 matched 8f2e2b8731a3a6088bb281a68d56b3c65ac11745e6d140faf3170e6447d78511. Fresh browser reload confirmed both logos loaded from the new asset: header 176x92 CSS pixels, footer approximately 259x135. Desktop header/footer screenshots verified readable tagline. Responsive CSS restored from source; a separate mobile-device visual check was not completed. Existing unrelated Quality Gate failures remain unresolved.


## Storefront, performance and SEO checkpoint: 2026-09-27 (UTC)

User direction: hold thehidi.com and www. Continue only on thidigk.thehidi.com; keep Razorpay in test mode and skip payment testing. No root/www DNS change, production SQL import, checkout enablement, search submission or production launch was performed.

Restored the remaining approved storefront work from feature/premium-storefront-v1 at 350e8f13: responsive typography, mobile drawer positioning, menu styling, desktop navigation, footer and bag retry. Preserved migration-specific code and the exact smooth SVG logo. Browser verified menus at 320x568, 390x844 and 412x740 using the validation-only menu-layout-check route.

Web image e27ababccc53cb3846710587fb9bb5eac653e4d6 is deployed and ready as hidi-web--0000008. API remains on its prior tested image; database remains hidi-sql-validation and migration safeguards remain enabled. Azure workflow 36351721786 and full Quality Gate 36351725246 both succeeded. All 104 frontend tests pass; TypeScript passes. Stale regression expectations were updated for the approved design, inclusive shipping threshold, extracted delivery component and corrected offer schema. The checkout test harness now supplies the document API. Azure build now runs the frontend regression suite before building containers.

Product-card photos, hover photos and product-page catalogue photos now use Next Image responsive optimization through the existing private-Blob media proxy. Collection image sizes follow the actual three/two/one-column grid. Known migrated media URLs normalize to same-origin paths; unknown remote images retain direct delivery rather than expanding the optimizer allowlist. Representative first product PNG: 1,991,424 bytes original, 25,112 bytes at 640px WebP (98.74% reduction). Same-client requests measured original 0.154s, first transform 0.575s, repeat transform 0.034s. This is one image measurement, not a browser-load or capacity benchmark.

SEO: improved homepage/catalogue titles and descriptions; restored working Contact & Help page; retained canonical URLs, social previews and breadcrumbs; Organization uses the current logo. Product offers now carry each variant's actual SKU, INR price and stock status instead of incorrectly using AggregateOffer for variants. Verified all 16 product schemas against live catalogue detail responses. Checked 26 public pages for title, description, one H1, canonical and noindex. Homepage canonical omits the trailing slash, an equivalent URL. Validation retains noindex in both metadata and HTTP headers. Robots allows crawlers to see noindex, advertises no sitemap in validation, and the validation sitemap contains zero URLs. At an explicitly enabled future production launch, sitemap includes public pages, products and their images. No fabricated ratings, identifiers, delivery times or support phone numbers were added.

Shipping: replaced the nonfunctional product PIN control with a validated, accessible request to the existing same-origin serviceability endpoint, including timeout and unavailable states. Browser confirmed invalid-PIN feedback and a clear unavailable response under the migration guard. No DELHIVERY environment variables are configured on hidi-api. Provider connection remains blocked: automatic approval review rejected inspecting the Google sign-in tab used for Delhivery because explicit account authorization was not clear. No workaround or further sign-in attempt was made. To finish, authorized Delhivery access and verified token, client name, pickup location, seller GSTIN, HSN and parcel details are still needed. Do not create a real shipment during validation.

Launch remains on hold. Before launch: complete shipping provider setup and staging serviceability/manifest checks; configure the actual public support channel (Contact currently links to orders/policies and truthfully says direct details will follow); perform the fresh production migration and separately authorized domain cutover; then verify production indexability and submit the production sitemap using authorized Search Console access. Existing Razorpay test-mode constraint continues to apply.

## HIDIindia.com SEO hardening: 2026-10-07

Added a canonical-domain control for the storefront. Set Web runtime/build environment `HIDI_PRIMARY_DOMAIN=hidiindia.com` when `HIDIindia.com` is the production SEO target. This makes `metadataBase`, canonical URLs, robots host, sitemap URLs and JSON-LD use `https://hidiindia.com/`, and it 308-redirects other configured production hosts to that primary host only when `ALLOW_PUBLIC_DOMAIN=true`.

`hidiindia.com` and `www.hidiindia.com` remain covered by the public-domain launch gate and image optimizer allowlists. Validation/testing hosts continue to stay non-indexable unless the explicit production-domain gate is opened. Local production builds must provide `API_URL` because the production storefront intentionally fails closed without an API origin; the focused SEO tests and TypeScript check pass, and `API_URL=http://127.0.0.1:4000/v1 pnpm --filter @hidi/web build` succeeds.

## MSG91 SMS OTP preparation: 2026-10-09 UTC

The user chose normal SMS for sign-in OTP, reserving WhatsApp for later promotions and updates. At the earlier MSG91 inspection, sender `HIDIND` was mapped to PE ID `1701179068941616531`, and both the SMS and SendOTP template lists were empty. The later Smartping submission below uses the active header `HIDIIN`. Its MSG91 sender mapping and registered PE–TM chain are now verified. DLT content approval and SendOTP template creation still need completion. MSG91's assigned OTP template ID differs from the DLT content template ID.

SMS delivery uses the documented POST SendOTP endpoint, a custom six-digit OTP and five-minute expiry. Only explicit success acknowledgements are accepted; errors/timeouts invalidate the challenge. The browser reads `/auth/config` before sending, so current runtime settings override older Firebase build defaults. Pending HIDI OTPs can finish across a provider rollback. The image-update script preserves the active OTP provider instead of resetting it to Firebase.

Use `node deploy/configure-msg91-auth.mjs --check` in an Azure-authenticated environment after deploying these runtime changes and securely staging `MSG91_AUTHKEY` and `MSG91_SMS_OTP_TEMPLATE_ID`. Preflight performs no writes, checks both apps are ready in Single revision mode, requires the isolated `hidi-sql-validation` database and customer-test guards, and preserves the existing HIDI signing secret and custom MSG91 secret references. Running without `--check` intentionally switches the validation apps to MSG91/SMS. This helper does not perform production database cutover.

No live provider switch has been performed. Before activation is complete, verify real SMS delivery, wrong-code rejection, successful account access, refresh and logout on an authorized HIDI test phone. Keep credentials and received OTPs out of chat and Git. Meta callback and WhatsApp sender work remain outside this SMS rollout.

## MSG91 primary with Firebase fallback: 2026-10-09 UTC

The user explicitly authorised pushing the SMS work and preparing/submitting the DLT content template. MSG91 SMS is the primary provider and Firebase is the fallback, enabled through `CUSTOMER_OTP_FALLBACK_PROVIDER=firebase`. MSG91 success stays on the HIDI SMS verification path. If the sender is unconfigured or rejects/times out, the server authorises a Firebase send after invalidating any created SMS challenge. Invalid phone input, rate limits and database/auth failures do not trigger fallback. The browser invokes the Firebase SDK only for an explicit matching directive and retains the issuing proof type if configuration changes before verification. Every new request checks the primary provider again.

Smartping submission was verified on 2026-10-09 at 15:36 IST: `HIDI_LOGIN_OTP`, Service Implicit, industry category `Consumer goods and automobiles`, English TEXT, active header `HIDIIN`, one OTP variable and five-minute expiry. The exact submitted content is `Your HIDI login OTP is {#var#}. Valid for 5 minutes. Do not share this code.` DLT Template ID is `1777179154039835718`, reference number `11-43PAMV0SWAHH`, and the observed portal status is `Work In Progress`; approval has not occurred. These facts are recorded in `deploy/msg91-dlt-otp-template.json`.

Smartping Registered PE–TM Chain shows `HIDI-MSG91` as `Active`, reference `11-2V26MUP2YJVA`, TM Delivery ID `1302157225275643280` for `WALKOVER WEB SOLUTIONS PRIVATE LIMITED`, chain ID `1715679744263757600`, last updated 01/10/2026 at 10:54 IST. MSG91 sender `HIDIIN` was saved with PE ID `1701179068941616531` and verified available in the `Select Sender ID` dropdown. The SendOTP draft is filled with name `hidi_login_otp`, sender `HIDIIN`, DLT ID `1777179154039835718` and exact content `Your HIDI login OTP is ##OTP##. Valid for 5 minutes. Do not share this code.` `Create` was not clicked: MSG91 instructs that the DLT ID must be approved, while its current status remains `Work In Progress`. After DLT approval, create that SendOTP template and record its assigned MSG91 OTP template ID, which remains unknown and unset.

The existing HIDI Firebase project and browser values remain available. The configuration helper checks that the API Firebase project matches the public build config before writing anything. This source version also preserves the user's latest scanner frontend rollback at remote commit `c86ef21324ef4d7b635b8275f8d4d5de9aef0e2d`, keeping the existing packing backend. Smartping sign-in, DLT submission, PE–TM chain verification and MSG91 sender mapping are now complete. No live authentication settings have changed; live sender activation and real delivery verification remain pending DLT approval, SendOTP template creation and its assigned ID, credentials and an Azure rollout.
