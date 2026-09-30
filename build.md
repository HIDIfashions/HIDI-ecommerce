# HIDI Mobile — build and evidence

Branch: `hidi-mobile-build-from-scratch`.
Phase 8 automated technical gate: **PASSED**.
Overall blueprint release acceptance: **OPEN / BLOCKED**.
Verified code: `c787270c66f594f0727000713214f6e39818223c`.
Successful run: `36686275612` (attempt 1), completed 30 September 2026 08:10:21 UTC.

React Native 0.87.1 / React 19.2.3 / TypeScript 6 / CI Node 22.13.1. Production identity `com.thehidi.app`; internal validation identity `com.thehidi.app.internal`. Backend/APIM/provider architecture is unchanged.

## Reproducibility
The committed package-lock.json is validated with npm ci. Lock SHA-256: `849a364d8ebfabad85b5acff4385abfa882c66f6ec440b49556c7c4c655315a3`.
Every native job used the exact tested source SHA. In this final run the workflow input and tested source are identical. All prior phase tests remain enabled. The historical Phase 7 push workflow is superseded by `.github/workflows/mobile-phase8.yml` to avoid duplicate builds.

## Final verified results
| Gate | Result |
| --- | --- |
| TypeScript | PASS |
| All unit/component tests | 135 passed / 0 failed / 0 pending; 17 suites |
| npm audit | PASS; zero known findings at execution time |
| Source credential-pattern scan | PASS; no matches within its documented scope |
| H001–H132 source inventory | 132 unique IDs with source references, not 132 executed journeys |
| CycloneDX npm inventory | 900 resolved components; native inventories retained separately |
| Android Release APK/test AAB | PASS; embedded JS, minification, internal test signing and verification |
| Android API 26 installed-app smoke | 15 checks passed |
| Android API 36 installed-app smoke | 15 checks passed |
| iOS Release simulator build/smoke | PASS; 5 checks, ad-hoc resource signature |
| Workflow jobs and steps | 5/5 jobs passed; zero failed/skipped steps |

Android artifacts include arm64-v8a and x86_64. APK metadata reports minSdk 26, targetSdk 36, version 0.1.0/code 1, and the internal application ID. APK Signature Schemes v2/v3 verified; zip alignment passed. A separate static inspection found all 32 packaged ELF64 libraries' LOAD segment alignments at least 16 KiB. This is not proof of execution on a 16-KiB-page physical device.

iOS was compiled with signing disabled, then the simulator artifact was ad-hoc signed and verified before installation. The successful device was an iPhone 17 Pro simulator on iOS 26.2. The workflow's old step label "Package unsigned simulator app" does not describe the delivered signature: it is AD HOC, with no Apple team identity. It is not an IPA or a TestFlight submission.

## Delivered binary checksums
| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| hidi-internal.apk | 42171987 | 1b420d321a72afeae39e00402960327d9cf2ee7a4bd2ea629ef27ba9b7835986 |
| hidi-internal-test.aab | 29854998 | dd30cda2ec378c162e34efa2868c51d66a024848c0aebee9bd34d3959813a1be |
| HIDI-simulator.zip | 17037137 | 0c5b71eec2e2f20aaa8d056bb0e1b9f54a50778b1ff3148160d50099415284ff |

Full GitHub artifact IDs, archive digests, test scope and remaining blockers are in `apps/mobile/docs/phase8-verification.md`. No signing key is included. The internal APK can run without Metro. Because test signing is ephemeral, updating over an earlier internally signed build may require uninstalling that earlier internal app. Do not uninstall the production app.

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

## Evidence limits / remaining release gate
All successful smoke runs use hosted emulators/simulators and test identities. The Android smoke route performs no OTP, payment, return or support writes. 320/360/390/412 dp, 100/130/200% text, night appearance, landscape and restart/offline states were captured; they are NOT approved baseline diffs or assistive-technology sign-off. Five Activity launch samples per Android environment are not useful-shell p95, backend load tests or real-user crash metrics. The universal APK/test AAB sizes are not a measured device-specific Play download size.

Release remains blocked by live OTP/provider reconciliation, missing native payment handoff, full local account isolation, missing/untested after-sales/privacy/support operations, merchant policy, physical-device accessibility, full visual approval, representative performance, and production signing/store/rollout approval. These are not waived by the passing pipeline. Only the automated technical subgate is closed.
