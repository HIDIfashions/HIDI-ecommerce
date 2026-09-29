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
- Phase 2 owner approval has now been granted.

## Phase 2 - Product confidence and bag
Status: COMPLETE / SIMULATION VERIFIED / NATIVE CI RECHECK BLOCKED

Owner approval: granted 29 Sep 2026.
Screens: H023-H044
Scope remained React Native frontend only; existing backend/APIM/provider contracts were unchanged.

Completed:
- H023 product detail uses the current published product contract with gallery, explicit price/variant context, sizing, delivery, reviews, care, returns link and fixed size/add action.
- H024 full-screen product gallery supports swipe, visible previous/next controls, image count, image-failure recovery and pinch zoom that resets between frames.
- H025 exact colour/size SKU selection, unavailable-size handling, inventory-aware add, single mutation lock and accessible add confirmation.
- H026 garment size guide uses only supplied variant measurements with cm/in conversion; absent body/model/chart data is not invented.
- H027 fit-helper recovery explains that the current backend exposes no approved fit-recommendation endpoint and collects no body measurements.
- H028 details/care renders supplied fabric/description/care and explicitly labels unsupported fields as not provided.
- H029-H030 PIN serviceability uses the current delivery-serviceability contract; no delivery date, fee or COD promise is fabricated when the API does not return it.
- H031-H032 reviews use the public aggregate/list contract, verified-purchase state and review text while avoiding unsupported photo/helpful/report/purchased-variant claims.
- H033 revalidates SKU stock before showing the stock-alert fallback; no alert is claimed because the current backend has no stock-alert endpoint.
- H034 retired/sold-out product recovery removes the purchase action and preserves browsing.
- H035 similar styles uses the current related-products endpoint and avoids invented similarity claims.
- H036 success is shown only after canonical cart confirmation; ambiguous add results are reconciled by re-reading the bag.
- H037-H038 real bag and true-empty states use the canonical current cart response, restore stale saved state on refresh failure and never treat load failure as empty.
- H039 supports canonical quantity edit with inventory limits. Atomic SKU replacement is not attempted because the current cart PATCH contract updates quantity only.
- H040 confirmed removal, local Saved-for-later alternative and canonical undo revalidation are implemented with one primary action.
- H041-H042 preserve promo-code UI/recovery without changing totals because the existing backend exposes no promotion-validation contract.
- H043 detects line-level price, reduced-stock and unavailable changes; stock conflicts must be resolved and price changes acknowledged before checkout can proceed.
- H044 local Saved-for-later preserves exact SKU/quantity/price and revalidates current product stock/price before moving back to the canonical bag.
- Canonical cart mutation handling now compares server responses against both the last acknowledged cart and the shopper-visible expected price, including first-add price races.
- Removing one line does not silently acknowledge an unrelated unresolved bag change.
- Phase 2 stops before H045 checkout. No payment or checkout intent is created.

Existing-backend capability gaps surfaced honestly in the UI:
- Fit recommendations.
- Stock-alert subscriptions.
- Server promotion validation/discount allocation.
- Atomic cart SKU replacement.
- Cart/quote version and operation-id contracts.
- Server Saved-for-later.
These were not replaced with fabricated client success states.

Simulation:
- Deterministic Phase 0-2 commerce simulation: 10/10 scenarios passed.
- Covered exact SKU availability, duplicate-add quantity merging, initial unavailable line blocking, first-add canonical price race, combined price/stock conflict, attention persistence after another line removal, quantity-over-stock blocking, paise arithmetic, deferred quantity revalidation and unsupported-capability honesty.

Verification state:
- Current GitHub Actions run `36610550967` did not enter any Android or iOS workflow steps: both jobs returned `steps: null`.
- This is not evidence of a TypeScript/test/native-build failure; the current runner attempt failed before checkout/setup/test/build steps could execute.
- The same Android/iOS native project baseline was fully verified in Phase 1 run `36585777566`.
- Phase 2 source-level simulation and contract coverage are complete; native Phase 2 revalidation should be rerun when GitHub Actions runners are available.

Phase 2 exit:
- H023-H044 frontend implementation and deterministic simulation are complete.
- No backend/APIM/database/provider resource was created or changed.
- Phase 3 must not start until owner approval.

## Phase 3 - Checkout and payment
Status: WAITING FOR OWNER APPROVAL
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
