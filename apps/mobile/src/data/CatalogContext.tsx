import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ApiProduct } from "../models/product";
import type { UiState } from "../state/uiState";
import { getCatalog, getFeatured } from "./catalog";

type CatalogContextValue = {
  state: UiState<ApiProduct[]>;
  featured: ApiProduct[];
  featuredFailed: boolean;
  refresh: () => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<UiState<ApiProduct[]>>({ kind: "loading" });
  const [featured, setFeatured] = useState<ApiProduct[]>([]);
  const [featuredFailed, setFeaturedFailed] = useState(false);

  const refresh = useCallback(async () => {
    setState((current) => current.kind === "content"
      ? { ...current, refreshing: true }
      : { kind: "loading" });
    try {
      const snapshot = await getCatalog();
      setState({
        kind: "content",
        data: snapshot.products,
        freshness: snapshot.freshness,
        refreshing: false,
      });
      const curated = await getFeatured(6);
      setFeatured(curated);
      setFeaturedFailed(curated.length === 0 && snapshot.products.length > 0);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to load the HIDI catalogue.";
      const code = typeof cause === "object" && cause && "code" in cause ? String((cause as { code?: unknown }).code ?? "") : "";
      setState({
        kind: "error",
        errorKind: code || message,
        retryable: true,
      });
      setFeatured([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ state, featured, featuredFailed, refresh }), [state, featured, featuredFailed, refresh]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used inside CatalogProvider");
  return value;
}
