# HIDI Admin — Product Management v1

## Daily workflow

Open `/admin/products` and unlock with the same private admin key used for Inventory. Choose **Create new product**. Enter the name, category, description, fabric and wash-care instructions. Select the existing website collections where the product belongs: collection assignments drive the current storefront collection filters. Category and collection are separate concepts.

Enter colours, optional six-digit colour hex values, sizes, selling price, MRP and optional packaged weight in whole grams. Two colours and four sizes create eight SKUs. Click **Create draft & generate SKUs**. Product creation is a database-backed operation, not a seed import. It always creates a DRAFT; its new Inventory rows start with onHand=0, reserved=0 and safetyStock=0. No purchase receipt or opening-stock transaction is created automatically.

After saving, add front/back/detail photos to the relevant SKU using **Add photo**. By default a photo is attached to every existing size of that colour. Untick the checkbox to attach it only to the selected SKU. The UI accepts JPEG, PNG, WebP and AVIF files up to 5 MB; the existing server/storage configuration may impose a lower limit. Photo bytes use the previously installed stock-receiving upload route. No storage keys belong in the browser or GitHub. This package neither creates a storage bucket nor alters storage policies.

Receive physical deliveries using `/admin/inventory/receive`. Enter manufacturer, invoice/PO, accepted and rejected quantities, and purchase cost. Posting is the action that increases stock. Purchase cost is not the customer selling price. Saving a receipt draft does not increase stock.

Publish the product explicitly from its editor. The server requires at least one active SKU, valid prices and at least one product photo or active-SKU photo. Draft/archived products remain hidden under the current storefront service's status checks. A published product with no sellable stock remains out of stock. Verify every colour's photography before publishing; a generic product image can otherwise appear as a fallback for a colour lacking its own photo.

## Create a product while receiving

Use **+ Create new product** beside the receiving search area. A modal opens without unmounting the receipt. Create a draft and optionally upload its photos. Then click **Use N SKUs in this receipt**. Only active variants are handed back. Existing receipt lines, supplier details, dates, quantities, and purchase costs are retained. Duplicate variant IDs are not added a second time. New lines have blank accepted quantity and unit cost, and rejected quantity zero; the operator must enter actual quantities.

Closing the modal does not delete an already-saved product draft. Discarding unsaved product edits does not discard the receiving form. Keeping the receipt intact applies to this same-page modal workflow; a browser refresh or deliberate navigation can still lose an unsaved receipt. Save a receipt draft before leaving the receiving page.

## Edit products and variants

Product metadata can be edited while retaining product IDs, existing SKUs, URLs, quantities and historical order items. Existing URLs are read-only to avoid broken customer links. SKU edits allow selling price, MRP, weight and enabled/disabled state, not identity or stock changes.

For a new size/colour of an existing design, use **Add a colour or size** in that product's editor. Existing combinations are skipped; newly created combinations start at zero stock. Matching existing colour spelling and photos are reused when adding another size of that colour. An archived product must first return to Draft. Limits: 20 colours and 15 sizes per submitted matrix, and 200 total SKUs per product. Colour/size matching ignores case and collapsed whitespace; labels such as `XXL` and `2XL` are not treated as interchangeable aliases.

The server refuses stale product revisions, invalid/negative/non-integer paise values, MRP below selling price, duplicate combinations, unsupported payload fields, foreign variant IDs and disabling a SKU with reserved stock. Move an active product to Draft before disabling its final enabled SKU. Archive is reversible; no delete-product operation is included.

## Security and stock boundaries

Every new backend product endpoint has the admin-key guard. Every new Next.js product proxy verifies the existing admin session before forwarding. New JSON writes also check request origin, use a bounded body size, and never send the admin key to the browser. This reuses the project's current shared-key admin model; individual staff accounts/roles and a detailed product-edit audit trail are not introduced here.

Create requests carry a stable request UUID so a network retry can return the already-created matching product rather than duplicate it. A changed payload with a used request UUID is rejected. Product writes use transactions, product row locks, optimistic version checks and bounded write-conflict retries. Existing stock is never updated by this module: Inventory rows are created at zero only for brand-new variants.

## Not included in this release

Bulk catalogue import, image deletion/reordering, new collection creation, tax/invoicing fields, advanced staff roles, and a persisted browser draft cache are not implemented. These are not required for the create-product → receive-stock workflow. Photos still depend on the previous upload feature and its storage configuration.


