# Customer experience and retention: implementation status

This change improves storefront interactions and adds disabled-by-default
retention and reward **previews**. It does not deploy a WhatsApp bot, send a
customer message, create spendable rewards, or modify checkout pricing.

## Delivered in this branch

| Area | Implemented | Not yet live / remaining |
| --- | --- | --- |
| HIDI Standard | Brand-level copy and up to four distinct catalogue styles; collection CTA | Visual approval on the deployed storefront |
| Product contact | WhatsApp SVG, keyboard-accessible modal, selected SKU/colour/size/quantity, fresh stock and price checks, sharing | Configure the real HIDI number; this opens a customer enquiry, not a confirmed order |
| Reviews | Larger accessible guidance and submission controls; no empty star score; verified badges only when supplied by API | Review emails remain governed by the existing separate review-follow-up settings |
| Retention preferences | Independent optional personalization/WhatsApp consent, audit trail, withdrawal, verified-phone enforcement | Phone-verification enrollment UI; current email sign-in does not verify a phone |
| Behaviour signals | Signed-in, consent-gated product views after 30 visible seconds and size selections | Anonymous visitors cannot be contacted or retroactively identified |
| Reminder policy | Protected dry-run eligibility preview with suppression and frequency rules | No outbound transport, delivery worker, Meta templates or STOP webhook |
| Rewards | Read-only estimates: 2 points per complete INR 100; 1 point = INR 1 | No wallet balance, credit ledger, redemption, expiry, offer stacking or birthday promotion |

Existing header and payment/checkout implementation are unchanged. Customer
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
| `HIDI_REWARD_RETURN_WINDOW_DAYS` | API | Empty; estimates held until approved whole days, 1–365, are supplied |

Never put `ADMIN_API_KEY`, a database password, or a messaging secret in a
`NEXT_PUBLIC_` variable. There is deliberately no switch that enables sending.
Changing a public variable requires rebuilding the web app.

The migration adds four private retention tables with foreign keys, indexes,
event-type constraints, RLS enabled, and no grants to `PUBLIC`, `anon` or
`authenticated`. Application access is through the server's existing Prisma
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
Guest/session-only carts are not silently attached to accounts. Orders using a
different email, guest sessions, and local-only wishlist state cannot be safely
correlated. Secure cart/order identity linking and wishlist/event reconciliation
must be completed and tested before any sender is enabled.

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
5. Approve reward basis, tax/shipping/discount treatment, return window,
   redemption limits, offer stacking, expiry and birthday rules. Implement a
   transaction-safe credit/debit/reversal ledger and checkout reservations with
   authoritative payment/refund and item-level fulfillment reconciliation.
   See `apps/api/src/rewards/README.md` for preview limitations.
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
```

The regression suite covers confirmed identity, refresh/logout races, consent
withdrawal and tracking races, reminder decisions, account-scoped estimates,
reward arithmetic/holds and product sharing. Tests use mocks, not live customer
messages, orders or payments. `tests/storefront-fixture-server.mjs` is an optional
synthetic catalogue for local UI checks only; do not deploy it.

All migrations were additionally applied to isolated PostgreSQL-compatible
PGlite and the new tables checked for RLS/public-role denial. This supplements,
but does not replace, a staging migration on the actual database version.

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
site deployment, customer notification or spendable wallet activation is claimed.
