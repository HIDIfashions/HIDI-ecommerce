# HIDI Mobile - Build Specification

Branch: `hidi-mobile-build-from-scratch`
Current phase: Phase 6 IN PROGRESS
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

## Gate
Phase 6 CI must pass before Phase 7 begins.
