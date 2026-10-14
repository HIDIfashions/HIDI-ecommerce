# HIDI complete image candidate test results

Tested commit: `3e2b9d41f0fc8036a642299cb88814608a658d48`
Run: 38636628924
Production changes: NONE

| Suite | Result | Passed cases | Failed cases |
|---|---|---:|---:|
| prisma-generate | PASS | 0 | 0 |
| frontend-regression | FAIL | 226 | 14 |
| api-regression | PASS | 382 | 0 |
| image-regression | FAIL | 75 | 2 |
| large-photo-stress | PASS | 0 | 0 |
| deployment-guards | PASS | 0 | 0 |
| api-build | PASS | 0 | 0 |
| web-build | PASS | 0 | 0 |
| web-lint | FAIL | 0 | 0 |
| admin-browser | PASS | 0 | 0 |
| homepage-browser | PASS | 0 | 0 |
| editorial-browser | FAIL | 0 | 0 |
| polish-browser | PASS | 0 | 0 |

## Not executed
- Authenticated Azure upload and resource test
- Real catalogue colour/embroidery approval
- Production deployment and live speed measurement

## Failed cases
- frontend-regression: apps/web/lib/product-sharing.test.mjs
- frontend-regression: HIDI theme keeps homepage and catalogue commerce on Mulberry, Gold and warm ivory
- frontend-regression: wallet checkbox starts unchecked; full-wallet checkout works without Razorpay SDK
- frontend-regression: cash checkout does not create an order before SDK is available
- frontend-regression: partial redemption sends only the server-authoritative cash amount to Razorpay
- frontend-regression: double submit creates only one prepare request
- frontend-regression: a lower freshly loaded wallet balance blocks new checkout instead of silently increasing cash
- frontend-regression: identical retry reuses checkout token even when its wallet funds are reserved
- frontend-regression: changed wallet choice creates a new idempotency key
- frontend-regression: captured cash retry redirects without opening a second Razorpay payment
- frontend-regression: account switch cancels a late full-wallet response and resets checkbox
- frontend-regression: guest cash checkout has no Authorization and wallet flag off renders no rewards controls
- frontend-regression: bag ownership conflict offers explicit new-bag action without automatic replacement
- frontend-regression: guest COD checkout bypasses missing Razorpay SDK and redirects once
- image-regression: rejects unsupported PDF and cleans temporary data
- image-regression: rejects truncated multipart and deletes partial files
