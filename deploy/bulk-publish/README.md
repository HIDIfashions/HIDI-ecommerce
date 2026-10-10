# Bulk product saving and publication

Both `/admin/import` and `/admin/product-bulk` provide a publication panel. Saving the spreadsheet retains the current publishing status. Review the saved batch, upload missing photos, select ready products and publish them together. A draft picker also supports older imports. No individual product-editor save is required.

The stock importer updates nonblank name, category, description, fabric and care fields once per design, preserves collections and blank details, and retains the existing price, variant and idempotent opening-stock workflow. Conflicting descriptions across size rows stop validation before writes.

Publication uses the existing authenticated status endpoint and freshly fetched `expectedUpdatedAt`. It requires an active SKU, valid selling price/MRP and a product or active-SKU photo. Zero stock is allowed by the existing API. Archived products are blocked, active products are skipped, and permission failures pause the batch. A lost successful response is confirmed by reviewing again without another status write.

The guarded release captures fresh immutable Azure image backups and full private settings, changes only retained web admin modules, checks every other runtime file/layer/configuration, and runs actual retained browser workflows against intercepted fixtures. API, SQL schema, Blob storage, environment settings, domain, media, payment and customer styling remain unchanged. Live checks are read-only; ownership-checked rollback preserves independent configuration changes.

No SKN schema migration or catalogue publication is executed by deployment.
