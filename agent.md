# HIDI Mobile — agent agreement

Branch: `hidi-mobile-build-from-scratch`. Frontend-only React Native. Existing backend/APIM/database/provider contracts are not changed. Source precedence: actual approved merchant/API contracts, then blueprint behavior/accessibility, then tokens, then rendered illustrations. No old mobile UI reuse.

## Invariants
No guessed credentials, monetary success, inventory, delivery, refund, rewards, ticket/deletion or policy claims. Do not interpret transport failure as empty state or payment failure. No automatic financial retries, first-launch permission prompts, mandatory browsing sign-in, contact scraping or automatic referral messages. Exact canonical SKU/price/order context remains authoritative. Growth flags stay OFF until server and commercial approvals exist. Tests/fixtures never become production data.

## Current checkpoint
Phase 8 automated technical gate PASSED at source `c787270c66f594f0727000713214f6e39818223c`, workflow `36686275612`, attempt 1. All five jobs completed successfully, with no failed/skipped steps. Test report: 135/135 passing tests, 17/17 suites, zero pending tests. Both Android API26/API36 installed-app smoke suites passed 15 checks each. iOS Release simulator smoke passed five checks, including ad-hoc resource-signature verification. Artifact digests were checked against GitHub and recorded in `apps/mobile/docs/phase8-verification.md`.

This is NOT complete production-release acceptance. Missing native payment integration, unverified live OTP, incomplete legacy local account/cache isolation, missing after-sales/privacy/support capabilities, approved merchant rules and real-device/visual/performance/signing evidence remain release-blocking. Account isolation remains code/test work; do not describe all remaining items as someone else's approvals. New payment preparation is blocked to avoid unpayable orders. Existing order reads must remain available without automatically creating another attempt.

## Evidence discipline
Use actual executed output. A 132-ID source inventory is not UI coverage; screenshots without approved baselines are not visual regression; emulator Activity-start timing is not useful-content p95 on physical hardware. Zero npm audit findings is not a guarantee that no vulnerabilities exist. Source-pattern scanning is not repository-history credential auditing. CI still emits some dependency/tool deprecation warnings; zero failed checks does not mean zero warning lines or a defect-free product.

Update phase.md, agent.md and build.md after further work. Full Phase 8 release acceptance stays OPEN/BLOCKED until the release ledger is satisfied. Never replace a failing real check with a skipped check or a mock that claims a live success.

## Change safety
Work only on this branch. No force-push, main merge or production deployment. The internal Android/iOS identity is `com.thehidi.app.internal`; production remains `com.thehidi.app`. The Android signer is an ephemeral test-only key; iOS simulator signing is ad hoc, without an Apple team identity. Never commit or upload private signing keys. A later internally signed Android build may require uninstall/reinstall because the test key changes. Do not use real customer credentials, addresses or payment data while release blockers remain.

The latest closing commit is documentation/evidence only; do not attribute a new native test run to it. Recheck the actual branch before further edits and preserve the exact source/artifact relationship.
