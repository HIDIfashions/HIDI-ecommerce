# HIDI burgundy header — review only

The user approved the existing burgundy hue (approximately #591E22), and requested consistent customer-facing headers including checkout. Current production uses a transparent-to-gradient campaign header and a separate translucent editorial gradient. The CSS makes both surfaces opaque #591E22 in all scroll/menu states, including the standalone buying-guide headers. The standalone privacy page has no navigation header and is checked for unchanged content. It preserves logo artwork, icon/text colors, layout, controls, body, footer, announcements, offers and all commerce code.

`patch-runtime.py` prepares a four-file overlay (server head injection, homepage head injection, guide-template head injection, one content-hashed stylesheet). Exact anchor and inverse checks fail closed. The user approved the preview and authorized deployment on 30 October 2026. The guarded release extracts the exact current image, verifies this four-file scope, preserves all other bytes and runs the retained checkout/payment/offer tests before publishing. It compares live catalogue prices, offer settings, media settings and API image before and after deployment.

`preview.mjs` serves public GET captures locally; cart data is isolated, admin endpoints unavailable, and every write is blocked. No credentials are forwarded upstream. `check.mjs` compares the old and proposed headers on 16 public routes at 390px and 1440px in Chromium and WebKit, including scrolling, navigation dialogs, geometry, logo, controls, footer, empty coupon input and hidden GET1. It does not execute payments.

Run from repository root with HIDI_PLAYWRIGHT_MODULE set to the installed Playwright index.mjs:

```
node deploy/header-theme/check.mjs ../outputs/header-theme-preview
node deploy/header-theme/preview.mjs 4321 ../outputs/header-theme-preview/cache
```

Review at http://127.0.0.1:4321/__preview/review. The approved preview remains available for reference.

The production gate runs 96 header cases across Chromium, Firefox and WebKit, retained coupon/purchase browser tests and 64 pricing/payment scenarios with isolated payment providers. Post-deployment checks verify headers on mobile and desktop using read-only requests. The release has an immutable rollback image and ownership-aware recovery.
