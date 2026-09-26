"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, MapPin, PackageCheck, Truck, WalletCards } from "lucide-react";
import { CatalogImage } from "@/components/catalog-image";
import { ReturnExchangeRequest } from "@/components/return-exchange-request";
import { AccountReviewPrompt } from "@/components/account/account-review-prompt";
import { formatPaise } from "@/lib/api";
import { accountTitleCase, fetchAccountOrder, type AccountOrder } from "@/lib/account-data";
import { formatWalletPaise } from "@/lib/wallet-client";
import styles from "./account-order-detail.module.css";

const ACTIVE_RETURN_STATUSES = new Set(["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUND_PROCESSING", "EXCHANGE_SHIPPED"]);

function orderStage(status: string) {
  if (["DELIVERED", "RETURN_REQUESTED", "RETURNED", "REFUNDED"].includes(status)) return 4;
  if (status === "SHIPPED") return 3;
  if (status === "PACKED") return 2;
  if (status === "CONFIRMED") return 1;
  return 0;
}

function addressLines(address?: Record<string, unknown> | null) {
  if (!address) return [];
  const name = [address.firstName, address.lastName].filter((value) => typeof value === "string" && value.trim()).join(" ");
  const locality = [address.city, address.state, address.postalCode].filter((value) => typeof value === "string" && value.trim()).join(", ");
  return [
    name,
    address.line1,
    address.line2,
    address.landmark,
    locality,
    address.phone,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

export function AccountOrderDetailClient({ orderNumber }: { orderNumber: string }) {
  const [order, setOrder] = useState<AccountOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchAccountOrder(orderNumber);
      setOrder(payload.order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load this order.");
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => { void load(); }, [load]);

  const steps = useMemo(() => {
    const current = orderStage(order?.status ?? "");
    return [
      { label: "Confirmed", icon: Check, done: current >= 1 },
      { label: "Packed", icon: PackageCheck, done: current >= 2 },
      { label: "Shipped", icon: Truck, done: current >= 3 },
      { label: "Delivered", icon: Check, done: current >= 4 },
    ];
  }, [order?.status]);

  if (loading) return <p className="muted">Opening your HIDI order…</p>;
  if (error || !order) return <div className={styles.state}><h2>We couldn’t open this order.</h2><p>{error}</p><Link href="/account/orders">Back to orders</Link></div>;

  const placedAt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(order.createdAt));
  const deliveredAt = order.deliveredAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(order.deliveredAt)) : null;
  const lines = addressLines(order.shippingAddress);
  const walletApplied = order.walletAppliedPaise ?? 0;
  const cashPayable = order.cashPayablePaise ?? Math.max(0, order.totalPaise - walletApplied);

  return (
    <div className={styles.wrap}>
      <Link href="/account/orders" className={styles.back}><ArrowLeft size={14} /> Back to orders</Link>

      <section className={styles.hero}>
        <div>
          <p className="eyebrow">ORDER DETAIL</p>
          <h1>{order.orderNumber}</h1>
          <p>{placedAt} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
        </div>
        <div className={styles.heroStatus}>
          <span>{accountTitleCase(order.status)}</span>
          <strong>{formatPaise(order.totalPaise)}</strong>
          <small>Payment: {order.paymentStatus === "CAPTURED" ? "Paid" : accountTitleCase(order.paymentStatus)}</small>
        </div>
      </section>

      {order.status !== "CANCELLED" && (
        <section className={styles.progress} aria-label="Order progress">
          {steps.map(({ label, icon: Icon, done }, index) => (
            <div className={done ? styles.progressDone : styles.progressStep} key={label}>
              <span><Icon size={16} strokeWidth={1.7} /></span>
              <strong>{label}</strong>
              {index < steps.length - 1 && <i aria-hidden="true" />}
            </div>
          ))}
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><p className="eyebrow">YOUR PIECES</p><h2>What’s in this order.</h2></div>
          {deliveredAt && <span>Delivered {deliveredAt}</span>}
        </div>

        <div className={styles.items}>
          {order.items.map((item) => {
            const latest = item.returnRequests[0] ?? null;
            const active = item.returnRequests.find((request) => ACTIVE_RETURN_STATUSES.has(request.status));
            return (
              <article className={styles.item} key={item.id}>
                <Link href={`/products/${item.slug}`} className={styles.thumb}>
                  <CatalogImage src={item.image} alt={item.productName} sizes="130px" fallbackLabel={`HIDI / ${item.productName}`} />
                </Link>
                <div className={styles.itemBody}>
                  <div className={styles.itemTop}>
                    <div>
                      <span className={styles.itemStatus}>{active ? `${active.type === "EXCHANGE" ? "Exchange" : "Return"} · ${accountTitleCase(active.status)}` : latest ? `${latest.type === "EXCHANGE" ? "Exchange" : "Return"} · ${accountTitleCase(latest.status)}` : accountTitleCase(order.status)}</span>
                      <Link href={`/products/${item.slug}`} className={styles.itemName}>{item.productName}</Link>
                      <p>{item.color} · Size {item.size} · Qty {item.quantity}</p>
                    </div>
                    <strong>{formatPaise(item.totalPaise)}</strong>
                  </div>

                  <ReturnExchangeRequest
                    orderNumber={order.orderNumber}
                    item={item}
                    eligible={Boolean(order.canReturnOrExchange)}
                    returnWindowEndsAt={order.returnWindowEndsAt}
                    onCreated={load}
                  />

                  {order.status === "DELIVERED" && (
                    <AccountReviewPrompt
                      orderNumber={order.orderNumber}
                      item={item}
                      onSubmitted={load}
                    />
                  )}

                  <div className={styles.itemActions}>
                    <Link href={`/products/${item.slug}`}>View piece <ArrowRight size={13} /></Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className={styles.detailGrid}>
        <section className={styles.detailCard}>
          <div className={styles.cardTitle}><WalletCards size={18} /><h3>Payment</h3></div>
          <div className={styles.rows}>
            <div><span>Merchandise</span><strong>{formatPaise(order.subtotalPaise ?? order.totalPaise)}</strong></div>
            {!!order.discountPaise && <div><span>Discount</span><strong>−{formatPaise(order.discountPaise)}</strong></div>}
            <div><span>Shipping</span><strong>{(order.shippingPaise ?? 0) === 0 ? "Complimentary" : formatPaise(order.shippingPaise ?? 0)}</strong></div>
            {!!order.taxPaise && <div><span>Tax</span><strong>{formatPaise(order.taxPaise)}</strong></div>}
            {!!walletApplied && <div><span>HIDI Wallet</span><strong>−{formatWalletPaise(walletApplied)}</strong></div>}
            {!!walletApplied && <div><span>Online payment</span><strong>{formatWalletPaise(cashPayable)}</strong></div>}
            <div className={styles.total}><span>Total</span><strong>{formatPaise(order.totalPaise)}</strong></div>
          </div>
        </section>

        <section className={styles.detailCard}>
          <div className={styles.cardTitle}><MapPin size={18} /><h3>Delivery</h3></div>
          {lines.length ? <address>{lines.map((line) => <span key={line}>{line}</span>)}</address> : <p className="muted">Delivery address unavailable.</p>}
          {order.shipment && (
            <div className={styles.shipment}>
              <span>{accountTitleCase(order.shipment.status)}</span>
              {order.shipment.provider && <small>{order.shipment.provider}</small>}
              {order.shipment.awb && <small>AWB {order.shipment.awb}</small>}
              {order.shipment.trackingUrl && <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">Track shipment ↗</a>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
