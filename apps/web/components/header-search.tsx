"use client";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { ApiProduct, formatPaise } from "@/lib/api";
import { CatalogImage } from "./catalog-image";
import iconStyles from "./header-icons.module.css";
import styles from "./header-search.module.css";
import { BROWSER_API_URL } from "@/lib/browser-api";
import { trapFocus } from "@/lib/focus-management";
const API = BROWSER_API_URL;
import { matchesProductSearch } from "@/lib/catalogue-discovery";
export function HeaderSearch({ onOpen }: { onOpen?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [products, setProducts] = useState<ApiProduct[]>([]), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null), triggerRef = useRef<HTMLButtonElement>(null), panelRef = useRef<HTMLElement>(null);
  function closeSearch(restoreFocus = true) { setOpen(false); if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true })); }
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true; setLoading(true); setFailed(false); setProducts([]);
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    fetch(`${API}/products`, { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Unable to load products")))
      .then(data => {
        if (!Array.isArray(data) || data.some(p => !p || typeof p.name !== "string" || typeof p.slug !== "string" ||
          !Array.isArray(p.variants) || !Array.isArray(p.collections) || !Array.isArray(p.images))) throw new Error("Invalid catalogue");
        if (active) setProducts(data);
      }).catch(() => { if (active) setFailed(true); })
      .finally(() => { window.clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [open, retry]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 20);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closeSearch(true); return; } trapFocus(event, panelRef.current); };
    document.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(timer); document.body.style.overflow = previous; document.removeEventListener("keydown", onKey); };
  }, [open]);
  const results = useMemo(() => { const normalized = query.trim().toLowerCase(); if (!normalized) return []; return products.filter(product => matchesProductSearch(product, normalized)).slice(0, 8); }, [products, query]);
  return <div className={styles.wrap}>
    <button ref={triggerRef} className={iconStyles.iconButton} type="button" aria-label="Search" aria-expanded={open} title="Search" onClick={() => { if (open) closeSearch(false); else { onOpen?.(); setOpen(true); } }}><Search className={iconStyles.icon} aria-hidden="true" /></button>
    {open && createPortal(<><button className={styles.backdrop} type="button" tabIndex={-1} aria-hidden="true" onClick={() => closeSearch(true)} />
      <section ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-label="Search HIDI"><div className={styles.inner}>
        <div className={styles.topRow}><div className={styles.searchBox}>
          <input ref={inputRef} className={styles.input} type="search" maxLength={160} autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key !== "Enter") return; const value = query.trim(); if (!value) return; closeSearch(false); router.push("/search?q=" + encodeURIComponent(value)); }} placeholder="Search products, colours, collections…" aria-label="Search HIDI products" />
          <Search className={styles.searchGlyph} aria-hidden="true" />
        </div><button className={styles.close} type="button" onClick={() => closeSearch(true)} aria-label="Close search"><X aria-hidden="true" /></button></div>
        {!query.trim() && <div className={styles.suggestions}><p>Discover your next HIDI piece</p><nav aria-label="Suggested searches"><Link href="/collections/work-edit" onClick={() => closeSearch(false)}>Workwear Edit</Link><Link href="/collections/everyday" onClick={() => closeSearch(false)}>Everyday</Link><Link href="/collections/occasion" onClick={() => closeSearch(false)}>Occasion</Link><Link href="/collections/new-arrivals" onClick={() => closeSearch(false)}>New arrivals</Link></nav></div>}
        {failed && <p className={styles.helper} role="alert">Search is temporarily unavailable. <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button> or <Link href="/collections/all" onClick={() => closeSearch(false)}>browse the collection</Link>.</p>}
        {!query.trim() && products.length > 0 && <div className={styles.results} aria-label="Discover HIDI products">{products.slice(0, 4).map(product => <Link key={product.id} href={`/products/${product.slug}`} className={styles.item} onClick={() => closeSearch(false)}><span className={styles.thumb}><CatalogImage src={product.images?.[0]?.url} alt={product.images?.[0]?.alt || product.name} sizes="72px" /></span><span><span className={styles.name}>{product.name}</span><span className={styles.meta}>{formatPaise(product.minPricePaise)}</span></span></Link>)}</div>}
        {loading && !!query.trim() && <p className={styles.helper} role="status">Searching HIDI…</p>}
        {!!query.trim() && !loading && !failed && results.length === 0 && <p className={styles.empty} role="status">No HIDI pieces matched “{query.trim()}”.</p>}
        {!loading && !failed && results.length > 0 && <div id="hidi-search-results" className={styles.results} aria-label="Search results">{results.map(product => { const image = product.images?.[0]; return <Link key={product.id} href={`/products/${product.slug}`} className={styles.item} onClick={() => closeSearch(false)}><span className={styles.thumb}><CatalogImage src={image?.url} alt={image?.alt ?? product.name} sizes="72px" fallbackLabel={`HIDI / ${product.name}`} /></span><span><span className={styles.name}>{product.name}</span><span className={styles.meta}>{formatPaise(product.minPricePaise)} · {product.variants[0]?.color ?? "HIDI"}</span></span></Link>; })}</div>}
        {!!query.trim() && !loading && !failed && <p className={styles.helper}><Link href={"/search?q=" + encodeURIComponent(query.trim())} onClick={() => closeSearch(false)}>View all search results</Link></p>}
      </div></section>
    </>, document.body)}
  </div>;
}
