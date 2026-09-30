import React, { createContext, PropsWithChildren, useContext, useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { useCart } from "../data/CartContext";
import { PHASE7_CAPABILITIES, PHASE7_FLAGS } from "./contracts";
import { createGiftSaveAction, GrowthRuntime } from "./operations";

async function unavailable(): Promise<never> {
  throw new Error("The current HIDI gateway does not expose an approved contract for this optional feature.");
}
// /rewards/summary is PREVIEW, not a credited points ledger. There is no reviewed
// referral-campaign/gift-options adapter. No new backend URL or key is invented.
export const productionGrowthRuntime: GrowthRuntime = Object.freeze({
  flags: PHASE7_FLAGS, capabilities: PHASE7_CAPABILITIES,
  services: { readCircle: unavailable, readReferral: unavailable, readGift: unavailable, saveGift: unavailable, reconcileGift: unavailable },
});
const Runtime = createContext(productionGrowthRuntime);
type GiftAction = ReturnType<typeof createGiftSaveAction>;
const GiftActions = createContext<Map<string, GiftAction> | null>(null);
export function GrowthProvider({ children, runtime = productionGrowthRuntime }: PropsWithChildren<{ runtime?: GrowthRuntime }>) {
  // Injection is a test/future reviewed-adapter seam, never a deep-link switch.
  // Scope unresolved operations by account AND cart so they cannot cross users.
  const actions = useMemo(() => new Map<string, GiftAction>(), [runtime]);
  return <Runtime.Provider value={runtime}><GiftActions.Provider value={actions}>{children}</GiftActions.Provider></Runtime.Provider>;
}
export const useGrowthRuntime = () => useContext(Runtime);
export function useGiftSaveAction() {
  const runtime = useGrowthRuntime(); const actions = useContext(GiftActions);
  const auth = useAuth(); const { cart } = useCart();
  const scope = JSON.stringify([auth.session?.user.id ?? "guest", cart?.sessionId ?? "", cart?.id ?? ""]);
  return useMemo(() => {
    const existing = actions?.get(scope); if (existing) return existing;
    const action = createGiftSaveAction(runtime); actions?.set(scope, action); return action;
  }, [actions, runtime, scope]);
}
