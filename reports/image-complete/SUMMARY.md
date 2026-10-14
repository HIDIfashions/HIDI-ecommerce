# HIDI complete application and upload tests

Tested commit: `c4dfedf4156aaa8ac94bd2d09ba3e44285c0a47a`
Run: 38647227116
Production and database changes: NONE

| Suite | Result | Passed cases | Failed cases |
|---|---|---:|---:|
| prisma-generate | PASS | 0 | 0 |
| frontend-regression | FAIL | 467 | 4 |
| api-regression | PASS | 382 | 0 |
| image-and-overlay-regression | PASS | 178 | 0 |
| legacy-buffer-boundary | PASS | 0 | 0 |
| genuine-large-photo | PASS | 0 | 0 |
| python-account-otp-release | PASS | 58 | 0 |
| python-account-otp-web-completion | PASS | 24 | 0 |
| python-account-privacy-links-preservation | PASS | 10 | 0 |
| python-admin-delete-release | PASS | 11 | 0 |
| python-button-states-release | PASS | 11 | 0 |
| python-button-states-revert | PASS | 11 | 0 |
| python-catalogue-polish | PASS | 3 | 0 |
| python-media-upload-config | PASS | 9 | 0 |
| python-msg91-browser-evidence | PASS | 11 | 0 |
| python-msg91-image-preservation | PASS | 4 | 0 |
| python-msg91-rollout | PASS | 4 | 0 |
| python-order-notifications-release | PASS | 4 | 0 |
| python-performance-rollout | PASS | 0 | 0 |
| python-photo-upload-release | PASS | 4 | 0 |
| python-privacy-policy-release | PASS | 5 | 0 |
| python-product-skn-landing | PASS | 7 | 0 |
| python-product-skn-release | PASS | 21 | 0 |
| python-product-upload-release | PASS | 27 | 0 |
| python-product-upload-retry-patch | PASS | 13 | 0 |
| python-shopping-ux-deploy | PASS | 4 | 0 |
| api-build | PASS | 0 | 0 |
| web-build | PASS | 0 | 0 |
| web-lint | FAIL | 0 | 0 |
| browser-photo-digest | PASS | 0 | 0 |
| browser-admin-quick-tools | PASS | 0 | 0 |
| browser-skn-photos | PASS | 0 | 0 |
| browser-button-states | PASS | 0 | 0 |
| browser-admin-product-delete | PASS | 0 | 0 |
| admin-browser-chromium | PASS | 10 | 0 |
| admin-browser-firefox | PASS | 10 | 0 |
| admin-browser-webkit | PASS | 10 | 0 |
| homepage-browser | PASS | 0 | 0 |
| editorial-browser | PASS | 0 | 0 |
| polish-browser | PASS | 0 | 0 |
| navigation-browser | PASS | 0 | 0 |
| otp-browser | PASS | 0 | 0 |
| web-upload-and-rendering | FAIL | 0 | 0 |

Browser per-case results are included in cases.csv; command-only gates do not invent case counts.
Legacy buffer boundary tests concern an unused buffered helper, not the live-route photo size policy.

## Not executed
- Authenticated Azure service upload, actual ingress limits, SQL migration and measured Azure memory/disk use
- Real HIDI garment colour, embroidery and zoom approval
- Production deployment and live website speed measurement
- Retained-container-only browser fixtures (Product Upload full runtime, navigation, OTP, privacy integration) require matching container snapshots, not a fresh Next build

## Failed cases
- frontend-regression: current upload route derives idempotent keys from the bytes it actually received
- frontend-regression: current upload route preserves mapping validation and legacy optional image codes
- frontend-regression: current upload route rejects missing, expired and cross-origin sessions before reading file bytes
- frontend-regression: current upload route cleans temporary files after ticket or metadata failure and never claims success
- browser:photo-web-upload: chromium / 45 MiB JPEG plus PNG upload through the real sequential web client
