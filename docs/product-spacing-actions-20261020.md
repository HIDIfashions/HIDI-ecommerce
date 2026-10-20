# Product spacing, PIN entry and active purchase actions — 20 October 2026

Scope: product page only, in the existing separate worktree. No shared loading scripts, existing deployment workflows, product facts or stock were changed.

- Removed inherited 18px vertical padding from product accordions; closed rows now measure 57px including their divider, with consistent 16px headings and 20px icons.
- Aligned product specification labels/values and added a matching document icon/chevron for Product description.
- Restyled Delivery options as a compact 380px maximum form with aligned 46px input and Check action, replacing the large nested box and oversized uppercase heading.
- Enabled Add to Cart and Buy Now before size selection when the current colour has available stock. Either activation prompts and focuses available sizes without any cart write. Explicit size selection is still required; sold-out and busy states remain disabled.
- Both actions are visible in the mobile sticky bar, with the price retained. At 320px the bag icon is omitted to give button text enough space.
- Removed empty helper spacing and the long visual SKU line; the accessible purchase summary retains the SKU.

Local validation: 16 unit/data/copy tests; TypeScript; optimized webpack build; five Chromium viewport cases; three short-phone cases; six red/fuchsia real-photo layout simulations (1440,390,320px), including compact full-section heights, aligned PIN controls, active purchase buttons and missing-size prompts. Functional tests assert zero cart-item writes when either action is activated without selecting a size. Existing broader product tests now expect active buttons after deselection/colour changes, while preserving sold-out/conflict assertions.

Evidence remains untracked under `evidence/product-page/spacing-preview/`. Screenshots use each product's real published photographs. The isolated release verifies the retained candidate in all three browsers, protects unrelated production files/configuration and validates the live rollout.

The full source-and-test job passed on `f8afd1189f1984a17dab57eed123ab694f1b75f7` (https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/39409016132/job/118581883435). The first isolated rollout passed all 48 candidate/live browser cases (https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/39409016167).

A final visual check found that the isolated CSS compiler rewrote dots inside the Product description SVG namespace. Percent-encoding those dots preserves the intended icon. The follow-up supports a strict two-file stylesheet refresh: the new CSS plus its one route reference. Verification proves all deployed product JavaScript and product facts are byte-identical after normalizing that stylesheet URL. The same candidate/live release gates remain required. One ad hoc real-photo check during rollout timed out; it was not counted as passing. A subsequent diagnostic returned HTTP 200 and the complete six-case red/fuchsia live rerun passed.
