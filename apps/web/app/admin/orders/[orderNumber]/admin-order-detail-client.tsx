"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./order-detail.module.css";

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

const FLOW = ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"];
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

function label(value: string) {
  return value.replaceAll("_", " ");
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminOrderDetailClient({ orderNumber }: { orderNumber: string }) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to load order");
      setOrder(body.order ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load order");
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  async function advanceStatus() {
    if (!order) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;

    setUpdating(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to update order");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update order");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return <main className={styles.page}><div className={styles.state}>Loading order…</div></main>;
  }

  if (!order) {
    return <main className={styles.page}><div className={styles.state}>{error ?? "Order not found"}</div></main>;
  }

  const address = order.shippingAddress ?? {};
  const name = [address.firstName, address.lastName].filter(Boolean).join(" ") || "Customer";
  const currentIndex = FLOW.indexOf(order.status);
  const next = NEXT_STATUS[order.status];

  return (
    <main className={styles.page}>
      <div className={styles.topline}>
        <Link href="/admin/orders">← Back to orders</Link>
        <span>HIDI ADMIN</span>
      </div>

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ORDER</p>
          <h1>{order.orderNumber}</h1>
          <p>{dateTime(order.createdAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
        </div>
        <div className={styles.headerRight}>
          <strong>{money(order.totalPaise)}</strong>
          <span className={`${styles.status} ${styles[`status${order.status}`] ?? ""}`}>{label(order.status)}</span>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.grid}>
        <div className={styles.mainColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div><p className={styles.eyebrow}>ORDER ITEMS</p><h2>What the customer ordered</h2></div>
            </div>
            {order.items.map((item) => (
              <div className={styles.item} key={item.id}>
                {item.image ? <img src={item.image} alt="" /> : <div className={styles.imageFallback}>H</div>}
                <div className={styles.itemInfo}>
                  <strong>{item.productName}</strong>
                  <span>{item.color} · Size {item.size}</span>
                  <span>SKU {item.sku}</span>
                  <span>Qty {item.quantity}</span>
                </div>
                <strong>{money(item.totalPaise)}</strong>
              </div>
            ))}

            <div className={styles.totals}>
              <span>Subtotal <strong>{money(order.subtotalPaise)}</strong></span>
              <span>Shipping <strong>{order.shippingPaise ? money(order.shippingPaise) : "Free"}</strong></span>
              {order.discountPaise > 0 && <span>Discount <strong>−{money(order.discountPaise)}</strong></span>}
              <span className={styles.total}>Total <strong>{money(order.totalPaise)}</strong></span>
            </div>
          </section>

          <section className={styles.card}>
            <p className={styles.eyebrow}>DELIVERY</p>
            <h2>{name}</h2>
            <div className={styles.addressGrid}>
              <div>
                <p>
                  {address.line1}<br />
                  {address.line2 && <>{address.line2}<br /></>}
                  {address.landmark && <>{address.landmark}<br /></>}
                  {[address.city, address.state, address.postalCode].filter(Boolean).join(", ")}<br />
                  {address.countryCode ?? "IN"}
                </p>
              </div>
              <div>
                <p>{order.customerPhone}<br />{order.customerEmail ?? "No email supplied"}</p>
              </div>
            </div>
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.card}>
            <p className={styles.eyebrow}>PAYMENT</p>
            <h2>{order.payment ? label(order.payment.status) : "No payment"}</h2>
            <dl className={styles.metaList}>
              <div><dt>Provider</dt><dd>{order.payment?.provider ?? "—"}</dd></div>
              <div><dt>Method</dt><dd>{order.payment?.method?.toUpperCase() ?? "—"}</dd></div>
              <div><dt>Amount</dt><dd>{money(order.totalPaise)}</dd></div>
            </dl>
          </section>

          <section className={styles.card}>
            <p className={styles.eyebrow}>FULFILMENT</p>
            <h2>{label(order.status)}</h2>
            <div className={styles.timeline}>
              {FLOW.map((step, index) => (
                <div className={index <= currentIndex ? styles.activeStep : ""} key={step}>
                  <span />
                  <small>{label(step)}</small>
                </div>
              ))}
            </div>

            {order.shipment && (
              <div className={styles.shipmentBox}>
                <span>Courier: {order.shipment.provider ?? "—"}</span>
                <span>AWB: {order.shipment.awb ?? "—"}</span>
                {order.shipment.trackingUrl && <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">Open tracking ↗</a>}
              </div>
            )}

            {next ? (
              <button className={styles.primaryAction} type="button" onClick={() => void advanceStatus()} disabled={updating}>
                {updating ? "Updating…" : `Mark as ${label(next)}`}
              </button>
            ) : (
              <div className={styles.complete}>Fulfilment complete</div>
            )}
          </section>

          <section className={styles.card}>
            <p className={styles.eyebrow}>QUICK ACTIONS</p>
            <button className={styles.secondaryAction} type="button" onClick={() => navigator.clipboard.writeText(order.customerPhone)}>Copy phone</button>
            <button className={styles.secondaryAction} type="button" onClick={() => navigator.clipboard.writeText([address.line1, address.line2, address.landmark, address.city, address.state, address.postalCode, address.countryCode].filter(Boolean).join(", "))}>Copy address</button>
            <button className={styles.secondaryAction} type="button" onClick={() => window.print()}>Print order</button>
          </section>
        </aside>
      </section>
    </main>
  );
}
