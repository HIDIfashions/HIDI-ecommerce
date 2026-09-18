# Customer experience and retention: implementation status

This change improves storefront interactions, adds disabled-by-default retention
previews, and implements a real **feature-gated rewards wallet**. When enabled
after staging acceptance, wallet code can credit, reserve, redeem and reverse
store credit. No live balances, payments, migrations or messages were changed
during implementation. WhatsApp automation is deferred.

## Delivered in this branch

| Area | Implemented | Not yet live / remaining |
| --- | --- | --- |
| HIDI Standard | Brand-level copy and up to four distinct catalogue styles; collection CTA | Visual approval on the deployed storefront |
| Product contact | WhatsApp SVG, keyboard-accessible modal, selected SKU/colour/size/quantity, fresh stock and price checks, sharing | Configure the real HIDI number; this opens a customer enquiry, not a confirmed order |
| Reviews | Larger accessible guidance and submission controls; no empty star score; verified badges only when supplied by API | Review emails remain governed by the existing separate review-follow-up settings |
| Retention preferences | Independent optional personalization/WhatsApp consent, audit trail, withdrawal, verified-phone enforcement | Phone-verification enrollment UI; current email sign-in does not verify a phone |
| Behaviour signals | Signed-in, consent-gated product views after 30 visible seconds and size selections | Anonymous visitors cannot be contacted or retroactively identified |
| Reminder policy | Protected dry-run eligibility preview with suppression and frequency rules | No outbound transport, delivery worker, Meta templates or STOP webhook |
| Rewards wallet | Immutable ledger, seven-day maturity, reserved funds, full/split wallet checkout, reversals and full-refund restoration | Staging/provider acceptance; partial-return allocation, birthday promotion and offer stacking remain separate |

The header is unchanged. Checkout/payment code now integrates wallet funding
while retaining guest cash checkout. Customer
authentication now requires a verified email; phone verification comes only from
Supabase Auth's top-level confirmed phone, never editable user metadata. Late
token refreshes cannot restore a logged-out account or overwrite another session.

## Safe configuration

Examples in the root environment templates leave all new features disabled.
Copy only the relevant variables into the existing application environments.

