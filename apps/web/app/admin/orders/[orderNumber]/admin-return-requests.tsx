"use client";

import { useMemo, useState } from "react";
import styles from "./return-operations.module.css";

export type AdminReturnRequest = {
  id: string;
  orderItemId: string;
  type: string;
  reason: string;
  detail?: string | null;
  quantity: number;
  refundDestination?: string | null;
  requestedSize?: string | null;
  refundPaise: number;
  status: string;
  adminNote?: string | null;
  rejectionReason?: string | null;
  pickupProvider?: string | null;
  pickupAwb?: string | null;
  pickupTrackingUrl?: string | null;
  pickupScheduledAt?: string | null;
  receivedAt?: string | null;
  inventoryDisposition?: string | null;
  refundWalletPaise?: number;
  refundCashPaise?: number;
  refundStatus?: string | null;
  refundProviderId?: string | null;
  replacementProvider?: string | null;
  replacementAwb?: string | null;
  replacementTrackingUrl?: string | null;
  replacementShippedAt?: string | null;
  exchangeReservationStatus?: string | null;
  createdAt: string;
  approvedAt?: string | null;
  processedAt?: string | null;
  completedAt?: string | null;
};

type OrderItem = {
  id: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
};

type Props = {
  orderNumber: string;
  requests: AdminReturnRequest[];
  items: OrderItem[];
  onUpdated: () => Promise<void> | void;
};

const COURIERS = ["Delhivery", "Blue Dart", "DTDC", "Xpressbees", "Ecom Express", "India Post", "Customer self-ship", "Other"];

