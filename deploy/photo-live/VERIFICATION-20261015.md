# HIDI photo release verification — 15 October 2026

## Status

**Verification completed successfully; production deployment NOT performed.**

The production-changing workflow update previously encountered a tool safety restriction. This verification work did not retry that blocked update, route deployment through another tool, change the production workflow, publish a candidate image, or switch live traffic. This document is a handover, not a deployment authorization or promotion artifact.

Tested photo source: `828525c93499507fa8054d5ad7d4f05c64c75ac4`.

## Evidence

### Packaged candidate verification — successful

Run: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/38673076917

Workflow commit: `38a2ce2f8011e97057e5d8d6f514b6ccb2848c50`.

Artifact: `photo-readonly-verification-evidence`, ID `11943834976`.

This run read the existing live Azure Container App configuration with the revised version-pinned ARM GET helper, pulled the exact live web/API image digests, and constructed local-only photo candidates on the GitHub runner. It did not push those candidates to ACR. Azure and Docker sessions were logged out before local composition and testing; the final Azure login was used for state comparison only.

Passed:

- 14 cleanup, authorization-error, ownership and concurrent-change offline tests.
- 9 ARM state-reader offline tests.
- Both API and web runtime file-preservation checks, with the existing explicit photo-only allowlists and pinned baseline checks retained.
- The packaged API upload-ticket tests: JPEG, PNG, WebP and AVIF at 12, 30, 40, 45, 60 and 100 MiB; invalid sizes and unsupported formats rejected; missing variant rejected; retained SQL Int capacity respected.
- The photo streaming, image optimizer and recovery test suite invoked by `deploy/photo-live/test.py`.
- All 24 browser scenarios: 8 scenarios in each of Chromium, Firefox and WebKit. The previously failing WebKit case now passes without filtering uncaught errors.
- Existing checkout-offer and purchase-action regression suites against the candidate runtime with isolated fixtures, not real customer transactions.
- Final comparison of live image digests, revisions, protected settings and public configuration: unchanged.

The 8 browser scenarios are: real product editor with fixture stock/prices; sequential 45 MiB JPEG plus PNG upload; original-byte verification; optimized images on the product page; no horizontal overflow at 1440/768/390/320 widths; zoom opening and Escape closing; absent/expired admin session rejection before upload-body consumption; corrupted-image rejection without attaching a photo. The 45 MiB browser fixture uses a valid JPEG with trailing padding to exercise transport boundaries.

### Genuine encoded large-image stress fixture — successful

Run: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/38673293508

Artifact: `photo-large-file-offline-evidence`, ID `11944599489`.

A synthetic, unpadded 6000 x 6000 PNG (36 megapixels), 108,179,321 bytes, passed streamed multipart ingestion, source SHA-256 preservation and WebP resizing at widths 384, 640, 1080, 1920 and 3840. Source hash: `9fd956c8c3f0f88f9882a53f900ed6edfbc6cb09bb5a0cb972d531010dfe16c4`.

This was an offline source-level fixture. It is not a real garment appearance approval, production performance benchmark or live Azure upload test.

### Live public/protected-route smoke checks — successful

Run: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/38673641630

Artifact: `hidi-live-readonly-smoke-evidence`, ID `11945327375`.

All 21 GET-only checks passed: homepage; all-products and four category pages; cream embroidered kurta product page; cart; checkout; account; wishlist; three health/readiness routes; payment-options endpoint; three protected admin routes returning HTTP 401; robots.txt; sitemap.xml; and one existing optimized product-image request. These checks used no cookies or customer authentication and made no uploads, cart writes, orders, payments or configuration changes.

## Explicitly not completed

- Clearing the production workflow update restriction and moving that workflow to the reviewed source.
- The official release's fresh exact-digest backup, real Azure temporary-upload/read-back/resize/delete validation using the revised helpers, and guarded production image switch.
- Post-deployment verification of the new upload handler and end-to-end uploads through the live storefront.
- Real payment execution, customer OTP delivery and production load/stress testing; these were deliberately not exercised on the live business.

The production workflow still pointed to `3435cd5bc0fac4f6efba5f75fa85683c6d82e796` when inspected. No production cap removal is claimed by this verification. The separate broader draft's BigInt migration was NOT applied; the photo-only candidate retains the existing SQL Int capacity of 2,147,483,647 bytes and other disk, format, pixel-count, timeout and hosting constraints.

Do not treat this evidence as permission to skip any original release guard. Any eventual release needs a fresh live-state capture and must stop on unrelated changes. Do not replay the older failed source simply because these newer-source verification runs passed.
