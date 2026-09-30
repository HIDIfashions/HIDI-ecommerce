import { createGiftSaveAction, createReferralShareAction } from "../src/growth/operations";
import { access, campaign, gift, NOW, runtime } from "../test-fixtures/growth";

describe("Phase 7 action safety", () => {
  it("makes no API or share call with flags off", async () => {
    const r = runtime(); r.flags = { circle: false, referrals: false, gifting: false };
    const share = jest.fn(); const action = createReferralShareAction(r, share, () => NOW);
    await expect(action(access, () => true)).rejects.toThrow("not active"); expect(r.services.readReferral).not.toHaveBeenCalled(); expect(share).not.toHaveBeenCalled();
    await expect(createGiftSaveAction(r, () => NOW).save(access, gift, gift.selected, "op", () => true)).rejects.toThrow("not active"); expect(r.services.saveGift).not.toHaveBeenCalled();
  });
  it("deduplicates double share taps and does not treat native completion as delivery", async () => {
    const r = runtime(); const share = jest.fn().mockResolvedValue({ action: "sharedAction" });
    const action = createReferralShareAction(r, share, () => NOW);
    const first = action(access, () => true); const second = action(access, () => true);
    expect(second).toBe(first); await expect(first).resolves.toBe("sheet-closed");
    expect(share).toHaveBeenCalledTimes(1); expect(r.services.readReferral).toHaveBeenCalledTimes(1);
  });
  it("treats dismissal as cancellation without a reward mutation", async () => {
    const share = jest.fn().mockResolvedValue({ action: "dismissedAction" }); const r = runtime();
    await expect(createReferralShareAction(r, share, () => NOW)(access, () => true)).resolves.toBe("dismissed"); expect(r.services.saveGift).not.toHaveBeenCalled();
  });
  it("rechecks expiry at the share action and prevents sharing after logout", async () => {
    const r = runtime(); const share = jest.fn();
    (r.services.readReferral as jest.Mock).mockResolvedValue({ ...campaign, endsAt: new Date(NOW).toISOString() });
    await expect(createReferralShareAction(r, share, () => NOW)(access, () => true)).rejects.toThrow();
    (r.services.readReferral as jest.Mock).mockResolvedValue(campaign);
    await expect(createReferralShareAction(r, share, () => NOW)(access, () => false)).rejects.toThrow(); expect(share).not.toHaveBeenCalled();
  });
  it("confirms one canonical gift mutation for repeated taps", async () => {
    const r = runtime(); const action = createGiftSaveAction(r, () => NOW);
    const a = action.save(access, gift, { note: "Exactly this note", packagingId: "test-wrap" }, "op-1", () => true);
    const b = action.save(access, gift, { note: "Exactly this note", packagingId: "test-wrap" }, "op-1", () => true);
    expect(b).toBe(a); await expect(a).resolves.toMatchObject({ kind: "confirmed", confirmation: { note: "Exactly this note", giftFeePaise: 12345 } });
    expect(r.services.saveGift).toHaveBeenCalledTimes(1);
  });
  it("reconciles a lost gift response through read-only status, never a second write", async () => {
    const r = runtime(); (r.services.saveGift as jest.Mock).mockRejectedValue(new Error("timeout"));
    await expect(createGiftSaveAction(r, () => NOW).save(access, gift, gift.selected, "op-1", () => true)).resolves.toMatchObject({ kind: "confirmed" });
    expect(r.services.saveGift).toHaveBeenCalledTimes(1); expect(r.services.reconcileGift).toHaveBeenCalledTimes(1);
  });
  it("retains unknown status and blocks a fresh operation until reconciled", async () => {
    const r = runtime(); (r.services.saveGift as jest.Mock).mockRejectedValue(new Error("timeout"));
    (r.services.reconcileGift as jest.Mock).mockRejectedValue(new Error("offline"));
    const action = createGiftSaveAction(r, () => NOW);
    await expect(action.save(access, gift, gift.selected, "op-1", () => true)).resolves.toEqual({ kind: "unknown", operationId: "op-1" });
    await expect(action.save(access, gift, { note: "Other", packagingId: null }, "op-2", () => true)).resolves.toEqual({ kind: "unknown", operationId: "op-1" });
    await expect(action.reconcile(access, () => true)).resolves.toMatchObject({ kind: "unknown" });
    expect(action.hasPending()).toBe(true); expect(r.services.saveGift).toHaveBeenCalledTimes(1);
  });
  it("does not accept a different fee or altered note as confirmation", async () => {
    const r = runtime(); (r.services.saveGift as jest.Mock).mockResolvedValue({ kind: "confirmed", confirmation: { note: "wrong" } });
    (r.services.reconcileGift as jest.Mock).mockRejectedValue(new Error("not resolved"));
    await expect(createGiftSaveAction(r, () => NOW).save(access, gift, gift.selected, "op-1", () => true)).resolves.toMatchObject({ kind: "unknown" });
  });
  it("requires another explicit save to accept a changed packaging fee", async () => {
    const r = runtime(); const updated = { ...gift, revision: "v2", packages: [{ ...gift.packages[0], feePaise: 13000 }] };
    (r.services.saveGift as jest.Mock).mockResolvedValueOnce({ kind: "fee-changed", options: updated });
    const action = createGiftSaveAction(r, () => NOW); const draft = { note: "Note", packagingId: "test-wrap" };
    await expect(action.save(access, gift, draft, "op-1", () => true)).resolves.toMatchObject({ kind: "fee-changed" });
    expect(r.services.saveGift).toHaveBeenCalledTimes(1);
    await expect(action.save(access, updated, draft, "op-2", () => true)).resolves.toMatchObject({ kind: "confirmed", confirmation: { giftFeePaise: 13000 } });
  });
  it("blocks unsupported items and a different cart before write", async () => {
    const r = runtime();
    await expect(createGiftSaveAction(r, () => NOW).save(access, { ...gift, unsupportedItems: ["Test item"] }, gift.selected, "op-1", () => true)).rejects.toThrow();
    await expect(createGiftSaveAction(r, () => NOW).save({ ...access, cartId: "other-cart" }, gift, gift.selected, "op-1", () => true)).rejects.toThrow();
    expect(r.services.saveGift).not.toHaveBeenCalled();
  });
});
