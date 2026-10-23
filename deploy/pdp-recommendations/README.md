# Recommendations and compact reviews — preview only

Requested changes: remove the exact footer brand sentence everywhere; put
recommendations directly after the PDP grid with a single centred heading;
replace the large review invitation with a compact centred Customer Reviews
block and Write a review CTA. Preserve real ratings/review cards and the existing
delivered-order review eligibility. The CTA opens `/account/orders`.

Source changes are in the shared footer, product page, ProductReviews, and
`apps/web/app/pdp-recommendations.css`. The retained production wrapper currently
moves reviews above recommendations; that relocation must be retired in the
eventual retained-runtime release. Do not rebuild the old Next source over prod.

`preview.mjs` serves a read-only local preview of current public production
responses. `transform.mjs` adapts both SSR markup and corresponding Flight model
before hydration; long UTF-8 Flight text records stay opaque and byte intact.
The independently built landing-page footer is adapted in its JS bundle. The
preview directs its mirrored landing bundle locally without its old SRI value.
An eventual release must generate a new immutable bundle URL and matching SRI,
preserve old assets, and verify the exact candidate runtime before deployment.
This preview is not a production deployment package.

Preview: `node deploy/pdp-recommendations/preview.mjs` (port 62654).
Transform tests: `node deploy/pdp-recommendations/test-transform.mjs`.
Browser tests: `node work/test-recommendation-preview.mjs`.
All upstream requests are anonymous GET/HEAD. Cart writes are intercepted only
inside the browser regression; the preview server rejects upstream writes.
The user approved this preview and production deployment after full regression on 2026-10-23. The dedicated release workflow patches the fresh retained runtime, rehashes changed immutable assets while retaining old URLs, verifies a rollback backup, runs candidate and live Chromium/Firefox/WebKit tests, checks every catalogue product at two widths, and rolls back on any live failure. Six isolated guest-cart checks use real production API requests and remove all test items; no orders or payments are created.
