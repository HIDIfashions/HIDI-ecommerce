"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiProduct, formatPaise } from "@/lib/api";
import { CatalogImage } from "./catalog-image";
import styles from "./header-search.module.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

function productSearchText(product: ApiProduct) {
  return [
    product.name,
    product.shortDescription,
    product.description,
    product.fabric,
    product.category?.name,
    ...product.collections.map((collection) => collection.name),
    ...product.variants.flatMap((variant) => [variant.color, variant.size]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || products.length) return;
    let active = true;
    setLoading(true);
    fetch(`${API}/products`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load products")))
      .then((data) => {
        if (active) setProducts(Array.isArray(data) ? data : []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open, products.length]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return products.filter((product) => productSearchText(product).includes(normalized)).slice(0, 8);
  }, [products, query]);

  return (
    <div className={styles.wrap}>
      <button
        className={styles.trigger}
        type="button"
        aria-label="Search"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="header-icon" aria-hidden="true">⌕</span>
      </button>

      {open && <>
        <button className={styles.backdrop} aria-label="Close search" onClick={() => setOpen(false)} />
        <section className={styles.panel} aria-label="Search HIDI">
          <div className={styles.inner}>
            <div className={styles.topRow}>
              <input
                ref={inputRef}
                className={styles.input}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search HIDI — style, colour, fabric…"
                aria-label="Search HIDI products"
              />
              <button className={styles.close} type="button" onClick={() => setOpen(false)} aria-label="Close search">×</button>
            </div>

            {!query.trim() && <p className={styles.helper}>Try “sage”, “work”, “ivory” or “kurta”.</p>}
            {loading && <p className={styles.helper}>Loading HIDI pieces…</p>}
            {!!query.trim() && !loading && results.length === 0 && <p className={styles.empty}>No HIDI pieces matched “{query.trim()}”.</p>}

            {results.length > 0 && <div className={styles.results}>
              {results.map((product) => {
                const image = product.images?.[0];
                return <Link key={product.id} href={`/products/${product.slug}`} className={styles.item} onClick={() => setOpen(false)}>
                  <span className={styles.thumb}>
                    <CatalogImage
                      src={image?.url}
                      alt={image?.alt ?? product.name}
                      sizes="74px"
                      fallbackLabel={`HIDI / ${product.name}`}
                    />
                  </span>
                  <span>
                    <span className={styles.name}>{product.name}</span>
                    <span className={styles.meta}>{formatPaise(product.minPricePaise)} · {product.variants[0]?.color ?? "HIDI"}</span>
                  </span>
                </Link>;
              })}
            </div>}
          </div>
        </section>
      </>}
    </div>
  );
}
