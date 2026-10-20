# Product gallery and information refinement — 20 October 2026

- Removed the unsolicited garment-measurements notice from Product details. The size guide remains honest when measurements are unavailable; no values were added.
- Product details now contains set contents, selected colour and confirmed design specifications. Material & Care owns fabric, care and any explicit lining information. Removed the duplicate Specifications accordion.
- Added the matching outlined Product details icon, preserving HIDI colours.
- Enlarged the desktop photo frame and mobile frame (340–480px, depending on viewport), moved mobile thumbnails below the photo and overrode inherited 94% slide widths only within this gallery. Images retain `object-fit: contain`.
- Larger mobile photos intentionally place sizes farther down the document. The sticky Select size action scrolls the complete size group clear of the purchase bar.

Reference review at 390×900: Libas main image 390×520px; Pink Fort 390×488px. HIDI preview frame is 366×480px, compared with the former 200px height cap. Global Desi's referenced older URL did not yield a usable product gallery in this browser session, so no current gallery-size claim is made for it.

References:
- https://www.libas.in/collections/floral-kurta-set/products/libas-pink-floral-printed-chiffon-a-line-kurta-set-56385
- https://pinkfort.co/products/cotton-bandhani-asymmetric-kurta-set-purple-pfks5130peab
- https://www.globaldesi.in/Women/All-Clothing/Kurtas-and-Kurta-Sets/Kurta-Sets-FW22GD5902PRY_Pink.html

Local validation: 16 unit/data/copy tests; TypeScript; optimized Next webpack build; five Chromium widths (320,390,768,1280,1440); three short-phone cases (390×844,375×812,320×568); real-photo desktop/mobile previews; retained React/Next render checks; protected webpack factory verification. Local Firefox failed to launch (`spawn UNKNOWN`) and is not counted as passing. The release gate runs all three engines in Linux.

The isolated release refreshes only the existing product component boundaries, one route stylesheet reference, the product-route client manifest and new immutable product assets. Other webpack factories, the page's SEO/data logic, existing assets, shared loading scripts and deployment workflows are preserved and checked against the captured production image.

Release closeout:

- Deployed source commit `09ef6fb1ea007da378b721179c32aa393c78b2cb` via successful isolated workflow https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/39396967742.
- Live image `acrhidiprod0927.azurecr.io/hidi-web@sha256:22207afa401cd65eaf97b0d3ddd7889262d6fe5658e1bcbcf7545dad48ebc752`; ready revision `hidi-web--productpage39396967742a1`.
- All 48 candidate/live regression cases passed (three engines × five widths, plus three engines × three short-phone sizes, in each environment). Two additional live real-photo views passed; an independent live Chromium check decoded all three photographs at desktop and three phone sizes and checked normal animated size selection.
- Exactly four allowlisted product files/assets changed. All 4,024 unrelated files, runtime configuration, base image layers and old immutable assets were preserved. API image/settings unchanged; no database or blob writes.
- Public SEO smoke passed: 69 sitemap pages / 238 images; 242 merchant offers / 54 product groups; sampled canonical/schema and robots restrictions intact. No fresh Lighthouse score is claimed.
- Follow-up test-only commit `811fe8a573d35729fb461213098e99e30ca00700` checks selected colour in the consolidated Product details section, replacing an obsolete expectation that the removed Specifications accordion exists. The superseded source-only run was cancelled; it is not counted as passing.
- Live preview evidence: `evidence/product-page/gallery-live/real-1440x900.png`, `real-390x844.png`, `sizes-390x844.png`, `real-photo-results.json`. Full release reports are under `evidence/product-page-release/gallery-release/` (untracked local evidence).
- The updated full `source-and-test` job passed on commit `811fe8a573d35729fb461213098e99e30ca00700`: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/39397567427/job/118545185244. This includes API/unit checks, release guards, the combined admin/storefront build and types, admin UI/BFF, homepage-background checks, and the full editorial storefront/polish browser suites in Chromium, Firefox and WebKit. Subsequent container packaging in that workflow does not deploy this revision; no deploy flags were used.
