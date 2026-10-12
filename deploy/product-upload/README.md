# Product Upload

The Admin Product Upload page combines product details, colour/size variants and photographs in one reviewed batch.

1. Download `HIDI_Product_Upload_Template.xlsx` and fill the **Products** sheet. Use one row per colour and size. Instructions, Field guide and Examples are never imported as products.
2. Choose the workbook or CSV, then choose the product images or an image folder.
3. Review the exact product matches, variants, filenames and main photos. Correct every preview error before saving.
4. Choose **Save as draft** or **Publish to storefront**. A complete saved draft batch can also be published from the same page.

Drafts remain hidden. Publication follows confirmed product details and image attachments for every intended size. A failed product is excluded from publication. Progress, pause/resume and a downloadable results CSV make partial batches reviewable.

`NEW` creates a draft with generated HIDI identities. `UPDATE` requires an exact existing product ID, SKN or product slug. Existing product URLs and SKU identities cannot be renamed by this tool. Blank update fields preserve saved details, garment measurements, collections, stock and galleries. Updating a published product first moves it to draft; the page explains this and asks for confirmation before the user saves.

Each product colour needs its own `image_sku`, such as `KUR_001`. Photos can match automatically as `KUR_001_1.jpeg`, `KUR_001_2.jpeg`, or be listed explicitly in `photo_names` using semicolons. `main_photo` and `photo_alt` control the cover and alternative text. Supported images are JPEG, PNG, WebP and AVIF, at most 12 MB each and 1,000 files per batch.

Stock quantities are preserved. New variants start at zero; use the existing **Receive Stock** page for inventory. The template covers the current catalogue inputs, including price, MRP, weight and six garment measurements. Supplier purchase cost and inventory receipts remain in their existing workflows.

Interrupted requests are reconciled against product versions and exact saved state. Another staff member's changes stop recovery instead of being overwritten. Image content hashes and attachment checks prevent repeat uploads from creating duplicate objects or galleries.

The release adds only this page and its assets, plus narrow route and navigation entries over a fresh live Web image. The API, compiled Next application, storefront, SEO, settings and product/media data are preserved. Both images are backed up and verified before release. Candidate tests use isolated product and Blob fixtures; deployment verification performs no product or photo writes.
