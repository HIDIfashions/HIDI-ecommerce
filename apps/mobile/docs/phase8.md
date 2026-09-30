# Phase 8 — hardening and release evidence

Status: IN PROGRESS. Internal validation is not production approval.
Branch: hidi-mobile-build-from-scratch.
Source: HIDI Mobile App Development Blueprint pages 10, 92–95 and 98; retained screen IDs H001–H132 and scenarios AT-01–AT-10.

## Work scope
Reproducible npm lock, complete existing regression suite, failure-injection and rendered-component tests, credential-pattern/dependency scans, resolved-lock CycloneDX inventory, source-to-screen report, embedded-JavaScript release builds, separately installable internal Android APK/test AAB, iOS simulator app, simulator installation/startup/guest navigation/layout/lifecycle captures, checksums and exact source provenance. No production backend/APIM/provider change or publishing.

## Safety corrections under validation
- The prior payment handoff created an order despite having no native PSP bridge. It now fails closed before token allocation or stock/order/payment mutation, with an honest internal-build message.
- Payment recovery no longer treats a cached capture flag as current server truth. It validates order reference, currency and total before classifying the fresh response.
- Minor-unit prices retain cents; noninteger/unsafe amounts are not displayed as valid payable values.
- Network metadata stays out of fetch options; cancellation, empty 204 responses, malformed payloads and Retry-After are explicit. No automatic write retry.
- Deep links reject lookalike hosts, extra path segments, encoded separators and unsupported schemes.
- Shared fields expose labels and errors to accessibility tools, and keyboard-aware bounded screens replace the fixed-width assumption.
- iOS forwards supported URL events to React Native.

## Evidence versus required release sign-off
CI must execute and pass before any build or smoke result is recorded. Screenshot capture is NOT an approved pixel comparison. A source inventory of 132 IDs is NOT 132 executed scenarios. Simulator Activity launch measurements are NOT the blueprint's real-device useful-shell p95. A signed internal APK uses an ephemeral test-only signer and the separate com.thehidi.app.internal identity; it is not a Play upload key or release identity. The unsigned iOS simulator app is not an IPA for physical devices.

## Explicit release blockers
Live identity/OTP contract and provider validation; native payment SDK/handoff and lost-callback end-to-end verification; complete identity isolation of legacy local account/checkout caches; canonical after-sales and privacy/support server capabilities; approved merchant policies and operational owners; physical low-memory devices and TalkBack/VoiceOver/Switch Access sign-off; approved visual diffs for all 132 screens; representative performance/load/crash metrics; production signing custody, store ownership, listings and deletion/support URLs. Optional growth stays off. No blocked feature is enabled to satisfy a test.

## Acceptance scenario ledger
AT-01: existing verification UI; live provider expired-OTP proof still required.
AT-02/03: inventory/price model simulations and exact-SKU validation; race under actual server load remains required.
AT-04: added mocked authoritative-response recovery/no-new-attempt regression; real captured-payment callback-loss rehearsal blocked by missing native provider bridge.
AT-05: COD unavailable in current adapter; no paid claim.
AT-06/07/08: partial shipment/refund/exchange authority requires existing backend/provider capability and controlled E2E rehearsal; not simulated as real operations.
AT-09: URI/order-context checks covered; full cross-account authorization/deletion/cache isolation still release blocking.
AT-10: shared-field semantics and simulator layout evidence are automated; human assistive-technology sign-off remains required.

## Rollback / forward fix
Keep production and the website unchanged. Install only the internal package. Keep the last known passing commit and immutable artifacts/checksums. If a smoke check fails, stop distribution of that candidate and forward-fix on this branch; do not reset history or change API contracts. Do not reuse the ephemeral signer for production. Keep new payment preparation blocked until native handoff and canonical reconciliation are approved. Real release requires named owners and an approved staged rollout/stop-threshold record.
