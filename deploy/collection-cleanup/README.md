# Collection header cleanup

The visible collection SEO additions placed a long heading, buying-guidance paragraph and cross-category links above the catalogue. Restore short storefront headings (All Products, Casual Wear, Work Wear and Occasional Wear) and remove those paragraphs and extra links. Keep existing search/social metadata and the existing mobile header visibility rule. New Arrivals redirects to All Products and receives the same cleanup; the other category aliases and Ananya's Pick have no added introduction.

## Impact reviewed before deployment

The runtime overlay changes only `apps/web/.next/server/app/collections/all/page.js` and `apps/web/.next/server/app/collections/[slug]/page.js`. Exact unique anchors and inverse transforms reject unknown runtimes and prove all other bytes are unchanged. No client chunks, filters, product selection, prices, images, cart, checkout, account, admin, APIs, database, media storage, policies, authentication or deployment settings are changed. Removing visible descriptive text and cross-links reduces on-page collection SEO content; existing metadata, canonical URLs and merchant feed are retained. Preserve a single short H1 for accessibility and orientation.

## Release verification

Use the existing guarded deployment sequence with a dedicated workflow and evidence directory. Capture the fresh ready production image, verify its exact rollback backup, compose the two-file overlay, compare the actual candidate against baseline and frozen active catalogue, then publish only the tested image. Chromium, Firefox and WebKit each run 320px, 390px and 1440px scenarios. Checks cover nine collection/alias routes, headings, absent intro/links, no horizontal overflow, unchanged head metadata, product cards and prices, sorting, product details/schema, five real carousel activations, policies, private-route indexing, merchant feed, browser errors and unexpected writes. Candidate tests use isolated read-only catalogue fixtures; production probes block writes. Live failure or changed deployment ownership prevents publication or triggers guarded rollback.

The source contract and compiled-runtime patch tests run before browser tests. This scope does not place a real order, initiate payment, change stock or test authenticated account mutations.

A live retry returned Azure's upstream connection-refused gateway page while opening the homepage. Read-only document navigation retries only explicit HTTP 502/503/504 responses, at most three attempts, with every attempt recorded. Other HTTP failures, transport exceptions and JavaScript errors are not retried or excluded. Persistent gateway failure still triggers rollback.

## Existing private-page warning

The complete candidate matrix found intermittent React #418 recovery events on cart/checkout, whose existing pricing script can prepend a discount note inside the React root before startup. The two-file overlay does not change that script or either private route. Before acceptance, a controlled delayed-start test must reproduce this exact warning on both routes in the unchanged baseline and verify page recovery. Its hashed evidence is required for publication. Only the same message on those two unchanged paths is recorded as an existing issue; every other runtime error still fails. Live checks use that recorded baseline proof. This checkout warning is reported, not silently fixed or suppressed, by the collection cleanup.
