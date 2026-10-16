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
