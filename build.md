# HIDI Mobile — build and evidence

Branch: `hidi-mobile-build-from-scratch`.
Phase 8 automated technical gate: **PASSED**.
Overall blueprint release acceptance: **OPEN / BLOCKED**.
Latest full regression source: `70c1ccb7f7e86339fba69fd07f537e958348b6b3`.
Latest successful run: `36718880259` (attempt 1), completed 30 September 2026 13:21:47 UTC.
Latest evidence: `apps/mobile/docs/final-regression-request.md`.

React Native 0.87.1 / React 19.2.3 / TypeScript 6 / CI Node 22.13.1. Production identity `com.thehidi.app`; internal validation identity `com.thehidi.app.internal`. Backend/APIM/provider architecture is unchanged.

## Latest regression rerun
All five job conclusions are success. TypeScript and all 135 unit/component regressions across all 17 source test suites passed, with zero failed/pending tests. npm audit: zero known findings at execution time. Limited source credential-pattern scan: no findings. Android API26/API36 installed-APK smoke suites: 15 checks each passed. iOS Release simulator smoke: five checks passed. Fresh APK/AAB and iOS simulator artifacts were built. All five downloaded artifact ZIP digests matched GitHub; binary digests matched the build manifests. The final iOS job log and downloaded smoke evidence confirm successful execution/packaging despite a stale step-summary API snapshot. No test was weakened or skipped to obtain the run result.

### Latest APK handoff
`HIDI-Final-Regression-Test.apk`, copied unchanged from this run's `hidi-internal.apk`.
Size: 42171987 bytes (about 42.2 MB).
SHA-256: `7914877ee892233b1f434943a0e49a151fbb92d73f4d6b51739316e6c6e27fe5`.
Internal signer certificate SHA-256: `22f18bb850ee1a2ce63ae7ac10bc12ba5e36ff05107f4866ea9b45c58d50b97a`.
Version 0.1.0/code 1, minSdk26/targetSdk36, arm64-v8a/x86_64. JavaScript is embedded; no Metro dependency. APK v2/v3 signature and ZIP alignment verified. All 32 delivered ELF64 libraries passed static LOAD-segment alignment inspection; physical 16KiB-page execution remains untested. The application bundle is byte-identical to the prior verified bundle; this rerun did not change application source, dependencies or feature flags.

The test-only signer differs from previous internal builds. An earlier `com.thehidi.app.internal` installation may need uninstalling first; this deletes its local data. Do not uninstall the separate production app. No private signing key is distributed. Use test data only. This is not a customer/store release candidate.

## Reproducibility
The committed package-lock.json is validated with npm ci. Lock SHA-256: `849a364d8ebfabad85b5acff4385abfa882c66f6ec440b49556c7c4c655315a3`.
Every native job used the exact tested source SHA. In the latest run the workflow input and tested source are identical. All prior phase tests remain enabled. The historical Phase 7 push workflow is superseded by `.github/workflows/mobile-phase8.yml` to avoid duplicate builds.

## Prior verified Phase 8 baseline (retained history)
Source `c787270c66f594f0727000713214f6e39818223c`, successful run `36686275612`, completed 30 September 2026 08:10:21 UTC. Full historical artifact IDs, archive digests, test scope and remaining blockers are in `apps/mobile/docs/phase8-verification.md`.

| Gate | Historical result |
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
| Workflow jobs and steps | 5/5 jobs passed; zero failed/skipped steps in that historical run |

Historical binary checksums (do not confuse with the latest APK above):
| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| hidi-internal.apk | 42171987 | 1b420d321a72afeae39e00402960327d9cf2ee7a4bd2ea629ef27ba9b7835986 |
| hidi-internal-test.aab | 29854998 | dd30cda2ec378c162e34efa2868c51d66a024848c0aebee9bd34d3959813a1be |
| HIDI-simulator.zip | 17037137 | 0c5b71eec2e2f20aaa8d056bb0e1b9f54a50778b1ff3148160d50099415284ff |

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
All successful smoke runs use hosted emulators/simulators and test identities. The Android smoke route performs no OTP, payment, return or support writes. 320/360/390/412dp, 100/130/200% text, night appearance, landscape and restart/offline states were captured; they are NOT approved baseline diffs or assistive-technology sign-off. Five Activity launch samples per Android environment are not useful-shell p95, backend load tests or real-user crash metrics. Universal APK/test AAB sizes are not device-specific Play download sizes. iOS simulator signing is ad hoc, without an Apple team; the app is not a physical-device IPA or TestFlight build.

Release remains blocked by live OTP/provider reconciliation, missing native payment handoff, full local account isolation, missing/untested after-sales/privacy/support operations, merchant policy, physical-device accessibility, full visual approval, representative performance, and production signing/store/rollout approval. These are not waived by the passing pipeline. Only the automated technical subgate and requested regression rerun are closed. The final tracking update changes documentation only, not the tested binaries.
