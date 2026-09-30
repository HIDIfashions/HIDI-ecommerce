# HIDI Mobile — phase tracking

Branch: `hidi-mobile-build-from-scratch`. React Native frontend only; native Android and iOS projects under `apps/mobile`. Existing backend/APIM/database/providers unchanged. No previous mobile UI code is a design reference. Phase-by-phase owner approval remains required.

## Phases 0–7: recorded CI checkpoints
| Phase | Scope | Verified workflow |
| --- | --- | --- |
| 0 | Native React Native foundation | 36570551111 |
| 1 | H001–H022 welcome/discovery | 36585777566 |
| 2 | H023–H044 product/bag | 36614729523 |
| 3 | H045–H060 checkout/payment frontend | 36628638488 |
| 4 | H061–H082/H128–H131 after-sales frontend | 36634182910 |
| 5 | H083–H102/H123–H126/H132 account/support | 36648013506 |
| 6 | H103–H118/H121–H122/H125 system/editorial | 36668877144 |
| 7 | H119/H120/H127 optional growth | 36673190391 |

These are compilation/unit/component checks, NOT live operational acceptance. Phase 7: 87 tests/11 suites passed at `3a72c1cd25aa54788bf7917ee21a733e63b607a6`; closure `b53d33e3196491cf7df3235ce83764196c9ecf5d` changed documentation only. Optional growth remains OFF. Its preview rewards, synthetic adapter tests and missing live contracts are described in `apps/mobile/docs/phase7.md`.

## Phase 8 — hardening and release evidence
Status: IN PROGRESS / RELEASE NOT APPROVED.
Owner approval: 30 September 2026.
Source: blueprint pages 10, 92–95, 98. Details: `apps/mobile/docs/phase8.md`.

Baseline audit: all 87 tests passed and npm reported no known dependency vulnerabilities. Initial evidence export path failure was fixed; audit run `36677057528` supplies the baseline. Native release builds, frozen dependency tree, source/credential scans, simulator guest/lifecycle/layout checks and immutable artifact/signature/checksum evidence are now being added. No new checks are considered passed until their actual results are read.

Hardening changes under validation: block new payment preparation without a real native PSP bridge; use fresh matched server order context for recovery instead of cached capture state; preserve price minor units; handle cancellation/204/non-JSON/network uncertainty; stricter deep links; keyboard-aware and labeled fields; native iOS URL forwarding.

The release gate remains BLOCKED for unverified live OTP/provider/payment/after-sales/privacy integrations, legacy local identity isolation, physical-device accessibility, approved full-screen visual baselines, representative performance, and production signing/merchant/operations approval. These are not waived by CI or hidden behind fake success.

## Next checkpoint
Read every Phase 8 result, fix failed technical checks, publish internal-only artifacts and the release-readiness ledger, then record exact verified source revision. Do not publish production or silently activate unavailable capabilities.
