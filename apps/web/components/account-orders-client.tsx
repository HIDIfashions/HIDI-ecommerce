"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogImage } from "@/components/catalog-image";
import { formatPaise } from "@/lib/api";
import { getCartSession } from "@/lib/cart-session";
import styles from "./account-orders.module.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

type OrderSummary = {
  orderNumber: string;
  status: string;
  createdAt: string;
  totalPaise: number;
  paymentStatus?: string | null;
  itemCount: number;
  items: Array<{
    id: string;
    productName: string;
    slug: string;
    image?: string | null;
    size: string;
    color: string;
    quantity: number;
    totalPaise: number;
  }>;
};

function titleCase(value?: string | null) {
  if (!value) return "Pending";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AccountOrdersClient() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const sessionId = getCartSession();
    fetch(`${API}/checkout/orders?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message ?? "Unable to load your orders");
        setOrders(data);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <div className={styles.empty}>
      <h2>We couldn’t load your orders.</h2>
      <p>{error}</p>
    </div>;
  }

  if (!orders) return <p className="muted">Loading your HIDI orders…</p>;

  if (orders.length === 0) {
    return <div className={styles.empty}>
      <h2>No orders yet.</h2>
      <p>When you place an order on this browser, it will appear here.</p>
      <Link className="button button-dark" href="/collections/new-arrivals">Explore new arrivals</Link>
    </div>;
  }

  return <div className={styles.list}>
    {orders.map((order) => {
      const placedAt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(order.createdAt));
      return <article className={styles.card} key={order.orderNumber}>
        <div className={styles.header}>
          <div>
            <p className="eyebrow">ORDER</p>
            <h2>{order.orderNumber}</h2>
            <p className={styles.meta}>{placedAt} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
          </div>
          <div className={styles.statusBlock}>
            <span className={styles.status}>{titleCase(order.status)}</span>
            <strong>{formatPaise(order.totalPaise)}</strong>
          </div>
        </div>

        <div className={styles.items}>
          {order.items.slice(0, 3).map((item) => <div className={styles.item} key={item.id}>
            <Link href={`/products/${item.slug}`} className={styles.thumb} style={{ position: "relative" }}>
              <CatalogImage src={item.image} alt={item.productName} sizes="86px" fallbackLabel={`HIDI / ${item.productName}`} />
            </Link>
            <div>
              <Link className={styles.name} href={`/products/${item.slug}`}>{item.productName}</Link>
              <p>{item.color} · Size {item.size} · Qty {item.quantity}</p>
            </div>
          </div>)}
        </div>

        <div className={styles.footer}>
          <span>Payment: {order.paymentStatus === "CAPTURED" ? "Paid" : titleCase(order.paymentStatus)}</span>
          <Link className="text-link" href={`/order-confirmed?order=${encodeURIComponent(order.orderNumber)}&status=${encodeURIComponent(order.status)}`}>View order →</Link>
        </div>
      </article>;
    })}
  </div>;
}
