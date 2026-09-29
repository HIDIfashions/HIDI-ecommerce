# HIDI Mobile - Build Specification

Branch: `hidi-mobile-build-from-scratch`
Status: Pre-code contract audit

## Proposed native Android baseline
Derived from the blueprint:
- Kotlin.
- Jetpack Compose + Material 3 foundations with HIDI tokens.
- minSdk 26.
- compileSdk/targetSdk 36 at current blueprint baseline; revalidate at release.
- ViewModels exposing immutable StateFlow.
- Repository data boundary.
- Room for safe browse cache.
- DataStore for preferences.
- Keystore-backed secret/session storage strategy with backup exclusions.
- WorkManager only for eligible sync/reconciliation; never to create unattended payments.

Proposed project location:
- `apps/android/`

Proposed module layout:
- `:app`
- `:core:designsystem`
- `:core:ui`
- `:core:network`
- `:core:data`
- `:core:testing`
- `:feature:identity`
- `:feature:discover`
- `:feature:product`
- `:feature:cart`
- `:feature:checkout`
- `:feature:orders`
- `:feature:account`
- `:feature:support`
- `:benchmark`

No source will be copied from prior Android branches.

## HIDI visual tokens
Blueprint baseline:
- Canvas: `#FAF8F4`
- Berry/action: `#702B42`
- Ink/text: `#2B2427`
- Blush/surface: `#F0E5E8`
- Forest/success: `#4C654D`
- Error: `#A12C3A`
- Caution: `#7A541E`
- Spacing: 4dp base; 20dp compact outer gutter; 12dp grid gap.
- Fields/buttons 8dp radius; cards 12dp; sheet top corners 24dp.
- Product media baseline 3:4.
- 48dp minimum interactive target.

Typography is to use approved/licensed brand equivalents, not a bundled font copied from the blueprint.

## Mobile API access - current real infrastructure
The current HIDI API is internal in Azure. The existing public Next.js proxy is:
- Public: `https://<HIDI_HOST>/api/store/<path>`
- Server forwards to: `INTERNAL_API_URL/<path>`
- NestJS global API prefix: `/v1`

Testing host currently used by HIDI:
- `https://thidigk.thehidi.com`

Production host is intended to be:
- `https://thehidi.com`

Protected customer endpoints use:
- `Authorization: Bearer <Supabase access token>`

Important: there is currently no confirmed Azure API Management gateway, APIM subscription header or APIM route key in the repo/confirmed infrastructure. Do not invent one.

## Existing backend routes that can be wired immediately
All backend routes below are under `/v1`; through the public proxy they become `/api/store/<route>`.

Catalogue:
- `GET /products`
- `GET /products?category=...`
- `GET /products/featured?limit=...`
- `GET /products/best-sellers?limit=...`
- `GET /products/:slug`
- `GET /products/:slug/related?limit=...`

Cart:
- `GET /carts/:sessionId`
- `POST /carts/:sessionId/items`
- `PATCH /carts/:sessionId/items/:itemId`
- `DELETE /carts/:sessionId/items/:itemId`

Checkout:
- `GET /checkout/delivery-serviceability?pin=......`
- `POST /checkout/prepare`
- `GET /checkout/orders?sessionId=...`
- `GET /checkout/confirmation/:orderNumber?sessionId=...`

Payment:
- `POST /payments/razorpay/verify`
- `POST /payments/razorpay/webhook` is server/provider only and must never be called by the Android app.

Authenticated account:
- `GET /account/orders`
- `GET /account/orders/:orderNumber`
- `POST /account/orders/:orderNumber/items/:orderItemId/review`
- `POST /account/orders/:orderNumber/returns`
- `PATCH /account/orders/:orderNumber/returns/:requestId/cancel`

Reviews:
- `GET /reviews/products/:productId`
- Review invitation routes exist, but token invitation submission is not a normal in-app authenticated review path.

Preferences/retention:
- `GET /retention/preferences`
- `PATCH /retention/preferences`
- `POST /retention/events`

