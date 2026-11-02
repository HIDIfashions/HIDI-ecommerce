# Offer terms and landing display

Approved on 2 November 2026. Two independent landing offers and separate terms links under checkout coupon assistance. Burgundy HIDI styling, desktop columns and mobile stacking. Terms are read from each offer's published admin configuration; drafts, selected audiences, schedules, pauses and placement flags remain authoritative.

The readonly `/api/hidi/offers/details?placement=landing|checkout` projection never returns customer identifiers, unpublished drafts or private audience lists. Existing offer and redemption policy responses remain unchanged. No checkout request or payment logic is changed; the terms enhancement is appended to the retained checkout asset.

`approved.json` holds the approved publication copy. After the guarded web deployment, an authenticated owner publishes only titles/terms and GET1 landing visibility, preserving audience, checkout enablement, collection and schedule. Do not publish new settings until all candidate tests and the web release pass.

GET1 return terms require a retained promotional dress to be paid at the regular selling price at purchase (credit ₹1) when returned qualifying goods reduce spend below ₹3,999. No preference return of the promotional dress; seven-day stock-dependent size exchanges; wrong/damaged items separately reviewed. This release does not automate a refund deduction or debit. Those adjustments require review and settlement during the existing admin after-sales process. No retroactive automated charge is introduced.

The user requested removal of the first-25 / once-per-customer disclosure sentence. This text change does not remove the existing server redemption cap or repeat-customer guard. Payment and eligibility remain unchanged.

Validation: unit projection checks; actual immutable runtime in Chromium, Firefox, WebKit at mobile and desktop widths; existing WELCOME250, GET1, purchase, CheckoutService and payment fixtures; read-only live hero and offer checks. Bounded OCI overlay and conditional deployment with owned rollback. API image, media, typography, prices and private configuration are preserved by the release snapshot.
