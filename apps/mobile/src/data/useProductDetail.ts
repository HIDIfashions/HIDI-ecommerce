import { useCallback, useEffect, useState } from "react";
import type { ApiProduct } from "../models/product";
import { HidiApiError } from "../network/apiClient";
import { getProductDetail } from "./productDetail";

export function useProductDetail(slug: string) {
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      setProduct(await getProductDetail(slug));
    } catch (cause) {
      if (cause instanceof HidiApiError && cause.status === 404) {
        setProduct(null);
        setNotFound(true);
      } else {
        setError(cause instanceof Error ? cause.message : "Unable to load this HIDI style.");
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { product, loading, error, notFound, reload };
}
