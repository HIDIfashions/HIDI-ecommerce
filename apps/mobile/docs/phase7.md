# Phase 7 — optional growth (H119, H120, H127)

Source: HIDI_Mobile_App_Development_Blueprint.pdf, page 70 (Circle / Invite a friend), page 74 (Gift note & packaging). The images were read as well as the screen behavior. These three screens are P1 / feature-flagged, not mandatory launch capabilities.

## Source-derived requirements
- H119: earned/available, pending and reversed points; eligibility and expiry; deduplicated order/return events; points are not cash. Off flags remove entry points.
- H120: approved campaign terms and referral link; native Share on deliberate tap; no contacts permission or automatic messages; expired campaign disables the promise.
- H127: optional exact gift note and packaging; packaging starts off; approved fee displayed plainly; explicit length, item-compatibility and fee-change handling; only canonical quote and fulfillment confirmation can show Saved.

## Existing contracts actually reviewed
- apps/api/src/rewards/rewards.controller.ts exposes GET /rewards/summary.
- rewards.service.ts describes that response as PREVIEW, with eligibilityTermsApproved=false, redemptionEnabled=false and zero spendablePaise. This is NOT a live Circle ledger and is intentionally not relabelled as one.
- The cart controller exposes cart GET, exact-variant add, quantity PATCH and remove. It does not expose gift-options PATCH or a gift-fee quote/fulfillment acknowledgement.
- No reviewed customer referral-campaign contract is bound by this branch.
- Backend, database, APIM, checkout payment creation, production configuration and provider credentials are unchanged.

## What the frontend implements
- Growth is a typed native root route; P1 entry points attach to My HIDI and the Bag only when both feature permission and a supported adapter are enabled.
- Production PHASE7_FLAGS and PHASE7_CAPABILITIES are all false. Flag-off renders no entry rows and makes no optional-service calls. Direct route navigation remains guarded.
- Circle renders approved policy text, point buckets and activity details. Replayed identical events appear once; conflicting event reuse is rejected rather than credited locally. API totals remain authoritative.
- Invitations are account-scoped, validated for expiry/eligibility and allowlisted HTTPS share destinations. Terms are fetched again at share time. Repeated taps collapse into one native share action. Dismissal is not success; Android sharedAction is not treated as delivery or earned reward.
- Gift editing preserves exact note text and counts Unicode code points. No packaging is selected by default. Unsupported items/packaging and excessive note length block Save. Prices stay in integer paise; no client gift fee is injected into the cart.
- Gift commands retain the operation ID across uncertain writes; recovery is a read, not a blind retry. Altered note/fee/quote/operation/fulfillment confirmation is never accepted. A changed fee requires another explicit reviewed save.
- Gift operation state is separated by verified account and cart and is retained while navigating within the running app. No gift-note data is written to plain AsyncStorage or logs.
- Theme tokens, scalable text, 48dp controls, native back and the existing reduced-motion root navigation are reused. No prior mobile branch UI was copied.

## Explicit boundary — do not mistake test models for live APIs
contracts.ts contains FRONTEND PRESENTATION/ADAPTER contracts derived from the screen's data needs, not a documented live server request schema. runtime.ts deliberately supplies an unavailable production adapter. test-fixtures/growth.ts is synthetic and is not imported into the app. Fixture points, prices, expiry dates, codes and terms are not merchant decisions.

Activation is a separate integration/business gate: approved earning/expiry/reversal terms plus a real ledger; a server-verified referral campaign with abuse controls; and operationally supported packaging, note limits, atomic gift-options quote/fulfillment acknowledgement, and restart-safe server operation reconciliation. The frontend must be mapped to those verified contracts and end-to-end tested before flipping either gate. Do not enable these features by changing flags alone.

## Validation
- All existing Phase 0–6 tests remain in the suite.
- New contract tests: exact optional-screen registry, off flags, unsupported adapters, no wallet/preview-to-points conversion, event replay/conflict, account isolation, campaign validity, share URL allowlist, exact note / Unicode limits, unsupported items, integer fees, canonical gift confirmation.
- New action tests: explicit share/dismissal, double taps, expiry at tap, logout, one canonical gift write, response loss/reconciliation, unresolved operation lock and explicit fee reapproval.
- New React Native component tests: flag-off invisibility and direct-route guard, Circle activity expansion, expired referral action disabled, gift-note editing without submission, and read-only recovery for ambiguous writes.
- CI: TypeScript, entire Jest suite, Metro release bundling for both platforms, Android debug compilation and iOS simulator compilation. Reports and debug APK are uploaded by the workflow.
- Native device visual, VoiceOver/TalkBack, installed-release and live-provider QA are not claimed by passing CI; release hardening remains Phase 8.
