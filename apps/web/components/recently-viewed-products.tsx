"use client";

import { useEffect, useState } from "react";
import type { ApiProduct } from "@/lib/api";
import { ProductCard } from "./product-card";

const STORAGE_KEY = "hidi_recently_viewed_products_v1";
const MAX_HISTORY = 8;
const MAX_DISPLAY = 4;

type Visit = {
  slug: string;
  viewedAt: number;
};

function readHistory(): Visit[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const visits: Visit[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const slug = (entry as { slug?: unknown }).slug;
      const viewedAt = (entry as { viewedAt?: unknown }).viewedAt;
      if (typeof slug !== "string" || !slug || slug.length > 120 || seen.has(slug)) continue;
      seen.add(slug);
      visits.push({
        slug,
        viewedAt: typeof viewedAt === "number" && Number.isFinite(viewedAt) ? viewedAt : 0,
      });
    }
    return visits.slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveCurrent(slug: string, existing: Visit[]) {
  try {
    const next = [
      { slug, viewedAt: Date.now() },
      ...existing.filter((entry) => entry.slug !== slug),
    ].slice(0, MAX_HISTORY);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Browsing should never fail if storage is blocked or full.
  }
}

export function RecentlyViewedProducts({ currentSlug }: { currentSlug: string }) {
  const [products, setProducts] = useState<ApiProduct[]>([]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const history = readHistory();
    const previous = history
      .filter((entry) => entry.slug !== currentSlug)
      .slice(0, MAX_DISPLAY);

    saveCurrent(currentSlug, history);

    if (!previous.length) {
      setProducts([]);
      return () => {
        active = false;
        controller.abort();
      };
    }

    void Promise.all(previous.map(async ({ slug }) => {
      try {
        const response = await fetch(`/api/store/products/${encodeURIComponent(slug)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return null;
        return await response.json() as ApiProduct;
      } catch {
        return null;
      }
    })).then((loaded) => {
      if (!active) return;
      setProducts(loaded.filter((product): product is ApiProduct => Boolean(product?.id)));
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [currentSlug]);

  if (!products.length) return null;

  return (
    <section className="pdp-recent" aria-labelledby="recently-viewed-title">
      <div className="pdp-related-heading">
        <div>
          <p className="eyebrow">LAST TIME YOU VISITED HIDI</p>
          <h2 id="recently-viewed-title">Continue where you left off.</h2>
          <p className="pdp-recent-copy">Products you recently explored on this browser.</p>
        </div>
      </div>
      <div className="pdp-related-grid">
        {products.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </section>
  );
}
