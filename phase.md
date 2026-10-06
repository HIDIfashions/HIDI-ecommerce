# HIDI Mobile Premium V2 — phase tracking

Branch: `hidi-mobile-premium-v2`
Base: production `main`
Rule: previous mobile UI/components are not design or feature references. Only the clean React Native native-project scaffold was reused; all application source, information architecture and commerce UI are new.

## Phase 0 — premium product definition
Status: COMPLETE
- Myntra-inspired commerce mechanics with original HIDI visual identity.
- White / charcoal / `#FF3F6C` system, strict 4:5 imagery and boutique card geometry.
- Five tabs: Home, Trends, Categories, Bag, Profile.

## Phase 1 — clean native foundation
Status: IMPLEMENTED / CI PENDING
- React Native 0.87, TypeScript, NativeWind, Reanimated, Gesture Handler, Bottom Sheet and FlashList.
- Android/iOS native projects, New Architecture, Hermes, safe areas, error boundary, API/cache layer.

## Phase 2 — Home and Trends
Status: IMPLEMENTED / CI PENDING
- Studio story bubbles, editorial carousel, optional backend campaign clock, infinite product feed and Trends stories using HIDI assets.

## Phase 3 — Categories and discovery
Status: IMPLEMENTED / CI PENDING
- Category/collection hub, search, two-column FlashList, sort and smart bottom-sheet filters for HIDI brand, price, size, colour and discount.

## Phase 4 — Product confidence
Status: IMPLEMENTED / CI PENDING
- Edge-to-edge gallery, wishlist spring/haptic, exact colour/size SKU selection, fit guidance, PIN check, accordions, related products and sticky add-to-bag.

## Phase 5 — Bag and checkout
Status: IMPLEMENTED / CI PENDING
- Swipe-to-remove, quantity limits, promo validation adapter, shipping-threshold adapter, canonical totals and cross-sell.
- Address → Summary → Payment flow.
- Stripe PaymentSheet / Apple Pay / Google Pay adapter is capability-gated by approved keys and server PaymentIntent endpoint; no fake payment success.

## Phase 6 — Profile and Insider
Status: IMPLEMENTED / CI PENDING
- OTP-capable guest/profile flow, wishlist, orders, local addresses and HIDI Insider summary against the existing rewards endpoint.
- Benefits remain server-authoritative.

## Phase 7 — hardening and APK
Status: IN PROGRESS
- Typecheck, regressions, Android release APK, signature/alignment verification and iOS simulator build are running in GitHub Actions.

## Current checkpoint
All product phases are implemented in the new application source. The final gate is zero-error CI and downloadable APK generation.
