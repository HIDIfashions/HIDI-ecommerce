# Catalogue styling preview — approval required before deployment

Only four presentation changes are proposed:

| Area | Proposed styling |
| --- | --- |
| Blank space above catalogue | 12px top padding up to 720px; 20px above 720px. Overrides the competing 66px/74px rules. |
| Zoom and quick-add icons | 32px visible surface and 16px glyph within the unchanged 44px tap target. Colours inherit the current HIDI theme. |
| Product names | Weight 400, retaining current font family, size, colour, height and truncation. |
| Product row spacing | 24px for mobile two-column view, 32px for mobile one-column view, 32–44px for larger screens. Column counts and horizontal gaps are retained. |

`catalogue-polish.css` is scoped entirely to `.collection-page`. No product data, photographs, header, wishlist button, filter behavior, grid switching, price, size choices, modal actions, cart, checkout, account or admin implementation changes.

`patch-runtime.py` can later prepare a reversible CSS-only addition inside the retained Web wrapper's existing style block. It does not deploy, access Azure, change JavaScript behavior, rebuild Next, change configuration, modify the API, write SQL or upload media. A fresh live image and its settings must be captured and guarded before a separately approved rollout.

## Regression and preview

`verify.mjs` reads anonymous public GET/HEAD responses through a local snapshot server. It freezes the same HTML, scripts, styles and catalogue responses for baseline and candidate; the candidate adds only the reviewed stylesheet. Production write requests are never forwarded. The unchanged canonical commerce suite fulfills cart operations and anonymous session refreshes locally. No real payment, OTP, order, stock change or admin mutation is performed.

The test checks all three browser engines at 320, 390, 620, 621, 720, 721, 844 and 1440px. It verifies the requested measurements, unchanged grid columns/horizontal spacing, names/prices/image sources, header/footer styles, 44px targets and keyboard zoom operation. It also compares computed styles before/after on homepage, product, bag, checkout, account and admin sign-in pages.

Then the complete existing `care-break/retained-commerce.mjs` suite runs once against the baseline and once against candidate HTML, preserving its original assertions for home, search/menu, filters, sorting/grid, quick add/size selection/cart addition, product sizing, WhatsApp state, cart editing, shipping disclosure, payment choices, account/rewards/returns/wishlist and anonymous admin tools. Local adapters affect transport only.

Before/after JPGs are captured from the real rendered UI at phone and desktop sizes. They are review evidence, not an image-generated mockup. **Do not show a preview as regression-approved unless the final report says passed.** Production remains unchanged until the user approves the preview and a guarded deployment is completed.
