# Checkout hydration repair

The existing pricing module inserted its discount explanation into React-owned `<main>` before delayed React startup. This altered the expected server HTML on both `/cart` and `/checkout`, causing React #418 and recovery. The explanation now replaces the campaign message within the pricing module's existing external banner on these routes. Its own banner clears the fixed checkout header within the existing page spacing; geometry checks prevent overlap with the checkout heading. Prices, discounts, offers, checkout calculations, sessions and payments are unchanged.

Release commits carry `[checkout-hydration]` in their message. The older pricing workflow skips that marker so it cannot launch a separate API/pricing rollout alongside this repair.

The runtime overlay modifies exactly `pricing/storefront.mjs`. A normalized baseline hash rejects independent pricing changes; protected-file, image-layer and configuration checks preserve all other application files, including product preview, collection cleanup and header changes. The release captures a fresh exact-image backup and uses the existing conditional deployment and owned rollback guards.

Read-only candidate preparation and browser tests may run while the exact source commit's complete Azure source-and-test job runs independently. Publication and deployment require that job to pass, with its proof hashed into the sealed candidate; a failed source job cannot publish or deploy. The isolated candidate freezes the currently published hero/media configuration JSON for browser reads, because the extracted local runtime has no private media-provider identity. Live tests use the real endpoints. The candidate then passes 24 strict hydration scenarios (three engines, mobile/desktop, normal/delayed React startup, direct entry to cart and checkout), six product-editor/commerce scenarios and six pricing scenarios. All page errors are fatal, including #418; no baseline warning exception is passed to the product probe. These suites repeat after deployment. Staff price/text saves use isolated fixtures; no live orders, payments, product edits or Blob writes occur.

Local browser-only verification, which intercepts only the pricing module and never changes the deployed site:

```powershell
$env:HIDI_LOCAL_OVERLAY='1'
$env:HIDI_BROWSER_ENGINES='chromium,webkit'
node deploy/checkout-hydration/probe.mjs https://hidiindia.com ../outputs/checkout-hydration-local-full
```

The main regression report is `evidence/checkout-hydration-release/after.json`, with strict candidate/live browser reports and source-CI proof alongside it.
