# HIDI Mobile - Build Specification

Branch: `hidi-mobile-build-from-scratch`
Current phase: Phase 7 FRONTEND COMPLETE / VERIFIED (CI) / LIVE FEATURES OFF
Scope: React Native frontend only

## Runtime
- React Native 0.87.1
- React 19.2.3
- React Navigation 7
- React Native Screens 4.28.0
- React Native Safe Area Context 5.10.0
- TypeScript 6.x
- Node >= 22.13.0

No dependency, native package identity, server or provider migration was performed for Phase 7.

## Build
```bash
cd apps/mobile
npm install
npm run typecheck
npm test -- --runInBand
./android/gradlew -p android assembleDebug
cd ios && bundle exec pod install && cd ..
xcodebuild -workspace ios/HIDI.xcworkspace -scheme HIDI -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

## Verified phases
- Phase 0: run `36570551111`.
- Phase 1: run `36585777566`.
- Phase 2: run `36614729523`.
- Phase 3: run `36628638488`.
- Phase 4: run `36634182910`.
- Phase 5: run `36648013506`.
- Phase 6: run `36668877144`; tested commit `eb87147d43599b5368c825163dab0286f7e5aa55`; Android typecheck/tests/build and iOS dependencies/pods/simulator build all passed. No failed/skipped steps.
- Phase 7: run `36673190391`; tested commit `3a72c1cd25aa54788bf7917ee21a733e63b607a6`; both jobs completed successfully. Details below.

## Phase 5 implementation evidence
- H083-H084 account and guest account entry.
- H085-H088 profile, address book, payment method state and shopping preferences.
- H089-H091 notifications inbox/settings and OS permission handoff.
- H092-H096 help centre, order help, support draft, conversation and contact route.
- H097-H102 policies, privacy choices, export, deletion and sign-out.
- H123-H126 phone/email/permission/guest-order extended flows; H132 support received.

Unsupported capabilities remain explicit unavailable/local-device-only states, not fake server success: payment-token list, notification sync, help-topic/search API, support tickets/messages, privacy export/deletion, phone change, email verification and guest-order challenge.

## Phase 6 implementation evidence
- H103-H104 loading and partial-section failure.
- H105-H106 offline saved/no-content states.
- H107-H116 error, session expiry, maintenance, update, permissions, unavailable links, rate limits and attachment issue states.
- H117-H118 editorial/story and look selection.
- H121-H122 appearance and dark preview; H125 OS permission route.

Local/system contracts are used where the gateway exposes no bootstrap/story/look/update/upload endpoint. CI does not validate every live-provider, physical-device or visual/accessibility scenario; those remain in release hardening.

## Phase 7 implementation evidence
Source: blueprint page 70 (H119, H120) and page 74 (H127). Source/contract audit: `apps/mobile/docs/phase7.md`.

New code under src/growth:
- contracts.ts: explicit P1 gates, presentation models, policy/account validation, event deduplication, campaign validity, exact-note/packaging/fee checks and canonical confirmation.
- operations.ts: deliberate single-flight sharing; single gift save and read-only unknown-outcome reconciliation.
- runtime.tsx: default unavailable production adapter and account/cart-scoped pending gift operations.
- GrowthScreen.tsx: source-inspired Circle/referral/gift screens with loading/error/inactive/success/recovery states.
- GrowthEntryPoints.tsx: no entry surface when either gate is closed.

Production flags AND capability gates are OFF. Synthetic test data is isolated under test-fixtures; it is never imported by the production app. Existing /rewards/summary explicitly returns PREVIEW and unapproved/nonredeemable rules, so it is not substituted for loyalty/account or loyalty/ledger. No unsupported referral/gift endpoint is called. No cart/payment totals, backend/database/APIM or live provider settings changed.

Before live activation: approved earning/expiry/reversal policy and ledger, approved server referral campaign/link/abuse checks, operational note/packaging limits and prices, and a verified gift-options server adapter with quote/fulfillment acknowledgement plus restart-safe operation reconciliation. Presentation types do not invent these server contracts. The UI adapter seam must be integration-tested against them.

## Phase 7 validation
Status: VERIFIED on 30 Sep 2026.
Workflow: `Mobile Phase 7` in `.github/workflows/mobile-phase0.yml`.
Successful run: `36673190391`, attempt 1, completed `2026-09-30T05:37:19Z`.
Verified application/test/workflow commit: `3a72c1cd25aa54788bf7917ee21a733e63b607a6`.

Passed:
- Android job `109752503463`: dependency installation, TypeScript, full Jest suite, Metro Android release bundle, debug compilation, test-report and debug-APK artifacts.
- iOS job `109752503718`: dependencies, Metro iOS release bundle, Ruby/CocoaPods installation and simulator build (unsigned).
- Both jobs and all reported steps concluded success. No failed/skipped steps in this run.
- Actual downloaded `test-results.json`: 87 passed of 87 tests, 11 passed of 11 suites, 0 failed tests, 0 pending tests.
- New Phase 7 cases: 22 contract tests, 10 action tests and 7 rendered-component tests (39 total). Existing Phase 0-6 tests remain enabled; none removed or weakened.
- Initial Phase 7 run identified one test-render-helper typing mismatch. The helper was typed as ReactElement, after which the complete verification above passed.

Artifacts in this run:
- `phase7-test-results`, artifact `11078329459`: Jest JSON used for the totals above.
- `hidi-phase7-android-debug`, artifact `11079430911`: debug APK, not a production-signed standalone release. The standard debug/Metro workflow still applies.
- Metro release bundles were independently built for both platforms; their success is not a claim that the debug APK is a release build.

Both jobs use staging runtime selection; optional-feature gates remain OFF. Dependency/toolchain warnings may remain; no claim of warning-free dependencies is made. Native device install, pixel comparison, VoiceOver/TalkBack and live commercial integration are not inferred from CI passes.

This closure updates tracking documentation only. Application code, dependencies, tests and workflow are unchanged from the verified commit.

## Gate
Phase 7 gated frontend implementation is complete. Do not start Phase 8 until owner approval. Do not activate optional growth features by changing flags alone.
