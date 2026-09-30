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
- Phases 0, 1 and 2 are complete and verified as recorded in phase.md.
- Phase 3 verified in run `36628638488`; Phase 4 in `36634182910`; Phase 5 in `36648013506`.
- Phase 6 verified in run `36668877144` at commit `eb87147d43599b5368c825163dab0286f7e5aa55`.
- Phase 7 H119/H120/H127 is implemented; CI validation is pending. Do not claim a test/native build passed before reading its result.
- Optional Phase 7 production gates remain OFF. The existing rewards preview is not a points ledger; do not repurpose it or wallet money. Do not bind proposed blueprint URLs as if they already existed.
- Frontend adapter/presentation contracts in src/growth are not approved REST schemas. Test fixtures are synthetic and must never be imported into application code.
- No contacts access, automatic invitation, local reward credit, silent packaging addition, client quote mutation or fake gift save confirmation.
- Fee changes require explicit reapproval. Unknown writes may only reconcile the existing operation. Gift note and reward-account data must not leak into logs or other users' screens.
- See apps/mobile/docs/phase7.md for activation prerequisites and source traceability.
- Keep Phase 6 resilience rules: cache is informational, payment retries are not generic recovery, update gates need trusted config and first launch has no permission prompt.
- Phase 8 is NOT STARTED; require explicit owner approval after Phase 7 reporting.

## Verification language
Build/type/unit/component/Metro success is CI evidence, not proof of live-provider readiness or complete physical-device visual/accessibility coverage. Preserve capability limitations and release-hardening work instead of silently marking them solved.
