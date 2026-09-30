# HIDI Mobile — build and evidence

Branch: `hidi-mobile-build-from-scratch`.
Current phase: Phase 8 IN PROGRESS. Release decision: NOT APPROVED.
React Native 0.87.1 / React 19.2.3 / TypeScript 6 / CI Node 22.13.1. Production identity com.thehidi.app; internal validation identity com.thehidi.app.internal. Backend/APIM/provider architecture is unchanged.

## Reproducibility
Phase 8 freezes package-lock.json and validates with npm ci. Every native job checks out the exact tested SHA emitted by the regression job, including the reviewed lock commit. Source SHA, workflow input SHA, lock digest, dependency inventory and run ID are retained in evidence. Do not confuse an auto-created lock commit with its parent workflow input revision.

## Workflow
`.github/workflows/mobile-phase8.yml` replaces duplicated Phase 7 push builds. It keeps all existing tests and adds TypeScript, network/payment recovery/component regressions, credential-pattern scan, npm audit gate, source-to-H001–H132 inventory and CycloneDX npm SBOM. Native dependency inventories are separate.

Android: release-mode JavaScript/Hermes embedded in minified APK and test AAB, arm64-v8a/x86_64. Internal test signer is ephemeral, not a merchant upload key. Verify signature, alignment, permissions and SHA256. Retain mapping, native symbols and source maps when emitted by the build toolchain. Install this exact APK on API26 and API36 hosted emulators for guest navigation, layout capture, restart/offline smoke and runtime-error checks.

iOS: Release simulator build with embedded JS and com.thehidi.app.internal. Install/launch, native URL forwarding and light/dark screenshots; artifact is an unsigned simulator application, not a physical-device IPA. Retain Podfile.lock and build output.

## Commands
```bash
cd apps/mobile
npm ci --no-audit --no-fund
npm run typecheck
npm test -- --runInBand
node scripts/phase8-evidence.mjs
npm audit --json
./android/gradlew -p android :app:assembleRelease :app:bundleRelease -PhidiInternalBuild=true -PreactNativeArchitectures=arm64-v8a,x86_64
```

## Verification history
Phases 0–7: 36570551111, 36585777566, 36614729523, 36628638488, 36634182910, 36648013506, 36668877144, 36673190391. Baseline Phase 8 audit run 36677057528: 87 tests and zero npm vulnerability findings. Full new Phase 8 pipeline has not yet executed to completion.

## Required release evidence still open
See `apps/mobile/docs/phase8.md` and generated `release-readiness.json`: live identity/payment and after-sales/provider validation, full local account isolation, authentic privacy/support operations, approved 132-screen visual comparisons, physical low-memory devices/assistive-technology sign-off, representative performance, merchant/fulfillment policy and production signing/listing/rollout approval. Missing server APIs remain explicit; source contracts or synthetic tests are not substitutes.
