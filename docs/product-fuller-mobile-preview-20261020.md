# Fuller mobile product gallery — undeployed review

20 October 2026. Worktree: product-page-refinement; branch codex/product-page-refinement-20261020.

Only product-gallery.module.css and the product route's product-page.module.css change. Mobile gallery frame extends into the existing 12px page gutters; image remains object-fit:contain. Height is clamp(340px,58svh,522px), preserving the whole outfit. Remove product-only top padding and inherited info padding, reduce gallery/title grid gap, align thumbnails with text. Brand colours, facts, desktop rules, shared loading scripts and deployment files remain untouched.

At 390x900 the uncropped portrait paints approximately 348px wide (previously 320px), and title starts at 716.5px (previous live capture approximately 739px). Full frame is 390px. Image sizing depends on source aspect ratio. On very short phones the title still requires scrolling; both purchase buttons remain in the sticky action bar.

Verification: six local source previews across red/fuchsia at 1440,390,320 with decoded real photos, size-picker cancellation (zero writes), mocked explicit M add (one exact SKU/quantity=1 write), and fit guide. Five-width Chromium product regression passed before the final scoped padding refinement; rerun after it is recorded in browser results. Eight additional browser-only CSS previews use current live page assets/header at 1440x900,390x900,375x812,320x568 for both products. New rules are taken directly from the source files with CSS Module selectors mapped to the live DOM. These are review previews, not a deployed candidate. Assertions: no horizontal overflow, contain image fitting, full viewport gallery frame on mobile, enabled Add/Buy and size dialog within viewport. All live-page non-read requests blocked; no actual purchase or cart writes.

Evidence (untracked): evidence/product-page/fuller-mobile-preview, evidence/product-page/fuller-width-review/results.json and screenshots. Deployment deliberately not run. Retained runtime candidate verification remains required before any deployment.

## Dropdown and deployment follow-up

User authorized deployment and requested Product details as a dropdown. Converted the existing section to a native details/summary disclosure, closed by default, with the existing product icon and a rotating chevron. Facts remain unchanged in the rendered HTML. The browser regression now checks initial collapsed state, keyboard opening, visible confirmed facts, pointer close and reopen. Local verification: 249 source tests, 17 data/copy/sharing tests and all five Chromium widths passed. Deployment will use the existing isolated release workflow after the full source gate, capturing the current immutable live base and preserving unrelated files/settings/API with exact-state guards.
