# Product Upload

The Admin Product Upload page combines product details, colour/size variants and photographs in one reviewed batch.

1. Download the starter `HIDI_Product_Upload_Package.zip`, extract it, and use its `HIDI_Product_Upload_Template.xlsx` and fill the **Products** sheet. Use one row per colour and size. Instructions, Field guide and Examples are never imported as products.
2. Put each colour’s photos in `photos/<image_sku>/`, alongside the workbook. Keep camera filenames. Compress the workbook and photos folder into one ZIP and choose it once. The separate workbook/photo controls remain available as an optional method.
3. Review the exact product matches, variants, filenames and main photos. Correct every preview error before saving.
4. Choose **Save as draft** or **Publish to storefront**. A complete saved draft batch can also be published from the same page.

Drafts remain hidden. Publication follows confirmed product details and image attachments for every intended size. A failed product is excluded from publication. Progress, pause/resume and a downloadable results CSV make partial batches reviewable.

`NEW` creates a draft with generated HIDI identities. `UPDATE` requires an exact existing product ID, SKN or product slug. Existing product URLs and SKU identities cannot be renamed by this tool. Blank update fields preserve saved details, garment measurements, collections, stock and galleries. Updating a published product first moves it to draft; the page explains this and asks for confirmation before the user saves.

Packages contain exactly one workbook or CSV, with no more than 1,000 photos. Both compressed ZIP and expanded contents are limited to 512 MiB. Archives are read locally, with bounded decompression, CRC checks, path and duplicate validation. Encrypted, split and unsupported ZIP formats are rejected before any catalogue write. Each photo folder must use its colour’s `image_sku`. Camera basenames may repeat in different colour folders; the review shows original paths. A nonblank `photo_names` chooses filenames and order within that folder. Unsupported RAW/ARW files must be exported to JPEG first.

Each product colour needs its own `image_sku`, such as `KUR_001`. Photos can match automatically as `KUR_001_1.jpeg`, `KUR_001_2.jpeg`, or be listed explicitly in `photo_names` using semicolons. For a new product or empty colour gallery, the chosen `main_photo` uploads first and becomes its cover; remaining photos retain their order. Existing UPDATE covers are preserved. Choosing a different existing-gallery cover is blocked during review before any product writes. `photo_alt` supplies alternative text. Supported images are JPEG, PNG, WebP and AVIF, at most 12 MB each and 1,000 files per batch.

Stock quantities are preserved. New variants start at zero; use the existing **Receive Stock** page for inventory. The template covers the current catalogue inputs, including price, MRP, weight and six garment measurements. Supplier purchase cost and inventory receipts remain in their existing workflows.

Interrupted requests are reconciled against product versions and exact saved state. Another staff member's changes stop recovery instead of being overwritten. Image content hashes and attachment checks prevent repeat uploads from creating duplicate objects or galleries.

The release adds this page and its assets, narrow route and navigation entries, and a repair to verified copies of the cached image-upload helper. That repair confirms an existing batch image only when its bytes, type and length match; legacy uploads and other errors retain their behavior. Every helper change has an exact inverse proof. The API, all other compiled files, storefront, SEO, settings and product/media data are preserved. Both images are backed up and verified before release. Candidate tests use isolated product and Blob fixtures; deployment verification performs no product or photo writes.
