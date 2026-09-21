"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./order-detail.module.css";
import { AdminReturnRequests, type AdminReturnRequest } from "./admin-return-requests";
import { OrderBarcodeLabel } from "@/components/admin/order-barcode-label";

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
  returnCount?: number;
  activeReturnCount?: number;
  afterSalesStatus?: string | null;
  returns?: AdminReturnRequest[];
  auditEvents?: Array<{
    id: string;
    eventType: string;
    actorType: string;
    actorId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    amountPaise?: number | null;
    correlationId?: string | null;
    source?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
  }>;
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

const COURIERS = ["Delhivery", "Blue Dart", "DTDC", "Xpressbees", "Ecom Express", "India Post", "Other"];

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

function auditTitle(eventType: string) {
  const labels: Record<string, string> = {
    ORDER_CREATED: "Order created",
    CURRENT_STATE_BASELINE: "Existing order state recorded",
    PAYMENT_CAPTURED: "Payment captured",
    ORDER_CONFIRMED: "Order confirmed",
    PAYMENT_REVIEW_REQUIRED: "Payment review required",
    PACK_VERIFIED: "Pack verified by barcode scan",
    ORDER_PACKED: "Order packed",
    SHIPMENT_PREPARED: "Shipment prepared",
    ORDER_SHIPPED: "Order shipped",
    ORDER_DELIVERED: "Order delivered",
    RETURN_REQUESTED: "Return requested",
    EXCHANGE_REQUESTED: "Exchange requested",
    RETURN_APPROVED: "Return approved",
    EXCHANGE_APPROVED: "Exchange approved",
    RETURN_REJECTED: "Return rejected",
    EXCHANGE_REJECTED: "Exchange rejected",
    RETURN_CANCELLED: "Return cancelled",
    EXCHANGE_CANCELLED: "Exchange cancelled",
    RETURN_PICKUP_SCHEDULED: "Return pickup scheduled",
    EXCHANGE_PICKUP_SCHEDULED: "Exchange pickup scheduled",
    RETURN_RECEIVED: "Returned item received",
    EXCHANGE_RECEIVED: "Exchange item received",
    REFUND_INITIATED: "Refund initiated",
    REFUND_PROVIDER_ACCEPTED: "Refund accepted by Razorpay",
    REFUND_PROVIDER_FAILED: "Refund provider attempt failed",
    REFUND_REVIEW_REQUIRED: "Refund requires review",
    RETURN_REFUNDED: "Return refunded",
    EXCHANGE_SHIPPED: "Replacement shipped",
    EXCHANGE_COMPLETED: "Exchange completed",
    PAYMENT_REFUNDED: "Payment refunded",
    PAYMENT_PARTIALLY_REFUNDED: "Payment partially refunded",
  };
  return labels[eventType] ?? label(eventType).toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function auditDetail(event: NonNullable<AdminOrder["auditEvents"]>[number]) {
  const parts: string[] = [];
  if (event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus) {
    parts.push(`${label(event.fromStatus)} → ${label(event.toStatus)}`);
  } else if (event.toStatus) {
    parts.push(label(event.toStatus));
  }
  if (event.amountPaise) parts.push(money(event.amountPaise));
  if (event.actorType === "CUSTOMER") parts.push("Customer");
  if (event.actorType === "ADMIN") parts.push("HIDI Admin");
  if (event.actorType === "PROVIDER") parts.push(event.actorId ?? "Provider");
  if (event.actorType === "SYSTEM") parts.push("System");
  return parts.join(" · ");
}

export function AdminOrderDetailClient({ orderNumber }: { orderNumber: string }) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [savingShipment, setSavingShipment] = useState(false);
  const [checkingDelhivery, setCheckingDelhivery] = useState(false);
  const [creatingDelhivery, setCreatingDelhivery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [serviceability, setServiceability] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [awb, setAwb] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to load order");
      const loaded = body.order ?? null;
      setOrder(loaded);
      if (loaded?.shipment) {
        setProvider(loaded.shipment.provider ?? "");
        setAwb(loaded.shipment.awb ?? "");
        setTrackingUrl(loaded.shipment.trackingUrl ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load order");
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const shipmentReady = useMemo(
    () => Boolean(order?.shipment?.provider && order?.shipment?.awb && order?.shipment?.trackingUrl),
    [order],
  );

  async function checkDelhivery() {
    if (!order) return;
    setCheckingDelhivery(true);
    setError(null);
    setNotice(null);
    setServiceability(null);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}/delhivery/serviceability`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to check Delhivery serviceability");
      const mode = body.prepaid ? "Prepaid serviceable" : "Prepaid not serviceable";
      const cod = body.cod ? "COD available" : "COD unavailable";
      setServiceability(`${body.pin}: ${mode} · ${cod}${body.city ? ` · ${body.city}` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to check Delhivery serviceability");
    } finally {
      setCheckingDelhivery(false);
    }
  }

  async function createDelhiveryShipment() {
    if (!order) return;
    setCreatingDelhivery(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}/delhivery/manifest`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to create Delhivery shipment");
      const createdAwb = body?.shipment?.awb;
      setNotice(createdAwb ? `Delhivery test shipment created. AWB: ${createdAwb}` : "Delhivery test shipment created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create Delhivery shipment");
    } finally {
      setCreatingDelhivery(false);
    }
  }

  async function saveShipment(event: FormEvent) {
    event.preventDefault();
    if (!order) return;

    setSavingShipment(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}/shipment`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, awb, trackingUrl }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to save shipment details");
      setNotice("Shipment details saved. The order can now be marked as shipped.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save shipment details");
    } finally {
      setSavingShipment(false);
    }
  }

  async function advanceStatus() {
    if (!order) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;

    if (next === "SHIPPED" && !shipmentReady) {
      setError("Create a Delhivery shipment or save courier, AWB and tracking URL first.");
      return;
    }

    setUpdating(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to update order");
      setNotice(next === "SHIPPED" ? "Order marked as shipped." : `Order marked as ${label(next).toLowerCase()}.`);
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
  const activeReturnStatuses = ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUND_PROCESSING", "EXCHANGE_SHIPPED"];
  const activeReturns = (order.returns ?? []).filter((request) => activeReturnStatuses.includes(request.status));
  const activeReturn = activeReturns[0];
  const activeReturnQuantity = activeReturns.reduce((sum, request) => sum + request.quantity, 0);

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
          {activeReturn ? (
            <div className={styles.afterSalesHeader}>
              <span className={`${styles.status} ${styles.afterSalesStatus}`}>{activeReturnQuantity} of {order.itemCount} item{order.itemCount === 1 ? "" : "s"} · {activeReturn.type === "EXCHANGE" ? "Exchange" : "Return"} in progress</span>
              <small>{label(activeReturn.status)} · Fulfilment: {label(order.status)}</small>
            </div>
          ) : (
            <span className={`${styles.status} ${styles[`status${order.status}`] ?? ""}`}>{label(order.status)}</span>
          )}
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

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

          <AdminReturnRequests
            orderNumber={order.orderNumber}
            requests={order.returns ?? []}
            items={order.items}
            onUpdated={load}
          />

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
            <div className={styles.autoLabelHeader}>
              <div>
                <p className={styles.eyebrow}>ORDER BARCODE</p>
                <h2>Label ready</h2>
              </div>
              <span>AUTO</span>
            </div>
            <p className={styles.autoLabelNote}>
              Generated automatically from this confirmed HIDI order. Staff do not need to create it manually.
            </p>
            <OrderBarcodeLabel orderNumber={order.orderNumber} className={styles.orderBarcode} />
            <Link
              className={styles.printLabelAction}
              href={"/admin/orders/" + encodeURIComponent(order.orderNumber) + "/label"}
              target="_blank"
            >
              Print order label
            </Link>
          </section>

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

            {order.status === "PACKED" && !order.shipment?.awb && (
              <div className={styles.shippingForm}>
                <div className={styles.shippingHeader}>
                  <div>
                    <p className={styles.eyebrow}>DELHIVERY TEST API</p>
                    <strong>Create courier shipment automatically</strong>
                  </div>
                </div>
                <p className={styles.shipmentHint}>Destination PIN: {address.postalCode || "—"}. This uses the Delhivery staging account configured on the API server.</p>
                {serviceability && <div className={styles.serviceability}>{serviceability}</div>}
                <button className={styles.secondaryAction} type="button" onClick={() => void checkDelhivery()} disabled={checkingDelhivery}>
                  {checkingDelhivery ? "Checking…" : "Check Delhivery serviceability"}
                </button>
                <button className={styles.saveShipment} type="button" onClick={() => void createDelhiveryShipment()} disabled={creatingDelhivery}>
                  {creatingDelhivery ? "Creating shipment…" : "Create Delhivery test shipment"}
                </button>
              </div>
            )}

            {order.status === "PACKED" && !order.shipment?.awb && (
              <form className={styles.shippingForm} onSubmit={saveShipment}>
                <div className={styles.shippingHeader}>
                  <div>
                    <p className={styles.eyebrow}>MANUAL / OTHER COURIER</p>
                    <strong>Enter dispatch details manually</strong>
                  </div>
                </div>

                <label>
                  <span>Courier</span>
                  <select value={provider} onChange={(event) => setProvider(event.target.value)} required>
                    <option value="">Select courier</option>
                    {COURIERS.map((courier) => <option key={courier} value={courier}>{courier}</option>)}
                  </select>
                </label>

                <label>
                  <span>AWB / tracking number</span>
                  <input value={awb} onChange={(event) => setAwb(event.target.value)} placeholder="e.g. 123456789012" required />
                </label>

                <label>
                  <span>Tracking URL</span>
                  <input type="url" value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} placeholder="https://..." required />
                </label>

                <button className={styles.saveShipment} type="submit" disabled={savingShipment}>
                  {savingShipment ? "Saving…" : "Save shipping details"}
                </button>
              </form>
            )}

            {order.shipment?.awb && (
              <div className={styles.shipmentBox}>
                <span>Courier: <strong>{order.shipment.provider ?? "—"}</strong></span>
                <span>AWB: <strong>{order.shipment.awb ?? "—"}</strong></span>
                <span>Status: <strong>{label(order.shipment.status)}</strong></span>
                {order.shipment.trackingUrl && <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">Open tracking ↗</a>}
              </div>
            )}

            {order.status === "CONFIRMED" ? (
              <Link
                className={styles.scanPackAction}
                href={"/admin/fulfilment?order=" + encodeURIComponent(order.orderNumber)}
              >
                Scan & pack this order →
              </Link>
            ) : next ? (
              <button
                className={styles.primaryAction}
                type="button"
                onClick={() => void advanceStatus()}
                disabled={updating || (next === "SHIPPED" && !shipmentReady)}
                title={next === "SHIPPED" && !shipmentReady ? "Create or save shipping details first" : undefined}
              >
                {updating ? "Updating…" : next === "SHIPPED" && !shipmentReady ? "Create shipment first" : "Mark as " + label(next)}
              </button>
            ) : (
              <div className={styles.complete}>Fulfilment complete</div>
            )}
          </section>

          <section className={styles.card}>
            <p className={styles.eyebrow}>OPERATIONS TIMELINE</p>
            <h2>Order history</h2>
            {(order.auditEvents ?? []).length === 0 ? (
              <p className={styles.auditEmpty}>No audit events recorded yet.</p>
            ) : (
              <div className={styles.auditTimeline}>
                {[...(order.auditEvents ?? [])].reverse().map((event) => (
                  <div className={styles.auditEvent} key={event.id}>
                    <span className={styles.auditDot} aria-hidden="true" />
                    <div className={styles.auditContent}>
                      <strong>{auditTitle(event.eventType)}</strong>
                      {auditDetail(event) && <small>{auditDetail(event)}</small>}
                      <time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.card}>
            <p className={styles.eyebrow}>QUICK ACTIONS</p>
            <button className={styles.secondaryAction} type="button" onClick={() => navigator.clipboard.writeText(order.customerPhone)}>Copy phone</button>
            <button className={styles.secondaryAction} type="button" onClick={() => navigator.clipboard.writeText([address.line1, address.line2, address.landmark, address.city, address.state, address.postalCode, address.countryCode].filter(Boolean).join(", "))}>Copy address</button>
            <Link
              className={styles.secondaryLink}
              href={"/admin/orders/" + encodeURIComponent(order.orderNumber) + "/label"}
              target="_blank"
            >
              Print order label
            </Link>
            <button className={styles.secondaryAction} type="button" onClick={() => window.print()}>Print order</button>
          </section>
        </aside>
      </section>
    </main>
  );
}
