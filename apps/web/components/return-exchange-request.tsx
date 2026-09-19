"use client";

import { FormEvent, useState } from "react";
import { ArrowLeftRight, RotateCcw, WalletCards, X } from "lucide-react";
import { BROWSER_API_URL } from "@/lib/browser-api";
import { getAccessToken } from "@/lib/supabase-auth";
import { formatPaise } from "@/lib/api";
import styles from "./return-exchange-request.module.css";

type ReturnRequestSummary = {
  id: string;
  type: string;
  reason: string;
  quantity: number;
  refundDestination?: string | null;
  requestedSize?: string | null;
  refundPaise: number;
  status: string;
  createdAt: string;
};

type ReturnItem = {
  id: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  returnableQuantity: number;
  totalPaise: number;
  exchangeSizes: string[];
  returnRequests: ReturnRequestSummary[];
};

type Props = {
  orderNumber: string;
  item: ReturnItem;
  eligible: boolean;
  returnWindowEndsAt?: string | null;
  onCreated: () => Promise<void> | void;
};

const reasons = [
  ["SIZE_FIT", "Size or fit issue"],
  ["DAMAGED_DEFECTIVE", "Damaged or defective"],
  ["WRONG_ITEM", "Received the wrong item"],
  ["DIFFERENT_FROM_DESCRIPTION", "Different from images or description"],
  ["QUALITY_NOT_EXPECTED", "Quality not as expected"],
  ["CHANGED_MIND", "Changed my mind"],
  ["OTHER", "Other"],
] as const;

function labelStatus(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ReturnExchangeRequest({ orderNumber, item, eligible, returnWindowEndsAt, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"RETURN" | "EXCHANGE">("EXCHANGE");
  const [reason, setReason] = useState("SIZE_FIT");
  const [refundDestination, setRefundDestination] = useState<"ORIGINAL" | "WALLET">("WALLET");
  const [requestedSize, setRequestedSize] = useState(item.exchangeSizes.find((size) => size !== item.size) ?? item.exchangeSizes[0] ?? "");
  const [quantity, setQuantity] = useState(1);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const active = item.returnRequests.find((request) =>
    ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED"].includes(request.status),
  );
  const latest = item.returnRequests[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = await getAccessToken();
    if (!token) {
      setError("Please sign in again before creating a return or exchange request.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${BROWSER_API_URL}/account/orders/${encodeURIComponent(orderNumber)}/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderItemId: item.id,
          type,
          reason,
          quantity,
          refundDestination: type === "RETURN" ? refundDestination : undefined,
          requestedSize: type === "EXCHANGE" ? requestedSize : undefined,
          detail,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "Unable to create the request.");
      setOpen(false);
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the request.");
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    return (
      <div className={styles.requestStatus}>
        <strong>{active.type === "EXCHANGE" ? "Exchange" : "Return"} requested</strong>
        <span>{labelStatus(active.status)}</span>
        {active.requestedSize && <small>Replacement size: {active.requestedSize}</small>}
        {active.refundDestination === "WALLET" && <small>Refund choice: HIDI Wallet</small>}
        {active.refundDestination === "ORIGINAL" && <small>Refund choice: Original payment source</small>}
      </div>
    );
  }

  if (!eligible || item.returnableQuantity <= 0) {
    return latest ? (
      <div className={styles.requestStatus}>
        <strong>{latest.type === "EXCHANGE" ? "Exchange" : "Return"}</strong>
        <span>{labelStatus(latest.status)}</span>
      </div>
    ) : null;
  }

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <RotateCcw size={15} /> Return / Exchange
      </button>

      {open && (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-label={`Return or exchange ${item.productName}`}>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close return or exchange">
              <X size={20} />
            </button>

            <p className={styles.eyebrow}>POST-DELIVERY SUPPORT</p>
            <h2>Return or exchange?</h2>
            <p className={styles.intro}>
              {item.productName} · {item.color} · Size {item.size}
            </p>
            {returnWindowEndsAt && (
              <p className={styles.window}>Request by {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(returnWindowEndsAt))}.</p>
            )}

            <form onSubmit={submit} className={styles.form}>
              <div className={styles.choiceGrid}>
                <button type="button" className={type === "EXCHANGE" ? styles.choiceActive : styles.choice} onClick={() => setType("EXCHANGE")}>
                  <ArrowLeftRight size={18} />
                  <strong>Exchange</strong>
                  <span>Choose another available size.</span>
                </button>
                <button type="button" className={type === "RETURN" ? styles.choiceActive : styles.choice} onClick={() => setType("RETURN")}>
                  <RotateCcw size={18} />
                  <strong>Return</strong>
                  <span>Choose where you want the refund.</span>
                </button>
              </div>

              <label>
                Why are you {type === "RETURN" ? "returning" : "exchanging"} this item?
                <select value={reason} onChange={(event) => setReason(event.target.value)}>
                  {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              {item.returnableQuantity > 1 && (
                <label>
                  Quantity
                  <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>
                    {Array.from({ length: item.returnableQuantity }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              )}

              {type === "EXCHANGE" && (
                <label>
                  Replacement size
                  <select value={requestedSize} onChange={(event) => setRequestedSize(event.target.value)} required>
                    <option value="" disabled>Choose size</option>
                    {item.exchangeSizes.map((size) => <option key={size} value={size}>{size}{size === item.size ? " (same size)" : ""}</option>)}
                  </select>
                </label>
              )}

              {type === "RETURN" && (
                <fieldset className={styles.refundOptions}>
                  <legend>Refund to</legend>
                  <label className={refundDestination === "WALLET" ? styles.refundActive : styles.refund}>
                    <input type="radio" name="refund" checked={refundDestination === "WALLET"} onChange={() => setRefundDestination("WALLET")} />
                    <WalletCards size={18} />
                    <span><strong>HIDI Wallet</strong><small>Fastest — credited instantly after HIDI approves the returned item.</small></span>
                  </label>
                  <label className={refundDestination === "ORIGINAL" ? styles.refundActive : styles.refund}>
                    <input type="radio" name="refund" checked={refundDestination === "ORIGINAL"} onChange={() => setRefundDestination("ORIGINAL")} />
                    <RotateCcw size={18} />
                    <span><strong>Original payment source</strong><small>Processed after approval; bank/payment-provider timelines apply.</small></span>
                  </label>
                  <p className={styles.amount}>Estimated item refund: {formatPaise(Math.floor((item.totalPaise * quantity) / item.quantity))}</p>
                </fieldset>
              )}

              <label>
                Anything else we should know? <span>(optional)</span>
                <textarea value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={600} rows={3} placeholder="Add a short note…" />
              </label>

              {error && <p className={styles.error}>{error}</p>}

              <button type="submit" className={styles.submit} disabled={busy || (type === "EXCHANGE" && !requestedSize)}>
                {busy ? "Submitting…" : `Request ${type === "RETURN" ? "return" : "exchange"}`}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
