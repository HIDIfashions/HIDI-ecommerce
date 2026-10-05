# HIDI Mobile Premium V2 — phase tracking

Branch: `hidi-mobile-premium-v2`
Base: `main`
Rule: the previous mobile application is not a UI or feature reference. Existing website/backend contracts may be reused only after verification.

## Phase 0 — visual product definition
Status: IN PROGRESS

Deliverables:
- New HIDI mobile design system: white/charcoal/pink, type scale, spacing, shadows, cards, motion and haptics.
- High-fidelity interactive prototypes for Home, Catalog/Filters, PDP and Bag.
- Five-tab information architecture: Home, Trends, Categories, Bag and Profile.
- Website/API audit and real-data mapping.
- Visual approval gate before broad screen implementation.

Exit gate:
- Screens must look premium at 320, 360, 390 and 430dp widths.
- Product imagery must use 4:5 or 1:1 geometry without cropping key garment details.
- No placeholder-grade UI, generic admin cards or previous mobile screen reuse.
- Owner approves screenshots of the four critical screens.

## Phase 1 — clean native foundation
Status: NOT STARTED

- React Native + TypeScript + NativeWind.
- Android and iOS native projects.
- New Architecture, Reanimated, gestures, bottom sheets, FlashList.
- Typed navigation, API client, query cache, image abstraction, error boundary and skeleton system.
- CI typecheck, tests and native builds.

## Phase 2 — Home and Trends
Status: NOT STARTED

- Infinite home feed, story bubbles, hero carousel, sale modules, contextual countdowns and personalized product rails.
- Trends/Studio content surface using approved HIDI editorial assets.

## Phase 3 — Categories and discovery
Status: NOT STARTED

- Category hub, search, listing, smart filter/sort bottom sheet, pagination and saved searches.
- Brand/price/size/colour/discount facets derived from real API data only.

## Phase 4 — Product confidence
Status: NOT STARTED

- Premium PDP, edge-to-edge gallery, exact SKU selection, size predictor, delivery check, accordions, reviews and sticky add-to-bag.

## Phase 5 — Bag and checkout
Status: NOT STARTED

- Swipe/drag bag interactions, live totals, coupons, threshold progress, cross-sell and canonical cart reconciliation.
- Address, order summary and payment-provider adapter.
- Apple Pay, Google Pay and Stripe remain gated until approved backend payment contracts exist.

## Phase 6 — Profile and Insider
Status: NOT STARTED

- Account, orders, returns, wishlist, preferences and Insider Premium Club.
- Loyalty benefits and shipping rules must be returned by canonical backend rules; the client must not invent entitlement.

## Phase 7 — store hardening
Status: NOT STARTED

- Accessibility, physical devices, performance, security, observability, deep links, notifications, app signing and store submission evidence.

## Current checkpoint
The clean branch exists and Phase 0 product/design work has started. No previous app screen implementation has been copied.
