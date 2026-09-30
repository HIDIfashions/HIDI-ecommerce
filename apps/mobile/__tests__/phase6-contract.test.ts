import { screenRegistry, screenContract } from "../src/spec/screenRegistry";
import {
  attachmentUploadIssue,
  canRequestPermission,
  classifyProblem,
  effectiveTheme,
  linkUnavailableReason,
  offlinePolicy,
  partialLoadRecovery,
  phase6ScreenIds,
  retryAfterMs,
  shouldShowOptionalUpdate,
  summarizeLookSelection,
  updateGate,
} from "../src/models/system";

describe("Phase 6 resilience, system states and editorial contracts", () => {
  it("keeps Phase 6 launch screens registered without moving Phase 5 extended routes", () => {
    const phase6 = screenRegistry.filter((screen) => screen.phase === 6).map((screen) => screen.id);
    expect(phase6).toEqual([
      ...Array.from({ length: 16 }, (_, index) => "H" + String(index + 103).padStart(3, "0")),
      "H121", "H122",
    ]);
    for (const id of phase6ScreenIds) expect(screenContract(id)).toBeTruthy();
    expect(screenContract("H125")?.priority).toBe("P0");
  });

  it("keeps offline cache informational and disables checkout mutation", () => {
    const policy = offlinePolicy({ hasSavedContent: true });
    expect(policy.showCachedContent).toBe(true);
    expect(policy.checkoutMutationsDisabled).toBe(true);
    expect(policy.wishlistQueueAllowed).toBe(true);
    expect(policy.cachedAvailabilityCopy.toLowerCase()).toContain("informational");
  });

  it("retries only failed sections instead of replacing successful content", () => {
    const recovery = partialLoadRecovery(["hero", "new arrivals"], "recommendations", "retry-token");
    expect(recovery.loadedItems).toEqual(["hero", "new arrivals"]);
    expect(recovery.failedSection).toBe("recommendations");
    expect(recovery.replaceWholePage).toBe(false);
    expect(recovery.preserveScrollAnchor).toBe(true);
  });

  it("classifies system errors without unsafe payment retry", () => {
    expect(classifyProblem(401, "req-auth")).toEqual({ kind: "session_expired", requestId: "req-auth", retriable: false });
    expect(classifyProblem(429).kind).toBe("too_many_requests");
    expect(classifyProblem(503).kind).toBe("maintenance");
    expect(classifyProblem(500).retriable).toBe(true);
  });

  it("bounds retry-after and update prompts", () => {
    expect(retryAfterMs("30", 1000)).toBe(30000);
    expect(retryAfterMs(999999, 0)).toBe(15 * 60 * 1000);
    expect(shouldShowOptionalUpdate({ dismissedAt: 1000, now: 1000 + 8 * 24 * 60 * 60 * 1000 })).toBe(true);
    expect(updateGate({ installedVersion: "1.0.0", minimumVersion: "1.0.1", trustedConfig: true }).required).toBe(true);
    expect(updateGate({ installedVersion: "1.0.0", minimumVersion: "9.9.9", trustedConfig: false }).required).toBe(false);
  });

  it("never prompts permissions on first launch and uses explicit user action", () => {
    expect(canRequestPermission({ userTriggered: false, firstLaunch: false, feature: "notifications" })).toBe(false);
    expect(canRequestPermission({ userTriggered: true, firstLaunch: true, feature: "notifications" })).toBe(false);
    expect(canRequestPermission({ userTriggered: true, firstLaunch: false, feature: "photos" })).toBe(true);
  });

  it("keeps invalid links and attachments safe", () => {
    expect(linkUnavailableReason({ hostAllowed: false, pathKnown: true, authorized: true })).toContain("trusted");
    expect(attachmentUploadIssue({ fileName: "large.jpg", mimeType: "image/jpeg", sizeBytes: 12 * 1024 * 1024 }).retryable).toBe(false);
    expect(attachmentUploadIssue({ fileName: "evidence.jpg", mimeType: "image/jpeg", sizeBytes: 1024 }).retryable).toBe(true);
  });

  it("keeps story looks explicit with no hidden product adds", () => {
    const result = summarizeLookSelection([
      { id: "kurta", productSlug: "sage-kurta", required: false, available: true, pricePaise: 100000 },
      { id: "dupatta", productSlug: "dupatta", required: false, available: false, pricePaise: 50000 },
    ], ["kurta", "dupatta"]);
    expect(result.selectedIds).toEqual(["kurta", "dupatta"]);
    expect(result.hiddenAdds).toEqual([]);
    expect(result.unavailable).toEqual(["dupatta"]);
    expect(result.requiresApproval).toBe(true);
    expect(result.totalPaise).toBe(100000);
  });

  it("resolves appearance settings from persisted preference and system mode", () => {
    expect(effectiveTheme("system", "dark")).toBe("dark");
    expect(effectiveTheme("system", "light")).toBe("light");
    expect(effectiveTheme("dark", "light")).toBe("dark");
  });
});
