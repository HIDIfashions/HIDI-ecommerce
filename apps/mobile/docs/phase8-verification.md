# Phase 8 — verified technical evidence

Verified 30 September 2026. This record closes the automated technical subgate only. The full blueprint release gate remains OPEN/BLOCKED.

- Repository: HIDIfashions/HIDI-ecommerce
- Branch: hidi-mobile-build-from-scratch
- Source and workflow input: c787270c66f594f0727000713214f6e39818223c
- Workflow: Mobile Phase 8, run 36686275612, attempt 1
- GitHub URL: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/36686275612
- Completed: 2026-09-30T08:10:21Z; conclusion: success
- Environment: staging; no production deployment; optional growth disabled
- Closing documentation commit does not change the application, tests, native configuration or workflow that produced these artifacts.

## Jobs
| Job | ID | Result |
| --- | ---: | --- |
| regression-phase8 | 109792764943 | success |
| android-build-phase8 | 109792935187 | success |
| android-smoke-phase8 (26) | 109795615066 | success |
| android-smoke-phase8 (36) | 109795615163 | success |
| ios-phase8 | 109792935076 | success |

Every step in these five jobs has conclusion success in this final run; none failed or was skipped. Earlier failing attempts remain in history and are not relabeled successful.

## Test, audit and inventory results
Downloaded `tests.json`: 135 passed tests, 0 failed, 0 pending; 17 passed suites; success=true. This includes all earlier-phase tests, with 48 additional tests compared with the Phase 7 count of 87. It does not measure end-to-end percentage or every screen interaction.

`npm-audit.json`: 0 information/low/moderate/high/critical vulnerabilities at execution time. `secret-scan.json`: no pattern matches within application-source scope, not full Git history. `sbom.cdx.json`: 900 resolved npm components. Gradle dependency listing and Podfile.lock accompany native artifacts. The 132-entry screen inventory has source references for every ID but explicitly marks physical-device and approved-visual checks NOT_EXECUTED.

Lock SHA-256: 849a364d8ebfabad85b5acff4385abfa882c66f6ec440b49556c7c4c655315a3.

## Installed-app smoke scope
Android API26 and API36 each passed 15 assertions: bundled release launch without Metro; guest entry; Shop/Saved/You tab access; absence of contacts permission; four configuration checks at 320dp/200%, 360dp/130%, 390dp/100% and 412dp/200%; process restart; offline cold launch; offline guest entry; connectivity recovery feedback; and absence of the tested fatal Java/JS error signatures. Dark/landscape screenshots and five OS Activity-start samples per environment were collected. These are no-write guest smoke tests, not full commerce or physical-device accessibility tests.

API26 emulator-control adbd is elevated only to permit hosted network-state controls; the installed application retains its ordinary app UID. The API26 harness correction did not add app privileges or skip runtime-error assertions.

iOS: iPhone 17 Pro / iOS 26.2 simulator. Five assertions passed: ad-hoc simulator resource-signature verification; release installation/launch; relaunch and OS URL handoff; process surviving navigation; embedded JS bundle present. Welcome light/dark and collection deep-link screenshots were inspected. No VoiceOver, physical iPhone, Apple team signing, TestFlight or live payment coverage is claimed.

## Artifact archives
| GitHub artifact | ID | Bytes | Archive SHA-256 |
| --- | ---: | ---: | --- |
| phase8-regression | 11083911648 | 532045 | e9d57c78ebc0ab4875a7b4e72398bf9574ca98eee80efb2a9964bf0c9ee5c37a |
| phase8-android-build | 11084155895 | 66871359 | c3aa76dfbd41c4201d128bae0d9ce3295e2c7dbc4dceeaa598baa1123811789c |
| phase8-android-smoke-26 | 11083988532 | 1623261 | 122c4fc140edff450946b6459aaf88b679d0fdffde10de23826dfe55730940f1 |
| phase8-android-smoke-36 | 11084761670 | 2137915 | a57de169a48cdfbce6d8a64ef7f5e4592a70ba10b65533425af7592ecbf10aeb |
| phase8-ios | 11083884975 | 24372418 | 969db0b4373d973bdbceb47eb8526219dae7e6630f7f2c387ebf8e16b18d9d5b |

All five downloaded archive digests matched GitHub. Artifacts are retained by this run until 14 October 2026; downloaded copies preserve the tested output separately.

## Deliverable binaries and signing
| Binary | Bytes | SHA-256 |
| --- | ---: | --- |
| hidi-internal.apk | 42171987 | 1b420d321a72afeae39e00402960327d9cf2ee7a4bd2ea629ef27ba9b7835986 |
| hidi-internal-test.aab | 29854998 | dd30cda2ec378c162e34efa2868c51d66a024848c0aebee9bd34d3959813a1be |
| HIDI-simulator.zip | 17037137 | 0c5b71eec2e2f20aaa8d056bb0e1b9f54a50778b1ff3148160d50099415284ff |

APK metadata: com.thehidi.app.internal; version 0.1.0/code 1; minSdk26/targetSdk36; arm64-v8a/x86_64. Release JS is embedded as assets/index.android.bundle. APK Signature Schemes v2/v3 verify. Signer subject: CN=HIDI INTERNAL TEST ONLY, OU=Not for production, O=HIDI. Certificate SHA-256: bd84b1016b30dca61cca9c919f22c43c9c302a1438414db9d526091ecf1e6dd2. No private signing key is committed or distributed. AAB signing is internal test-only, not Play approval. Zip alignment passes. Local static inspection of all 32 delivered ELF64 libraries found LOAD segment alignment >=16 KiB; physical 16-KiB-page execution remains untested.

iOS app has Signature=adhoc and no TeamIdentifier; codesign reports valid on disk and designated requirement satisfied. It is a simulator application, not a distributable iPhone IPA. A workflow packaging step retains an older "unsigned" label; that label must not be mistaken for the actual verified ad-hoc signature.

## Stop-release decision
Release-readiness.json remains BLOCKED for LIVE-PAYMENT, LIVE-IDENTITY, ACCOUNT-ISOLATION, AFTER-SALES, PRIVACY-OPERATIONS, PHYSICAL-A11Y, VISUAL-BASELINES, PERFORMANCE-SLO and PRODUCTION-SIGNING. These include actual implementation/test gaps, not only approvals. Read phase8.md for required closure evidence. Use test data only; no customer launch or store publication is approved by this record.
