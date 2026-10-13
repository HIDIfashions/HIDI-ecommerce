# Storefront-style product administration

The additive `/admin/product-page?product=PRODUCT_ID` editor follows the current product page: photography on the left, overview and factual information on the right, followed by SKU prices and HIDI Fit. Products receives an **Edit product page** link; the existing editor receives **Edit like the storefront**. Existing product creation and adding a new colour/size stay in the original editor.

| Storefront field | Admin control | Existing persistence |
| --- | --- | --- |
| Name, subtitle, detailed description | Named text fields | Product name, shortDescription, description |
| Fabric; Material & Care | Fabric / composition | Product fabric |
| Care; Material & Care | Care instructions | Product care |
| Included pieces / set contents | Separate text field | `Includes:` line in description |
| Fit | Separate text field | `Fit:` line in description |
| Lining | Separate text field | `Lining:` line in description |
| Model information | Separate text field | `Model:` line in description |
| Category and collection placement | Select and checkboxes | Existing categoryId / collections |
| Colour and sizes | Select existing SKU; link to add combinations | Existing variant identity; labels remain stable |
| Selling price and MRP | Per-SKU rupee fields | Existing pricePaise / mrpPaise |
| HIDI Fit / size guide | Bust, waist, hip, shoulder, sleeve and garment length in cm | Existing integer mm columns |
| Photos | Colour gallery; add/remove for all existing sizes | Existing authenticated inventory photo endpoints |
| Availability | SKU enabled; warehouse quantities shown | Active flag; stock remains in Receive Stock |
| Publication | Publish, move to draft, archive | Existing versioned status endpoint |

The preview shows the unsaved product content, enabled sizes and saved price for the selected colour. It is an admin approximation of the storefront, not a checkout simulator. An active product's saved fields take effect immediately; there is no new unpublished revision layer.

Unknown description lines, old inactive collection assignments, null values, URLs, SKU identities, order history and warehouse quantities are retained. A specification change uses the existing labelled-fact format the storefront already reads. Clearing a fact removes stale copies from both description fallback sources. Labelled facts pasted into narrative fields are rejected. Submitted text limits include the combined description length. Every write uses the existing optimistic product revision. An uncertain save locks further writes until a successful reload; failed saves retain typed fields. Photo selections are validated before the first upload and never automatically retried.

Shared Shipping & Returns text, photography disclaimer, purchase button labels and navigation are currently storefront code. Delivery availability is calculated by the delivery service. Ratings are submitted reviews; recommendations and recently viewed products are calculated. The editor identifies these sections as shared/computed rather than presenting nonfunctional save controls. Editable global copy, colour renaming, image reordering, per-photo alt editing and custom SEO overrides are **not implemented**. They require additional endpoints and/or storefront integration. Existing SEO metadata is currently derived from product name and description.

## Verification and release

Run `node --test tests/product-page-editor.test.mjs`, `python3 tests/product-page-overlay.test.py` and `node tests/product-page-editor.browser.mjs` with Playwright available. `HIDI_EDITOR_ENGINES=chromium,firefox,webkit` runs all engines. Browser tests use a disposable HTTP catalogue fixture and the actual API input parsers; they do not use live products. CI installs browsers in an isolated temporary directory. This validation workflow cannot deploy.

`patch-runtime.py` prepares six additive files from a freshly captured current Azure Web image: two narrowly edited handler/navigation files plus four editor assets. It retains the live Product Upload tab and every unrelated runtime file, and refuses changed anchors or repeat installation. It does not replace the retained Next build, API, server, environment or database. **This change is not live.** Deployment still requires fresh live-image capture/backup, candidate runtime and route checks, preservation verification and the existing guarded image rollout. Do not run the old `deploy-admin-tools.yml`: its pinned historical base would discard later live changes.
