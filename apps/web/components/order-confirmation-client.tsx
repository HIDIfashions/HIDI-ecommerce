"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogImage } from "@/components/catalog-image";
import { formatPaise } from "@/lib/api";
import { getCartSession } from "@/lib/cart-session";
import styles from "./order-confirmation.module.css";

import { BROWSER_API_URL } from "@/lib/browser-api";
const API = BROWSER_API_URL;

type Receipt = {
  orderNumber: string;
  status: string;
  createdAt: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  walletAppliedPaise?: number;
  customerEmail?: string | null;
  customerPhone: string;
  shippingAddress: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    countryCode?: string;
  };
  payment: { status: string; method?: string | null; amountPaise: number } | null;
  items: Array<{
    id: string;
    productName: string;
    slug: string;
    image?: string | null;
    size: string;
    color: string;
    quantity: number;
    unitPricePaise: number;
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

export function OrderConfirmationClient({ orderNumber, initialStatus }: { orderNumber: string; initialStatus?: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const sessionId = getCartSession();
    fetch(`${API}/checkout/confirmation/${encodeURIComponent(orderNumber)}?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message ?? "Unable to load order details");
        setReceipt(data);
      })
      .catch((e) => setError(e.message));
  }, [orderNumber]);

  const pendingReview = (receipt?.status ?? initialStatus) === "PAYMENT_REVIEW" || initialStatus === "authorized";

  if (error) {
    return <div className="container confirmation-page">
      <p className="eyebrow">ORDER RECEIVED</p>
      <h1>It’s yours.</h1>
      <p>Your order was received, but the detailed receipt could not be loaded right now.</p>
      <div className="confirmation-number"><span>Order number</span><strong>{orderNumber}</strong></div>
      <Link className="button button-dark" href="/collections/new-arrivals">Continue browsing</Link>
    </div>;
  }

  if (!receipt) {
    return <div className="container confirmation-page"><p className="muted">Loading your HIDI order…</p></div>;
  }

  const address = receipt.shippingAddress ?? {};
  const fullName = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const paymentLabel = receipt.payment?.status === "CAPTURED" ? "Paid" : titleCase(receipt.payment?.status);
  const walletAppliedPaise = receipt.walletAppliedPaise ?? 0;
  const paymentMethod = walletAppliedPaise === receipt.totalPaise && walletAppliedPaise > 0
    ? "HIDI rewards" : receipt.payment?.method ? titleCase(receipt.payment.method) : "Razorpay";
  const orderLabel = titleCase(receipt.status);
  const placedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(receipt.createdAt));

  return <div className={`container confirmation-page confirmation-wide ${styles.receipt}`}>
    <p className="eyebrow">{pendingReview ? "PAYMENT RECEIVED" : "ORDER CONFIRMED"}</p>
    <h1>{pendingReview ? "We’re confirming the final details." : "It’s yours."}</h1>
    <p>{pendingReview
      ? "Your payment is safe. Our system is completing the confirmation; please do not pay again."
      : "Thank you for choosing HIDI. We’ll keep you updated as your order moves from our team to your door."}</p>
    <p className={styles.updateNote}>You can check your latest order status in My account.</p>

    <div className="confirmation-number">
      <span>Order number</span>
      <strong>{receipt.orderNumber}</strong>
    </div>
    <div className={styles.orderMeta}>
      <span>Placed on</span>
      <strong>{placedAt}</strong>
    </div>

    <div className="confirmation-grid">
      <section className="confirmation-card">
        <div className="confirmation-card-header">
          <div><p className="eyebrow">YOUR ORDER</p><h2>What you chose</h2></div>
          <span className="status-chip">{orderLabel}</span>
        </div>
        <div className="confirmation-items">
          {receipt.items.map((item) => <article className="confirmation-item" key={item.id}>
            <Link href={`/products/${item.slug}`} className="confirmation-thumb" style={{ position: "relative" }}>
              <CatalogImage src={item.image} alt={item.productName} sizes="120px" fallbackLabel={`HIDI / ${item.productName}`} />
            </Link>
            <div className="confirmation-item-copy">
              <Link href={`/products/${item.slug}`} className="confirmation-item-name">{item.productName}</Link>
              <p>{item.color} · Size {item.size}</p>
              <p>Qty {item.quantity} × {formatPaise(item.unitPricePaise)}</p>
            </div>
            <strong>{formatPaise(item.totalPaise)}</strong>
          </article>)}
        </div>
        <div className="confirmation-totals">
          <div><span>Subtotal</span><strong>{formatPaise(receipt.subtotalPaise)}</strong></div>
          {receipt.discountPaise > 0 && <div><span>Discount</span><strong>−{formatPaise(receipt.discountPaise)}</strong></div>}
          <div><span>Shipping</span><strong>{receipt.shippingPaise ? formatPaise(receipt.shippingPaise) : "Free"}</strong></div>
          <div className="confirmation-total-row"><span>Order total</span><strong>{formatPaise(receipt.totalPaise)}</strong></div>
          {walletAppliedPaise > 0 && <div><span>HIDI rewards applied</span><strong>{formatPaise(walletAppliedPaise)}</strong></div>}
          <div><span>{receipt.payment?.status === "CAPTURED" ? "Payment received" : "External payment amount"}</span><strong>{formatPaise(receipt.totalPaise - walletAppliedPaise)}</strong></div>
        </div>
      </section>

      <aside className="confirmation-side">
        <section className="confirmation-card">
          <p className="eyebrow">DELIVERY</p>
          <h2>Shipping to</h2>
          <p className="confirmation-address">
            {fullName && <><strong>{fullName}</strong><br /></>}
            {address.line1}<br />
            {address.line2 && <>{address.line2}<br /></>}
            {address.city}, {address.state} {address.postalCode}<br />
            India
          </p>
          <div className={styles.contactDetails}>
            <span>{receipt.customerPhone}</span>
            {receipt.customerEmail && <span>{receipt.customerEmail}</span>}
          </div>
        </section>

        <section className="confirmation-card">
          <p className="eyebrow">PAYMENT</p>
          <h2>{paymentLabel}</h2>
          <p className="muted">Paid via {paymentMethod}</p>
          <div className="confirmation-mini-row"><span>Payment status</span><strong>{paymentLabel}</strong></div>
          <div className="confirmation-mini-row"><span>Order status</span><strong>{orderLabel}</strong></div>
        </section>
      </aside>
    </div>

    <div className="confirmation-actions">
      <Link className="button button-dark" href="/collections/new-arrivals">Continue browsing</Link>
      <Link className="text-link" href="/account">View my orders</Link>
      <Link className="text-link" href="/">Back to HIDI home</Link>
    </div>
  </div>;
}
