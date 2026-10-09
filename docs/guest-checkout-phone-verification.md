# Guest checkout: 10-digit Indian mobile + OTP

## Customer flow
The phone field has a fixed +91 prefix and a compact ten-digit local input. It supports numeric typing and pasting a formatted +91 number. A valid local number exposes **Verify number**. Typing alone sends nothing.
Clicking requests a six-digit SMS code. The inline verification panel preserves the delivery form and shopping bag.
A correct, unexpired code shows **Verified**. Changing the number discards the proof immediately.
The customer stays a guest: this flow neither calls Supabase sign-in nor creates a User or marketing opt-in.

The existing backend, browser API proxy and Azure resources are retained. This is a scoped checkout verification provider, not a replacement authentication system.

## API / enforcement
- GET /v1/checkout/phone/policy: no-store public rollout status only.
- POST /v1/checkout/phone/send: {sessionId, phone}.
- POST /v1/checkout/phone/verify: {sessionId, phone, challengeId, otp}.
- Existing POST /v1/checkout/prepare receives phoneVerificationToken.

With the gate enabled, the server checks phone, delivery phone, cart session, authenticated actor (or guest), expiry and a random grant before any order/user/wallet/stock/payment work. A verified sign-in phone can be reused only after the existing Auth service confirms it server-side. Email-only accounts need checkout phone verification.

The opaque grant is held only in React memory (not localStorage, URL or cookies), stored server-side as a keyed hash, expires after 15 minutes, and is consumed in the same transaction as order creation. Retries of the same checkout key are allowed; another order/session/phone/actor cannot reuse the grant. A refresh requires verification again. A forged browser "verified" flag has no effect.

OTP validity: 5 minutes; maximum 5 attempts per challenge; resend delay 60 seconds; maximum 5 sends per phone and per cart session per one-hour bucket. There is also a configurable global hourly limit, default 100 (hard upper bound 1000). All counters are durable SQL rows, serialized across replicas. Failed provider sends also consume a rate budget. There is no automatic retry after an ambiguous provider response.

MSG91 verification is keyed by phone, so a resend invalidates earlier outstanding challenges for that phone across sessions. Only an explicit fresh "OTP verified success" provider response succeeds; "already verified" and malformed/ambiguous replies fail closed.

## Activation is NOT automatic
The feature defaults OFF (`CHECKOUT_PHONE_VERIFICATION_REQUIRED` must equal `true`). The compact phone input still enforces ten local digits when off; the old guest checkout behavior is retained. A failed policy request blocks the UI rather than pretending verification is off. An enabled-but-unconfigured provider blocks unverified checkout.

Required release sequence:
1. Confirm MSG91 entity/KYC, DLT header and approved OTP template, provider configuration, and real SMS delivery. Last known application status was pending verification; this code does not establish approval.
2. Review/apply `deploy/sql/checkout-phone-verification.sql` to the intended existing Azure SQL database. It adds two short-lived tables only. Do not use the repository's historical PostgreSQL migrations on Azure SQL. Inspect table/index shape if pre-existing.
3. Configure backend-only `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`, and a cryptographically random `CHECKOUT_PHONE_HASH_KEY` of at least 32 characters using the existing secret mechanism. Optionally set `CHECKOUT_OTP_HOURLY_SEND_LIMIT` after reviewing expected launch traffic and SMS spend. No NEXT_PUBLIC secrets.
4. Deploy compatible API and web together with the gate off. Do not reuse a historical API image or enable only a frontend flag.
5. In an isolated controlled checkout, verify send/invalid/expired/resend/success, actual provider response schema, exact six-digit template delivery, and a real Azure SQL transaction/concurrency check. Browser and in-memory service fixtures are not real SMS or SQL integration certification.
6. Explicitly set the backend gate true only after the preceding checks pass. Confirm guest and existing verified-phone checkout; monitor delivery errors/rate ceilings. Feature-toggle rollback is a business decision because turning it off again permits unverified guests; never auto-disable on outages.

Use `deploy/sql/checkout-phone-retention.sql` through the existing maintenance process to remove expired records in bounded batches. No extra worker/cloud resources are required. HMAC key rotation invalidates outstanding grants and resets hash-based counters: coordinate rotation, do not rotate during traffic as a rate-limit workaround.

## Sensitive-data handling
No raw phone, OTP, provider key, bearer or grant is written to application logs. MSG91's GET verify contract includes phone and code in the upstream URL: redact query strings from HTTP tracing, APM, proxy and exception telemetry before activation. Never return provider raw errors. Use HTTPS, existing WAF/bot protection and the configured global spend ceiling. This flow does not add marketing consent.

## Test commands
Run the existing source and API suites (they include checkout-phone tests), then the production web build and:
`HIDI_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/checkout-phone.browser.mjs`

CI artifacts contain synthetic checkout screenshots and sanitized results only. Live delivery, database installation and activation are separate release gates.
