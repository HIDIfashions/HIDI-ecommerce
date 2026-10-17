# Performance release access and readiness

The storefront remains on Azure Container Apps. The performance candidate uses an isolated Azure Static Web App only for a reviewed, content-addressed application bundle, posters and videos. Original same-origin assets and recovery remain available. No DNS, API, database, inventory or payment configuration needs changing.

## Asset-site prerequisite

An Azure owner provisions the following resource before the build:

- Subscription: `91d9572d-0f0b-47fe-802d-0eef36d7c719`
- Resource group: `rg-hidi-prod`
- Static site: `hidi-performance-assets`
- SKU: **Free** (never Standard)
- Region: East Asia; asset delivery is global
- Source: Other; no repository integration or managed API
- Tags: `hidi-owner=paint-performance-release`, `hidi-purpose=immutable-assets`

`python3 deploy/paint-performance/asset-mirror.py preflight` performs only a metadata read. It rejects absent/unreadable, paid, unrelated or repository-connected sites before media composition. It does not prove publishing authorization, retrieve a deployment key, create resources or assign roles.

The existing GitHub OIDC identity is application/client `3d62eb64-29dc-48ee-ab35-093312bd50af`, principal object `de4bbc4e-3303-4c2e-8f75-8eb0c724fc47`. The current error is missing `Microsoft.Web/staticSites/read` on the proposed site. Once it exists, an owner can grant **Contributor scoped only to this static site**, or a reviewed custom publishing role containing the site's read and list-secrets operations and any required deployment operations. Do not grant subscription-wide Contributor/Owner, expose production storage, disable access controls or paste deployment tokens into chat. Role expansion requires explicit action-time confirmation when using the browser.

Azure role operations: https://learn.microsoft.com/azure/role-based-access-control/permissions/web-and-mobile
Free-plan documentation: https://learn.microsoft.com/azure/static-web-apps/plans

## Release gates remain required

Local unit checks are preliminary. The actual candidate must pass immutable-file preservation, image/video quality, browser recovery (including failed or stalled mirror responses), 24 checkout/cart hydration cases across Chromium/Firefox/WebKit with no commerce writes, and production-identity HTTP/2 Lighthouse comparisons with the same third-party scripts. Candidate headroom remains score >=93, mobile median LCP <2200 ms, CLS <=0.1. Only a tested image may reach production; live checks require score >90 and mobile median LCP <2500 ms, with rollback on failure. These targets are not claimed as achieved merely because source tests pass.

Use a `[prepare-only]` commit or manual dispatch for a preparation-only run. A later explicitly authorized push can release through the existing guarded workflow after prerequisites and all tests pass. Exact production snapshots, API/settings preservation and the shared release lock remain mandatory.

## Other owner inputs

Performance: sign in to the owning Azure account; resolve only the scoped site permission; review Cloudflare zone/cache configuration if it is needed. Azure portal displayed trial-credit expiry on 27 October 2026: the billing owner must review continuity before that date. No billing upgrade is performed by this workflow.

SEO reporting: Search Console and GitHub are connected. GA4 needs access to the actual HIDI property (Viewer for reporting); Merchant Center needs access to account 5874715450 for current approval and return-label review; Bing Webmaster Tools needs site-owner verification. These are separate from the performance deployment prerequisite.

Product evidence: complete included pieces for the Chocolate Brown Printed and Black Embroidered sets; Kiara Coral Pink Anarkali fabric; Cream Floral Embroidered Kurta Pant care; size-wise actual garment measurements and measurement basis; verified fit/lining/fibre details and colour-specific photographs. Do not infer quantities, measurements or fibre percentages from product names or images. Use the evidence workbook for source/reviewer/date and corrections.
