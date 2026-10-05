# HIDI Mobile Premium V2 — engineering agreement

## Scope
Build a clean React Native application on `hidi-mobile-premium-v2`, based on the production website/backend in `main`. Do not use the previous mobile application's UI, screen composition, navigation structure or placeholder features as a reference.

## Product principles
- HIDI branding, photography and copy remain original. Myntra is a benchmark for energy, conversion mechanics and interaction quality—not a source of copied assets or brand identity.
- White is the primary canvas, `#1C1C1E` is the main text colour and `#FF3F6C` is reserved for active states, sale emphasis and primary CTAs.
- Every product feed uses strict 4:5 or 1:1 media geometry and a disciplined two-column layout.
- One strong primary CTA per state. No decorative clutter, oversized headings, fake urgency or cheap discount-store treatment.
- Motion must communicate state: spring card expansion, bottom-sheet selection, wishlist heart-pop/haptic and swipe-to-remove.

## Data and commerce invariants
- Reuse verified website APIs and APIM routes. Do not create a second gateway or silently change backend contracts.
- Inventory, prices, discount percentages, tax, shipping, loyalty entitlement and payment success always come from canonical server responses.
- Never convert a network failure into an empty catalogue, successful cart mutation, payment success or loyalty benefit.
- No real Apple Pay, Google Pay or Stripe success state until the backend exposes approved PaymentIntent/reconciliation contracts and native configuration is present.
- Insider Premium Club is feature-gated until commercial rules and server entitlements are approved.

## Delivery method
- Build the four critical screens first and generate review screenshots before scaling to the full app.
- Keep `phase.md`, `agent.md` and `build.md` current after every milestone.
- Each phase requires typecheck, tests and Android/iOS build evidence.
- No force-push, production deployment or merge to `main` without explicit approval.
