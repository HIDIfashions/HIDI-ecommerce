# Approved category names

Casual Wear → Daily Dose; Work Wear → Chill Vibes; Occasional/Ethnic Wear → Pretty Little Plans; Ananya’s Pick → Ananya’s Closet.

The migration renames existing Category and Collection reference rows in a serializable transaction. It includes known older slugs and spelling variants. IDs, URLs, active states, positions, product assignments and collection memberships remain unchanged. A product may remain in several collections; Ananya’s Closet remains a curated collection across categories. No product, inventory, image, price or order rows are written.

The source and freshly captured runtime update menu/footer/search labels, collection headings, product breadcrumbs, landing carousel defaults, saved default-caption normalization, media admin labels and bulk import aliases. Old upload headers and category names remain accepted. Custom captions and persisted media configuration are preserved.

Release captures an exact immutable image backup and reference snapshot, validates candidate/browser behavior against a frozen catalogue and baseline, waits for the same-commit standard build, then deploys only the tested image and applies the checked rename. A concurrent product assignment or taxonomy change stops the migration. Rollback restores only reference names that still match this release and restores only an owned web revision. No schema migration or seed runs.

Run `node --test deploy/category-names/category-names.test.mjs tests/admin-product-bulk.test.mjs tests/admin-quick-tools.test.mjs` locally. The dedicated Actions workflow exercises the retained runtime in Chromium, Firefox and WebKit at 320, 390 and 1440 pixels and validates live product groups after rollout.