Rewards/wallet:
- `GET /rewards/summary`
- `GET /wallet`
These are feature-controlled and must not automatically enable blueprint P1 growth features.

## Blueprint-to-backend gaps to implement or explicitly defer
The blueprint proposes a broader contract than the current backend. Before each phase, the exact API will be reconciled and added backward-compatibly when required.

Known gaps include:
- `/bootstrap`, welcome/content modules and remote update/maintenance config.
- Canonical categories/collections/search/suggestions/facets APIs.
- Wishlist/saved-items server sync and stock alerts.
- Dedicated size-guide/fit endpoints if product payload cannot supply approved data.
- Delivery range/fee/COD eligibility beyond current PIN prepaid serviceability.
- Saved addresses.
- Immutable quote/payment-attempt resources matching the blueprint's generic state model.
- Item-level cancellation endpoint for customers.
- Shipment tracking/split-shipment customer APIs where current order payload is insufficient.
- Return pickup/evidence/refund/exchange APIs required by H071-H081/H128-H131.
- Notification inbox/settings.
- Help/policy/support ticket APIs.
- Privacy export/delete and verified phone/email-change flows.
- Guest-order scoped-access flow.

A UI screen is not considered complete until its authoritative backend/OS/provider contract exists.

## Authentication
Current backend validates Supabase bearer tokens.
Planned Android behavior:
- Supabase phone OTP client flow for authenticated account access.
- Guest browsing/cart remains local/server-session based.
- Verified guest checkout must be designed so verification is purpose-scoped; current backend does not yet expose the full blueprint guest-grant contract.
- OTP values are never persisted.
- Sensitive authenticated cache is partitioned by identity and cleared on logout.

## Payment safety
Current HIDI checkout:
1. Server re-reads current prices.
2. Server locks/reserves stock.
3. Server creates a HIDI `PENDING_PAYMENT` order.
4. Server creates a Razorpay order.
5. Client opens approved Razorpay/provider flow.
6. Server verifies signature + provider payment amount/currency/capture state.
7. Webhook is an independent idempotent confirmation path.

Android must preserve this model while adding explicit pending/reconciliation UI.

## State model
`UiState<T>`
- Loading
- Content(data, freshness, refreshing)
- Empty(reason, action)
- Error(kind, retry, cachedData?)

`MutationState`
- Idle
- Submitting(operationId)
- Succeeded(result)
- Failed(reason)
- Unknown(operationId)

Financial mutation `Unknown` must reconcile before a new attempt is allowed.

## Environments
Planned flavors:
- `dev`: local/fixture backend.
- `staging`: HIDI testing host and real non-production provider setup.
- `prod`: HIDI production host and production provider configuration.

Only public/publishable identifiers belong in build config. Secrets remain server-side/managed.

## Required tests
- Unit: money formatting/allocation display, reducers, retry policy, eligibility mapping, navigation.
- Contract: real API schemas/error mapping.
- UI/instrumented: all P0 journeys with deterministic fixtures.
- Screenshot: H001-H132 reference states at approved tolerances.
- Accessibility: TalkBack, Switch Access, keyboard, 200% text.
- Lifecycle: process death, rotation, provider handoff, background/foreground.
- Network: offline/no cache/stale cache/timeout/packet loss.
- Payments: success/final failure/cancel/unknown/duplicate callback/late success/amount mismatch.
- Security: cross-account denial, expired guest grant, logout isolation, malicious deep link/attachment.

## Build/release outputs
- Debug/internal APK for direct testing.
- Test/release AAB for Play distribution.
- Mapping/symbol files.
- SBOM and artifact checksums.
- Screen-ID test report.
- Exact commit/build/environment record.
- No production deployment or signing change without owner approval.

## Pending owner confirmations
- Gateway: use existing `/api/store/*` public proxy for Android, or supply newly-created APIM details if APIM now exists.
- Final Android application ID/signing owner: retain `com.thehidi.app` or replace it.
- Permission to add missing mobile-facing backend endpoints in this branch while preserving website compatibility.
