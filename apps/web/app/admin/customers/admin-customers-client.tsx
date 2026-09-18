"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import styles from "./customers.module.css";

type OrderItem = {
  productName: string;
  quantity: number;
};

type Order = {
  id: string;
  orderNumber: string;
  createdAt: string;
  totalPaise: number;
  customerEmail?: string | null;
  customerPhone: string;
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
  } | null;
  items?: OrderItem[];
};

type Customer = {
  key: string;
  name: string;
  phone: string;
  email: string;
  orders: number;
  lifetimePaise: number;
  lastPurchaseAt: string;
  lastPurchasePaise: number;
  lastProducts: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminCustomersClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/orders", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthenticated(false);
        setOrders([]);
        return;
      }
      if (!response.ok) throw new Error(body?.message ?? "Unable to load customers");
      setAuthenticated(true);
      setOrders(body.orders ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      await load();
    } catch (caught) {
      setAuthenticated(false);
      setError(caught instanceof Error ? caught.message : "Unable to sign in");
      setLoading(false);
    }
  }

  async function lock() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    setAuthenticated(false);
    setOrders([]);
  }

  const customers = useMemo(() => {
    const byCustomer = new Map<string, Customer>();

    for (const order of [...orders].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))) {
      const phone = String(order.customerPhone ?? "").trim();
      const email = String(order.customerEmail ?? "").trim();
      const key = phone || email.toLowerCase() || order.id;
      const address = order.shippingAddress ?? {};
      const name = [address.firstName, address.lastName].filter(Boolean).join(" ") || "Customer";
      const products = (order.items ?? [])
        .map((item) => `${item.productName}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`)
        .join(", ");

      const current = byCustomer.get(key);
      if (!current) {
        byCustomer.set(key, {
          key,
          name,
          phone,
          email,
          orders: 1,
          lifetimePaise: order.totalPaise,
          lastPurchaseAt: order.createdAt,
          lastPurchasePaise: order.totalPaise,
          lastProducts: products || "—",
        });
      } else {
        current.orders += 1;
        current.lifetimePaise += order.totalPaise;
      }
    }

    return Array.from(byCustomer.values()).sort(
      (a, b) => +new Date(b.lastPurchaseAt) - +new Date(a.lastPurchaseAt),
    );
  }, [orders]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.phone, customer.email, customer.lastProducts]
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [customers, query]);

  if (authenticated === null) {
    return <main className={styles.loginPage}><section className={styles.loginCard}>Checking admin session…</section></main>;
  }

  if (!authenticated) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.loginCard}>
          <p className={styles.eyebrow}>HIDI OPERATIONS</p>
          <h1>Admin access</h1>
          <p>Enter the private admin key configured for this environment.</p>
          {error && <div className={styles.error}>{error}</div>}
          <form onSubmit={unlock}>
            <input type="password" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Admin key" autoFocus />
            <button disabled={loading}>{loading ? "Opening…" : "Open dashboard"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>HIDI ADMIN</p>
          <AdminNav />
        </div>
        <button type="button" onClick={() => void lock()}>Lock admin</button>
      </header>

      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CUSTOMER RELATIONSHIPS</p>
          <h1>Customers</h1>
          <p>Purchase history and recent product context for customer follow-up.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </section>

      <section className={styles.stats}>
        <div><span>Customers</span><strong>{customers.length}</strong></div>
        <div><span>Total orders</span><strong>{orders.length}</strong></div>
        <div><span>Lifetime sales</span><strong>{money(customers.reduce((sum, customer) => sum + customer.lifetimePaise, 0))}</strong></div>
      </section>

      <section className={styles.toolbar}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customer, mobile, email or product"
        />
        <span>{filtered.length} customer{filtered.length === 1 ? "" : "s"}</span>
      </section>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Mobile</th>
              <th>Orders</th>
              <th>Lifetime</th>
              <th>Last purchase</th>
              <th>Last amount</th>
              <th>Products</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((customer) => (
              <tr key={customer.key}>
                <td><strong>{customer.name}</strong><small>{customer.email || "No email"}</small></td>
                <td>{customer.phone || "—"}</td>
                <td>{customer.orders}</td>
                <td>{money(customer.lifetimePaise)}</td>
                <td>{dateTime(customer.lastPurchaseAt)}</td>
                <td>{money(customer.lastPurchasePaise)}</td>
                <td className={styles.products}>{customer.lastProducts}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className={styles.empty}>No customers match this search.</div>}
      </section>
    </main>
  );
}
