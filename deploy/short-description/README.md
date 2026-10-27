# Product short description

The admin-maintained `shortDescription` is rendered below the product title/rating
and before the price on every product detail page. Empty or whitespace-only values
render nothing. The existing escaped catalogue formatter preserves line breaks,
emphasis and lists. HIDI-043 is the preview and release verification example.

The source page and scoped CSS match the deployed change. Production uses a
retained runtime: `patch.mjs` inserts only this server-rendered block and appends
its CSS to a new immutable product stylesheet. Reversing the insertion and CSS
reference must recover the exact original server bytes. Client bundles, admin,
API, stored product data, images and purchasing logic are retained.

The guarded release backs up the fresh web image, verifies every retained file,
tests the actual candidate at 390/768/1440px in Chromium/Firefox/WebKit, and checks
the live result after rollout. Tests use a local read-only product fixture to
exercise changed, blank, formatted and hostile text; they also check size
selection, hydration, layout and rendering without JavaScript. No admin product,
cart, order or payment writes are made. A failed rollout restores its owned image.
