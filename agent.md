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

## Current checkpoint
- Phase 0 is complete and verified.
- Phase 1 H001-H022 is complete and verified.
- Phase 2 H023-H044 is complete and verified.
- Phase 3 H045-H060 is complete and verified in run `36628638488`.
- Phase 4 H061-H082/H128-H131 is complete and verified in run `36634182910`.
- Phase 5 H083-H102/H123-H126/H132 is complete and verified in run `36648013506`.
- Phase 6 H103-H118/H121-H122/H125 is owner-approved and in progress.
- Phase 6 must keep resilience states honest: cached content is informational, checkout mutations are disabled offline, generic errors must not suggest payment retry, update gates use trusted config, and permission prompts are never shown on first launch.
- Do not start Phase 7 until owner approval after Phase 6 verification.
