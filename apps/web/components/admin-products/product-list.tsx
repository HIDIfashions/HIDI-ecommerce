"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi } from "@/lib/admin-products-client";
import { money } from "@/lib/admin-products-contract";
import type { ProductList } from "@/lib/admin-products-contract";
import styles from "./products.module.css";

export function ProductListClient() {
  const [result, setResult] = useState<ProductList>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [search, setSearch] = useState(""); const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL"); const [page, setPage] = useState(1); const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    const params = new URLSearchParams({ q: query, status, page: String(page) });
    void productApi<ProductList>(`?${params}`).then(data => { if (active) setResult(data); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Unable to load products."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, status, page, reload]);
  return <>
    <div className={styles.heading}><div><p className={styles.eyebrow}>THE HIDI CATALOGUE</p><h1>Products</h1><p>Create your designs. Build their SKUs. Publish when they are ready.</p></div><div className={styles.buttonGroup}><Link className={styles.primaryLink} href="/admin/products/new">+ Create new product</Link><Link href="/admin/products/price-tags">Price tags / barcodes</Link><Link href="/admin/import#products-stock">Import Products / Stock</Link><Link href="/admin/import#photos">Bulk Upload Photos</Link></div></div>
    <div className={styles.explainer}><div><span>01</span><strong>Create draft</strong><small>Product details and zero-stock SKUs</small></div><div><span>02</span><strong>Receive delivery</strong><small>Accepted pieces enter warehouse stock</small></div><div><span>03</span><strong>Publish product</strong><small>Make the design visible to customers</small></div></div>
    <section className={styles.card}><div className={styles.toolbar}><form onSubmit={event => { event.preventDefault(); setPage(1); setQuery(search.trim()); }} className={styles.searchForm}><label className={styles.srOnly} htmlFor="hidi-product-search">Search products</label><input id="hidi-product-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product name, URL, SKU or scan barcode" maxLength={160} /><button type="submit">Search</button></form><label>Status<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="ALL">All products</option><option value="DRAFT">Drafts</option><option value="ACTIVE">Published</option><option value="ARCHIVED">Archived</option></select></label><button type="button" onClick={() => setReload(n => n + 1)} disabled={loading}>Refresh</button></div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <p className={styles.resultCount} aria-live="polite">{loading ? "Loading products…" : `${result.total} products match this view`}</p>
      {!loading && !error && result.items.length === 0 ? <div className={styles.empty}>No products found. Create a draft or adjust your search.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Product</th><th>Status</th><th>SKUs</th><th>On hand</th><th>Price from</th><th /></tr></thead><tbody>{result.items.map(product => <tr key={product.id}><td><div className={styles.productIdentity}>{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <div className={styles.placeholder}>H</div>}<div><strong>{product.name}</strong><small>{product.category ?? "Uncategorised"}</small><small>{product.slug}</small></div></div></td><td><span className={styles.badge} data-status={product.status}>{product.status}</span></td><td>{product.variantCount}</td><td>{product.onHand}</td><td>{money(product.minPricePaise)}</td><td><div className={styles.rowActions}><Link href={`/admin/products/${encodeURIComponent(product.id)}`}>Edit →</Link><Link href={`/admin/products/price-tags?productId=${encodeURIComponent(product.id)}`}>Print tags →</Link></div></td></tr>)}</tbody></table></div>}
      <div className={styles.pagination}><button type="button" disabled={loading || page <= 1} onClick={() => setPage(n => n - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}</span><button type="button" disabled={loading || page * result.pageSize >= result.total} onClick={() => setPage(n => n + 1)}>Next</button></div>
    </section>
  </>;
}
