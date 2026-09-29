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
Status: WAITING FOR OWNER APPROVAL
Screens: H001-H022
Shared states: H103-H108 as needed

## Phase 2 - Product confidence and bag
Status: NOT STARTED
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
