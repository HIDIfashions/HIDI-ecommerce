import { screenRegistry } from "../src/spec/screenRegistry";
import { canShareCampaign, featureAvailable, giftCommand, giftDraftError, giftFee, invitationMessage, noteLength, parseCircleAccount, parseGiftOptions, parseGiftOutcome, parseReferralCampaign, PHASE7_CAPABILITIES, PHASE7_FLAGS, trustedInvitationUrl } from "../src/growth/contracts";
import { campaign, circle, confirmation, gift, NOW } from "../test-fixtures/growth";

describe("Phase 7 source-grounded optional contracts", () => {
  it("retains only H119 H120 H127 as optional P1 screens", () => {
    const screens = screenRegistry.filter(s => s.phase === 7);
    expect(screens.map(s => s.id)).toEqual(["H119", "H120", "H127"]);
    expect(screens.every(s => s.priority === "P1")).toBe(true);
  });
  it("keeps production flags and unsupported adapters off independently", () => {
    for (const feature of ["circle", "referrals", "gifting"] as const) {
      expect(featureAvailable(feature, PHASE7_FLAGS, { circle: true, referrals: true, gifting: true })).toBe(false);
      expect(featureAvailable(feature, { circle: true, referrals: true, gifting: true }, PHASE7_CAPABILITIES)).toBe(false);
    }
  });
  it("accepts approved points without converting them to cash", () => {
    const data = parseCircleAccount(circle, "test-user"); expect(data.availablePoints).toBe(120);
    expect(data).not.toHaveProperty("balancePaise");
  });
  it("rejects the real backend preview shape as a credited ledger", () => {
    expect(() => parseCircleAccount({ mode: "PREVIEW", spendablePaise: 0, policy: { eligibilityTermsApproved: false } }, "test-user")).toThrow();
  });
  it("rejects cross-account rewards and missing approved terms", () => {
    expect(() => parseCircleAccount(circle, "someone-else")).toThrow();
    expect(() => parseCircleAccount({ ...circle, policy: { ...circle.policy, approved: false } }, "test-user")).toThrow();
  });
  it("deduplicates identical events without adding balances locally", () => {
    const data = parseCircleAccount({ ...circle, ledger: [circle.ledger[0], circle.ledger[0]] }, "test-user");
    expect(data.ledger).toHaveLength(1); expect(data.availablePoints).toBe(120);
  });
  it("rejects conflicting event re-deliveries", () => {
    expect(() => parseCircleAccount({ ...circle, ledger: [circle.ledger[0], { ...circle.ledger[0], points: 999 }] }, "test-user")).toThrow();
  });
  it("keeps a reversal as its own server event, not a second earned credit", () => {
    const data = parseCircleAccount({ ...circle, ledger: [circle.ledger[0], { ...circle.ledger[0], eventId: "return-e2", state: "reversed", points: 10 }] }, "test-user");
    expect(data.ledger.map(e => e.state)).toEqual(["earned", "reversed"]); expect(data.availablePoints).toBe(120);
  });
  it.each(["https://evil.test/r/a", "https://thehidi.com.evil.test/r/a", "http://thehidi.com/r/a", "https://thehidi.com@evil.test/r/a", "javascript:alert(1)", "https://thehidi.com/r/a%0aBAD"])("rejects untrusted invitation %s", url => expect(trustedInvitationUrl(url)).toBe(false));
  it("requires an active eligible campaign and preserves the approved link", () => {
    const parsed = parseReferralCampaign(campaign, "test-user"); expect(canShareCampaign(parsed, NOW)).toBe(true);
    expect(invitationMessage(parsed, NOW)).toBe("Discover HIDI. https://thehidi.com/r/TEST-INVITE");
  });
  it("disables expired, future, ineligible and stale invitations", () => {
    expect(canShareCampaign(campaign, Date.parse(campaign.endsAt))).toBe(false);
    expect(canShareCampaign(campaign, Date.parse(campaign.startsAt) - 1)).toBe(false);
    expect(canShareCampaign({ ...campaign, eligible: false }, NOW)).toBe(false);
    expect(canShareCampaign({ ...campaign, validUntil: new Date(NOW).toISOString() }, NOW)).toBe(false);
  });
  it("rejects another account's referral", () => expect(() => parseReferralCampaign(campaign, "other")).toThrow());
  it("defaults extra packaging off and preserves exact gift note whitespace", () => {
    const options = parseGiftOptions(gift, "test-cart"); expect(options.selected.packagingId).toBeNull();
    const command = giftCommand(options, { note: "  For you ♥\nWith love  ", packagingId: null }, "op-1", NOW);
    expect(command.note).toBe("  For you ♥\nWith love  "); expect(command.expectedFeePaise).toBe(0);
  });
  it("counts Unicode code points and never silently truncates a note", () => {
    expect(noteLength("😀♥")).toBe(2);
    expect(giftDraftError({ ...gift, maxNoteLength: 1 }, { note: "😀♥", packagingId: null }, NOW)).toContain("limit");
  });
  it("rejects unavailable packaging, unsupported items and stale gift options", () => {
    expect(giftDraftError(gift, { note: "", packagingId: "missing" }, NOW)).toContain("no longer");
    expect(giftDraftError({ ...gift, unsupportedItems: ["Test item"] }, gift.selected, NOW)).toContain("do not support");
    expect(giftDraftError(gift, gift.selected, Date.parse(gift.validUntil))).toContain("refreshed");
  });
  it("uses integer paise for packaging and leaves the existing cart untouched", () => {
    const before = JSON.stringify(gift); expect(giftFee(gift, { note: "", packagingId: "test-wrap" })).toBe(12345); expect(JSON.stringify(gift)).toBe(before);
  });
  it("requires exact note, operation, fee, quote and fulfillment confirmation", () => {
    const command = giftCommand(gift, { note: "Hi", packagingId: "test-wrap" }, "op-1", NOW); const reply = confirmation(command);
    expect(parseGiftOutcome(reply, command).kind).toBe("confirmed");
    for (const override of [{ note: "Changed" }, { operationId: "other" }, { giftFeePaise: 999 }, { recordedForFulfillment: false }, { quoteId: "" }]) {
      expect(() => parseGiftOutcome({ ...reply, confirmation: { ...reply.confirmation, ...override } }, command)).toThrow();
    }
  });
});
