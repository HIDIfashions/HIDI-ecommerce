"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import styles from "./scan-pack.module.css";

type PackItem = {
  id: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  image?: string | null;
};

type PackOrder = {
  id: string;
  orderNumber: string;
  status: string;
  itemCount: number;
  customerPhone: string;
  items: PackItem[];
  shipment?: {
    provider?: string | null;
    awb?: string | null;
    trackingUrl?: string | null;
    status?: string | null;
  } | null;
};

function normalizeOrderScan(raw: string) {
  let value = raw.trim();
  value = value.replace(/^HIDI-ORDER:/i, "").replace(/^ORDER:/i, "").trim();

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      const parts = url.pathname.split("/").filter(Boolean);
      value = decodeURIComponent(parts.at(-1) ?? value);
    }
  } catch {
    // Treat non-URL scans as a plain order number.
  }

  return value;
}

function normalizeSkuScan(raw: string) {
  return raw
    .trim()
    .replace(/^HIDI-SKU:/i, "")
    .replace(/^SKU:/i, "")
    .trim()
    .toUpperCase();
}

function quantityBySku(items: PackItem[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const sku = item.sku.trim().toUpperCase();
    map.set(sku, (map.get(sku) ?? 0) + item.quantity);
  }
  return map;
}

export function ScanPackClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [orderInput, setOrderInput] = useState("");
  const [skuInput, setSkuInput] = useState("");
  const [order, setOrder] = useState<PackOrder | null>(null);
  const [scans, setScans] = useState<string[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const orderRef = useRef<HTMLInputElement>(null);
  const skuRef = useRef<HTMLInputElement>(null);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/orders?status=CONFIRMED&q=__scan_pack_session_check__", {
        cache: "no-store",
      });
      setAuthenticated(response.status !== 401);
    } catch {
      setAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (authenticated && !order) orderRef.current?.focus();
  }, [authenticated, order]);

  useEffect(() => {
    if (order?.status === "CONFIRMED") skuRef.current?.focus();
  }, [order]);

  const expected = useMemo(() => quantityBySku(order?.items ?? []), [order]);

  const scannedCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const sku of scans) map.set(sku, (map.get(sku) ?? 0) + 1);
    return map;
  }, [scans]);

  const scannedTotal = scans.length;
  const expectedTotal = order?.itemCount ?? 0;
  const fullyVerified = Boolean(
    order &&
      order.status === "CONFIRMED" &&
      expectedTotal > 0 &&
      scannedTotal === expectedTotal &&
      [...expected.entries()].every(([sku, qty]) => (scannedCounts.get(sku) ?? 0) === qty),
  );

  async function unlock(event: FormEvent) {
    event.preventDefault();
    const key = draftKey.trim();
    if (!key) return;

    setError(null);
    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAuthenticated(false);
      setError(body?.message ?? "Unable to sign in");
      return;
    }

    setDraftKey("");
    setAuthenticated(true);
    window.setTimeout(() => orderRef.current?.focus(), 30);
  }

  async function loadOrder(event: FormEvent) {
    event.preventDefault();
    const orderNumber = normalizeOrderScan(orderInput);
    if (!orderNumber) return;

    setLoadingOrder(true);
    setError(null);
    setNotice(null);
    setOrder(null);
    setScans([]);

    try {
      const response = await fetch("/api/admin/orders/" + encodeURIComponent(orderNumber), {
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));

      if (response.status === 401) {
        setAuthenticated(false);
        throw new Error("Admin session expired");
      }
      if (!response.ok) throw new Error(body?.message ?? "Order not found");

      const loaded = body.order as PackOrder;
      setOrder(loaded);
      setOrderInput("");

      if (loaded.status !== "CONFIRMED") {
        setError(
          loaded.status === "PACKED"
            ? "This order is already packed. Scan another order."
            : "This order cannot enter Scan & Pack while its status is " + loaded.status + ".",
        );
      } else {
        setNotice(
          "Order " +
            loaded.orderNumber +
            " loaded. Scan " +
            loaded.itemCount +
            " item" +
            (loaded.itemCount === 1 ? "" : "s") +
            ".",
        );
        navigator.vibrate?.(35);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load order");
      window.setTimeout(() => orderRef.current?.focus(), 30);
    } finally {
      setLoadingOrder(false);
    }
  }

  function scanSku(event: FormEvent) {
    event.preventDefault();
    if (!order || order.status !== "CONFIRMED") return;

    const sku = normalizeSkuScan(skuInput);
    setSkuInput("");
    setError(null);
    setNotice(null);

    if (!sku) {
      skuRef.current?.focus();
      return;
    }

    const expectedQty = expected.get(sku);
    if (!expectedQty) {
      setError("Wrong item: " + sku + " is not part of order " + order.orderNumber + ".");
      navigator.vibrate?.([100, 60, 100]);
      skuRef.current?.focus();
      return;
    }

    const currentQty = scannedCounts.get(sku) ?? 0;
    if (currentQty >= expectedQty) {
      setError(
        "Extra scan blocked: " +
          sku +
          " already has all " +
          expectedQty +
          " required piece" +
          (expectedQty === 1 ? "" : "s") +
          ".",
      );
      navigator.vibrate?.([100, 60, 100]);
      skuRef.current?.focus();
      return;
    }

    setScans((current) => [...current, sku]);
    setNotice("Verified " + sku + " · " + (scannedTotal + 1) + " of " + expectedTotal);
    navigator.vibrate?.(35);
    window.setTimeout(() => skuRef.current?.focus(), 10);
  }

  function undoLastScan() {
    if (!scans.length) return;
    const removed = scans.at(-1);
    setScans((current) => current.slice(0, -1));
    setError(null);
    setNotice(removed ? "Removed last scan: " + removed : null);
    window.setTimeout(() => skuRef.current?.focus(), 10);
  }

  function resetStation() {
    setOrder(null);
    setScans([]);
    setSkuInput("");
    setOrderInput("");
    setError(null);
    setNotice(null);
    window.setTimeout(() => orderRef.current?.focus(), 30);
  }

  async function completePack() {
    if (!order || !fullyVerified) return;

    setCompleting(true);
    setError(null);
    setNotice("Verifying pack on the server…");

    try {
      const response = await fetch(
        "/api/admin/orders/" + encodeURIComponent(order.orderNumber) + "/scan-pack",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scans }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to complete pack");

      setOrder((current) => (current ? { ...current, status: "PACKED" } : current));
      setNotice("Pack verified. HIDI is creating the Delhivery shipment…");

      const manifestResponse = await fetch(
        "/api/admin/orders/" + encodeURIComponent(order.orderNumber) + "/delhivery/manifest",
        { method: "POST" },
      );
      const manifestBody = await manifestResponse.json().catch(() => ({}));

      if (manifestResponse.ok) {
        const createdAwb = manifestBody?.shipment?.awb;
        setOrder((current) =>
          current
            ? {
                ...current,
                shipment: {
                  ...(current.shipment ?? {}),
                  provider: "DELHIVERY",
                  awb: createdAwb ?? null,
                  trackingUrl: manifestBody?.shipment?.trackingUrl ?? null,
                  status: manifestBody?.shipment?.status ?? "READY_TO_SHIP",
                },
              }
            : current,
        );
        setNotice(
          createdAwb
            ? "Pack complete · Delhivery AWB " + createdAwb + " created. Ready for the next order."
            : "Pack complete · Delhivery shipment created. Ready for the next order.",
        );
      } else {
        setNotice(
          "Pack complete. Courier creation needs attention: " +
            (manifestBody?.message ?? "Delhivery shipment was not created"),
        );
      }

      navigator.vibrate?.([45, 35, 45]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete pack");
      navigator.vibrate?.([120, 60, 120]);
    } finally {
      setCompleting(false);
    }
  }

  if (authenticated === null) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.loginCard}>Checking admin session…</section>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.loginCard}>
          <p className={styles.eyebrow}>HIDI OPERATIONS</p>
          <h1>Scan & Pack</h1>
          <p>Enter the admin key once, then keep the scanner focused on the packing station.</p>
          {error && <div className={styles.error}>{error}</div>}
          <form className={styles.loginForm} onSubmit={unlock}>
            <input
              type="password"
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              placeholder="Admin key"
              autoComplete="current-password"
              autoFocus
            />
            <button type="submit">Open pack station</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.adminTopbar}>
        <div>
          <p className={styles.eyebrow}>HIDI ADMIN</p>
          <AdminNav />
        </div>
        <div className={styles.stationState}>2D SCANNER MODE</div>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>FULFILMENT</p>
          <h1>Scan & Pack</h1>
          <p>
            Scan the order first, then every garment going into the parcel.
            Wrong SKU, colour, size or extra quantity is blocked.
          </p>
        </div>
        <div className={styles.scannerTip}>
          <strong>Scanner setup</strong>
          <span>USB/Bluetooth HID mode · send Enter after each scan</span>
        </div>
      </section>

      {!order && (
        <section className={styles.orderScanCard}>
          <p className={styles.step}>STEP 1</p>
          <h2>Scan order</h2>
          <form onSubmit={loadOrder}>
            <input
              ref={orderRef}
              value={orderInput}
              onChange={(event) => setOrderInput(event.target.value)}
              placeholder="Scan order barcode or type order number"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={loadingOrder}>
              {loadingOrder ? "Opening…" : "Open order"}
            </button>
          </form>
          <small>
            Accepted test values: plain order number, ORDER:&lt;number&gt; or HIDI-ORDER:&lt;number&gt;.
          </small>
        </section>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      {order && (
        <>
          <section className={styles.orderHeader}>
            <div>
              <span>ORDER</span>
              <strong>{order.orderNumber}</strong>
            </div>
            <div>
              <span>STATUS</span>
              <strong>{order.status.replaceAll("_", " ")}</strong>
            </div>
            <div>
              <span>PROGRESS</span>
              <strong>{Math.min(scannedTotal, expectedTotal)} / {expectedTotal}</strong>
            </div>
            <Link href={"/admin/orders/" + encodeURIComponent(order.orderNumber)}>View order →</Link>
          </section>

          {order.status === "CONFIRMED" && (
            <section className={styles.workspace}>
              <div className={styles.scanPanel}>
                <p className={styles.step}>STEP 2</p>
                <h2>Scan garments</h2>
                <div
                  className={styles.progressTrack}
                  aria-label={scannedTotal + " of " + expectedTotal + " items verified"}
                >
                  <span
                    style={{
                      width: expectedTotal
                        ? Math.min(100, (scannedTotal / expectedTotal) * 100) + "%"
                        : "0%",
                    }}
                  />
                </div>

                <form className={styles.skuForm} onSubmit={scanSku}>
                  <input
                    ref={skuRef}
                    value={skuInput}
                    onChange={(event) => setSkuInput(event.target.value)}
                    placeholder="Scanner ready — scan SKU"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="submit">Verify</button>
                </form>

                <div className={styles.scanActions}>
                  <button type="button" onClick={undoLastScan} disabled={!scans.length}>
                    Undo last scan
                  </button>
                  <button type="button" onClick={resetStation}>
                    Cancel / scan another order
                  </button>
                </div>

                <div className={styles.itemList}>
                  {order.items.map((item) => {
                    const sku = item.sku.trim().toUpperCase();
                    const scanned = scannedCounts.get(sku) ?? 0;
                    const complete = scanned === item.quantity;
                    return (
                      <div
                        className={styles.itemRow + (complete ? " " + styles.itemComplete : "")}
                        key={item.id}
                      >
                        <div className={styles.itemImage}>
                          {item.image ? <img src={item.image} alt="" /> : <span>H</span>}
                        </div>
                        <div className={styles.itemCopy}>
                          <strong>{item.productName}</strong>
                          <span>{item.color} · Size {item.size}</span>
                          <code>{item.sku}</code>
                        </div>
                        <div className={styles.itemCount}>
                          <span>{scanned} / {item.quantity}</span>
                          <small>{complete ? "VERIFIED" : "WAITING"}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside className={styles.completePanel}>
                <p className={styles.step}>STEP 3</p>
                <h2>{fullyVerified ? "Pack verified" : "Complete every scan"}</h2>
                <p>
                  {fullyVerified
                    ? "Every SKU and quantity matches the customer order. Complete packing to lock verification."
                    : "The completion button stays locked until the scanned contents exactly match the order."}
                </p>
                <button
                  type="button"
                  className={styles.completeButton}
                  disabled={!fullyVerified || completing}
                  onClick={() => void completePack()}
                >
                  {completing ? "Completing pack…" : "Complete pack"}
                </button>
              </aside>
            </section>
          )}

          {order.status === "PACKED" && (
            <section className={styles.doneCard}>
              <span className={styles.doneMark}>✓</span>
              <div>
                <p className={styles.step}>PACK COMPLETE</p>
                <h2>{order.orderNumber} is verified and packed.</h2>
                {order.shipment?.awb ? (
                  <p>Delhivery AWB: <strong>{order.shipment.awb}</strong></p>
                ) : (
                  <p>The pack is complete. Courier creation can be retried from the order page if needed.</p>
                )}
              </div>
              <button type="button" onClick={resetStation}>Scan next order</button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
