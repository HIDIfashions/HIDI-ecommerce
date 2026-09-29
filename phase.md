# HIDI Mobile - Phase Plan

Branch: `hidi-mobile-build-from-scratch`
Status: Planning/contract audit
Source of truth: `HIDI_Mobile_App_Development_Blueprint.pdf` (V1.0, 27 Sep 2026)

## Non-negotiable build rules
- Build the Android app from scratch. Do not copy or adapt code/UI from prior Android branches.
- Screen IDs H001-H132 are the traceability key across design, engineering and QA.
- P0 correctness, recovery, accessibility, privacy and payment safety come before visual polish.
- P1 features H119 (Circle), H120 (referrals) and H127 (gifting) remain feature-flagged until business rules are approved.
- Existing website/API remain the system of record for product, price, stock, order and payment truth.
- Never fabricate success, stock, delivery promises, refunds, reviews, support channels or policy terms.

## Phase 0 - Contract audit and foundation
Status: IN PROGRESS

Scope:
- Confirm public mobile gateway strategy and package/signing ownership.
- Map every blueprint endpoint/state to the real HIDI backend.
- Create native Android project/module skeleton under the approved path.
- Establish HIDI design tokens, typography strategy, icons, navigation shell and accessibility baseline.
- Establish environment/flavor configuration and secret policy.
- Create deterministic fixture layer for screen-state development without pretending fixtures are production data.
- Create screen registry and traceability matrix H001-H132.

Exit evidence:
- Android project builds from clean checkout.
- API contract matrix classifies every screen as: existing API / backend extension / OS-provider handoff / local-only.
- No secret is present in source or APK config.
- Base design-system previews cover light/dark, 200% text, loading/error and reduced-motion variants.

## Phase 1 - Welcome, identity and discovery
Screens:
- H001-H022
- H103-H108 where needed for shared state/recovery

Work:
- Launch/restore, welcome, optional preferences, sign-in/OTP, consent and verification limits.
- Home, categories, collections, listing, search, suggestions, filters/sort, saved and recently viewed.
- Guest browsing first; sign-in never blocks catalogue browsing.
- Restore tab history, scroll position and safe return intent.

Exit evidence:
- Guest reaches Home in one tap.
- OTP return-to-intent works.
- Product/list/search states handle loading, empty, partial failure and offline correctly.
- Wishlist local/offline behavior is deterministic and later merge-safe.

## Phase 2 - Product confidence and bag
Screens:
- H023-H044

Work:
- PDP, full-screen gallery, SKU picker, size guide, optional fit helper, details/care, PIN serviceability, reviews, stock alert, unavailable/similar states.
- Bag CRUD, promotions, changed-price/stock acknowledgement, saved-for-later.
- Exact SKU identity and authoritative totals.

Exit evidence:
- Last-unit race never shows false success.
- A selected size/color maps to a specific SKU.
- Bag totals equal server values.
- Changed stock/price is acknowledged before checkout.

## Phase 3 - Checkout and payment
Screens:
- H045-H060
- H115 where rate limiting applies

Work:
- Verified guest checkout, address flow, serviceability, delivery options, final review, payment methods.
- Razorpay/UPI/provider handoff behind a PaymentGateway abstraction.
- COD path.
- Payment pending/failure/confirmed/resume states.
- Stable idempotency/operation IDs and server reconciliation.

Exit evidence:
- Lost callback resolves the same order.
- No duplicate order/charge on retry/process recreation.
- PAN/CVV/UPI PIN never enters HIDI fields/logs/analytics.
- Pending is treated as a real state and never auto-converted to failure/success.

## Phase 4 - Orders, delivery and after-sales
Screens:
- H061-H082
- H128-H131

Work:
- Orders, order detail, shipment tracking/split shipments/delivery exception.
- Item-level cancellation.
- Invoice/receipt.
- Returns, evidence, pickup, tracking, refunds, exchanges and price differences.
- Review submission.

Exit evidence:
- Partial/split states are item-quantity scoped.
- Refund cannot exceed remaining paid amount.
- Replayed provider/carrier events are idempotent.
- Pickup/refund/order states remain separate.

## Phase 5 - Account, support and privacy
Screens:
- H083-H102
- H123-H126
- H132

Work:
- Profile, addresses, payment-token view, shopping preferences.
- Notifications inbox/settings.
- Help centre, order-aware support, ticket conversation and real contact channels.
- Policies/legal.
- Privacy choices, export/delete, phone/email changes, guest order lookup and sign-out isolation.

Exit evidence:
- Cross-account reads fail without data leakage.
- Logout clears scoped local data.
- Export/delete are reauthenticated and tracked.
- Support requests are idempotent and resume safely.

## Phase 6 - Resilience, system states and editorial
Screens:
- H103-H118
- H121-H122
- H125

Work:
- Shared loading, partial error, offline cached/no-cache, generic error, session expiry, maintenance, required/optional updates.
- Permission education/denial and OS-owned permission dialog.
- Deep-link recovery.
- Editorial story and shop-the-look.
- Light/dark appearance with semantic tokens.

Exit evidence:
- Every P0 route has loading/empty/error/offline handling where applicable.
- No permission prompt on first launch.
- Deep links validate route + authorization.
- Theme changes do not recreate payment attempts or lose state.

## Phase 7 - Optional growth
Screens:
- H119, H120, H127

Status: FEATURE-FLAGGED / NOT LAUNCH-BLOCKING

Work only after commercial approval:
- HIDI Circle.
- Referral sharing.
- Gift note/packaging.

## Phase 8 - Hardening, release and evidence
Work:
- Device matrix: API 26 baseline through API 36/current supported release.
- 320/360/390/412 dp, landscape, tablets/foldables.
- TalkBack, Switch Access, keyboard, 100/130/200% text, reduced motion.
- Lossy network/process death/provider app-switch failure injection.
- Performance benchmark and screenshot regression for all H001-H132 states.
- Signed internal APK + test AAB, SBOM/checksums, release record and rollback plan.

Stop-release defects:
- Double charge/order.
- Wrong total/refund.
- Unauthorized object access.
- Lost confirmed order.
- Unhandled payment ambiguity.
- Inaccessible checkout blocker.
- Misleading return eligibility.

## Current open decisions
1. Public mobile gateway: no Azure API Management resource/key is currently established in the repository or prior confirmed infrastructure. Existing public path is the Next.js server proxy `/api/store/*` -> internal NestJS `/v1/*`. Confirm this as the Android gateway or provide an APIM service/key if one now exists.
2. Confirm final Android application ID/signing ownership. Previous Android work used `com.thehidi.app`; this build will not inherit old app code.
3. Confirm that required backend/API additions for blueprint gaps may be developed in this same branch, backward-compatible with the website.