## Product Preview & Edit

Open `/admin/product-preview`, or use **Preview & edit text** on a product row or product editor. The catalogue is paginated and searchable across published, draft and archived products. Existing Quick Fill and bulk import remain available.

Choose a dress to load its saved name, short description, description, material and care. The preview updates as text changes; photo thumbnails switch between the product and SKU photographs. Mobile and desktop layout modes show the formatted copy with existing prices, colours and sizes. Included pieces, fit, lining and model notes continue to use the existing labelled description lines (`Includes:`, `Fit:`, `Lining:`, `Model:`).

Formatting supports paragraphs, line breaks, `**bold**`, `*italic*`, `# Heading`, `- bullets` and `1. numbered lists`. HTML and links are escaped. The admin and storefront use identical restricted renderer code, verified by a parity test. Arbitrary fonts, colours and raw HTML are intentionally outside this formatting format.

**Save product text** explicitly writes the five copy fields and retains category and collection assignments, with the existing `expectedUpdatedAt` concurrency guard. Prices, SKUs, stock, photographs and publication state are omitted from this request. A conflict or expired session retains the draft for review. Switching products and leaving the page warn about unsaved changes. Saving text on an ACTIVE product changes its published copy immediately after this feature is deployed; it is not a separate content publishing workflow.

For local review, run `node deploy/product-preview/preview.mjs` from the repository root and open `http://127.0.0.1:4318/admin/product-preview`. This sandbox loads the 54-product saved storefront catalogue from `../seo-preparation/merchant-products-detail.json`. If unavailable, it falls back to the 69-product supplier snapshot and its local photographs. It does not represent current production data. Edits are stored only in process memory and disappear when the sandbox restarts. The sandbox module is for local review only and must not be deployed as the production API.

Validation commands:

```sh
node --test tests/product-copy.test.mjs tests/admin-quick-tools.test.mjs tests/admin-product-bulk.test.mjs tests/bulk-publication.test.mjs tests/product-upload-model.test.mjs tests/product-upload-engine.test.mjs
node --import ./apps/api/node_modules/tsx/dist/loader.mjs --test tests/admin-rbac.test.ts tests/product-skn-collections.test.ts tests/product-skn-main-photo.test.ts
node tests/product-preview.browser.mjs
```

The browser script defaults to Chromium. Set `HIDI_BROWSER_ENGINES=chromium,firefox,webkit` on a host where all three engines can launch. It exercises 320, 375, 768 and 1440px viewports. Browser evidence is written under `evidence/product-preview/`.

The owner approved deployment after preview. The guarded release composes a small overlay onto the freshly captured production web image. It retains the compiled storefront and adds the shared copy renderer, formatted PDP layer, colour placement and editor links; matching Next source components are also included for future rebuilds. Release assets: `handler.mjs`, `navigation.js`, `product-quick-fill.html`, `product-preview.html`, `product-preview.css`, `product-preview.mjs`, `product-copy.mjs`. Retain the remaining existing admin assets. No database migration is required. Do not run an older release-specific patch or deploy the sandbox. Capture a fresh production baseline and prepare a guarded candidate with rollback before deployment.


### Photo framing and deployment regression

The main product photograph uses a 3:4 portrait frame, with the image positioned at 50% horizontally and 80% vertically. This removes the preview's contain bands and tightens the background around the model. Original image files, image order and the full-photo inspection viewer are retained. In the backend preview choose **Full original photo** to inspect the entire image; close-up thumbnails default to the original frame. Backend display images use the existing image optimiser rather than downloading the full-resolution files.

`deploy/product-preview/release.py` captures the current ready API and web states, retains an exact-digest registry backup, composes and fingerprints a ten-file web overlay, and requires the actual candidate to pass browser regression before publishing or changing the live revision. An owned failed rollout restores the captured image without overwriting independent application changes. The release does not change database schema, product records, Blob content, app configuration or the API image.

The candidate and post-deployment browser suites cover the editor with intercepted staff API fixtures, formatting, save/reload, retained stock/pricing/collections/status, conflict recovery, paging, portrait framing, full-original inspection and public commerce pages in Chromium, Firefox and WebKit at 375px and 1440px. Live staff saves are intercepted, so these tests do not modify real catalogue records. The live HTTP checks separately verify the real API's unauthenticated access boundaries and exact deployed asset bytes.
