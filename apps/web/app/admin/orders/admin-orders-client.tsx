"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./orders.module.css";

type Address = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
};

type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  subtotalPaise: number;
  shippingPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  customerEmail?: string | null;
  customerPhone: string;
  shippingAddress: Address;
  payment: null | {
    status: string;
    method?: string | null;
    provider: string;
    providerPaymentId?: string | null;
  };
  shipment: null | {
    status: string;
    provider?: string | null;
    awb?: string | null;
    trackingUrl?: string | null;
  };
  itemCount: number;
  items: Array<{
    id: string;
    productName: string;
    slug: string;
    image?: string | null;
    sku: string;
    size: string;
    color: string;
    quantity: number;
    unitPricePaise: number;
    totalPaise: number;
  }>;
};

const STATUS_OPTIONS = ["ALL", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"];
const NEXT_STATUS: Record<string, string | undefined> = {
  CONFIRMED: "PACKED",
  PACKED: "SHIPPED",
  SHIPPED: "DELIVERED",
};

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
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminOrdersClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status !== "ALL") params.set("status", status);

      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        cache: "no-store",
      });

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

  const stats = useMemo(() => ({
    total: orders.length,
    confirmed: orders.filter((order) => order.status === "CONFIRMED").length,
    packed: orders.filter((order) => order.status === "PACKED").length,
    shipped: orders.filter((order) => order.status === "SHIPPED").length,
  }), [orders]);

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

  async function updateStatus(orderNumber: string, nextStatus: string) {
    setUpdating(orderNumber);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthenticated(false);
        throw new Error("Admin session expired. Please sign in again.");
      }
      if (!response.ok) throw new Error(body?.message ?? "Unable to update order");
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update order");
    } finally {
      setUpdating(null);
    }
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
            <input
              type="password"
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              placeholder="Admin key"
              autoComplete="current-password"
              autoFocus
            />
            <button type="submit" disabled={loading}>{loading ? "Opening…" : "Open dashboard"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>HIDI OPERATIONS</p>
          <h1>Orders</h1>
          <p>Review paid orders and move fulfilment from confirmation through delivery.</p>
        </div>
        <button className={styles.lockButton} type="button" onClick={() => void lock()}>Lock admin</button>
      </header>

      <section className={styles.stats} aria-label="Order summary">
        <div><span>Visible orders</span><strong>{stats.total}</strong></div>
        <div><span>Confirmed</span><strong>{stats.confirmed}</strong></div>
        <div><span>Packed</span><strong>{stats.packed}</strong></div>
        <div><span>Shipped</span><strong>{stats.shipped}</strong></div>
      </section>

      <section className={styles.toolbar}>
        <form
          className={styles.searchForm}
          onSubmit={(event) => {
            event.preventDefault();
            void loadOrders();
          }}
        >
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
        <section className={styles.orderList}>
          {orders.map((order) => {
            const address = order.shippingAddress ?? {};
            const next = NEXT_STATUS[order.status];
            return (
              <details className={styles.orderCard} key={order.id}>
                <summary className={styles.orderSummary}>
                  <div>
                    <span className={styles.orderNumber}>{order.orderNumber}</span>
                    <span className={styles.orderMeta}>{dateTime(order.createdAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</span>
                  </div>
                  <div className={styles.customerSummary}>
                    <strong>{[address.firstName, address.lastName].filter(Boolean).join(" ") || "Customer"}</strong>
                    <span>{order.customerPhone}</span>
                  </div>
                  <div className={styles.amount}>{money(order.totalPaise)}</div>
                  <span className={`${styles.status} ${styles[`status${order.status}`] ?? ""}`}>{statusLabel(order.status)}</span>
                </summary>

                <div className={styles.detailGrid}>
                  <section className={styles.panel}>
                    <p className={styles.panelEyebrow}>ORDER ITEMS</p>
                    {order.items.map((item) => (
                      <div className={styles.item} key={item.id}>
                        {item.image ? <img src={item.image} alt="" /> : <div className={styles.imageFallback}>H</div>}
                        <div className={styles.itemInfo}>
                          <strong>{item.productName}</strong>
                          <span>{item.color} · Size {item.size}</span>
                          <span>SKU {item.sku} · Qty {item.quantity}</span>
                        </div>
                        <strong>{money(item.totalPaise)}</strong>
                      </div>
                    ))}
                    <div className={styles.totals}>
                      <span>Subtotal <strong>{money(order.subtotalPaise)}</strong></span>
                      <span>Shipping <strong>{order.shippingPaise ? money(order.shippingPaise) : "Free"}</strong></span>
                      {order.discountPaise > 0 && <span>Discount <strong>−{money(order.discountPaise)}</strong></span>}
                      <span className={styles.totalLine}>Total <strong>{money(order.totalPaise)}</strong></span>
                    </div>
                  </section>

                  <section className={styles.panel}>
                    <p className={styles.panelEyebrow}>CUSTOMER & DELIVERY</p>
                    <h2>{[address.firstName, address.lastName].filter(Boolean).join(" ") || "Customer"}</h2>
                    <p>
                      {address.line1}<br />
                      {address.line2 && <>{address.line2}<br /></>}
                      {address.landmark && <>{address.landmark}<br /></>}
                      {[address.city, address.state, address.postalCode].filter(Boolean).join(", ")}<br />
                      {address.countryCode ?? "IN"}
                    </p>
                    <p>{order.customerPhone}<br />{order.customerEmail ?? "No email supplied"}</p>

                    <div className={styles.paymentBox}>
                      <span>Payment</span>
                      <strong>{order.payment ? statusLabel(order.payment.status) : "No payment record"}</strong>
                      {order.payment?.method && <small>via {order.payment.method.toUpperCase()}</small>}
                    </div>
                  </section>

                  <section className={`${styles.panel} ${styles.fulfilmentPanel}`}>
                    <p className={styles.panelEyebrow}>FULFILMENT</p>
                    <h2>{statusLabel(order.status)}</h2>
                    <div className={styles.progress}>
                      {["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"].map((step) => {
                        const orderIndex = ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"].indexOf(order.status);
                        const stepIndex = ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"].indexOf(step);
                        return <div className={stepIndex <= orderIndex ? styles.progressActive : ""} key={step}><span /><small>{statusLabel(step)}</small></div>;
                      })}
                    </div>

                    {order.shipment && (
                      <div className={styles.shipmentBox}>
                        <span>Shipment: {statusLabel(order.shipment.status)}</span>
                        {order.shipment.provider && <span>Courier: {order.shipment.provider}</span>}
                        {order.shipment.awb && <span>AWB: {order.shipment.awb}</span>}
                      </div>
                    )}

                    {next ? (
                      <button className={styles.primaryAction} type="button" disabled={updating === order.orderNumber} onClick={() => void updateStatus(order.orderNumber, next)}>
                        {updating === order.orderNumber ? "Updating…" : `Mark as ${statusLabel(next)}`}
                      </button>
                    ) : <div className={styles.completed}>Fulfilment complete</div>}
                  </section>
                </div>
              </details>
            );
          })}
        </section>
      )}
    </main>
  );
}
