# HIDI Mobile - Build Specification

Branch: `hidi-mobile-build-from-scratch`
Current phase: Phase 6 COMPLETE / VERIFIED (CI)
Scope: React Native frontend only

## Runtime
- React Native 0.87.1
- React 19.2.3
- React Navigation 7
- React Native Screens 4.28.0
- React Native Safe Area Context 5.10.0
- TypeScript 6.x
- Node >= 22.13.0

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
- Phase 6: run `36668877144`, tested commit `eb87147d43599b5368c825163dab0286f7e5aa55`.

## Phase 5 implementation evidence
Implemented frontend scope:
- H083-H084 account and guest account entry.
- H085-H088 profile, address book, payment method state and shopping preferences.
- H089-H091 notifications inbox/settings and OS permission handoff.
- H092-H096 help centre, order help, create support request, support conversation and contact route.
- H097-H102 policies, privacy choices, export, deletion and sign-out.
- H123-H126 phone/email/permission/guest-order extended flows.
- H132 support request received.

Unsupported backend capabilities are represented as explicit unavailable or local-device-only states, not fake server success:
- payment method token list
- notification sync
- help topic/search API
- support tickets/messages
- privacy export/deletion
- phone change
- email verification
- guest order access challenge

## Phase 6 implementation evidence
Implemented frontend scope:
- H103-H104 loading skeleton and partial-section failure.
- H105-H106 offline saved-content and no-content states.
- H107-H116 generic error, session expiration, maintenance, update gates, permission handling, unavailable link, rate limit and attachment upload recovery.
- H117-H118 editorial story and shop-the-look with explicit item selection.
- H121-H122 appearance settings and dark home preview.
- H125 Android permission dialog remains wired from the extended-flow route.

Phase 6 uses local/system contracts only where the current mobile gateway has no bootstrap, story, look, update, permission or upload endpoint exposed. The UI does not pretend live server confirmation.

## Phase 6 verification evidence
Checked on 30 Sep 2026 against the actual GitHub Actions result:
- Workflow: `Mobile Phase 6`.
- Run: `36668877144`, attempt 1.
- Tested commit: `eb87147d43599b5368c825163dab0286f7e5aa55`.
- Overall status: `completed`; conclusion: `success`.
- Android job `109739379906` (`android-phase6`): dependency installation, `npm run typecheck`, `npm test -- --runInBand` and `assembleDebug` all passed.
- iOS job `109739380114` (`ios-phase6`): dependency installation, `bundle install`, `pod install` and simulator `xcodebuild` all passed.
- Both jobs completed; no failed or skipped steps were reported.
- No source/test/workflow changes were required to obtain this result. The closure commit changes only `phase.md`, `agent.md` and `build.md`.

Limits of this evidence:
- A simulator build is compilation, not an executed end-to-end simulator journey.
- This run does not certify all devices, visual states, accessibility scenarios or live provider integrations.
- Existing unavailable/local-only capabilities remain unchanged. Release hardening remains in Phase 8.

## Gate
Phase 6 configured CI checks have passed. Phase 7 remains not started and requires owner approval.
