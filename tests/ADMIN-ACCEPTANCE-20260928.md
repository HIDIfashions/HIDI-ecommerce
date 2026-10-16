# HIDI admin deployment and acceptance — 28 September 2026

## Scope and outcome

The existing Azure apps were updated in API-first, web-second order. No infrastructure, database migrations, DNS changes, staff accounts, real orders, shipments or refunds were created. The root/www domain remains held. Razorpay transactions remain excluded as requested.

Release `e91db4b36578ca1acad759d6f1fe9de659c2152b` required two corrections found during acceptance:

- API `a1b0ca64e4408894f2ef3fcd27ea339cba4db5d5`: allow explicitly listed authenticated staff GET/HEAD reporting routes in the existing customer-testing migration mode. The AdminGuard and role permissions remain in force. Carrier operations and transactional mutations remain blocked.
- Web `2a5f9876baa7b361c3fe626404f0c378e763c665`: preserve an upstream 401 on the inventory route. The original web returned 502 with an expired-session message for a forged cookie. It exposed no private records, but failed the correct HTTP-status acceptance check.

The original dashboard web image was deployed successfully before the inventory issue was found. Its corrected successor is now deployed and ready.

| App | Final image tag | Ready revision | Provisioning |
| --- | --- | --- | --- |
| hidi-api | a1b0ca64e4408894f2ef3fcd27ea339cba4db5d5 | hidi-api--0000006 | Succeeded |
| hidi-web | 2a5f9876baa7b361c3fe626404f0c378e763c665 | hidi-web--0000011 | Succeeded |

Both latest revisions equal their latest-ready revisions. Final deployment completed at 00:54:21 UTC in workflow 36363507643. It verified the existing API a1b0ca6 and web e91db4b before updating; the API image was reused and only the corrected web container was built.

## Deployment controls

- GitHub identity has Container Apps Contributor only on the existing hidi-api and hidi-web resource scopes; existing ACR push permission is retained.
- The deployment script verifies both running images, readiness, topology and commit ancestry before changing either app.
- It checks for concurrent image changes immediately before each update.
- It restores only images changed by that run if readiness or deployment checks fail.
- Original successful workflow: 36362417855. Corrected web workflow: 36363507643.

## Existing architecture

The testing-domain web app uses the private existing Azure API at `hidi-api.internal.delightfulstone-4c9a3791.centralindia.azurecontainerapps.io/v1`. The API connects to Azure SQL database `hidi-sql-validation` on `sql-hidi-prod-0927.database.windows.net`. Product media uses the existing private Blob setup in `sthidiprod0927` through the web media/image routes. Existing Supabase authentication remains the identity provider.

This is the validation database, not the held production database. `MIGRATION_READ_ONLY=true` and `MIGRATION_CUSTOMER_TESTING=true` remain enabled. Successful Azure sign-in does not grant HIDI staff access.

## Verified evidence

### Live public entry and media

- `https://thidigk.thehidi.com/admin` renders the protected staff entry instead of 404.
- The staff sign-in page renders the existing secure email-code flow; no account is created by the dashboard.
- Header/footer logo images and four visible featured product images loaded successfully after scrolling the lazy-loaded product section into view.
- API endpoints denied missing and forged authorization on me, orders, products, inventory, dashboard overview, returns queue and global search.
- After the final deployment, all 14 public web requests (seven routes, each with missing and forged sessions) returned 401, including inventory. All 14 direct API access-boundary checks on the unchanged API had also returned 401. No private records were returned.

### Actual SQL records, read-only reporting validation

The deployed AdminDashboardController read methods were compared with independent Prisma reads inside the existing API container. This establishes real-record calculation agreement; it is **not** authenticated browser acceptance and does not substitute for role/sign-in checks.

| IST date range | Qualifying orders | Booked order value | Previous-period value | Result |
| --- | ---: | ---: | ---: | --- |
| 1–28 September 2026 | 20 | ₹64,825 | ₹0 | Pass |
| 18 September 2026 | 0 | ₹0 | ₹4,180 | Pass |
| 19–25 September 2026 | 12 | ₹34,715 | ₹25,440 | Pass |
| 28 September 2026 | 0 | ₹0 | ₹0 | Pass |

Every daily current/previous order count and amount, date-series length and selected-period total matched independently selected rows. Qualifying statuses: CONFIRMED, PACKED, SHIPPED, DELIVERED, RETURN_REQUESTED, RETURNED and REFUNDED. These are booked values, not a claim about collected cash or accounting revenue.

Additional real-record checks passed:

- 24 orders in the unfiltered queue; the empty second page was correct for a 25-row page size.
- PACKED filter returned 2 orders; default deliveries returned 13 eligible orders.
- Order-number queue search found the matching underlying record.
- Low-stock count was 19, independently calculated from active variants/products using available stock and reorder levels.
- There were no ReturnRequest records; the empty active-return queue was expected. Multiple requests within one real order therefore remain unvalidated.

### Automated fixture coverage

Both corrected releases passed 119 frontend/shared checks, 205 API checks and 10 isolated browser checks. The final web source-and-test job 108745218306 passed at 00:50 UTC, including a new BFF assertion for missing and forged inventory sessions. Quality Gate run 36363510071 also succeeded.

The browser suite covers desktop overview, date presets, chart table, daily CSV download, global-search keyboard navigation, deliveries pagination, return-row rendering, empty and error states, catalogue-role UI restrictions, and 390px mobile navigation/table containment. Its records and sessions are isolated fixtures. No live operational lifecycle is certified by those tests.

## Remaining acceptance gates

The database has **zero AdminStaff records** and **no ADMIN_BOOTSTRAP_EMAIL configuration**. An approved owner/staff identity is required before authenticated browser checks can proceed. No identity was inferred from Azure/GitHub or granted a role automatically.

Pending authenticated acceptance: staff sign-in, real-record navigation/AWBs, browser export reconciliation, global-search record navigation, role-by-role access and sign-out. Actual authenticated desktop/mobile tables and transitions also remain pending.

The API has **no Delhivery token**, and no configured Razorpay test key. Wallet and transactional operations remain restricted in migration mode. The controlled order → packing → shipment/tracking → delivery → item return/exchange → refund/wallet lifecycle is pending suitable disposable test records, an approved staff identity and verified test-provider configuration. No real order was repurposed as a disposable test and no live shipment or refund was attempted.

Deployment readiness, fixture tests and read-only SQL reconciliation are complete evidence categories. They do not justify marking the entire operational end-to-end task complete.
