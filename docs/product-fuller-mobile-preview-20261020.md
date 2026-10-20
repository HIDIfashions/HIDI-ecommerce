# Fuller mobile product gallery — undeployed review

20 October 2026. Worktree: product-page-refinement; branch codex/product-page-refinement-20261020.

Only product-gallery.module.css and the product route's product-page.module.css change. Mobile gallery frame extends into the existing 12px page gutters; image remains object-fit:contain. Height is clamp(340px,58svh,522px), preserving the whole outfit. Remove product-only top padding and inherited info padding, reduce gallery/title grid gap, align thumbnails with text. Brand colours, facts, desktop rules, shared loading scripts and deployment files remain untouched.

At 390x900 the uncropped portrait paints approximately 348px wide (previously 320px), and title starts at 716.5px (previous live capture approximately 739px). Full frame is 390px. Image sizing depends on source aspect ratio. On very short phones the title still requires scrolling; both purchase buttons remain in the sticky action bar.

Verification: six local source previews across red/fuchsia at 1440,390,320 with decoded real photos, size-picker cancellation (zero writes), mocked explicit M add (one exact SKU/quantity=1 write), and fit guide. Five-width Chromium product regression passed before the final scoped padding refinement; rerun after it is recorded in browser results. Eight additional browser-only CSS previews use current live page assets/header at 1440x900,390x900,375x812,320x568 for both products. New rules are taken directly from the source files with CSS Module selectors mapped to the live DOM. These are review previews, not a deployed candidate. Assertions: no horizontal overflow, contain image fitting, full viewport gallery frame on mobile, enabled Add/Buy and size dialog within viewport. All live-page non-read requests blocked; no actual purchase or cart writes.

Evidence (untracked): evidence/product-page/fuller-mobile-preview, evidence/product-page/fuller-width-review/results.json and screenshots. Deployment deliberately not run. Retained runtime candidate verification remains required before any deployment.

## Dropdown and deployment follow-up

User authorized deployment and requested Product details as a dropdown. Converted the existing section to a native details/summary disclosure, closed by default, with the existing product icon and a rotating chevron. Facts remain unchanged in the rendered HTML. The browser regression now checks initial collapsed state, keyboard opening, visible confirmed facts, pointer close and reopen. Local verification: 249 source tests, 17 data/copy/sharing tests and all five Chromium widths passed. Deployment will use the existing isolated release workflow after the full source gate, capturing the current immutable live base and preserving unrelated files/settings/API with exact-state guards.

## Verified live release

- Deployed source: e6eb988da8284f6f5c91031804107832b365ea4a. Full source/API/build/admin/homepage/three-engine editorial gate passed: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/39421919888/job/118624746974.
- Isolated release succeeded: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/39423322536. Ready revision hidi-web--productpage39423322536a1; immutable image acrhidiprod0927.azurecr.io/hidi-web@sha256:9b721f1136035fe04225e20f9470f184fafaab55c665f43cca55f516ef5f09ce.
- Captured base was the preceding product release image sha256:d778e0047d71f1df27d49869f1ded6c03e51480bbcdabd676b71a088ea9c8820. Backup verified before composition. Exactly four allowlisted product files changed; 4,031 unrelated files were byte-identical. Base layers, runtime configuration and old assets preserved. API image/settings unchanged. No database or blob writes.
- All 48 candidate/live browser cases passed (three engines, five main widths and three short-phone sizes on each side of rollout), including native disclosure keyboard/pointer toggles, unchanged confirmed facts, gallery/sticky geometry, purchase actions and explicit-size/cancellation guards. Six independent live red/fuchsia real-photo checks at 1440/390/320 also passed, with real hero and thumbnail decoding and mocked cart writes only.
- Before/after SEO comparison passed exactly: robots, sitemap (69 pages,238 images), merchant feed (242 offers,54 groups), public runtime config and both sampled product titles/descriptions/canonicals/structured data preserved. No new Lighthouse score is claimed.
- The first broad source run failed only because its colour test read hidden text before opening the new dropdown. The test now explicitly opens it; the full corrected run passed. Product code was unchanged by that test correction.
- Evidence remains untracked in evidence/fullwidth-release-39423322536/, evidence/product-page/fuller-final-live/ and evidence/product-page/fuller-release-seo/.
