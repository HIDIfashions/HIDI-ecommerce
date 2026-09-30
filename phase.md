# HIDI Mobile — phase tracking

Branch: `hidi-mobile-build-from-scratch`. React Native frontend only; native Android and iOS projects under `apps/mobile`. Existing backend/APIM/database/providers unchanged. No previous mobile UI code is a design reference. Phase-by-phase owner approval remains required.

## Latest full regression rerun — 30 September 2026
Owner requested all existing regression tests and the final downloadable APK. Status: **AUTOMATED REGRESSION PIPELINE PASSED / INTERNAL TEST APK DELIVERED**.
Run `36718880259`, attempt 1, source `70c1ccb7f7e86339fba69fd07f537e958348b6b3`, completed 13:21:47 UTC. All five jobs passed. TypeScript and all 135 tests/17 suites passed, with no failed or pending tests. Android API26 and API36 each passed 15 installed-APK checks; iOS passed five simulator checks. Audits and artifact/binary digest checks passed. No application, dependency, feature-flag, backend/APIM or test-expectation changes were needed. Closing documentation does not change the tested artifact.

Delivered APK: `HIDI-Final-Regression-Test.apk`, 42171987 bytes, SHA-256 `7914877ee892233b1f434943a0e49a151fbb92d73f4d6b51739316e6c6e27fe5`. It is an internal staging build, not a production release. Exact job/artifact evidence: `apps/mobile/docs/final-regression-request.md`. The existing full-release blockers below remain unchanged.

## Phases 0–7: recorded CI checkpoints
| Phase | Scope | Recorded verification run |
| --- | --- | --- |
| 0 | Native React Native foundation | 36570551111 |
| 1 | H001–H022 welcome/discovery | 36585777566 |
| 2 | H023–H044 product/bag | 36614729523 |
| 3 | H045–H060 checkout/payment frontend | 36628638488 |
| 4 | H061–H082/H128–H131 after-sales frontend | 36634182910 |
| 5 | H083–H102/H123–H126/H132 account/support | 36648013506 |
| 6 | H103–H118/H121–H122/H125 system/editorial | 36668877144 |
| 7 | H119/H120/H127 optional growth | 36673190391 |

These are historical compilation/unit/component checkpoints, NOT live operational acceptance. Phase 7 passed 87 tests/11 suites at `3a72c1cd25aa54788bf7917ee21a733e63b607a6`; closure `b53d33e3196491cf7df3235ce83764196c9ecf5d` changed documentation only. Optional growth remains OFF. Synthetic adapter tests do not establish live commercial or provider capabilities.

## Phase 8 — hardening and release evidence
Automated technical gate: **PASSED**.
Overall blueprint release acceptance: **OPEN / BLOCKED — NOT PRODUCTION READY**.
Owner approval: 30 September 2026.
Source: blueprint pages 10, 92–95 and 98.
Initially verified source: `c787270c66f594f0727000713214f6e39818223c`.
Initial successful workflow: `36686275612`, attempt 1, completed 30 September 2026 at 08:10:21 UTC.
Initial evidence record: `apps/mobile/docs/phase8-verification.md`.

### Executed and verified in the initial Phase 8 gate
All five jobs passed with no failed or skipped steps in that historical run: regression-phase8, android-build-phase8, android-smoke-phase8 (26), android-smoke-phase8 (36), and ios-phase8.

- TypeScript and all 135 unit/component tests across 17 suites passed; zero failed or pending tests. Existing phases' tests remain enabled.
- npm ci uses the committed lock. npm audit returned zero known vulnerability findings at execution time. The limited source credential-pattern scan returned no findings. The CycloneDX resolved-npm inventory contains 900 components.
- Android release APK and test AAB built with embedded JavaScript; internal test signatures, alignment checks, symbols/mapping and checksums were produced.
- The delivered APK passed 15 installed-app smoke checks on API 26 and another 15 on API 36: guest navigation, layout/configuration changes, restart, offline recovery and fatal-runtime-error checks.
- iOS Release simulator app built and passed five signature/install/launch/relaunch/deep-link/process checks after ad-hoc simulator resource signing. It is not a physical-device IPA or TestFlight build.
- Downloaded artifact archive digests and binary checksums were independently checked. Source inventory traces H001–H132; it does not claim 132 executed UI journeys.

### Hardening delivered
Payment preparation is blocked before allocating an order or reservation when the native PSP bridge is absent. Payment recovery matches fresh server order reference/currency/total rather than trusting cached capture state. Confirmed-order UI does not infer COD from a missing payment object or clear an unrelated pending checkout. Prices retain exact minor units. Network cancellation, 204, malformed responses and server cooldowns are explicit without automatic write retries. Deep links are stricter. Shared forms are labeled and keyboard-aware. Large text uses adaptive tabs/cards. Android release fragment restoration and iOS URL/resource-signing handling were corrected. Fabricated system recovery IDs, update notices, story/look content and no-op success actions were removed.

### Required before complete release acceptance
Live identity/OTP and native payment/reconciliation validation; full local checkout/address account isolation and cross-account authorization checks; missing after-sales/privacy/support capabilities and operational validation; approved merchant policies; physical-device accessibility; approved visual comparisons across the required screen matrix; representative performance and reliability measurements; and production signing/store/rollout approval. Account isolation is outstanding implementation/testing work, not merely external approval. Optional growth stays OFF and new native payment preparation stays blocked.

## Next checkpoint
Internal build-and-smoke verification and the requested automated rerun are finished. Continue the explicitly open release-hardening and live-integration ledger in `apps/mobile/docs/phase8.md`. Do not represent all of Phase 8 or the production release as complete, publish to a store, change the existing backend, or enable unsupported capabilities on the strength of CI alone. Closing updates change documentation/evidence only; delivered binaries remain tied to their verified source.
