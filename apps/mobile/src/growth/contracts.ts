// H119 / H120 / H127 presentation contracts. These are NOT claims that new REST
// endpoints exist. A future verified adapter must map server data into them.
export type GrowthFeature = "circle" | "referrals" | "gifting";
export type GrowthFlags = Readonly<Record<GrowthFeature, boolean>>;
export const PHASE7_FLAGS: GrowthFlags = Object.freeze({ circle: false, referrals: false, gifting: false });
export const PHASE7_CAPABILITIES: GrowthFlags = Object.freeze({ circle: false, referrals: false, gifting: false });
export const GROWTH_SCREEN_IDS = { circle: "H119", referrals: "H120", gifting: "H127" } as const;

export function featureAvailable(feature: GrowthFeature, flags: GrowthFlags, capabilities: GrowthFlags) {
  return flags[feature] === true && capabilities[feature] === true;
}

export type GrowthAccess = { subjectId: string; accessToken: string; cartId?: string };
export type RewardEvent = {
  eventId: string;
  sourceReference: string;
  state: "earned" | "pending" | "reversed" | "expired";
  points: number;
  occurredAt: string;
  expiresAt: string | null;
};
export type CircleAccount = {
  kind: "confirmed-points";
  subjectId: string;
  availablePoints: number;
  pendingPoints: number;
  reversedPoints: number;
  asOf: string;
  validUntil: string;
  policy: { version: string; eligibility: string; expiry: string; reversals: string; approved: true };
  ledger: RewardEvent[];
};
export type ReferralCampaign = {
  subjectId: string;
  campaignId: string;
  approved: true;
  eligible: boolean;
  terms: string;
  invitationCode: string;
  invitationUrl: string;
  startsAt: string;
  endsAt: string;
  validUntil: string;
};
export type GiftDraft = { note: string; packagingId: string | null };
export type GiftPackage = { id: string; label: string; feePaise: number; available: boolean };
export type GiftOptions = {
  cartId: string;
  revision: string;
  currency: "INR";
  maxNoteLength: number;
  noteSupported: boolean;
  unsupportedItems: string[];
  packages: GiftPackage[];
  selected: GiftDraft;
  validUntil: string;
};
export type GiftCommand = GiftDraft & {
  cartId: string;
  revision: string;
  operationId: string;
  expectedFeePaise: number;
};
export type GiftConfirmation = GiftDraft & {
  cartId: string;
  operationId: string;
  quoteId: string;
  giftFeePaise: number;
  recordedForFulfillment: true;
};
export type GiftOutcome =
  | { kind: "confirmed"; confirmation: GiftConfirmation }
  | { kind: "fee-changed"; options: GiftOptions }
  | { kind: "unknown"; operationId: string };

