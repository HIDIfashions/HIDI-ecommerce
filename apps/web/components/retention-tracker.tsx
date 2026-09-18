"use client";

import { useEffect } from "react";
import { PRODUCT_VARIANT_EVENT, type ProductVariantSelection } from "@/lib/product-sharing";
import {
  getRetentionPreferences, recordRetentionEvent, retentionAccountId, retentionEnabled,
  RETENTION_PREFERENCES_EVENT,
} from "@/lib/retention-client";

const QUALIFIED_VIEW_MS = 30_000;

/** No anonymous identifiers, background-tab views, or events before server-confirmed consent. */
export function RetentionTracker({ productId, slug }: { productId: string; slug: string }) {
  useEffect(() => {
    if (!retentionEnabled || !productId) return;
    let active = true;
    let userId: string | null = null;
    let controller = new AbortController();
    let revision = 0;
    let allowed = false;
    let detailSent = false;
    let visibleMs = 0;
    let visibleSince: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const selectedVariants = new Set<string>();

    function stopClock() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (visibleSince !== null) visibleMs += performance.now() - visibleSince;
      visibleSince = null;
    }

    function canTrack() {
      return active && allowed && userId !== null && retentionAccountId() === userId && !controller.signal.aborted;
    }

    function startClock() {
      if (!canTrack() || detailSent || document.visibilityState !== "visible" || visibleSince !== null) return;
      visibleSince = performance.now();
      timer = setTimeout(() => {
        stopClock();
        if (!canTrack() || !userId || document.visibilityState !== "visible") return;
        detailSent = true;
        void recordRetentionEvent(userId, { productId, kind: "DETAIL_VIEW" }, controller.signal).catch(() => undefined);
      }, Math.max(0, QUALIFIED_VIEW_MS - visibleMs));
    }

    async function loadConsent() {
      controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const currentRevision = ++revision;
      const expectedUserId = userId;
      allowed = false;
      stopClock();
      visibleMs = 0;
      if (!expectedUserId) return;
      try {
        const preferences = await getRetentionPreferences(expectedUserId, signal);
        if (!active || signal.aborted || currentRevision !== revision || retentionAccountId() !== expectedUserId) return;
        allowed = preferences.enabled && preferences.personalizationOptIn;
        startClock();
      } catch { /* Optional personalisation must never interrupt browsing. */ }
    }

    function onAuth() {
      const nextUserId = retentionAccountId();
      if (nextUserId === userId) return; // Token refresh is not a new customer.
      userId = nextUserId;
      detailSent = false;
      selectedVariants.clear();
      void loadConsent();
    }

    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === "hidi_supabase_session") onAuth();
    }

    function onPreferences(event: Event) {
      if ((event as CustomEvent<{ userId?: string }>).detail?.userId === userId) void loadConsent();
    }

    function onVisibility() {
      if (document.visibilityState !== "visible") stopClock();
      else startClock();
    }

    function onVariant(event: Event) {
      const selection = (event as CustomEvent<ProductVariantSelection>).detail;
      if (!canTrack() || !userId || document.visibilityState !== "visible" || selection?.slug !== slug ||
          !selection.variantId || !selection.size || selectedVariants.has(selection.variantId)) return;
      selectedVariants.add(selection.variantId);
      void recordRetentionEvent(userId, { productId, variantId: selection.variantId, kind: "SIZE_SELECT" }, controller.signal).catch(() => undefined);
    }

    onAuth();
    window.addEventListener("hidi-auth-updated", onAuth);
    window.addEventListener("storage", onStorage);
    window.addEventListener(RETENTION_PREFERENCES_EVENT, onPreferences);
    window.addEventListener(PRODUCT_VARIANT_EVENT, onVariant);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      revision += 1;
      controller.abort();
      stopClock();
      window.removeEventListener("hidi-auth-updated", onAuth);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(RETENTION_PREFERENCES_EVENT, onPreferences);
      window.removeEventListener(PRODUCT_VARIANT_EVENT, onVariant);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [productId, slug]);

  return null;
}
