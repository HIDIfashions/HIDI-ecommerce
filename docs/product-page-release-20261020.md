# Product-page release — 20 October 2026

Status: production release and mobile follow-up verified.

The product page now has a compact gallery, clear price/size hierarchy, one mobile sticky purchase action and workbook-supported specifications. Invalid model text and disputed target-style fit/technique claims are suppressed. Missing measurements remain explicitly unavailable.

## Production evidence

- Initial release: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/39390133445
- Final follow-up: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/39392381762
- Final image: `acrhidiprod0927.azurecr.io/hidi-web@sha256:f148d072462009baa64acf6c6df9e8184f5a52bb996d5ad78bac00ae0b47fca9`
- Ready revision: `hidi-web--productpage39392381762a1`.

The initial overlay replaced four retained product component factories and their server counterparts while reusing the original React/Next modules. Only the product route, its manifest, a new product chunk and a scoped stylesheet changed. The follow-up changed only its stylesheet reference and a new CSS asset. Previous immutable assets remain available.

The final image preserves the completed performance release through the captured production image ancestry. The final preservation proof confirms 4,024 unrelated files are byte-identical, the API image and runtime settings are unchanged, and original image layers are retained. Existing deployment workflows and shared loading scripts were not edited for this product release; the workflow and guard files added for it live under `deploy/product-page` and `.github/workflows/product-page-release.yml`.

## Validation

- Current source production build and TypeScript checks passed.
- Sixteen targeted data/copy/sharing tests passed.
- Final candidate: 15 standard responsive cases and nine shorter-phone cases passed.
- Live production: the same 24 cases passed.
- All three browser engines were verified on Linux: Chromium, Firefox and WebKit.
- Actual product photography, whole-garment containment and desktop/mobile overflow checks passed.
- Thumbnail navigation, zoom, size guide, size selection/deselection, cart request identity, delivery feedback and sticky-action clearance were checked. Purchase and delivery test requests were intercepted; no orders or reservations were created.
- Public SEO smoke passed with the existing 69 sitemap pages, 238 images and 242 feed offers unchanged.

Broader source/build/browser regression job passed for source revision `6e3f2c89a3fd294776ec5eb03cc2029b4dbcb12c`: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/39394081555/job/118532364664 . This includes the source/API tests, production build, homepage/background checks and editorial browser suites. Product assertions match the approved square burgundy controls and expandable shipping policy. The workflow's subsequent general container builds do not deploy without explicit deployment tags; the product release above is the live deployment.

## Team follow-up

Use `team-measurement-checklist-hidi-019.md` to collect and independently approve M, L, XL and XXL measurements. Fabric, fit, technique, model information, lining, pockets and waistband details still require the evidence listed there. No missing values were invented or written to the catalogue.

The smallest 320×568 viewport requires a short scroll for sizes; the sticky Select size action scrolls them into a clear position. Existing shared-header work remains outside this release.
