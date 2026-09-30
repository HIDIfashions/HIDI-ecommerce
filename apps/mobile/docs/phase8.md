# Phase 8 — hardening and release evidence

Automated technical gate: **PASSED**.
Full blueprint release gate: **OPEN / BLOCKED — NOT PRODUCTION READY**.
Branch: `hidi-mobile-build-from-scratch`.
Verified source: `c787270c66f594f0727000713214f6e39818223c`.
Successful run: `36686275612`, 30 September 2026.
Detailed evidence: [phase8-verification.md](phase8-verification.md).
Source: HIDI Mobile App Development Blueprint pages 10, 92–95 and 98; retained screen IDs H001–H132 and scenarios AT-01–AT-10.

## Technical work completed
Committed npm lock; all existing regression tests plus failure-injection, canonical payment-recovery and rendered-component checks; source credential-pattern/dependency scans; resolved-lock CycloneDX inventory; source-to-screen report; embedded-JavaScript release builds; separately installable internal Android APK/test AAB; ad-hoc-signed iOS simulator app; simulator installation, guest navigation, layout, lifecycle and offline captures; checksums and source provenance. All five jobs passed in the final run. No production backend/APIM/provider change or publishing occurred.

## Safety corrections validated by the automated checks
- The former handoff path could prepare an order despite the missing native PSP bridge. It now fails closed before token allocation or stock/order/payment mutation, with an explicit internal-build message.
- Payment recovery uses fresh matched order reference/currency/total, not a cached capture flag. Missing payment data is not labeled COD or paid. Viewing an old order does not clear another unresolved checkout.
- Integer minor-unit prices are preserved; invalid/unsafe amounts are not displayed as valid payable values.
- Network metadata stays out of fetch options. Cancellation, empty 204 responses, malformed payloads, cooldown and uncertain writes are explicit; writes are not automatically retried.
- Deep links reject untrusted hosts, extra path segments and encoded separators.
- Shared fields expose labels/errors, screens handle keyboard insets, and product cards/tabs adapt for large text. The 320 dp/200% tab layout retains the five complete labels.
- Android optimized release Activity recreation uses the screens restoration factory with targeted shrinker rules. iOS forwards supported URLs and its simulator resources are sealed with verified ad-hoc signing.
- System recovery UI no longer invents support IDs, update requirements, published stories/looks or uploaded attachments. Recovery actions do not manufacture a completed operation.

## Remaining release work — not waived
| Blocker | Required evidence / work |
| --- | --- |
| LIVE-IDENTITY | Confirm the current auth contract and validate real OTP/session delivery, expiry and recovery through the existing approved provider. |
| LIVE-PAYMENT | Connect/validate the native PSP handoff against the existing backend; exercise callback loss and reconcile the same order without a duplicate charge. New preparation stays blocked meanwhile. |
| ACCOUNT-ISOLATION | Complete frontend scoping/cleanup for legacy checkout/address caches; test logout/account switch and server cross-account authorization. This is outstanding implementation/testing, not only approval. |
| AFTER-SALES | Resolve current capability gaps and validate actual shipment, cancellation, partial refund, pickup and exchange handling with the existing service owners. |
| PRIVACY-OPERATIONS | Validate actual support, export/deletion and guest-access operations, authorized access and responsible operational owners. |
| PHYSICAL-A11Y | Physical 2–4 GB devices, TalkBack/VoiceOver, Switch Access, keyboard and required form journeys at 200% text. Simulator screenshots alone are insufficient. |
| VISUAL-BASELINES | Approve comparisons across the required 132 screen/state IDs. Current captures are initial evidence; very narrow large-text branding still warrants visual review. |
| PERFORMANCE-SLO | Representative useful-content startup, image budgets, jank, backend load and reliability measurements; no achieved p95/crash-free claim from the five emulator samples. |
| PRODUCTION-SIGNING | Approved app/store ownership, production signing custody, listings, authentic policy/deletion/support URLs, merchant/fulfillment rules and staged rollout/stop thresholds. |

Optional growth remains OFF. No capability is activated solely to satisfy a test. Use the delivered internal app only with test data; it is not cleared for customer accounts or payments.

## Acceptance scenario ledger
AT-01: verification UI exists; real expired-OTP/provider proof remains open.
AT-02/03: inventory/price model simulations and exact-SKU checks pass; deliberate actual last-unit and changed-quote races remain required.
AT-04: mocked fresh-server recovery/no-new-attempt regressions pass; real provider capture/callback-loss rehearsal remains blocked by the missing bridge.
AT-05: COD is unavailable in the current adapter. Display labeling tests require explicit server COD; absent payment data never implies COD.
AT-06/07/08: split shipment, partial refund and exchange authority require controlled backend/provider E2E evidence; they are not claimed as tested live operations.
AT-09: URI/order-context checks pass; complete account/cache isolation and authorized deletion/access testing remain release blocking.
AT-10: shared semantics and installed simulator layout/lifecycle checks pass in their limited scope; complete human assistive-technology and P0 form acceptance remains open.

## Evidence distinctions
135 tests and 35 installed-app smoke assertions are not 132 completed UI journeys. Source references do not prove rendering. Captured layouts do not constitute approved visual regressions. Android Activity-start samples are not useful-shell p95 on physical hardware. The source scanner is limited pattern matching, not a historical credential audit. Zero npm audit findings reflects the advisory database at execution time, not a guarantee of defect-free dependencies.

The Android internal signer is ephemeral and the package is `com.thehidi.app.internal`; the AAB is test-only, not approved for Play. The iOS simulator application uses ad-hoc signing and is not a physical-device IPA. Artifact sizes are not a measurement of device-specific store download size.

## Rollback / forward fix
Keep production and the website unchanged. Retain source SHA, signatures, checksums and evidence. Stop distributing any internal candidate that fails a real check and forward-fix on this branch without rewriting history or backend contracts. Do not reuse ephemeral test signing for production. Reinstall only the separate internal Android app when a later test signer differs; never remove the customer's production app. Keep new payment preparation blocked until handoff and reconciliation are approved. Public release requires the unresolved ledger above, named owners and an approved staged rollout.
