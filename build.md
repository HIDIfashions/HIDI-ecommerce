# HIDI Mobile - Build Specification

Branch: `hidi-mobile-build-from-scratch`
Current phase: Phase 0 COMPLETE / VERIFIED
Scope: React Native frontend only

## Runtime
- React Native 0.87.1
- React 19.2.3
- React Navigation 7
- React Native Screens 4.28.0
- React Native Safe Area Context 5.10.0
- TypeScript 6.x
- Node >= 22.13.0

The project uses the official React Native Community native template, not prior HIDI mobile source.

## Project
`apps/mobile/`

Native:
- `apps/mobile/android/`
- `apps/mobile/ios/`

Identity:
- Android `com.thehidi.app`
- iOS `com.thehidi.app`

Android:
- minSdk 26
- targetSdk 36
- compileSdk follows the RN 0.87 template toolchain
- native berry/ivory launch surface
- release signing material is not committed

iOS:
- `HIDI.xcodeproj`
- native berry/ivory launch screen
- CocoaPods native dependency integration

## Workspace isolation
`apps/mobile` is excluded from the root pnpm workspace and uses its own npm install. The existing web/API pnpm lockfile is not repurposed for React Native.

## Source layout
- `src/app`: bootstrap/providers
- `src/theme`: HIDI semantic tokens
- `src/components`: accessible shared primitives
- `src/navigation`: typed navigation
- `src/network`: existing gateway + request/error handling
- `src/state`: UiState/MutationState
- `src/spec`: H001-H132 registry, motion, accessibility
- `src/screens`: phase-owned UI

## Identity delivery
- Mobile phone sign-in requests OTP delivery with Supabase Auth channel `whatsapp`.
- Phone OTP verification continues to use Supabase verification type `sms`, as required by the phone OTP contract.
- WhatsApp delivery requires the existing Supabase Auth project to be configured with Twilio or Twilio Verify and an approved WhatsApp sender.
- No Twilio/Meta secret is stored in the React Native app.
- There is no SMS fallback enabled for launch while DLT remains unresolved.

## Existing gateway - unchanged
Debug/staging:
`https://thidigk.thehidi.com/api/store`

Production:
`https://thehidi.com/api/store`

No backend/APIM code is created by this branch.

Recorded existing client routes include products, cart CRUD, checkout preparation/serviceability/confirmation, Razorpay verification, account orders, reviews, retention, rewards and wallet.

If a later blueprint screen requires a capability not exposed by the existing backend, record it as an integration blocker and render the blueprint-safe unavailable/recovery state. Do not invent success or create backend code from this branch.

## State contract
`UiState<T>`: loading | content | empty | error

`MutationState<T>`: idle | submitting | succeeded | failed | unknown

## Build
```bash
cd apps/mobile
npm install
npm run typecheck
npm test -- --runInBand
npm run android

# macOS
cd ios && pod install && cd ..
npm run ios
```

## Phase 0 verification
CI workflow: `Mobile Phase 0`

Latest verified run: `36570551111`

Passed:
- Dependency installation.
- TypeScript typecheck.
- Foundation unit tests.
- Android debug APK compilation.
- Exact core color and 48dp token tests.
- H001-H132 registry contains 132 unique IDs.
- H119, H120 and H127 are the only P1 screens.

iOS native project is committed and structurally configured; iOS compilation requires a macOS/Xcode runner and will be part of the iOS validation gate before distribution.

## Gate
Phase 1 is owner-approved and in progress. Treat WhatsApp OTP as integration-ready only after the Supabase/Twilio sender configuration is validated with a real +91 test number.
