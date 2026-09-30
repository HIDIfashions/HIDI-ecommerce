import { canShareCampaign, featureAvailable, giftCommand, GrowthAccess, GrowthFeature, GrowthFlags, GiftCommand, GiftDraft, GiftOptions, GiftOutcome, invitationMessage, parseGiftOutcome, parseReferralCampaign } from "./contracts";

// Frontend adapter boundary only. Do not bind the blueprint's proposed paths
// until those server contracts have been verified. The production adapter is off.
export type GrowthServices = {
  readCircle: (access: GrowthAccess) => Promise<unknown>;
  readReferral: (access: GrowthAccess) => Promise<unknown>;
  readGift: (access: GrowthAccess) => Promise<unknown>;
  saveGift: (access: GrowthAccess, command: GiftCommand) => Promise<unknown>;
  reconcileGift: (access: GrowthAccess, command: GiftCommand) => Promise<unknown>;
};
export type GrowthRuntime = { flags: GrowthFlags; capabilities: GrowthFlags; services: GrowthServices };
export function assertGrowthEnabled(runtime: GrowthRuntime, feature: GrowthFeature) {
  if (!featureAvailable(feature, runtime.flags, runtime.capabilities)) throw new Error("This optional feature is not active.");
}
export type NativeShare = (message: string) => Promise<{ action: string }>;
export function createReferralShareAction(runtime: GrowthRuntime, share: NativeShare, now = Date.now) {
  let active: Promise<"dismissed" | "sheet-closed"> | null = null;
  return (access: GrowthAccess, stillCurrent: () => boolean): Promise<"dismissed" | "sheet-closed"> => {
    if (active) return active;
    active = (async () => {
      assertGrowthEnabled(runtime, "referrals");
      // Fetch approval/expiry again at the user's tap, not at screen mount only.
      const c = parseReferralCampaign(await runtime.services.readReferral(access), access.subjectId);
      assertGrowthEnabled(runtime, "referrals");
      if (!stillCurrent() || !canShareCampaign(c, now())) throw new Error("This invitation is no longer available. Refresh the campaign terms.");
      const result = await share(invitationMessage(c, now()));
      // Android's sharedAction does not prove delivery. Never credit a reward here.
      return result.action === "dismissedAction" ? "dismissed" : "sheet-closed";
    })().finally(() => { active = null; });
    return active;
  };
}

export function createGiftSaveAction(runtime: GrowthRuntime, now = Date.now) {
  let inFlight: Promise<GiftOutcome> | null = null;
  let pending: GiftCommand | null = null;
  let pendingScope: string | null = null;
  const scope = (a: GrowthAccess) => a.subjectId + ":" + a.cartId;
  const unknown = (): GiftOutcome => ({ kind: "unknown", operationId: pending?.operationId ?? "unresolved" });
  function check(access: GrowthAccess) {
    assertGrowthEnabled(runtime, "gifting");
    if (!access.cartId) throw new Error("Reload your bag before saving gift options.");
    if (pendingScope && pendingScope !== scope(access)) throw new Error("The bag or account changed. Reopen gift options.");
  }
  async function verify(access: GrowthAccess, raw: unknown, stillCurrent: () => boolean): Promise<GiftOutcome> {
    check(access);
    if (!pending || !stillCurrent()) return unknown();
    const result = parseGiftOutcome(raw, pending);
    if (result.kind !== "unknown") { pending = null; pendingScope = null; }
    return result;
  }
  return {
    save(access: GrowthAccess, options: GiftOptions, draft: GiftDraft, operationId: string, stillCurrent: () => boolean): Promise<GiftOutcome> {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        check(access);
        if (pending) return unknown(); // Never replay an ambiguous write.
        if (!stillCurrent() || options.cartId !== access.cartId) throw new Error("Reload your bag before saving gift options.");
        pending = giftCommand(options, draft, operationId, now()); pendingScope = scope(access);
        try {
          return await verify(access, await runtime.services.saveGift(access, pending), stillCurrent);
        } catch {
          // A timeout or malformed confirmation is not failure/success. Read only.
          try { return await verify(access, await runtime.services.reconcileGift(access, pending!), stillCurrent); }
          catch { return unknown(); }
        }
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
    reconcile(access: GrowthAccess, stillCurrent: () => boolean): Promise<GiftOutcome> {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        check(access); if (!pending) throw new Error("There is no unresolved gift operation.");
        try { return await verify(access, await runtime.services.reconcileGift(access, pending), stillCurrent); }
        catch { return unknown(); }
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
    hasPending: () => pending !== null,
  };
}
