# HIDI Mobile - Agent Working Agreement

Branch: `hidi-mobile-build-from-scratch`

## Mission
Build the UI and client-side flows in the HIDI Mobile App Development Blueprint as a new React Native application, one approved phase at a time.

## Source-of-truth order
1. Existing HIDI backend/gateway/provider contracts.
2. Blueprint behavior, states, accessibility and navigation.
3. Blueprint component/token rules.
4. Rendered blueprint screens as visual reference.

## Hard constraints
- Frontend only unless the owner explicitly changes scope.
- Do not create, replace or redesign backend/APIM/database/provider infrastructure.
- Do not copy UI/application code from any prior HIDI mobile branch.
- Prior branches may be inspected only to recover an already-established integration contract.
- React Native is the only UI stack in this branch.
- Keep `android/` and `ios/` build projects.
- Keep app identity `com.thehidi.app`.
- Never place private API keys, provider secrets, admin keys, signing secrets or database credentials in the app.
- Never fabricate success, stock, payment, delivery, refund, review, policy or support states.
- Failed fetch is not an empty state. Timeout is not payment failure.
- No mandatory sign-in for browsing.
- No first-launch permission prompt.
- Phone OTP delivery for launch uses WhatsApp through the existing Supabase Auth contract; provider credentials stay outside the app.

## Phase discipline
For every phase:
1. Re-read all blueprint screens in scope.
2. Build reusable primitives first.
3. Wire only to existing HIDI integration contracts.
4. Implement required loading/empty/error/offline/recovery states.
5. Add deterministic tests and screen-ID traceability.
6. Update `phase.md`, `agent.md`, `build.md`.
7. Report completion and stop until owner approval.

## UI baseline
- Canvas `#FAF8F4`, berry `#702B42`, ink `#2B2427`, blush `#F0E5E8`, forest `#4C654D`.
- 48dp minimum interaction target.
- Scalable text up to 200% without clipping critical content.
- Editorial serif for display/title and readable system sans for interface copy until approved fonts exist.
- Product photography never color-inverted.
- Reduced motion removes nonessential travel/shimmer.
- Do not imitate provider/OS security dialogs.

## Existing gateway
- Debug/staging: `https://thidigk.thehidi.com/api/store`
- Production: `https://thehidi.com/api/store`

This app reuses that layer; it does not add a new one.


## Current checkpoint
- Phase 0 is complete and CI-verified.
- Typecheck, unit tests and Android debug build passed in workflow run `36570551111`.
- Phase 1 is approved and in progress.
- H004/H005 now use WhatsApp OTP delivery while keeping the existing Supabase phone-session contract.
- Live WhatsApp delivery remains provider-configuration dependent; do not expose Twilio or Meta secrets in React Native.
