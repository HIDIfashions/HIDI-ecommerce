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

Phase 0 exit: frontend/native structure is ready; no previous app UI code copied; CI run `36570551111` passed dependency install, typecheck, tests and Android debug build.

## Phase 1 - Welcome, identity and discovery
Status: COMPLETE / VERIFIED

Screens: H001-H022. Verified run `36585777566` passed TypeScript, unit tests, Android debug build, CocoaPods install and iOS simulator build.

## Phase 2 - Product confidence and bag
Status: COMPLETE / VERIFIED

Screens: H023-H044. Deterministic Phase 0-2 simulation passed 16/16. Native Phase 2 re-check run `36614729523` passed Android typecheck, unit tests, Android debug build, iOS pod install and iOS simulator build.

## Phase 3 - Checkout and payment
Status: COMPLETE / VERIFIED

Screens: H045-H060. Verified run `36628638488` passed Android typecheck, unit tests, Android debug build, iOS pod install and iOS simulator build.

## Phase 4 - Orders and after-sales
Status: COMPLETE / VERIFIED

Screens: H061-H082, H128-H131. Verified run `36634182910` passed Android typecheck, unit tests, Android debug build, iOS pod install and iOS simulator build.

## Phase 5 - Account, support and privacy
Status: COMPLETE / VERIFIED

Owner approval: granted 30 Sep 2026.
Screens: H083-H102, H123-H126, H132.
Verified run `36648013506` passed Android typecheck, unit tests, Android debug build, iOS pod install and iOS simulator build.
Scope remains React Native frontend only; existing backend/APIM/provider contracts are unchanged.

Implemented in this phase:
- My HIDI and guest account entry.
- Profile edit, local address management, saved payment capability state and shopping preferences.
- Notifications inbox empty state, notification settings and OS permission handoff.
- Help centre, order-help context, local support draft, support conversation placeholder, contact route and support received state.
- Policies/legal links, privacy choices, data export request state, account deletion request state and sign-out confirmation.
- Change-phone, email verification, Android permission handoff and guest-order lookup states.

Backend gaps surfaced honestly:
- Payment-method token list, notifications API, support ticket API, privacy export/deletion, phone-change, email-verification and guest-order access-challenge endpoints are not exposed by the current mobile gateway.
- Local-device adaptations are clearly labeled and do not claim server submission.

## Phase 6 - Resilience, system states and editorial
Status: COMPLETE / VERIFIED (CI)

Owner approval: granted 30 Sep 2026.
Screens: H103-H118, H121-H122, H125.
Scope remains React Native frontend only; existing backend/APIM/provider contracts are unchanged.

Implemented scope recorded for this phase:
- Loading skeleton, partial load failure and offline states.
- Generic error, session expired, maintenance, required update and optional update states.
- Permission explanation, permission declined, link unavailable, rate limit and attachment upload issue states.
- Editorial story and shop-the-look flows with explicit item selection and no hidden cart additions.
- Appearance settings and dark appearance preview with persisted local theme preference.

Verification checked on 30 Sep 2026:
- Workflow: `Mobile Phase 6`, run `36668877144`, attempt 1, overall conclusion `success`.
- Tested commit: `eb87147d43599b5368c825163dab0286f7e5aa55`.
- `android-phase6`, job `109739379906`: dependency installation, TypeScript typecheck, unit tests and Android debug build all passed.
- `ios-phase6`, job `109739380114`: dependency installation, Ruby dependencies, CocoaPods installation and iOS simulator build all passed.
- Both jobs completed successfully. No failed or skipped steps were reported in this run.
- No application, test or workflow change was needed during verification; this closure updates documentation only.

Verification scope:
- This is the configured CI/build verification, not a claim that every device, visual, accessibility or live-provider scenario has been tested.
- Existing bootstrap, editorial, update and upload capability limitations remain as recorded in `build.md`; passing CI does not create missing backend contracts.
- Full release hardening remains in Phase 8.

## Phase 7 - Optional growth
Status: FRONTEND COMPLETE / VERIFIED (CI) / LIVE FEATURES OFF

Owner approval to implement: 30 Sep 2026. Screens: H119, H120, H127 (P1).
Source review: blueprint page 70 and page 74, including rendered screen images.

Delivered frontend:
- H119 Circle: point buckets, approved eligibility/expiry/reversal terms, expandable activity and duplicate-event protection. Never converts wallet/preview amounts into points or cash.
- H120 Invite a friend: campaign terms, eligible invitation, expiry gate, native share action, dismissal handling, double-tap prevention and account-scoped revalidation before sharing.
- H127 Gift note & packaging: exact note, Unicode length check, packaging default off, approved integer-paise fee, unsupported-item state, fee-change review, canonical quote/fulfillment acknowledgement and uncertain-write reconciliation.
- Feature-off removes all optional entry points; direct navigation is guarded. No service call occurs while the gates are closed.
- Main account and bag entries, typed navigation, provider, component and action tests are added without backend changes.

Integration boundary:
- Production flags/capabilities remain false. Code approval is not approval of a points policy, referral reward, packaging price or new backend contract.
- Existing /rewards/summary is illustrative PREVIEW, not a credited ledger. No reviewed referral or cart gift-options adapter is available.
- Presentation contracts and synthetic tests are explicitly distinguished from real API schemas/merchant terms. Details: `apps/mobile/docs/phase7.md`.
- Live activation requires the verified server contracts and commercial/fulfillment approval listed there. No fake user rewards, successful messages or gift-fee charges are generated.

Verification checked on 30 Sep 2026:
- Workflow `Mobile Phase 7`, run `36673190391`, attempt 1, overall conclusion `success`.
- Verified application/test/workflow commit: `3a72c1cd25aa54788bf7917ee21a733e63b607a6`.
- `android-phase7`, job `109752503463`: dependency installation, TypeScript, all unit/component tests, Metro Android release bundle, Android debug build, test-result upload and debug-APK upload passed.
- `ios-phase7`, job `109752503718`: dependency installation, Metro iOS release bundle, Ruby dependencies, CocoaPods and iOS simulator build passed.
- All reported steps in both jobs completed successfully; no failed or skipped steps in the verified run.
- Downloaded and read the actual Jest JSON artifact: 87/87 tests passed; 11/11 suites passed; 0 failed tests; 0 pending tests.
- Phase 7 adds 39 passing tests: 22 contract cases, 10 action cases, 7 rendered-component cases. Existing Phase 0-6 tests remain enabled.
- Artifacts: `phase7-test-results` (11078329459) and `hidi-phase7-android-debug` (11079430911).
- Initial run `36673037386` found one new test-render-helper typing error. It was fixed without weakening tests; the complete subsequent run above passed.
- Closure modifies these tracking documents only; application code and verification workflow remain identical to the tested commit.

This completes the gated frontend phase, not customer activation. Live commercial integration and physical-device/visual/accessibility release validation are not claimed by this CI result.

## Phase 8 - Hardening and release evidence
Status: NOT STARTED
Owner approval required. Do not start automatically after Phase 7 CI.
