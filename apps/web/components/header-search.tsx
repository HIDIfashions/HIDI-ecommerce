"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { ApiProduct, formatPaise } from "@/lib/api";
import { CatalogImage } from "./catalog-image";
import iconStyles from "./header-icons.module.css";
import styles from "./header-search.module.css";
import { BROWSER_API_URL } from "@/lib/browser-api";

const API = BROWSER_API_URL;

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
  const router = useRouter();
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
        className={iconStyles.iconButton}
        type="button"
        aria-label="Search"
        aria-expanded={open}
        title="Search"
        onClick={() => setOpen((value) => !value)}
      >
        <Search className={iconStyles.icon} aria-hidden="true" />
      </button>

      {open && <>
        <button className={styles.backdrop} aria-label="Close search" onClick={() => setOpen(false)} />
        <section className={styles.panel} aria-label="Search HIDI">
          <div className={styles.inner}>
            <div className={styles.topRow}>
              <div className={styles.searchBox}>
                <input
                  ref={inputRef}
                  className={styles.input}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const value = query.trim();
                    if (!value) return;
                    setOpen(false);
                    router.push("/search?q=" + encodeURIComponent(value));
                  }}
                  placeholder="Search products, colours, collections…"
                  aria-label="Search HIDI products"
                />
                <Search className={styles.searchGlyph} aria-hidden="true" />
              </div>
              <button className={styles.close} type="button" onClick={() => setOpen(false)} aria-label="Close search">
                <X aria-hidden="true" />
              </button>
            </div>

            {loading && !!query.trim() && <p className={styles.helper}>Searching HIDI…</p>}
            {!!query.trim() && !loading && results.length === 0 && <p className={styles.empty}>No HIDI pieces matched “{query.trim()}”.</p>}

            {results.length > 0 && <div className={styles.results}>
              {results.map((product) => {
                const image = product.images?.[0];
                return <Link key={product.id} href={`/products/${product.slug}`} className={styles.item} onClick={() => setOpen(false)}>
                  <span className={styles.thumb}>
                    <CatalogImage
                      src={image?.url}
                      alt={image?.alt ?? product.name}
                      sizes="72px"
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
