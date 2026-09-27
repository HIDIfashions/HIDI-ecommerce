# HIDI admin operations workspace

Design: https://www.figma.com/design/hmDmdI8lTnFnInMX9PoYiZ
Base: migration/azure-sql-blob, 41c0876cfe25a41a06146e47d718f5343e36b53b.

## Scope
A protected, responsive /admin workspace with original HIDI logo, the current mulberry/gold/ivory palette, sales comparisons, all-time action queues, real paginated order/delivery/return views, daily and current-page CSV exports, keyboard global search, and role-filtered navigation. Existing product, inventory, receiving, import, customer and staff pages are retained inside the shell. Order detail mutations, shipment booking/tracking, returns/exchanges, original-source/wallet refunds and audit trails remain in their existing controllers. No automatic financial or shipping action is introduced. Staff creation is deliberately left to the owner.

## Reporting contract
All money is integer paise; presentation is INR. Date bounds are IST calendar days, inclusive start/exclusive end, maximum 90 days. Booked value includes tax/shipping after discount, includes returned/refunded orders before refunds, and excludes pending-payment, payment-review and cancelled orders. It is not net accounting revenue, cash collected, profit or carrier settlement. Historical values follow the current order status. Cash refunds are measured by processedAt, not order date, and exclude wallet credits. Comparisons are equal-length calendar periods; today is incomplete. Missing days are zero-filled. Work queues, low stock and recent orders are all-time views, independent of reporting dates.

SQL Server aggregates cast integers to bigint before SUM. Totals do not depend on the eight-row recent-order preview. SQL values use tagged parameters. Database/schema/infrastructure are unchanged. No Redis, search cluster, chart service or new third-party dependency is required by the application.

## Access
The Next.js BFF forwards the existing server-side admin session to the existing Nest AdminGuard. Overview requires order:read and inventory:read; queues require order:read. Global search restricts orders/customers to OWNER, OPERATIONS and SUPPORT. CATALOG queries products only. Staff management stays owner-only. BFF responses are private/no-store and noindex. Search is debounced and cancellable; failed requests never render invented data. Native dialogs provide keyboard focus containment. Motion respects reduced-motion preferences. CSV escapes formulas.

## Verification
- `node --test tests/admin-dashboard.test.cjs`: deterministic reporting/controller/security/CSV tests with a mocked database.
- Existing full source tests, API compilation and Next.js production compilation run in the Azure workflow.
- `tests/admin-workspace.browser.mjs`: isolated Playwright UI fixtures plus real local BFF missing/forged-session checks. Screenshots and server logs are CI artifacts. These do not certify real-money payment/refund or live carrier operations.
- No test logs in to a real staff account, creates users, alters inventory, books a shipment, issues a refund or writes live orders.

## Existing-resource release
The existing Azure workflow builds immutable API/web images in acrhidiprod0927. Pull requests run validation only; no Azure login or deployment occurs. A push/merge commit containing `[deploy-admin]` additionally updates only existing hidi-api and hidi-web in rg-hidi-prod. The script first reads both resources, refuses missing/unsettled or complex canary resources, preserves configuration, and changes application image tags only (plus existing revision traffic for simple multiple-revision mode). It restores its own images on failed readiness or HTTP verification and refuses to overwrite another deployment. The existing OIDC identity must already have the needed permissions; this work does not create identities or grant roles.

Validation is exclusively thidigk.thehidi.com. No root-domain DNS flip or new resource provisioning is included. An unauthenticated/forged-token 401 is an access-boundary test, not a substitute for authenticated live-data acceptance. The dashboard connects to existing operational records after an approved staff member signs in.

## Design notes
Figma samples are explicitly illustrative and never inserted into app data. Native website typography remains Helvetica Neue / Segoe UI / Arial. Figma does not provide those fonts in this account, so editable preview text uses Arimo; original logo vector contours are preserved. Web CSS is scoped to the admin workspace and does not restyle the storefront.
