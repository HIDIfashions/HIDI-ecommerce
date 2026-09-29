# HIDI Mobile - Phase Plan

Branch: `hidi-mobile-build-from-scratch`
Implementation mode: frontend-only React Native
Source of truth: HIDI Mobile App Development Blueprint V1.0 / 27 Sep 2026

## Confirmed decisions
- New UI/frontend only. Existing backend, API gateway/APIM layer, database and provider integrations remain unchanged.
- React Native only; no Kotlin/Compose UI implementation.
- Native build projects are committed under `apps/mobile/android` and `apps/mobile/ios`.
- Android application ID and iOS bundle ID: `com.thehidi.app`.
- Do not copy UI/application source from prior mobile branches.
- Prior branches may be inspected only for already-established integration contracts.
- Complete one phase, update tracking docs, report, then wait for owner approval.

## Phase 0 - React Native foundation
Status: COMPLETE / VERIFIED

Completed:
- React Native 0.87.1 / React 19.2.3 project created from the official Community native template.
- Android and iOS native build folders created.
- Android minSdk 26 / targetSdk 36 and HIDI native launch surface prepared.
- HIDI light/dark semantic design tokens implemented.
- 48dp interaction baseline and scalable typography primitives created.
- React Navigation stack foundation and five root-tab route types reserved: Home, Shop, Saved, Bag, You.
- Shared `UiState<T>` and `MutationState<T>` contracts created.
- Existing HIDI gateway consumed from the frontend; no APIM/backend resource created.
- Phase 1 phone sign-in delivery is WhatsApp OTP through the existing Supabase Auth contract. No new mobile-side provider secret or APIM route is introduced.
- Typed API request/error layer and existing route constants created.
- H001-H132 registry created with phase/priority traceability.
- M1-M8 motion and accessibility contracts recorded in code.
- Foundation tests added.
- Root pnpm workspace excludes `apps/mobile`, keeping web/API dependency state isolated.

Phase 0 exit:
- Frontend/native structure is ready for Phase 1.
- No previous app UI code was copied.
- No backend source or infrastructure was changed.
- CI verification passed: dependency install, TypeScript typecheck, unit tests and Android debug build all completed successfully.
- Verification workflow: `Mobile Phase 0`, run `36570551111`.

## Phase 1 - Welcome, identity and discovery
Status: COMPLETE / VERIFIED

Screens: H001-H022
Shared states used where needed: H103-H108

Completed:
- H001 launch/restore with onboarding restore, safe product/collection deep links, process-restart recovery and no artificial second splash.
- H002 welcome with HIDI visual language, guest-first browsing, optional sign-in and optional style setup.
- H003 style preferences with optional selections, storage-failure recovery and no shopping restriction.
- H004-H008 identity path: phone entry, WhatsApp OTP request, six-digit verification, optional profile completion, consent controls, phone-scoped rate-limit recovery and guest fallback.
- Auth session tokens use secure native keychain storage; OTP codes are never persisted.
- H009 Home with live catalogue content, editorial hero, collection discovery, featured fallback, offline-cache badge and Recently Viewed entry.
- H010 Shop categories built from current published category/collection data instead of fabricated taxonomy.
- H011 collection landing with live product data and expired/unpublished collection recovery.
- H012 product listing with live inventory-aware cards.
- H013-H016 search entry, suggestions, results and no-results recovery with local recent-search privacy controls.
- H017 filter workspace with size/colour/fabric/price groups and same-SKU inventory-safe matching.
- H018 sorting with persisted selection; Recommended, price and rating are supported. Newest remains visibly disabled until the existing catalogue API exposes a stable published-date sort contract.
- H019 filtered listing with removable chips and zero-result recovery.
- H020-H021 guest Saved Items and empty state, including current availability and saved-price-change messaging.
- H022 Recently Viewed with local-device privacy toggle, clear-history control and unavailable-item handling.
- Catalogue loading/content/error/offline-cache states are distinct; failed network fetches are not presented as empty catalogues.
- Live storefront relative media URLs are resolved against the selected HIDI public origin.
- Android and iOS deep-link handling is allowlisted to HIDI product/collection routes.
- Five persistent root tabs are active: Home, Shop, Saved, Bag, You. Bag/You are intentionally lightweight placeholders because their full contracts belong to later phases.
- Product taps hand off to a temporary Phase-1 detail bridge only; H023+ product detail behavior is deliberately deferred to Phase 2.

Verification:
- Workflow: `Mobile Phase 1`
- Verified run: `36585777566`
- TypeScript typecheck: PASS
- Phase 0 + Phase 1 unit tests: PASS
- Android debug build: PASS
- iOS CocoaPods install: PASS
- iOS simulator build: PASS

Known external integration prerequisite, not a Phase 1 frontend defect:
- Live H004/H005 WhatsApp OTP still requires the existing Supabase Auth project/provider configuration and mobile-safe public auth build variables. No credential or provider secret is guessed or embedded in the app.

Phase 1 exit:
- H001-H022 frontend/UI/navigation/recovery scope is implemented and CI-verified.
- No backend/APIM/database resource was created or changed for Phase 1.
- Phase 2 must not start until owner approval.

## Phase 2 - Product confidence and bag
Status: WAITING FOR OWNER APPROVAL
Screens: H023-H044

## Phase 3 - Checkout and payment
Status: NOT STARTED
Screens: H045-H060

## Phase 4 - Orders and after-sales
Status: NOT STARTED
Screens: H061-H082, H128-H131

## Phase 5 - Account, support and privacy
Status: NOT STARTED
Screens: H083-H102, H123-H126, H132

## Phase 6 - Resilience, system states and editorial
Status: NOT STARTED
Screens: H103-H118, H121-H122, H125

## Phase 7 - Optional growth
Status: FEATURE-FLAGGED / NOT STARTED
Screens: H119, H120, H127

## Phase 8 - Hardening and release evidence
Status: NOT STARTED
