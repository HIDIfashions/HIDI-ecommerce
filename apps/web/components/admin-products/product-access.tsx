"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { productApi, ProductApiError } from "@/lib/admin-products-client";
import styles from "./products.module.css";

export function ProductAccess({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void productApi("/options").then(() => { if (active) setReady(true); })
      .catch(e => { if (active && !(e instanceof ProductApiError && e.status === 401)) setError(e instanceof Error ? e.message : "Unable to open Products."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  async function unlock(event: FormEvent) {
    event.preventDefault(); if (checking) return;
    setChecking(true); setError(null);
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: key.trim() }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to sign in.");
      setKey(""); await productApi("/options"); setReady(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in."); }
    finally { setChecking(false); }
  }
  async function lock() {
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to lock the admin session. Try again.");
      setReady(false); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to lock admin."); }
  }
  if (!ready) return <main className={styles.loginPage}><section className={styles.loginCard}><p className={styles.eyebrow}>HIDI OPERATIONS</p><h1>Product administration</h1><p>Use the same private admin key as Inventory.</p>{error && <div className={styles.error} role="alert">{error}</div>}<form onSubmit={unlock}><label>Admin key<input type="password" required value={key} autoComplete="current-password" onChange={e => setKey(e.target.value)} /></label><button className={styles.primary} disabled={checking}>{checking ? "Checking…" : "Open products"}</button></form></section></main>;
  return <main className={styles.page}><header className={styles.topbar}><div><p className={styles.eyebrow}>HIDI ADMIN</p><nav aria-label="Admin navigation"><Link href="/admin/orders">Orders</Link><Link href="/admin/products" aria-current="page">Products</Link><Link href="/admin/import">Imports</Link><Link href="/admin/inventory">Inventory</Link><Link href="/admin/inventory/receive">Receive stock</Link></nav></div><button type="button" onClick={() => void lock()}>Lock admin</button></header>{error && <div className={styles.error} role="alert">{error}</div>}{children}</main>;
}
