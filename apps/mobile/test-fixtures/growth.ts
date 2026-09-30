// Synthetic test data ONLY. No imports from production screens/runtime to here.
// These values, URLs and rules are NOT approved merchant campaigns or prices.
import type { CircleAccount, GiftCommand, GiftOptions, GrowthAccess, ReferralCampaign } from "../src/growth/contracts";
import type { GrowthRuntime } from "../src/growth/operations";
export const NOW = Date.parse("2030-01-01T12:00:00Z");
export const access: GrowthAccess = { subjectId: "test-user", accessToken: "test-only-token", cartId: "test-cart" };
export const circle: CircleAccount = {
  kind: "confirmed-points", subjectId: "test-user", availablePoints: 120, pendingPoints: 30, reversedPoints: 10,
  asOf: "2030-01-01T11:00:00Z", validUntil: "2030-01-02T00:00:00Z",
  policy: { approved: true, version: "TEST-1", eligibility: "Fixture eligibility, not merchant terms.", expiry: "Fixture expiry, not merchant terms.", reversals: "Fixture reversal rule, not merchant terms." },
  ledger: [{ eventId: "e1", sourceReference: "TEST-ORDER", state: "earned", points: 120, occurredAt: "2030-01-01T10:00:00Z", expiresAt: "2031-01-01T00:00:00Z" }],
};
export const campaign: ReferralCampaign = {
  subjectId: "test-user", campaignId: "TEST-CAMPAIGN", approved: true, eligible: true,
  terms: "Synthetic test terms. No real reward is offered.", invitationCode: "TEST-INVITE", invitationUrl: "https://thehidi.com/r/TEST-INVITE",
  startsAt: "2030-01-01T00:00:00Z", endsAt: "2030-02-01T00:00:00Z", validUntil: "2030-01-02T00:00:00Z",
};
export const gift: GiftOptions = {
  cartId: "test-cart", revision: "v1", currency: "INR", maxNoteLength: 100, noteSupported: true, unsupportedItems: [],
  packages: [{ id: "test-wrap", label: "Fixture packaging", feePaise: 12345, available: true }],
  selected: { note: "", packagingId: null }, validUntil: "2030-01-02T00:00:00Z",
};
export function confirmation(command: GiftCommand) {
  return { kind: "confirmed", confirmation: { cartId: command.cartId, operationId: command.operationId, note: command.note, packagingId: command.packagingId, giftFeePaise: command.expectedFeePaise, quoteId: "TEST-QUOTE", recordedForFulfillment: true } };
}
export function runtime(): GrowthRuntime {
  return { flags: { circle: true, referrals: true, gifting: true }, capabilities: { circle: true, referrals: true, gifting: true }, services: {
    readCircle: jest.fn().mockResolvedValue(circle), readReferral: jest.fn().mockResolvedValue(campaign), readGift: jest.fn().mockResolvedValue(gift),
    saveGift: jest.fn().mockImplementation(async (_access: GrowthAccess, command: GiftCommand) => confirmation(command)),
    reconcileGift: jest.fn().mockImplementation(async (_access: GrowthAccess, command: GiftCommand) => confirmation(command)),
  } };
}
