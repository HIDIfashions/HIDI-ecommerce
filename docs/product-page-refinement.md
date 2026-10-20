# Product page refinement — 20 October 2026

Branch: `codex/product-page-refinement-20261020`
Worktree: `product-page-refinement`
Source baseline: `8cb1bf1` (existing product-preview source baseline).

## Result

Product-page-only presentation changes: a compact title and set contents, variant-aware pricing and discount, sizes immediately before purchase actions, burgundy primary Add to Cart and outlined Buy Now, delivery checking, compact facts and expandable details. Desktop uses a visible thumbnail rail and a full-garment hero; mobile uses thumbnails and a sticky Select size / Add to Cart action. Reviews precede recommendations, with a linked rating near the title only when genuine reviews exist.

The fuchsia product has a concise presentation override grounded in its existing catalogue record. Conflicting print/embroidery and fit claims are omitted. Fabric uses the structured catalogue value. Invalid model information is suppressed; garment measurements are not invented. Underlying catalogue data, SEO metadata, pricing, checkout and inventory contracts are unchanged.

## Verification

- Production build: passed with the local read-only fixture configured. Production-mode preview startup was blocked by automatic approval review; browser verification used the localhost development preview.
- Existing product-copy and sharing suites: 12 tests passed.
- TypeScript: `tsc --noEmit -p apps/web/tsconfig.json`.
- Responsive browser checks: 1440, 1280, 768, 390 and 320px; no horizontal overflow or browser exceptions.
- Size selection, gallery switching, zoom dialog and Escape, unavailable measurement guide, mocked cart POST and delivery results.
- Visual QA used locally cached public photographs; functional tests use image fixtures. Local media credentials are not required.
- Public catalogue sample is in `tests/fixtures/pdp-refinement/product.json`.

Run the read-only API fixture with `node tests/pdp-refinement-fixture.mjs` on port 4000. Run the web app on port 3117, then `node tests/pdp-refinement.browser.mjs`. `PDP_BASE_URL` can select another local web port. All cart writes in the browser suite are intercepted locally; the fixture rejects non-GET requests. For a production build and local start, set `API_URL=http://127.0.0.1:4000/v1` and `NEXT_PUBLIC_API_URL=/api/store` in the process environment. No environment files need modification.

## Release boundary

No deployment, shared loader, global stylesheet, media helper, API or deployment file changes. No merge into the ongoing release. Before any future deployment, reconcile this source-only branch with the completed SEO/performance release and check the real production wrapper, media and checkout integration. The local review does not establish live conversion improvement.

## Remaining catalogue work

Verified garment measurements and genuine model height/worn size are not available for this product. Resolving the original fabric/fit/print descriptions at catalogue level remains separate from this presentation correction. The page does not fabricate reviews or product claims.

## Design assessment

The original review gave Libas 8.7/10. My provisional local assessment of this refinement is information 8.5, UI 8.8 and layout 9.0 (8.8 overall). These are subjective design scores using the original criteria, not usability research or a conversion guarantee. Verified sizing information and final production integration are still needed before claiming the live page exceeds Libas.
