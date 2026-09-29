# HIDI Mobile - Agent Working Agreement

Branch: `hidi-mobile-build-from-scratch`

## Mission
Implement the Android commerce experience defined by the HIDI Mobile App Development Blueprint from scratch, while integrating with the real HIDI commerce backend and preserving production safety.

## Source-of-truth order
1. Approved merchant policy and actual backend/provider contracts.
2. Blueprint screen behavior, accessibility and state rules.
3. HIDI design tokens and reusable components.
4. Rendered blueprint screenshots as art direction.

When two sources conflict, stop and record the conflict. Do not silently guess.

## Hard constraints
- Do not copy or reference UI/source code from prior Android branches (`feature/android-app-v1`, `feature/android-app-v2-*`, `feature/android-app-v3-commerce`).
- Reading existing NestJS API, infrastructure config, database schema and server proxy code is allowed only to establish real integration contracts.
- Do not modify production infrastructure or create new Azure resources as part of the mobile build.
- Do not put provider secrets, admin keys, signing secrets or database credentials in Android source, Gradle files, resources or generated artifacts.
- Do not calculate authoritative price/tax/refund/payment totals on the client.
- Do not treat a client/provider callback as payment truth; reconcile with HIDI server state.
- Do not auto-retry financial writes with a fresh idempotency key after an ambiguous result.
- Do not infer return/cancellation eligibility from device time; use server-provided allowed actions.
- Do not show fake stock scarcity, countdowns, ratings, delivery dates, savings, support channels or policy promises.
- Do not add first-launch permission prompts.
- Do not block browsing on sign-in.

## Traceability
Every implementation ticket/commit touching a customer journey must include:
- Screen ID(s), e.g. `H023/H025/H036`.
- User outcome.
- State transition(s).
- API/OS/provider contract.
- Loading/empty/error/offline behavior.
- Accessibility acceptance.
- Test evidence.

## Documentation discipline
Update these files continuously:
- `phase.md`: current phase, completed screens, next screens, blockers.
- `build.md`: architecture, environment, API mapping, build/test instructions.
- `agent.md`: stable operating rules and confirmed decisions.

Never mark a phase complete based only on a screenshot.

## Change safety
- All work remains on `hidi-mobile-build-from-scratch` until explicitly approved.
- Keep existing website API contracts backward-compatible.
- Use small, reviewable commits grouped by phase/screen IDs.
- No merge to `main`, no production deployment and no release signing without explicit approval.

## UI implementation rules
- Native Android: Kotlin + Jetpack Compose.
- 48dp minimum interactive targets.
- Native semantics and logical focus order.
- 200% text must remain usable without clipping critical content.
- Use semantic HIDI tokens, not hard-coded screenshot dimensions.
- Product media keeps natural colors in dark mode.
- Reduced motion removes shared-element travel/looping shimmer.
- Back behavior: keyboard -> overlay -> current route; successful order confirmation must not back-navigate into payment submission.

## Commerce state rules
Represent network/domain state separately.
- Loading != empty.
- Failed fetch != zero results.
- Offline cache != current stock.
- Payment timeout != payment failed.
- Cancellation request != cancellation completed.
- Provider processed refund != bank credited unless evidence supports it.

## Current confirmed integration facts
- Repository: `HIDIfashions/HIDI-ecommerce`.
- Default branch: `main`.
- Backend: NestJS/Fastify with global prefix `/v1`.
- Customer auth: Supabase JWT validated by the backend.
- Production target architecture: Azure Container Apps + Azure SQL + private Blob; API is internal behind the public web tier.
- Public server proxy already exists: `/api/store/[...path]` -> internal `/v1/[...path]`.
- Payment implementation currently uses Razorpay server verification/webhooks.
- No confirmed Azure APIM service, APIM subscription key/header or APIM gateway URL exists in repository/prior confirmed setup.

## Decision protocol
If a required contract is absent:
1. Check the blueprint.
2. Check the real backend/server configuration.
3. If still unresolved, add it to `phase.md` Open Decisions and ask the owner.
4. Do not invent a value or ship a placeholder that behaves like production.
