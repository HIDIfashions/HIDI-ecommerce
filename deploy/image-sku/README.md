# Image SKU product/photo mapping

On `/admin/import`, add an `image_sku` column to the product spreadsheet, for example `KUR_001`. Use the same code across all sizes of a product colour. Different products or colours need different codes. The existing `sku` column retains its stock-adjustment meaning.

After importing, select many photos or a ZIP in **Bulk product photos**. Filenames such as `KUR_001_1.JPEG`, `KUR_001_2.WEBP` and `KUR_001_10.jpeg` match that product colour and are uploaded in numeric order within the selected batch. Every existing size of that colour receives the photos. Existing photos are preserved. Existing full HIDI SKU filenames retain their previous behavior.

For products already imported, use `opening_qty=0` when re-importing to add Image SKUs. The existing opening-stock system treats a changed spreadsheet as a different batch. Catalogue import does not record supplier purchase costs; use receipts for those.

Mappings are append-only and persist in Azure Blob `product-media/admin/product-image-skus/v1.json`, under the live web app's existing managed identity. Reads require staff authentication; writes require the existing OWNER/CATALOG roles and same-origin requests. Conditional ETag writes prevent simultaneous batches from overwriting mappings. Registered codes cannot be reassigned to another product/colour or recycled after deletion. No SQL schema change or five-digit SKN release is involved.

Duplicate photo numbers (including JPEG and WebP for the same number), unknown codes, invalid types/sizes and archived products are blocked. File content digests plus attachment confirmation across sizes skip completed uploads on a retry/reload. An uncertain attempted upload is reconciled before another attempt is allowed.

`release.py` backs up fresh immutable web/API images and preserves application settings, all unrelated runtime files and published CMS content. Only eight web admin files are patched; current collection-speed changes remain intact. The API and SQL schema are unchanged. Original immutable browser chunk URLs remain byte-identical. Candidate tests use fixtures only, including actual retained Next import, ZIP, reload and lost-response cases in three browser engines at 320/1440 widths, followed by retained bulk, category, admin and commerce regressions.

Deployment does not upload photos, register real mappings or publish products. Publication remains an explicit action on the existing bulk publication panel.