export class GrowthContractError extends Error {
  constructor() { super("This optional service could not be verified. Please try again later."); this.name = "GrowthContractError"; }
}
function requireValue(ok: unknown): asserts ok { if (!ok) throw new GrowthContractError(); }
function record(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 4000): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function count(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function date(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
export function freshUntil(value: string, now = Date.now()) { return Number.isFinite(Date.parse(value)) && Date.parse(value) > now; }
export function noteLength(note: string) { return Array.from(note).length; }

export function parseCircleAccount(value: unknown, subjectId: string): CircleAccount {
  const x = record(value); const policy = record(x.policy);
  // In particular, /rewards/summary mode PREVIEW and wallet paise are not points.
  requireValue(x.kind === "confirmed-points" && x.subjectId === subjectId);
  requireValue(count(x.availablePoints) && count(x.pendingPoints) && count(x.reversedPoints));
  requireValue(date(x.asOf) && date(x.validUntil));
  requireValue(policy.approved === true && text(policy.version, 100) && text(policy.eligibility) && text(policy.expiry) && text(policy.reversals));
  requireValue(Array.isArray(x.ledger));
  const unique = new Map<string, RewardEvent>();
  for (const raw of x.ledger) {
    const e = record(raw);
    requireValue(text(e.eventId, 200) && text(e.sourceReference, 200));
    requireValue(["earned", "pending", "reversed", "expired"].includes(String(e.state)) && count(e.points));
    requireValue(date(e.occurredAt) && (e.expiresAt === null || date(e.expiresAt)));
    const entry: RewardEvent = { eventId: e.eventId, sourceReference: e.sourceReference, state: e.state as RewardEvent["state"], points: e.points, occurredAt: e.occurredAt, expiresAt: e.expiresAt };
    const prior = unique.get(entry.eventId);
    // Exact re-delivery may be displayed once. Conflicting event reuse is not
    // silently summed or fixed by the client. Server accounting remains authoritative.
    requireValue(!prior || JSON.stringify(prior) === JSON.stringify(entry));
    unique.set(entry.eventId, entry);
  }
  return { ...(x as unknown as CircleAccount), ledger: [...unique.values()] };
}

export function trustedInvitationUrl(value: string) {
  // Share text only; no privileged WebView and no arbitrary host/port/userinfo.
  return /^https:\/\/(?:thehidi\.com|www\.thehidi\.com|thidigk\.thehidi\.com)\/[A-Za-z0-9_\-/?=&%.~]+$/.test(value)
    && !/%(?:0a|0d|00)/i.test(value);
}
export function parseReferralCampaign(value: unknown, subjectId: string): ReferralCampaign {
  const x = record(value);
  requireValue(x.subjectId === subjectId && x.approved === true && typeof x.eligible === "boolean");
  requireValue(text(x.campaignId, 100) && text(x.terms) && text(x.invitationCode, 100));
  requireValue(text(x.invitationUrl, 1500) && trustedInvitationUrl(x.invitationUrl));
  requireValue(date(x.startsAt) && date(x.endsAt) && date(x.validUntil));
  requireValue(Date.parse(x.startsAt) < Date.parse(x.endsAt));
  return x as unknown as ReferralCampaign;
}
export function canShareCampaign(c: ReferralCampaign, now = Date.now()) {
  return c.approved && c.eligible && trustedInvitationUrl(c.invitationUrl)
    && now >= Date.parse(c.startsAt) && now < Date.parse(c.endsAt) && freshUntil(c.validUntil, now);
}
export function invitationMessage(c: ReferralCampaign, now = Date.now()) {
  if (!canShareCampaign(c, now)) throw new GrowthContractError();
  return "Discover HIDI. " + c.invitationUrl;
}

export function parseGiftOptions(value: unknown, cartId: string): GiftOptions {
  const x = record(value); const selected = record(x.selected);
  requireValue(x.cartId === cartId && text(x.revision, 200) && x.currency === "INR" && date(x.validUntil));
  requireValue(Number.isSafeInteger(x.maxNoteLength) && Number(x.maxNoteLength) > 0 && Number(x.maxNoteLength) <= 10000);
  requireValue(typeof x.noteSupported === "boolean" && Array.isArray(x.unsupportedItems) && x.unsupportedItems.every(v => text(v, 300)));
  requireValue(typeof selected.note === "string" && (selected.packagingId === null || text(selected.packagingId, 100)));
  requireValue(Array.isArray(x.packages));
  const seen = new Set<string>();
  for (const raw of x.packages) {
    const p = record(raw);
    requireValue(text(p.id, 100) && !seen.has(p.id) && text(p.label, 300) && count(p.feePaise) && typeof p.available === "boolean");
    seen.add(p.id);
  }
  return x as unknown as GiftOptions;
}
export function giftFee(options: GiftOptions, draft: GiftDraft) {
  if (draft.packagingId === null) return 0;
  const pack = options.packages.find(p => p.id === draft.packagingId && p.available);
  if (!pack) throw new GrowthContractError();
  return pack.feePaise;
}
export function giftDraftError(options: GiftOptions, draft: GiftDraft, now = Date.now()): string | null {
  if (!freshUntil(options.validUntil, now)) return "Gift options need to be refreshed before saving.";
  if (options.unsupportedItems.length) return "Some items in this bag do not support gifting.";
  if (draft.note.length && !options.noteSupported) return "Gift notes are not supported for this bag.";
  if (noteLength(draft.note) > options.maxNoteLength) return "The gift note exceeds the approved character limit.";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(draft.note)) return "Remove unsupported control characters from the gift note.";
  if (draft.packagingId !== null && !options.packages.some(p => p.id === draft.packagingId && p.available)) return "This packaging is no longer available.";
  return null;
}
export function giftCommand(options: GiftOptions, draft: GiftDraft, operationId: string, now = Date.now()): GiftCommand {
  if (giftDraftError(options, draft, now) || !text(operationId, 200)) throw new GrowthContractError();
  // Preserve the exact approved note; do not trim/truncate after user review.
  return { ...draft, cartId: options.cartId, revision: options.revision, operationId, expectedFeePaise: giftFee(options, draft) };
}
export function parseGiftOutcome(value: unknown, command: GiftCommand): GiftOutcome {
  const x = record(value);
  if (x.kind === "fee-changed") return { kind: "fee-changed", options: parseGiftOptions(x.options, command.cartId) };
  if (x.kind === "unknown") return { kind: "unknown", operationId: command.operationId };
  requireValue(x.kind === "confirmed"); const c = record(x.confirmation);
  requireValue(c.cartId === command.cartId && c.operationId === command.operationId && text(c.quoteId, 200));
  requireValue(c.recordedForFulfillment === true && c.note === command.note && c.packagingId === command.packagingId);
  requireValue(count(c.giftFeePaise) && c.giftFeePaise === command.expectedFeePaise);
  return { kind: "confirmed", confirmation: c as unknown as GiftConfirmation };
}
