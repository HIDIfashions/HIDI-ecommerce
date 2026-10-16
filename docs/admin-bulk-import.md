# HIDI Bulk Import v1

Target: HIDI admin after Stock Receiving/SKU Photos v1, Product Management v1 and Multi-Photo Fix v1.

## What this adds

- New admin page: `/admin/import`.
- **Products + opening stock** import from `.csv` or `.xlsx`.
- Admin-downloadable Excel-compatible product/stock template.
- `NEW` rows create draft products/SKUs; HIDI-generated SKUs remain authoritative.
- `STOCK` rows add opening pieces to an existing SKU.
- Deterministic batch reference derived from spreadsheet contents; stock movements with the same reference are skipped on a same-file retry.
- Bulk photo upload from many selected images or a ZIP, matched from filenames like `FULL-HIDI-SKU_01.jpg`.
- Optional “apply photo to all existing sizes of this colour”.
- Bulk supplier receipt-line import directly inside **Receive Stock**, from CSV/XLSX columns `sku, accepted_qty, rejected_qty, unit_cost`.
- Product dashboard buttons for **Import Products / Stock** and **Bulk Upload Photos**.

## Important inventory rules

The product/opening-stock import is for catalogue setup or a controlled opening balance. It intentionally does **not** store supplier purchase cost. Manufacturer deliveries should use the Bulk Receipt template in Receive Stock so unit cost remains part of the receipt workflow. Receipt imports prepare lines only; stock still changes only when the operator explicitly posts the receipt.

New products remain Draft. Photo imports do not change stock. The package adds no schema migration and changes no environment files or dependencies.

## Product / opening-stock template

Columns:

`mode, product_name, product_slug, category, short_description, description, fabric, care, color, color_hex, size, selling_price, mrp, weight_grams, opening_qty, sku`

- `NEW`: fill product/variant details and leave `sku` blank. HIDI generates the SKU.
- `STOCK`: fill `sku` + `opening_qty`; product columns can be blank.
- Prices are rupees, e.g. `1499.00`.
- One NEW row represents one colour/size combination. Different combinations may have different prices/weights.
- Repeating the same product slug with conflicting product-level name/category/description/fabric/care is rejected during preview.
- HIDI previews every row before enabling Import.

## Photo naming

Use the full HIDI SKU followed by `_` and an image sequence:

`HIDI-MEERA-...-MAROON-M_01.jpg`
`HIDI-MEERA-...-MAROON-M_02.jpg`

JPG/JPEG, PNG, WebP and AVIF are supported, max 5 MB each. Up to 1,000 images per batch. ZIP extraction happens in the browser and accepts normal Stored/Deflate ZIP entries. Encrypted ZIPs are rejected.

## Supplier receipt template

Columns:

`sku, accepted_qty, rejected_qty, unit_cost`

Upload it from the new **Bulk receipt lines** panel on `/admin/inventory/receive`. Unknown or duplicate SKUs are rejected before the lines are added. The operator then reviews supplier/reference/notes and posts the receipt once.

## Installation workflow

1. Upload `HIDI-bulk-import-v1.zip` itself to the repository root through GitHub.com.
2. Fetch and run installer `--check` first; it is read-only.
3. Stop frontend/backend watchers.
4. Run the exact `--apply` command printed by the check.
5. Run frontend type generation/type-check.
6. Restart one API and one web process.
7. Test with 2–3 test SKUs before importing the real 96-item file.

The installer is conservative: it checks exact known patch anchors, refuses collisions, backs up modified shared files outside the repository, and makes no database/env/dependency/Git changes.

## Operational cautions

- Product imports can be partially applied if a later row fails; the results panel identifies each row. Correct failed rows only.
- The same unmodified spreadsheet gets the same bulk stock reference, preventing the opening quantity from being applied twice to a SKU on a retry. Changing the spreadsheet creates a new reference and is treated as a new batch.
- Photo uploads are separate requests, not one transaction. After a network interruption, verify saved photos before retrying.
- Bulk receipt import only fills the current receipt. It does not auto-post.
- Never test by posting fictitious inventory into the production warehouse.
