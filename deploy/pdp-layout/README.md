# PDP layout preview — not deployed

The production storefront retains compiled UI from several releases. The image
architecture source commit is not a complete reconstruction of that UI. Therefore
this change is an additive, reversible stylesheet in the existing storefront
wrapper, preserving the current application bundles and image pipeline.

Changes:
- Above 1000px, the existing thumbnail rail remains 64px and the photo frame uses
  the entire remaining gallery column. The 500px cap and shrinking height limit
  are removed; 3:4 framing, contain fit, image bytes, selection and zoom remain.
  A larger photograph can extend below the first screen and is accessible by scrolling.
- Hide the redundant visual colour/size sentence for all product pages. Keep the
  screen-reader selection announcement and functional size choices.
- Reduce the reviews/recommendations, recently viewed and page/footer spacing.
- Mobile/tablet gallery dimensions and fixed purchase-bar footer clearance remain.

`patch-runtime.py` changes only the CSS string in `server.mjs` and proves that
removing the addition restores the exact original bytes. It never deploys.
Do not rebuild the old Next source from this branch to deploy these changes.

`verify.mjs` compares baseline and candidate using identical anonymous public
HTML/assets at twelve viewport sizes in Chromium, Firefox and WebKit. It checks
photographs, responsive dimensions, overflow, price/stock display, gallery and
zoom controls, keyboard closing, size toggling, size guide, review expansion,
and locally intercepted cart writes. `commerce.mjs` checks three other products,
empty history, Buy Now navigation, COD/online selection, and unchanged styles on
cart, checkout, collection, home, account and admin sign-in pages.

The snapshot server forwards only anonymous GET/HEAD requests and rejects writes.
Cart/payment-option test fixtures are local; no orders/payments or inventory
changes are made. The test workflow has contents-read permission only, no Azure
login, no secrets and no deployment step.

Run with `HIDI_PLAYWRIGHT_MODULE` pointing to Playwright's `index.mjs`:

```sh
python3 deploy/pdp-layout/test_patch.py
node deploy/pdp-layout/verify.mjs
node deploy/pdp-layout/commerce.mjs
node deploy/pdp-layout/preview.mjs
```

Production deployment remains pending user preview review. A later approved
release must capture the fresh live image, apply this exact CSS overlay, verify
the retained package and run smoke tests against that immutable candidate before
traffic changes. Preserve the deployed image architecture and rollback baseline.
