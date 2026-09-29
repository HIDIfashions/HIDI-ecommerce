# HIDI Mobile - Build Specification

Branch: `hidi-mobile-build-from-scratch`
Current phase: Phase 2 COMPLETE / SIMULATION VERIFIED
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

## Phase 1 implementation evidence
Implemented frontend scope:
- H001-H008 launch, onboarding, WhatsApp phone verification UI, optional profile and consent.
- H009-H012 Home, Shop/category discovery, collection landing and catalogue listing.
- H013-H016 search entry/suggestions/results/no-results.
- H017-H019 filter, sort and filtered listing.
- H020-H022 Saved Items and Recently Viewed.
- Offline saved catalogue presentation, partial-section failure handling and generic retry surfaces required by Phase 1.
- HIDI allowlisted product/collection deep-link recovery on Android and iOS.
- Secure native session persistence through Keychain.
- Local privacy controls for recent searches and Recently Viewed.
- Saved-item price/availability snapshots.
- Relative storefront media URL resolution for React Native.

Live Phase 1 catalogue integration was checked against the existing testing gateway and currently returns published product/category/collection/inventory data and relative product media paths.

CI workflow: `Mobile Phase 1`
Verified run: `36585777566`

Passed:
- npm dependency installation.
- TypeScript typecheck.
- Foundation tests.
- Phase 1 discovery/filter/deep-link contract tests.
- Android debug build.
- iOS Ruby/CocoaPods dependency installation.
- iOS simulator build with code signing disabled.

## Phase 1 auth runtime configuration
The frontend deliberately does not contain Supabase/provider secrets.

Required build-time public values for live customer OTP:
- `HIDI_SUPABASE_URL`
- `HIDI_SUPABASE_PUBLISHABLE_KEY`
- `HIDI_MOBILE_ENV=staging|production`

WhatsApp OTP provider/sender configuration remains outside this frontend branch.

## Phase 2 implementation evidence
Implemented frontend scope:
- H023-H036 product detail, gallery, exact SKU selection, supplied size measurements, fit-capability fallback, details/care, PIN serviceability, reviews, stock/unavailable recovery, related products and canonical add confirmation.
- H037-H044 canonical bag, empty state, quantity edit, confirmed remove/undo, promotion capability state, bag-change acknowledgement and local Saved-for-later revalidation.
- Cart writes are serialized. Ambiguous add/update/remove results are reconciled against a fresh canonical GET before success is claimed.
- Canonical mutation results are compared against the last acknowledged bag and, for newly added SKUs, the shopper-visible expected price.
- Checkout is blocked by stale bag state, unresolved price/stock attention, or quantity above current availability.
- Unsupported server features are recorded in `src/spec/phase2Capabilities.ts`; the frontend does not manufacture success.

Deterministic simulation result:
- 16/16 Phase 0-2 commerce scenarios passed.
- Simulation checks phone normalization/validation, search token order, exact-SKU filtering, sold-out exclusion, allowlisted/untrusted deep links, duplicate-add merge math, initial unavailable lines, first-add price races, price+stock conflict, unresolved-attention preservation, stock quantity limits, minor-unit arithmetic, local Saved-for-later quantity revalidation and unsupported-capability honesty.

Phase 2 backend reconciliation:
- Existing product detail/related/reviews/cart/PIN-serviceability contracts are used as-is.
- Current cart server supports read, add exact variant, quantity update and remove.
- Current backend does not expose fit recommendations, stock alerts, promotion evaluation, atomic variant replacement, cart/quote versioning or server Saved-for-later.
- No backend/APIM source was modified to fill those gaps.

Phase 2 native verification status:
- Latest Actions attempt: `36610550967`.
- Android and iOS jobs failed before any workflow step was created or executed; GitHub returned `steps: null` for both jobs.
- Therefore this run provides no TypeScript/test/build failure evidence and is not counted as a failed application build.
- Last full native baseline evidence remains Phase 1 run `36585777566`: TypeScript, tests, Android debug build, CocoaPods and iOS simulator build all passed.
- Rerun the Phase 2 Android/iOS workflow when GitHub Actions runner capacity/account execution is available.

## Gate
Phase 2 implementation and simulation are complete. Do not start H045-H060 until the owner explicitly approves Phase 3.