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
