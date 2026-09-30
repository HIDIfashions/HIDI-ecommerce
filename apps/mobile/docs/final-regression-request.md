# Final regression rerun request

Owner request: rerun all regressions and provide the downloadable APK.
Requested on 30 September 2026.
Branch: `hidi-mobile-build-from-scratch`.
Starting checkpoint: `b10c72ea4de81e0e2a808abe03aaff24196d2caa`.
Application baseline: `c787270c66f594f0727000713214f6e39818223c`.

Status: REQUESTED — no new result is assumed until the run completes.

This documentation-only commit triggers the existing Mobile Phase 8 workflow without changing application code, dependencies, feature flags, backend/APIM, or test expectations. Run every existing Phase 0–8 unit/component regression, TypeScript, dependency and credential-pattern checks, the release-mode Android APK/AAB build, installed-APK API26 and API36 smoke checks, and the iOS Release build and installed-simulator checks. Inspect the final run and downloaded evidence; verify the delivered APK digest and source revision. Fix actual failures rather than skipping tests.

A passing configured suite is not a claim that all 132 screens, physical assistive technologies or live transactions were exercised. The existing release-readiness blockers remain in force: live OTP/provider integration, native payment bridge, complete account/cache isolation, missing after-sales/privacy/support capabilities, physical-device/approved visual and performance acceptance, and production signing/merchant approvals. The APK is for internal testing with test data, not production distribution. No external payment, real order, SMS, support ticket or customer-data mutation is authorized by this regression request.
