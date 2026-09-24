"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Circle, PackageCheck, RefreshCcw, Truck, WalletCards } from "lucide-react";
import { CatalogImage } from "@/components/catalog-image";
import { accountTitleCase, fetchAccountOrders, type AccountOrder, type AccountOrderItem, type AccountReturnRequest } from "@/lib/account-data";
import { formatPaise } from "@/lib/api";
import styles from "./account-aftercare.module.css";

const ACTIVE = new Set(["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUND_PROCESSING", "EXCHANGE_SHIPPED"]);

type Case = {
  order: AccountOrder;
  item: AccountOrderItem;
  request: AccountReturnRequest;
};

function returnSteps(entry: Case) {
  const request = entry.request;
  if (request.type === "EXCHANGE") {
    return [
      ["REQUESTED", "Requested"],
      ["APPROVED", "Approved"],
      ["PICKUP_SCHEDULED", "Pickup"],
      ["RECEIVED", "Received"],
      ["EXCHANGE_SHIPPED", "Replacement sent"],
      ["COMPLETED", "Complete"],
    ] as const;
  }
  return [
    ["REQUESTED", "Requested"],
    ["APPROVED", "Approved"],
    ["PICKUP_SCHEDULED", "Pickup"],
    ["RECEIVED", "Received"],
    ["REFUND_PROCESSING", "Refund processing"],
    ["REFUNDED", "Refunded"],
  ] as const;
}

function statusIndex(entry: Case) {
  const request = entry.request;
  if (["CANCELLED", "REJECTED"].includes(request.status)) return -1;
  const steps = returnSteps(entry);
  const direct = steps.findIndex(([status]) => status === request.status);
  if (direct >= 0) return direct;
  if (request.completedAt) return steps.length - 1;
  if (request.type === "RETURN" && request.refundStatus === "REFUNDED") return steps.length - 1;
  return 0;
}

export function AccountAftercareClient() {
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void fetchAccountOrders()
      .then((payload) => { if (live) setOrders(payload.orders); })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "Unable to load aftercare."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const cases = useMemo(() => orders
    .flatMap((order) => order.items.flatMap((item) => item.returnRequests.map((request) => ({ order, item, request }))))
    .sort((a, b) => new Date(b.request.createdAt).getTime() - new Date(a.request.createdAt).getTime()), [orders]);

  const activeCases = cases.filter(({ request }) => ACTIVE.has(request.status));
  const completedCases = cases.filter(({ request }) => !ACTIVE.has(request.status));
  const refunded = cases.filter(({ request }) => request.status === "REFUNDED" || request.refundStatus === "REFUNDED").length;
  const exchanges = cases.filter(({ request }) => request.type === "EXCHANGE").length;

  if (loading) return <p className="muted">Opening HIDI Aftercare…</p>;
  if (error) return <div className={styles.state}><h2>We couldn’t load Aftercare.</h2><p>{error}</p></div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.summaryGrid}>
        <div><span>ACTIVE</span><strong>{activeCases.length}</strong><small>Returns or exchanges moving now</small></div>
        <div><span>REFUNDS COMPLETE</span><strong>{refunded}</strong><small>Completed refund journeys</small></div>
        <div><span>EXCHANGES</span><strong>{exchanges}</strong><small>Size or replacement journeys</small></div>
      </div>

      {cases.length === 0 ? (
        <div className={styles.empty}>
          <RefreshCcw size={24} />
          <h2>No aftercare cases yet.</h2>
          <p>When you request a return or exchange, its full journey will appear here.</p>
          <Link href="/account/orders">View your orders <ArrowRight size={14} /></Link>
        </div>
      ) : (
        <>
          {activeCases.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeading}><p className="eyebrow">IN PROGRESS</p><h2>We’re taking care of these.</h2></div>
              <div className={styles.caseList}>{activeCases.map((entry) => <AftercareCase key={entry.request.id} entry={entry} />)}</div>
            </section>
          )}

          {completedCases.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeading}><p className="eyebrow">HISTORY</p><h2>Completed & closed.</h2></div>
              <div className={styles.caseList}>{completedCases.map((entry) => <AftercareCase key={entry.request.id} entry={entry} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function AftercareCase({ entry }: { entry: Case }) {
  const { order, item, request } = entry;
  const steps = returnSteps(entry);
  const current = statusIndex(entry);
  const isStopped = ["CANCELLED", "REJECTED"].includes(request.status);
  const refundTotal = (request.refundWalletPaise ?? 0) + (request.refundCashPaise ?? 0) || request.refundPaise;
  const created = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(request.createdAt));

  return (
    <article className={styles.caseCard}>
      <div className={styles.caseHeader}>
        <div className={styles.product}>
          <Link href={`/products/${item.slug}`} className={styles.thumb}>
            <CatalogImage src={item.image} alt={item.productName} sizes="92px" fallbackLabel={`HIDI / ${item.productName}`} />
          </Link>
          <div>
            <span>{request.type === "EXCHANGE" ? "EXCHANGE" : "RETURN"} · {accountTitleCase(request.status)}</span>
            <Link href={`/products/${item.slug}`} className={styles.productName}>{item.productName}</Link>
            <small>{item.color} · Size {item.size} · Qty {request.quantity}</small>
            <small>{order.orderNumber} · Requested {created}</small>
          </div>
        </div>
        <div className={styles.caseAmount}>
          {request.type === "RETURN" ? <><span>REFUND</span><strong>{formatPaise(refundTotal)}</strong></> : <><span>REPLACEMENT</span><strong>Size {request.requestedSize ?? "—"}</strong></>}
        </div>
      </div>

      {isStopped ? (
        <div className={styles.stopped}>
          <strong>{request.status === "REJECTED" ? "Request not approved" : "Request cancelled"}</strong>
          {request.rejectionReason && <span>{request.rejectionReason}</span>}
        </div>
      ) : (
        <div className={styles.timeline} aria-label={request.type === "RETURN" ? "Return progress" : "Exchange progress"}>
          {steps.map(([status, label], index) => {
            const done = index <= current;
            return <div className={done ? styles.stepDone : styles.step} key={status}>
              <span>{done ? <Check size={14} /> : <Circle size={12} />}</span>
              <strong>{label}</strong>
              {index < steps.length - 1 && <i />}
            </div>;
          })}
        </div>
      )}

      <div className={styles.details}>
        {request.refundDestination === "WALLET" && <span><WalletCards size={15} /> Refund to HIDI Wallet</span>}
        {request.refundDestination === "ORIGINAL" && <span><RefreshCcw size={15} /> Refund to original payment source</span>}
        {request.pickupAwb && <span><Truck size={15} /> Pickup {request.pickupProvider ?? "courier"} · {request.pickupAwb}</span>}
        {request.replacementAwb && <span><PackageCheck size={15} /> Replacement {request.replacementProvider ?? "courier"} · {request.replacementAwb}</span>}
      </div>

      <div className={styles.actions}>
        {request.pickupTrackingUrl && <a href={request.pickupTrackingUrl} target="_blank" rel="noreferrer">Track pickup ↗</a>}
        {request.replacementTrackingUrl && <a href={request.replacementTrackingUrl} target="_blank" rel="noreferrer">Track replacement ↗</a>}
        <Link href={`/account/orders/${encodeURIComponent(order.orderNumber)}`}>View order <ArrowRight size={13} /></Link>
      </div>
    </article>
  );
}
