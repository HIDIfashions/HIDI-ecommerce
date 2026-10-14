# HIDI complete application and upload tests

Tested commit: `af57341892610b41765ea12ad9fded2444a93eee`
Run: 38640709929
Production and database changes: NONE

| Suite | Result | Passed cases | Failed cases |
|---|---|---:|---:|
| prisma-generate | PASS | 0 | 0 |
| frontend-regression | FAIL | 463 | 1 |
| api-regression | PASS | 382 | 0 |
| image-and-overlay-regression | PASS | 178 | 0 |
| legacy-buffer-boundary | PASS | 0 | 0 |
| genuine-large-photo | PASS | 0 | 0 |
| python-account-otp-release | PASS | 58 | 0 |
| python-account-otp-web-completion | FAIL | 23 | 1 |
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
| python-product-upload-release | FAIL | 26 | 1 |
| python-product-upload-retry-patch | PASS | 13 | 0 |
| python-shopping-ux-deploy | PASS | 4 | 0 |
| api-build | PASS | 0 | 0 |
| web-build | PASS | 0 | 0 |
| web-lint | FAIL | 0 | 0 |
| browser-photo-digest | FAIL | 0 | 0 |
| browser-admin-quick-tools | FAIL | 0 | 0 |
| browser-skn-photos | PASS | 0 | 0 |
| browser-button-states | PASS | 0 | 0 |
| browser-admin-product-delete | PASS | 0 | 0 |
| admin-browser-chromium | PASS | 10 | 0 |
| admin-browser-firefox | PASS | 10 | 0 |
| admin-browser-webkit | PASS | 10 | 0 |
| homepage-browser | PASS | 0 | 0 |
| editorial-browser | FAIL | 0 | 0 |
| polish-browser | PASS | 0 | 0 |

Browser per-case results are included in cases.csv; command-only gates do not invent case counts.
Legacy buffer boundary tests concern an unused buffered helper, not the live-route photo size policy.

## Not executed
- Authenticated Azure service upload, actual ingress limits, SQL migration and measured Azure memory/disk use
- Real HIDI garment colour, embroidery and zoom approval
- Production deployment and live website speed measurement
- Retained-container-only browser fixtures (Product Upload full runtime, navigation, OTP, privacy integration) require matching container snapshots, not a fresh Next build

## Failed cases
- frontend-regression: tests/image-sku-runtime-keys.test.mjs
- python-account-otp-web-completion: test_workflow_keeps_all_three_strict_source_and_actual_image_fixtures_and_only_web_composition (__main__.DormantWorkflow.test_workflow_keeps_all_three_strict_source_and_actual_image_fixtures_and_only_web_composition)
- python-product-upload-release: test_package_update_preserves_existing_navigation_api_and_unrelated_assets (__main__.UploaderGuards.test_package_update_preserves_existing_navigation_api_and_unrelated_assets)
- browser:editorial-storefront: chromium / SRCH-01
- browser:editorial-storefront: chromium / LOOK-01
- browser:editorial-storefront: chromium / FOOT-01
- browser:editorial-storefront: chromium / QUAL-13
- browser:editorial-storefront: chromium / QUAL-14
- browser:editorial-storefront: chromium / FIX-07
- browser:editorial-storefront: chromium / FIX-05
- browser:editorial-storefront: firefox / SRCH-01
- browser:editorial-storefront: firefox / LOOK-01
- browser:editorial-storefront: firefox / FOOT-01
- browser:editorial-storefront: firefox / QUAL-13
- browser:editorial-storefront: firefox / QUAL-14
- browser:editorial-storefront: firefox / FIX-07
- browser:editorial-storefront: firefox / FIX-05
- browser:editorial-storefront: webkit / SRCH-01
- browser:editorial-storefront: webkit / LOOK-01
- browser:editorial-storefront: webkit / FOOT-01
- browser:editorial-storefront: webkit / QUAL-13
- browser:editorial-storefront: webkit / QUAL-14
- browser:editorial-storefront: webkit / FIX-07
- browser:editorial-storefront: webkit / FIX-05
- browser:photo-digest: webkit / Standalone admin SHA-256 without whole-file arrayBuffer
