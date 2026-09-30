# HIDI Mobile — agent agreement

Branch: `hidi-mobile-build-from-scratch`. Frontend-only React Native. Existing backend/APIM/database/provider contracts are not changed. Source precedence: actual approved merchant/API contracts, then blueprint behavior/accessibility, then tokens, then rendered illustrations. No old mobile UI reuse.

## Invariants
No guessed credentials, monetary success, inventory, delivery, refund, rewards, ticket/deletion or policy claims. Do not interpret transport failure as empty state or payment failure. No automatic financial retries, first-launch permission prompts, mandatory browsing sign-in, contact scraping or automatic referral messages. Exact canonical SKU/price/order context remains authoritative. Production growth flags stay OFF until server and commercial approvals exist. Tests/fixtures never become production data.

## Checkpoint
Phases 0–7 have recorded CI evidence in phase.md; Phase 7 passed 87 tests/11 suites, Android and iOS. Phase 8 is now owner-approved and IN PROGRESS. Phase 8 audits expose limitations of the previous compile-only gates: the native payment handoff is absent, several capabilities are placeholders, and legacy local caches need complete account isolation. The new payment-preparation guard prevents unpayable orders instead of claiming the native SDK exists.

## Evidence discipline
Use actual executed output. A test inventory is not UI coverage; screenshots without approved baselines are not visual regression; emulator timing is not physical-device p95; a test-only signature is not production signing custody. Update phase.md, agent.md, build.md after results. Do not mark the complete blueprint release gate passed while required live-provider, physical-device, privacy, commercial or signing approvals remain absent.

## Change safety
Work only on this branch. No force-push, main merge or production deployment. The internal Android/iOS identity is com.thehidi.app.internal; the production identifier remains com.thehidi.app. Test signing keys must never be committed or included in artifacts. CI may commit ONLY the generated dependency lock on this branch after tests, without rewriting other changes. All native jobs validate that exact frozen source SHA.