| Variable | Application | Default / purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER` | Web, build-time public | Empty disables ordering contact; use international digits only |
| `NEXT_PUBLIC_RETENTION_ENABLED` | Web, build-time public | `false`; enables preference UI and consent-gated tracking only |
| `RETENTION_ENABLED` | API | `false`; enables tracking and dry-run preview, never sending |
| `HIDI_REWARDS_PREVIEW_ENABLED` | API | `false`; enables authenticated estimate endpoint only |
| `HIDI_REWARD_RETURN_WINDOW_DAYS` | API | 7 in examples; controls only the old illustrative preview |
| `HIDI_WALLET_ENABLED` | API | `false`; enables real enrollment, earning and redemption |
| `HIDI_WALLET_WORKER_ENABLED` | API | `false`; optional bounded once-per-minute maturity processing |
| `NEXT_PUBLIC_WALLET_ENABLED` | Web, build-time public | `false`; wallet account panel and checkout controls |

The owner confirmed seven days after delivery and no percentage redemption cap.
The real wallet snapshots that versioned policy. Earning is based on merchandise
after discounts and wallet tender; shipping and separately recorded tax are
excluded. Final customer terms must describe this basis and partial-return holds.

Never put `ADMIN_API_KEY`, a database password, or a messaging secret in a
`NEXT_PUBLIC_` variable. There is deliberately no switch that enables sending.
Changing a public variable requires rebuilding the web app.

The migrations add four private retention tables and five wallet/refund tables
with foreign keys, indexes, check constraints, RLS and no grants to `PUBLIC`,
`anon` or `authenticated`. Ledger updates/deletes are rejected; corrections use
compensating entries. Access is through the server's existing Prisma
database connection. Generate Prisma types after the schema change. Apply
migrations to staging first using the established migration workflow; no live
database migration was performed as part of this coding change.

## API contract

Paths below are relative to the existing `/v1` API prefix.

- `GET /retention/preferences`: bearer-authenticated preferences, masked phone,
  feature state, consent version and `sendingEnabled: false`.
- `PATCH /retention/preferences`: accepts explicit boolean choices plus the
  current consent version. No caller-provided customer ID or phone. Withdrawal
  is allowed even while disabled, deletes the profile's browsing events and
  cancels queued delivery records.
- `POST /retention/events`: authenticated `DETAIL_VIEW` or `SIZE_SELECT` for an
  active product and optional matching variant. Requires current personalization
  consent; disabled/anonymous/no-consent requests do not become browsing history.
- `GET /retention/admin/preview`: private `x-admin-key` authorization, paginated
  dry-run decisions, no raw phone/email and no transport. Never call this from
  customer browser code or expose the admin secret.
- `GET /rewards/summary`: verified-account preview; disabled returns 404. Always
  `mode: PREVIEW` and `spendablePaise: 0`. Estimates are not lifetime balances.
- `GET /wallet`: verified-account real balance, reserved/available/pending/held
  amounts and latest ledger history. Read-only; never credits on a GET.
- `POST /wallet/admin/reconcile`: protected, bounded maturity/reversal pass.
- `POST /wallet/admin/orders/:orderNumber/return-hold`: protected support action
  to block/reverse earning, without issuing a cash refund.
- `POST /wallet/admin/orders/:orderNumber/refund-wallet-only`: protected full
  refund for orders funded entirely by rewards, requiring reason/reference.
- `POST /checkout/prepare`: supports optional verified bearer identity,
  `walletPaise` and `expectedTotalPaise`. Fully wallet-paid orders complete
  without Razorpay. All amounts are validated on the server.

## Reminder policy and limitations

The proposed dry-run policy waits at least 24 hours after meaningful activity:
a size selection or repeated views separated by 30 minutes. Account-owned carts
take priority. It rechecks current price and available stock, requires current
dual consent and verified phone, suppresses duplicate episodes and purchases,
caps marketing sends at two per rolling seven days, limits delivery eligibility
to 09:00–20:00 Asia/Kolkata, and includes a stable 10% holdout. Activity older
than seven days is ineligible. These are implementation defaults for approval,
not evidence of improved conversion or CAC.

Purchase suppression uses linked account orders and unclaimed orders matching
the trusted verified account email, case-insensitively. It never claims orders.
New authenticated checkout binds the order and current cart to the verified
account. Historical guest/session-only carts, unrelated-email purchases and
local-only wishlist state cannot be safely correlated. Identity/wishlist
reconciliation and send-time checks still require testing before a sender exists.

Event collection has five-minute deduplication and a daily cap; large preview
inputs fail closed for manual review. Old events are pruned for active profiles,
but a global scheduled purge is still required to remove inactive profiles'
expired browsing data. Consent audit retention/access policy also needs approval.

## Required before live messaging or wallet launch

1. Approve customer-facing consent wording, privacy/retention terms, reminder
   cadence and reward rules. WhatsApp recipients need a verified number and
   explicit WhatsApp marketing permission, not merely an account or page view.
2. Implement phone enrollment/verification, approved Meta marketing templates,
   signed inbound webhook handling, STOP/unsubscribe and human escalation.
3. Implement a durable queue with atomic claims, idempotency, retries/backoff,
   provider delivery reconciliation, shared marketing caps, global data purge,
   monitoring and a kill switch. Recheck consent, purchases, stock and price at
   actual send time. Verify sender/withdrawal race handling.
4. Build the separate commerce assistant and human handoff if 24/7 ordering
   support is required. An enquiry button is not that assistant.
5. Validate the implemented wallet on staging, including real PostgreSQL
   multi-session contention, Razorpay TEST capture/refund fixtures and deployed
   scheduler operation. Seven-day release and no percentage cap are confirmed.
   Finalize terms for earning basis, partial returns and offer stacking;
   birthday/anniversary discounts remain unimplemented. Multi-shipment accruals
   fail closed pending item-level reconciliation. See
   `apps/api/src/wallet/README.md` for operational limits and activation steps.
6. Stage a small consented cohort and measure incremental repeat purchases and
   contribution margin against holdout, along with unsubscribe/complaint rate.
   Lower CAC is a business objective, not a guaranteed result of these changes.

## Verification and release checklist

Use Node 24 and the repository's pinned pnpm/dependencies. After generating
Prisma types with the normal project environment:

```sh
pnpm test:customer-experience
pnpm --filter @hidi/api exec tsc --noEmit
pnpm --filter @hidi/web exec tsc --noEmit
pnpm --filter @hidi/web exec next build --webpack
node --test tests/wallet-db.integration.mjs
pnpm test:wallet-http
```

The regression suite covers confirmed identity, refresh/logout races, consent
withdrawal and tracking races, reminder decisions, account-scoped estimates,
wallet arithmetic/holds/refunds, checkout, support operations, workers,
storefront HTML/CSS contracts and sharing. Tests use mocks, not live customer
messages, orders or payments. `tests/storefront-fixture-server.mjs` is an optional
synthetic catalogue for local UI checks only; do not deploy it.

The final local run passed 171 API tests, 68 web/storefront tests, 28 isolated
database tests and six compiled HTTP guard tests (273 total, including parent
test cases). API and web production builds passed. In this environment the
test commands were run directly with Node and the installed build binaries;
the pnpm wrapper attempted dependency reinstallation, which was not allowed to
replace the shared dependency directories. The HTTP guards use a fake database
provider and exercise real compiled Nest modules, not live services.

All seven migrations were applied to isolated PostgreSQL-compatible PGlite.
Wallet tests cover role denials, immutability, constraints, rollback and
reservation bounds. PGlite uses one connection: this does not test independent
session contention or replace staging PostgreSQL acceptance.

Before merging/releasing:

- Confirm desktop/mobile layout, image crops, empty and populated reviews.
- Test modal keyboard focus, Escape/backdrop close, colour/size synchronization,
  sold-out variants, changed stock/price, quantity limits and share cancellation.
- Check the real WhatsApp recipient and message contents without placing an
  unintended order. Missing/invalid recipient must stay disabled.
- Check consent persistence/withdrawal, logout/account switching and disabled
  flags on staging, with no notifications sent.
- Verify regular cart, checkout/payment and post-purchase flows in TEST mode.
- Apply the migration on staging and verify the server connection's privileges.

Production build, type checks, policy/unit tests and HTTP server-rendering checks
were available in the coding environment. Browser access to the local preview
was blocked, so visual and interactive browser QA remains outstanding. No live
site deployment, customer notification or live wallet activation is claimed.
