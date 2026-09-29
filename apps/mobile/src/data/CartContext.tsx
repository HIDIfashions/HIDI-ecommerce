import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ApiCart, CartAttention, CartLine, SavedForLaterItem } from "../models/cart";
import { compareCartSnapshots } from "../models/cart";
import { HidiApiError } from "../network/apiClient";
import { addCartVariant, fetchCart, removeCartLine, updateCartQuantity } from "./cartApi";
import { cartStorage } from "../storage/cartStorage";

type CartContextValue = {
  loading: boolean;
  cart: ApiCart | null;
  error: string;
  stale: boolean;
  attention: CartAttention[];
  savedForLater: SavedForLaterItem[];
  busyKey: string;
  undoCandidate: CartLine | null;
  refresh: () => Promise<void>;
  addVariant: (variantId: string, quantity?: number) => Promise<{ cart: ApiCart; reconciled: boolean }>;
  updateQuantity: (lineId: string, quantity: number) => Promise<ApiCart>;
  removeLine: (lineId: string) => Promise<ApiCart>;
  undoRemove: () => Promise<ApiCart | null>;
  moveToSaved: (lineId: string) => Promise<ApiCart>;
  moveSavedToBag: (key: string) => Promise<{ cart: ApiCart; reconciled: boolean; savedRemovalFailed: boolean }>;
  removeSavedForLater: (key: string) => Promise<void>;
  acknowledgeAttention: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

function ambiguous(error: unknown) {
  return error instanceof HidiApiError && (error.status === 0 || error.status === 408 || error.status >= 500);
}

export function CartProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<ApiCart | null>(null);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [attention, setAttention] = useState<CartAttention[]>([]);
  const [savedForLater, setSavedForLater] = useState<SavedForLaterItem[]>([]);
  const [busyKey, setBusyKey] = useState("");
  const [undoCandidate, setUndoCandidate] = useState<CartLine | null>(null);
  const mutationLock = useRef(false);

  const loadSaved = useCallback(async () => {
    setSavedForLater(await cartStorage.savedForLater());
  }, []);

  const commit = useCallback(async (next: ApiCart, acknowledge = true) => {
    setCart(next);
    setError("");
    setStale(false);
    if (acknowledge) {
      setAttention([]);
      await cartStorage.acknowledgeCart(next).catch(() => undefined);
    }
  }, []);

  const refresh = useCallback(async () => {
    const sessionId = await cartStorage.sessionId();
    const acknowledged = await cartStorage.acknowledgedCart();
    if (!cart && acknowledged) setCart(acknowledged);
    try {
      const next = await fetchCart(sessionId);
      const changes = compareCartSnapshots(acknowledged, next);
      setCart(next);
      setAttention(changes);
      setError("");
      setStale(false);
      if (!acknowledged) await cartStorage.acknowledgeCart(next).catch(() => undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to refresh your bag.";
      setError(message);
      if (cart || acknowledged) setStale(true);
    } finally {
      setLoading(false);
    }
  }, [cart]);

  useEffect(() => {
    void Promise.all([refresh(), loadSaved()]);
  }, []); // bootstrap once; refresh is deliberately explicit after this

  const withMutation = useCallback(async <T,>(key: string, work: () => Promise<T>) => {
    if (mutationLock.current) {
      throw new HidiApiError({ message: "Another bag update is still being confirmed.", status: 409, retryable: false });
    }
    mutationLock.current = true;
    setBusyKey(key);
    setError("");
    try {
      return await work();
    } finally {
      mutationLock.current = false;
      setBusyKey("");
    }
  }, []);

  const addVariant = useCallback(async (variantId: string, quantity = 1) => withMutation("add:" + variantId, async () => {
    const sessionId = await cartStorage.sessionId();
    const result = await addCartVariant(sessionId, variantId, quantity, cart);
    await commit(result.cart, true);
    return result;
  }), [cart, commit, withMutation]);

  const updateQuantity = useCallback(async (lineId: string, quantity: number) => withMutation("update:" + lineId, async () => {
    const sessionId = await cartStorage.sessionId();
    try {
      const next = await updateCartQuantity(sessionId, lineId, quantity);
      await commit(next, true);
      return next;
    } catch (cause) {
      if (!ambiguous(cause)) throw cause;
      const reconciled = await fetchCart(sessionId);
      const line = reconciled.items.find((item) => item.id === lineId);
      if (line?.quantity === quantity) {
        await commit(reconciled, true);
        return reconciled;
      }
      throw new HidiApiError({
        message: "We couldn’t confirm the quantity update. Review your bag before trying again.",
        status: cause instanceof HidiApiError ? cause.status : 0,
        retryable: false,
      });
    }
  }), [commit, withMutation]);

  const removeLine = useCallback(async (lineId: string) => withMutation("remove:" + lineId, async () => {
    const existing = cart?.items.find((item) => item.id === lineId);
    if (!existing) throw new HidiApiError({ message: "That bag line is no longer available.", status: 404, retryable: false });
    const sessionId = await cartStorage.sessionId();
    try {
      const next = await removeCartLine(sessionId, lineId);
      setUndoCandidate(existing);
      await commit(next, true);
      return next;
    } catch (cause) {
      if (!ambiguous(cause)) throw cause;
      const reconciled = await fetchCart(sessionId);
      if (!reconciled.items.some((item) => item.id === lineId)) {
        setUndoCandidate(existing);
        await commit(reconciled, true);
        return reconciled;
      }
      throw new HidiApiError({
        message: "We couldn’t confirm the removal. The item is still shown in your bag.",
        status: cause instanceof HidiApiError ? cause.status : 0,
        retryable: false,
      });
    }
  }), [cart, commit, withMutation]);

  const undoRemove = useCallback(async () => {
    const line = undoCandidate;
    if (!line) return cart;
    const result = await addVariant(line.variant.id, line.quantity);
    setUndoCandidate(null);
    return result.cart;
  }, [addVariant, cart, undoCandidate]);

  const moveToSaved = useCallback(async (lineId: string) => {
    const line = cart?.items.find((item) => item.id === lineId);
    if (!line) throw new HidiApiError({ message: "That bag line is no longer available.", status: 404, retryable: false });
    const saved: SavedForLaterItem = {
      key: line.product.id + ":" + line.variant.id,
      productId: line.product.id,
      slug: line.product.slug,
      name: line.product.name,
      image: line.product.image,
      variantId: line.variant.id,
      size: line.variant.size,
      color: line.variant.color,
      quantity: line.quantity,
      savedPricePaise: line.unitPricePaise,
      savedAt: Date.now(),
    };

    await cartStorage.saveForLater(saved);
    try {
      const next = await removeLine(lineId);
      await loadSaved();
      setUndoCandidate(null);
      return next;
    } catch (cause) {
      await cartStorage.removeSavedForLater(saved.key).catch(() => undefined);
      await loadSaved();
      throw cause;
    }
  }, [cart, loadSaved, removeLine]);

  const moveSavedToBag = useCallback(async (key: string) => {
    const item = savedForLater.find((entry) => entry.key === key);
    if (!item) throw new HidiApiError({ message: "That saved item is no longer available.", status: 404, retryable: false });
    const result = await addVariant(item.variantId, item.quantity);
    let savedRemovalFailed = false;
    try {
      setSavedForLater(await cartStorage.removeSavedForLater(key));
    } catch {
      savedRemovalFailed = true;
    }
    return { ...result, savedRemovalFailed };
  }, [addVariant, savedForLater]);

  const removeSavedForLater = useCallback(async (key: string) => {
    setSavedForLater(await cartStorage.removeSavedForLater(key));
  }, []);

  const acknowledgeAttention = useCallback(async () => {
    if (!cart) return;
    await cartStorage.acknowledgeCart(cart);
    setAttention([]);
  }, [cart]);

  const value = useMemo<CartContextValue>(() => ({
    loading,
    cart,
    error,
    stale,
    attention,
    savedForLater,
    busyKey,
    undoCandidate,
    refresh,
    addVariant,
    updateQuantity,
    removeLine,
    undoRemove,
    moveToSaved,
    moveSavedToBag,
    removeSavedForLater,
    acknowledgeAttention,
  }), [
    loading, cart, error, stale, attention, savedForLater, busyKey, undoCandidate,
    refresh, addVariant, updateQuantity, removeLine, undoRemove, moveToSaved,
    moveSavedToBag, removeSavedForLater, acknowledgeAttention,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