function money(value = 0) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function label(value?: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ReturnRequestCard({
  orderNumber,
  request,
  item,
  onUpdated,
}: {
  orderNumber: string;
  request: AdminReturnRequest;
  item?: OrderItem;
  onUpdated: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState(request.adminNote ?? "");
  const [rejectionReason, setRejectionReason] = useState("");
  const [pickupProvider, setPickupProvider] = useState(request.pickupProvider ?? "Delhivery");
  const [pickupAwb, setPickupAwb] = useState(request.pickupAwb ?? "");
  const [pickupTrackingUrl, setPickupTrackingUrl] = useState(request.pickupTrackingUrl ?? "");
  const [inventoryDisposition, setInventoryDisposition] = useState<"RESTOCK" | "DAMAGED">("RESTOCK");
  const [replacementProvider, setReplacementProvider] = useState(request.replacementProvider ?? "Delhivery");
  const [replacementAwb, setReplacementAwb] = useState(request.replacementAwb ?? "");
  const [replacementTrackingUrl, setReplacementTrackingUrl] = useState(request.replacementTrackingUrl ?? "");

  async function run(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/returns/${encodeURIComponent(request.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note, ...payload }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to update return request");
      setNotice("Return workflow updated.");
      await onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update return request");
    } finally {
      setBusy(false);
    }
  }

  const refundDestination = request.refundDestination === "WALLET"
    ? "HIDI Wallet"
    : request.refundDestination === "ORIGINAL"
      ? "Original payment source"
      : null;

  return (
    <article className={styles.requestCard}>
      <header className={styles.requestHeader}>
        <div>
          <span className={styles.typePill}>{label(request.type)}</span>
          <h3>{item?.productName ?? "Order item"}</h3>
          <p>
            {item ? `${item.color} · Size ${item.size} · SKU ${item.sku}` : `Item ${request.orderItemId}`}
            {" · "}Qty {request.quantity}
          </p>
        </div>
        <div className={styles.statusStack}>
          <span className={styles.statusPill}>{label(request.status)}</span>
          <small>Raised {dateTime(request.createdAt)}</small>
        </div>
      </header>

      <div className={styles.detailsGrid}>
        <div><span>Reason</span><strong>{label(request.reason)}</strong></div>
        {request.type === "RETURN" && <div><span>Refund value</span><strong>{money(request.refundPaise)}</strong></div>}
        {refundDestination && <div><span>Customer chose</span><strong>{refundDestination}</strong></div>}
        {request.requestedSize && <div><span>Replacement size</span><strong>{request.requestedSize}</strong></div>}
        {request.exchangeReservationStatus && <div><span>Replacement stock</span><strong>{label(request.exchangeReservationStatus)}</strong></div>}
        {request.inventoryDisposition && <div><span>Inspection</span><strong>{label(request.inventoryDisposition)}</strong></div>}
      </div>

      {request.detail && <p className={styles.customerNote}><strong>Customer note:</strong> {request.detail}</p>}
      {request.rejectionReason && <p className={styles.rejection}><strong>Rejected:</strong> {request.rejectionReason}</p>}

      {(request.pickupProvider || request.pickupAwb) && (
        <div className={styles.logBox}>
          <strong>Return pickup</strong>
          <span>{request.pickupProvider ?? "Courier"}{request.pickupAwb ? ` · AWB ${request.pickupAwb}` : ""}</span>
          {request.pickupScheduledAt && <small>Scheduled {dateTime(request.pickupScheduledAt)}</small>}
          {request.pickupTrackingUrl && <a href={request.pickupTrackingUrl} target="_blank" rel="noreferrer">Open pickup tracking ↗</a>}
        </div>
      )}

      {request.status === "REFUND_PROCESSING" && (
        <div className={styles.processing}>
          Refund initiated. HIDI will complete the request only after Razorpay confirms the processed refund webhook.
        </div>
      )}

      {(request.refundWalletPaise || request.refundCashPaise || request.refundStatus) && (
        <div className={styles.logBox}>
          <strong>Refund reconciliation</strong>
          <span>Wallet: {money(request.refundWalletPaise ?? 0)} · Payment source: {money(request.refundCashPaise ?? 0)}</span>
          <span>Status: {label(request.refundStatus)}</span>
          {request.refundProviderId && <small>Provider refund: {request.refundProviderId}</small>}
        </div>
      )}

      {(request.replacementProvider || request.replacementAwb) && (
        <div className={styles.logBox}>
          <strong>Replacement shipment</strong>
          <span>{request.replacementProvider ?? "Courier"}{request.replacementAwb ? ` · AWB ${request.replacementAwb}` : ""}</span>
          {request.replacementShippedAt && <small>Shipped {dateTime(request.replacementShippedAt)}</small>}
          {request.replacementTrackingUrl && <a href={request.replacementTrackingUrl} target="_blank" rel="noreferrer">Open replacement tracking ↗</a>}
        </div>
      )}

      {["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "EXCHANGE_SHIPPED"].includes(request.status) && (
        <div className={styles.noteField}>
          <label>
            <span>Internal note <small>(optional)</small></span>
            <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} maxLength={600} placeholder="Inspection, customer call, exception…" />
          </label>
        </div>
      )}

      {request.status === "REQUESTED" && (
        <div className={styles.actionPanel}>
          <div className={styles.primaryActions}>
            <button type="button" onClick={() => void run("APPROVE")} disabled={busy}>
              {busy ? "Working…" : request.type === "EXCHANGE" ? "Approve & reserve replacement" : "Approve return"}
            </button>
          </div>
          <div className={styles.rejectRow}>
            <input
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Reason required to reject"
              maxLength={300}
            />
            <button
              className={styles.dangerButton}
              type="button"
              onClick={() => void run("REJECT", { rejectionReason })}
              disabled={busy || !rejectionReason.trim()}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {request.status === "APPROVED" && (
        <div className={styles.actionPanel}>
          <p className={styles.helper}>Arrange reverse pickup, or receive directly if the item has already reached HIDI.</p>
          <div className={styles.formGrid}>
            <label><span>Pickup provider</span>
              <select value={pickupProvider} onChange={(event) => setPickupProvider(event.target.value)}>
                {COURIERS.map((courier) => <option key={courier} value={courier}>{courier}</option>)}
              </select>
            </label>
            <label><span>Pickup AWB <small>(optional)</small></span><input value={pickupAwb} onChange={(event) => setPickupAwb(event.target.value)} /></label>
            <label className={styles.full}><span>Pickup tracking URL <small>(optional)</small></span><input type="url" value={pickupTrackingUrl} onChange={(event) => setPickupTrackingUrl(event.target.value)} placeholder="https://…" /></label>
          </div>
          <button
            type="button"
            onClick={() => void run("SCHEDULE_PICKUP", { provider: pickupProvider, awb: pickupAwb, trackingUrl: pickupTrackingUrl })}
            disabled={busy || !pickupProvider}
          >
            Schedule / record pickup
          </button>
          <div className={styles.receiveInline}>
            <select value={inventoryDisposition} onChange={(event) => setInventoryDisposition(event.target.value as "RESTOCK" | "DAMAGED")}>
              <option value="RESTOCK">Passed inspection — restock</option>
              <option value="DAMAGED">Damaged / not saleable — do not restock</option>
            </select>
            <button type="button" onClick={() => void run("MARK_RECEIVED", { inventoryDisposition })} disabled={busy}>
              Item already received
            </button>
          </div>
        </div>
      )}

      {request.status === "PICKUP_SCHEDULED" && (
        <div className={styles.actionPanel}>
          <p className={styles.helper}>When the physical item arrives, inspect it before inventory or refund changes.</p>
          <div className={styles.receiveInline}>
            <select value={inventoryDisposition} onChange={(event) => setInventoryDisposition(event.target.value as "RESTOCK" | "DAMAGED")}>
              <option value="RESTOCK">Passed inspection — restock</option>
              <option value="DAMAGED">Damaged / not saleable — do not restock</option>
            </select>
            <button type="button" onClick={() => void run("MARK_RECEIVED", { inventoryDisposition })} disabled={busy}>
              Mark received & inspected
            </button>
          </div>
        </div>
      )}

      {request.status === "RECEIVED" && request.type === "RETURN" && (
        <div className={styles.actionPanel}>
          <p className={styles.helper}>
            Issue {money(request.refundPaise)} to {refundDestination ?? "the selected destination"}. This action is ledger/provider backed and cannot be treated as a manual status change.
          </p>
          <button className={styles.refundButton} type="button" onClick={() => void run("ISSUE_REFUND")} disabled={busy}>
            {busy ? "Processing…" : `Issue ${money(request.refundPaise)} refund`}
          </button>
        </div>
      )}

      {request.status === "RECEIVED" && request.type === "EXCHANGE" && (
        <div className={styles.actionPanel}>
          <p className={styles.helper}>The replacement is reserved. Enter dispatch details to consume that reserved stock.</p>
          <div className={styles.formGrid}>
            <label><span>Courier</span>
              <select value={replacementProvider} onChange={(event) => setReplacementProvider(event.target.value)}>
                {COURIERS.filter((value) => value !== "Customer self-ship").map((courier) => <option key={courier} value={courier}>{courier}</option>)}
              </select>
            </label>
            <label><span>AWB / tracking number</span><input value={replacementAwb} onChange={(event) => setReplacementAwb(event.target.value)} /></label>
            <label className={styles.full}><span>Tracking URL <small>(optional)</small></span><input type="url" value={replacementTrackingUrl} onChange={(event) => setReplacementTrackingUrl(event.target.value)} placeholder="https://…" /></label>
          </div>
          <button
            type="button"
            onClick={() => void run("SHIP_EXCHANGE", { provider: replacementProvider, awb: replacementAwb, trackingUrl: replacementTrackingUrl })}
            disabled={busy || !replacementProvider || !replacementAwb.trim()}
          >
            Ship replacement
          </button>
        </div>
      )}

      {request.status === "EXCHANGE_SHIPPED" && (
        <div className={styles.actionPanel}>
          <p className={styles.helper}>Complete only after the replacement is delivered or HIDI support has confirmed closure.</p>
          <button type="button" onClick={() => void run("COMPLETE_EXCHANGE")} disabled={busy}>
            Complete exchange
          </button>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <footer className={styles.requestFooter}>
        <span>Return ID {request.id}</span>
        <span>Order {orderNumber}</span>
      </footer>
    </article>
  );
}

export function AdminReturnRequests({ orderNumber, requests, items, onUpdated }: Props) {
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  if (!requests.length) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>AFTER-SALES</p>
          <h2>Returns & exchanges</h2>
        </div>
        <span>{requests.length} request{requests.length === 1 ? "" : "s"}</span>
      </div>
      <p className={styles.intro}>
        Forward fulfilment stays separate from after-sales. Work each request here so inventory, wallet and payment records move together.
      </p>
      <div className={styles.requests}>
        {requests.map((request) => (
          <ReturnRequestCard
            key={request.id}
            orderNumber={orderNumber}
            request={request}
            item={itemMap.get(request.orderItemId)}
            onUpdated={onUpdated}
          />
        ))}
      </div>
    </section>
  );
}
