"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./orders.module.css";

type Address = {
  firstName?: string;
  lastName?: string;
};

type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  totalPaise: number;
  customerEmail?: string | null;
  customerPhone: string;
  shippingAddress: Address;
  payment: null | {
    status: string;
    method?: string | null;
    provider: string;
  };
  itemCount: number;
};

const STATUS_OPTIONS = ["ALL", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"];

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdminOrdersClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status !== "ALL") params.set("status", status);

      const response = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthenticated(false);
        setOrders([]);
        return;
      }
      if (!response.ok) throw new Error(body?.message ?? "Unable to load orders");

      setAuthenticated(true);
      setOrders(body.orders ?? []);
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : "Unable to load orders");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    void loadOrders();
  }, [status, loadOrders]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayOrders = orders.filter((order) => new Date(order.createdAt).toDateString() === today);
    return {
      total: todayOrders.length,
      confirmed: orders.filter((order) => order.status === "CONFIRMED").length,
      packed: orders.filter((order) => order.status === "PACKED").length,
      shipped: orders.filter((order) => order.status === "SHIPPED").length,
      delivered: orders.filter((order) => order.status === "DELIVERED").length,
      sales: todayOrders.reduce((sum, order) => sum + order.totalPaise, 0),
    };
  }, [orders]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    const key = draftKey.trim();
    if (!key) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to sign in");

      setDraftKey("");
      setAuthenticated(true);
      await loadOrders();
    } catch (err) {
      setAuthenticated(false);
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  async function lock() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    setAuthenticated(false);
    setOrders([]);
    setError(null);
  }

  if (authenticated === null && loading) {
    return <main className={styles.loginPage}><section className={styles.loginCard}><p>Checking admin session…</p></section></main>;
  }

  if (!authenticated) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.loginCard}>
          <p className={styles.eyebrow}>HIDI OPERATIONS</p>
          <h1>Admin access</h1>
          <p>Enter the private admin key configured for this environment.</p>
          {error && <div className={styles.error}>{error}</div>}
          <form onSubmit={unlock} className={styles.loginForm}>
            <input type="password" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Admin key" autoComplete="current-password" autoFocus />
            <button type="submit" disabled={loading}>{loading ? "Opening…" : "Open dashboard"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.adminTopbar}>
        <div>
          <p className={styles.eyebrow}>HIDI ADMIN</p>
          <nav><strong>Orders</strong><span>Products</span><Link href="/admin/inventory">Inventory</Link><span>Customers</span></nav>
        </div>
        <button className={styles.lockButton} type="button" onClick={() => void lock()}>Lock admin</button>
      </header>

      <section className={styles.pageHeader}>
        <div>
          <h1>Orders</h1>
          <p>Process paid orders from confirmation through delivery.</p>
        </div>
      </section>

      <section className={styles.stats} aria-label="Order summary">
        <div><span>Today</span><strong>{stats.total}</strong></div>
        <div><span>Confirmed</span><strong>{stats.confirmed}</strong></div>
        <div><span>Packed</span><strong>{stats.packed}</strong></div>
        <div><span>Shipped</span><strong>{stats.shipped}</strong></div>
        <div><span>Delivered</span><strong>{stats.delivered}</strong></div>
        <div><span>Today&apos;s sales</span><strong>{money(stats.sales)}</strong></div>
      </section>

      <section className={styles.toolbar}>
        <form className={styles.searchForm} onSubmit={(event) => { event.preventDefault(); void loadOrders(); }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, phone or email" />
          <button type="submit">Search</button>
        </form>
        <label className={styles.statusFilter}>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{statusLabel(option)}</option>)}
          </select>
        </label>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <div className={styles.loading}>Loading orders…</div>}

      {!loading && orders.length === 0 ? (
        <div className={styles.empty}>No orders match the current filters.</div>
      ) : (
        <section className={styles.tableWrap}>
          <div className={styles.tableHeader}>
            <span>Order</span><span>Customer</span><span>Items</span><span>Total</span><span>Payment</span><span>Status</span><span />
          </div>
          {orders.map((order) => {
            const address = order.shippingAddress ?? {};
            const name = [address.firstName, address.lastName].filter(Boolean).join(" ") || "Customer";
            return (
              <div className={styles.orderRow} key={order.id}>
                <div><strong>{order.orderNumber}</strong><small>{dateTime(order.createdAt)}</small></div>
                <div><strong>{name}</strong><small>{order.customerPhone}</small></div>
                <div>{order.itemCount}</div>
                <div className={styles.rowAmount}>{money(order.totalPaise)}</div>
                <div><span className={styles.paymentPill}>{order.payment?.status ? statusLabel(order.payment.status) : "—"}</span></div>
                <div><span className={`${styles.status} ${styles[`status${order.status}`] ?? ""}`}>{statusLabel(order.status)}</span></div>
                <div className={styles.viewCell}><Link href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}>View →</Link></div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
