# Four customer categories

The independent release shows only Casual Wear, Work Wear, Occasional Wear and
Ananya’s Pick in the customer menus, footers, homepage carousel and search
suggestions. Existing collection URLs remain available under the new labels.
The complete catalogue remains available for shopping actions.

The three wear views include products assigned to the matching primary category
and retained legacy collection members. Ananya’s Pick includes only published
products selected for the `ananyas-pick` collection, across all wear categories.
In Admin → Products → Edit, select **Ananya’s Pick** under **Website collections**
and save. The product keeps its main wear category.

The release captures fresh Azure images, full private application settings and
published media/policy hashes, verifies immutable image backups, and overlays
only the category filter and category navigation on the retained applications.
The candidate runs the actual retained Next/Vite runtimes and actual compiled
API filter against isolated products before rollout. Browser checks cover
Chromium, Firefox and WebKit at 320, 390 and 1440 pixels. Retained shopping and
admin runtime regression gates also run. Live checks permit only GET/HEAD.

Only missing category/collection reference rows are inserted. A private snapshot
of existing references and product data hashes is taken first; existing product,
variant, image, category assignment and stock rows are verified unchanged. The
workflow does not execute SQL DDL, change credentials/domains/settings, or upload
product images. An owned failed release restores its images without overwriting
an independent release. New unused reference rows remain to avoid deleting any
concurrent product assignment.

This release does not enable five-digit SKNs. The previously built SKN candidate
images predate this four-category navigation and must not be promoted; that
release requires a fresh retained-image composition and its existing SQL gates.
