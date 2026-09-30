export type AppearancePreference = "system" | "light" | "dark";
export type PermissionFeature = "notifications" | "photos";
export type SystemErrorKind = "session_expired" | "too_many_requests" | "maintenance" | "generic";
export const phase6ScreenIds = ["H103", "H104", "H105", "H106", "H107", "H108", "H109", "H110", "H111", "H112", "H113", "H114", "H115", "H116", "H117", "H118", "H121", "H122", "H125"] as const;
export const appearanceChoices: readonly { value: AppearancePreference; label: string }[] = [{ value: "system", label: "Use system setting" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }];
export function isAppearancePreference(value: unknown): value is AppearancePreference { return value === "system" || value === "light" || value === "dark"; }
export function effectiveTheme(preference: AppearancePreference, systemColorScheme: "light" | "dark" | null | undefined) { return preference === "system" ? systemColorScheme === "dark" ? "dark" : "light" : preference; }
export function offlinePolicy(input: { hasSavedContent: boolean }) { return { showCachedContent: input.hasSavedContent, checkoutMutationsDisabled: true, wishlistQueueAllowed: input.hasSavedContent, cachedAvailabilityCopy: "Cached prices and inventory are informational until HIDI reconnects." }; }
export function partialLoadRecovery<T>(loadedItems: readonly T[], failedSection: string, retryToken: string) { return { loadedItems, failedSection, retryToken, replaceWholePage: false, preserveScrollAnchor: true }; }
export function classifyProblem(status: number, requestId?: string | null): { kind: SystemErrorKind; requestId?: string; retriable: boolean } {
  if (status === 401 || status === 403) return { kind: "session_expired", requestId: requestId ?? undefined, retriable: false };
  if (status === 429) return { kind: "too_many_requests", requestId: requestId ?? undefined, retriable: true };
  if (status === 503) return { kind: "maintenance", requestId: requestId ?? undefined, retriable: true };
  return { kind: "generic", requestId: requestId ?? undefined, retriable: status >= 500 || status === 0 };
}
export function retryAfterMs(value: string | number | null | undefined, now = Date.now(), maxMs = 15 * 60 * 1000) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(maxMs, value * 1000));
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value.trim()); if (Number.isFinite(numeric)) return Math.max(0, Math.min(maxMs, numeric * 1000));
  const dateMs = Date.parse(value); return Number.isNaN(dateMs) ? null : Math.max(0, Math.min(maxMs, dateMs - now));
}
/** The remote contract currently permits stable major.minor.patch only. Unknown formats cannot force an update. */
function stableVersion(value: string | null | undefined): number[] | null {
  if (!value || !/^\d+\.\d+\.\d+$/.test(value)) return null;
  const parts = value.split(".").map(Number); return parts.every(Number.isSafeInteger) ? parts : null;
}
function olderThan(a: number[], b: number[]) { for (let i = 0; i < 3; i++) { if (a[i]! !== b[i]!) return a[i]! < b[i]!; } return false; }
export function updateGate(input: { installedVersion: string; minimumVersion?: string | null; latestVersion?: string | null; trustedConfig: boolean }) {
  if (!input.trustedConfig) return { required: false, optional: false, reason: "untrusted_config" as const };
  const installed = stableVersion(input.installedVersion), minimum = stableVersion(input.minimumVersion), latest = stableVersion(input.latestVersion);
  if (!installed || (input.minimumVersion && !minimum) || (input.latestVersion && !latest)) return { required: false, optional: false, reason: "invalid_config" as const };
  if (minimum && olderThan(installed, minimum)) return { required: true, optional: false, reason: "minimum_version" as const };
  if (latest && olderThan(installed, latest)) return { required: false, optional: true, reason: "latest_version" as const };
  return { required: false, optional: false, reason: "current" as const };
}
export function shouldShowOptionalUpdate(input: { dismissedAt?: number | null; now?: number; intervalMs?: number }) { return !input.dismissedAt || (input.now ?? Date.now()) - input.dismissedAt >= (input.intervalMs ?? 7 * 24 * 60 * 60 * 1000); }
export function canRequestPermission(input: { userTriggered: boolean; firstLaunch: boolean; feature: PermissionFeature }) { return input.userTriggered && !input.firstLaunch && (input.feature === "notifications" || input.feature === "photos"); }
export function permissionDeclinedCopy(feature: PermissionFeature) { return feature === "photos" ? "You can continue without photo access and attach evidence later." : "You can continue without notifications and still track orders in the app."; }
export function linkUnavailableReason(input: { hostAllowed: boolean; pathKnown: boolean; authorized: boolean } | string) {
  if (typeof input === "string") {
    if (input === "untrusted_host") return "This link is not a trusted HIDI destination.";
    if (input === "unauthorized") return "Sign in or verify access to open this private HIDI link.";
    return "This HIDI destination is unavailable. Choose a current style from the catalogue.";
  }
  if (!input.hostAllowed) return "This link is not a trusted HIDI destination.";
  if (!input.pathKnown) return "This HIDI link is no longer available.";
  if (!input.authorized) return "Sign in or verify access to open this private HIDI link.";
  return "This HIDI destination is temporarily unavailable.";
}
export function attachmentUploadIssue(input: { fileName: string; mimeType?: string; sizeBytes?: number; maxBytes?: number }) {
  const maxBytes = input.maxBytes ?? 8 * 1024 * 1024;
  if (input.sizeBytes !== undefined && input.sizeBytes > maxBytes) return { fileName: input.fileName, retryable: false, reason: "File is too large. Remove it or choose a smaller file." };
  if (input.mimeType && !/^image\/(jpeg|jpg|png|webp)$/i.test(input.mimeType)) return { fileName: input.fileName, retryable: false, reason: "This file type is not supported for HIDI attachments." };
  return { fileName: input.fileName, retryable: true, reason: "Upload was interrupted. Retry keeps your other attachments and message text." };
}
export type LookComponent = { id: string; productSlug: string; required: boolean; available: boolean; pricePaise: number };
export function summarizeLookSelection(components: readonly LookComponent[], selectedIds: readonly string[]) {
  const selectedSet = new Set(selectedIds); const selected = components.filter(item => selectedSet.has(item.id));
  const unavailable = selected.filter(item => !item.available).map(item => item.id);
  return { selectedIds: selected.map(item => item.id), hiddenAdds: components.filter(item => !selectedSet.has(item.id) && item.required).map(item => item.id), unavailable, totalPaise: selected.filter(item => item.available).reduce((sum, item) => sum + item.pricePaise, 0), requiresApproval: unavailable.length > 0 };
}
