"use client";

import Link from "next/link";
import { ArrowRight, RotateCcw, Star } from "lucide-react";
import { CatalogImage } from "@/components/catalog-image";
import { ReturnExchangeRequest } from "@/components/return-exchange-request";
import { formatPaise } from "@/lib/api";
import { formatWalletPaise } from "@/lib/wallet-client";
import type { AccountOrderSummary } from "@/lib/account-types";
import styles from "./order-card.module.css";

const ACTIVE_RETURN_STATUSES = new Set([
  "REQUESTED",
  "APPROVED",
  "PICKUP_SCHEDULED",
  "RECEIVED",
  "REFUND_PROCESSING",
  "EXCHANGE_SHIPPED",
]);

function titleCase(value?: string | null) {
  if (!value) return "Pending";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function itemState(order: AccountOrderSummary, item: AccountOrderSummary["items"][number]) {
  const active = item.returnRequests.find((request) => ACTIVE_RETURN_STATUSES.has(request.status));
  if (active) return (active.type === "EXCHANGE" ? "Exchange" : "Return") + " · " + titleCase(active.status);
  if (item.returnRequests[0]?.status === "COMPLETED") {
    return item.returnRequests[0].type === "EXCHANGE" ? "Exchange complete" : "Refund complete";
  }
  return titleCase(order.status);
}

export function OrderCard({ order, onChanged }: { order: AccountOrderSummary; onChanged: () => void }) {
  const placedAt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(order.createdAt));
  const activeReturnQuantity = order.items.reduce(
    (sum, item) => sum + item.returnRequests
      .filter((request) => ACTIVE_RETURN_STATUSES.has(request.status))
      .reduce((itemSum, request) => itemSum + request.quantity, 0),
    0,
  );

  return (
    <article className={styles.order}>
      <header className={styles.orderHeader}>
        <div>
          <span className={styles.eyebrow}>HIDI ORDER</span>
          <h2>{order.orderNumber}</h2>
          <p>{placedAt} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
        </div>

        <div className={styles.orderSummary}>
          <span className={styles.status}>
            {activeReturnQuantity > 0
              ? activeReturnQuantity + " item" + (activeReturnQuantity === 1 ? "" : "s") + " in aftercare"
              : titleCase(order.status)}
          </span>
          <strong>{formatPaise(order.totalPaise)}</strong>
          {!!order.walletAppliedPaise && (
            <small>
              Rewards {formatWalletPaise(order.walletAppliedPaise)} · Cash {formatWalletPaise(order.cashPayablePaise ?? 0)}
            </small>
          )}
        </div>
      </header>

      <div className={styles.items}>
        {order.items.map((item) => {
          const rating = item.rating;
          return (
            <section className={styles.item} key={item.id}>
              <Link href={"/products/" + item.slug} className={styles.image} aria-label={"View " + item.productName}>
                <CatalogImage
                  src={item.image}
                  alt={item.productName}
                  sizes="(max-width: 620px) 88px, 118px"
                  fallbackLabel={"HIDI / " + item.productName}
                />
              </Link>

              <div className={styles.copy}>
                <div className={styles.itemTop}>
                  <div>
                    <span className={styles.itemState}>{itemState(order, item)}</span>
                    <Link className={styles.name} href={"/products/" + item.slug}>{item.productName}</Link>
                    <p>{item.color} · Size {item.size} · Qty {item.quantity}</p>
                  </div>
                  <strong className={styles.itemPrice}>{formatPaise(item.totalPaise)}</strong>
                </div>

                <div className={styles.ratingRow}>
                  <div className={styles.stars} aria-label={rating?.count ? rating.average.toFixed(1) + " out of 5 from " + rating.count + " reviews" : "No reviews yet"}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Star
                        key={value}
                        size={15}
                        strokeWidth={1.5}
                        fill={rating && rating.average >= value - 0.35 ? "currentColor" : "none"}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <span>
                    {rating?.customerRating
                      ? "Your rating · " + rating.customerRating + "/5"
                      : rating?.count
                        ? rating.average.toFixed(1) + " · " + rating.count + " review" + (rating.count === 1 ? "" : "s")
                        : "Be among the first to review"}
                  </span>
                  <Link href={"/products/" + item.slug + "#reviews"}>Reviews & details <ArrowRight size={12} aria-hidden="true" /></Link>
                </div>

                <div className={styles.actions}>
                  <Link href={"/products/" + item.slug} className={styles.secondaryAction}>
                    View product <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                  <div className={styles.aftercare}>
                    <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
                    <ReturnExchangeRequest
                      orderNumber={order.orderNumber}
                      item={item}
                      eligible={Boolean(order.canReturnOrExchange)}
                      returnWindowEndsAt={order.returnWindowEndsAt}
                      onCreated={onChanged}
                    />
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <footer className={styles.footer}>
        <span>Payment · {order.paymentStatus === "CAPTURED" ? "Paid" : titleCase(order.paymentStatus)}</span>
        <Link href={"/order-confirmed?order=" + encodeURIComponent(order.orderNumber) + "&status=" + encodeURIComponent(order.status)}>
          View complete order <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </footer>
    </article>
  );
}
