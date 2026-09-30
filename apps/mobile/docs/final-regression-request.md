# Final regression rerun and APK handoff

Owner request: rerun all regressions and provide the downloadable APK.
Status: COMPLETE FOR THE EXISTING AUTOMATED REGRESSION PIPELINE. Production-release acceptance remains BLOCKED.
Verified on 30 September 2026.
Repository: HIDIfashions/HIDI-ecommerce.
Branch: hidi-mobile-build-from-scratch.
Tested source: 70c1ccb7f7e86339fba69fd07f537e958348b6b3.
Workflow: Mobile Phase 8, run 36718880259, attempt 1.
Run URL: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/36718880259
Completed: 2026-09-30T13:21:47Z. Overall conclusion: success.

## Executed results
| Job | ID | Result |
| --- | ---: | --- |
| regression-phase8 | 109898586423 | success |
| android-build-phase8 | 109898818254 | success |
| android-smoke-phase8 (26) | 109903074502 | success |
| android-smoke-phase8 (36) | 109903074412 | success |
| ios-phase8 | 109898818253 | success |

Downloaded tests.json confirms 135 passed tests, zero failed, zero pending, and 17 passed suites. All 17 test-suite files in the exported source are represented in the execution report; no suite was removed or disabled. TypeScript passed. npm audit returned zero known vulnerabilities in all severity categories at execution time. The limited source credential-pattern scan returned no findings. The resolved npm inventory contains 900 components.

The installed release APK passed 15 smoke checks on Android API26 and another 15 on API36: launch without Metro, guest entry, Shop/Saved/You navigation, no contacts permission, 320/360/390/412dp and 100/130/200% text configuration changes, process restart, offline launch/entry/recovery feedback, and tested fatal-runtime-error signature checks. Dark and landscape captures are included in the evidence, not treated as complete visual approval.

iOS Release compilation, installation and five smoke checks passed on an iPhone 17 Pro / iOS 26.2 simulator: ad-hoc resource signing, installation/launch, relaunch/URL handoff, process survival and embedded JavaScript. The completed job log and downloaded smoke/results.json confirm execution and successful packaging. The step-summary endpoint still displayed stale in-progress metadata on the last fetch even though the run/job conclusions and completed logs were successful; this record relies on the completed execution evidence rather than inventing per-step API values.

## Exact APK delivered
Filename: HIDI-Final-Regression-Test.apk (copied unchanged from hidi-internal.apk).
Bytes: 42171987 (about 42.2 MB).
SHA-256: 7914877ee892233b1f434943a0e49a151fbb92d73f4d6b51739316e6c6e27fe5.
Version: 0.1.0 / code 1. Application ID: com.thehidi.app.internal.
Minimum SDK: 26. Target SDK: 36. ABIs: arm64-v8a and x86_64.
Embedded JavaScript: present; byte-identical to the previous verified application bundle. Metro is not required.
APK Signature Schemes v2/v3 verified; ZIP alignment passed. Internal signer certificate SHA-256: 22f18bb850ee1a2ce63ae7ac10bc12ba5e36ff05107f4866ea9b45c58d50b97a.
All 32 packaged ELF64 libraries passed the separate static LOAD-segment-alignment check; no physical 16KiB-page device test is claimed.

## Downloaded artifact integrity
| Artifact | ID | ZIP SHA-256 |
| --- | ---: | --- |
| phase8-regression | 11097401620 | a1632fa5ce9b72dcc0cbe097be86a62969e961ce667ab7f4a95f6c90dbf1a857 |
| phase8-android-build | 11098510465 | dd9d2316466f7b5786c93d7cb7f2d57e7c8e67e521170f8178a49776b524a22d |
| phase8-android-smoke-26 | 11097932837 | 10db09eaa7d8dbb5bda0ceea25fbacf7696222376d0e3e5cd3e1b9a30bcc9631 |
| phase8-android-smoke-36 | 11097693439 | 5631a43e449ce465c3e2661d766d4d5ea7897bd1da9de861394ea218fa009048 |
| phase8-ios | 11098796309 | 6178504d57f3ffeff03134bff6399d23a3a5234109fa788f28456eebad0e84a4 |

All five archive digests matched GitHub. APK/AAB and iOS-app ZIP digests matched the build manifests. Raw results, signatures, dependency inventories, screenshots and a readable test index are in the delivered regression report. Private keys and loose font files are not distributed.

## Installation and limits
Internal staging/test data only. Android's package installer can install the APK. A previous com.thehidi.app.internal installation may require uninstalling first because each build uses an ephemeral test signer. Uninstalling deletes that internal installation's local data. Do not remove or replace a separate production app.

No application code, dependencies, test expectations, feature flags, backend/APIM or provider configuration changed during this rerun. Closing documentation updates do not alter the tested binaries.

This pass is not proof of every 132-screen journey, all live transactions or a defect-free product. New native payment preparation remains blocked because the PSP handoff is missing; live OTP delivery remains unconfigured/unverified in this internal build. Local account/cache isolation and missing after-sales/privacy/support operations remain implementation/integration work. Physical accessibility, approved visual baselines, representative performance and production signing/merchant rollout approvals remain open. Optional growth remains OFF. Use test data only. Non-fatal dependency/tool warnings remain in the logs.
