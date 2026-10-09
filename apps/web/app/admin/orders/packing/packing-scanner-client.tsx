"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import styles from "./packing-scanner.module.css";

type PackingItem = {
  id: string;
  barcode: string;
  sku: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  image?: string | null;
};

type PackingOrder = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  customerPhone: string;
  totalPaise: number;
  itemCount: number;
  items: PackingItem[];
};

type QueueOrder = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  customerPhone: string;
  itemCount: number;
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function beep(ok: boolean) {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (ok ? 0.08 : 0.18));
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Audio feedback is optional; visual feedback remains available.
  }
}

export function PackingScannerClient({ initialOrderNumber = "" }: { initialOrderNumber?: string }) {
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [order, setOrder] = useState<PackingOrder | null>(null);
  const [queue, setQueue] = useState<QueueOrder[]>([]);
  const [scanValue, setScanValue] = useState("");
  const [scans, setScans] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [packing, setPacking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const focusScanner = useCallback(() => {
    window.setTimeout(() => scanRef.current?.focus(), 40);
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/orders?status=CONFIRMED", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setQueue((body.orders ?? []).slice(0, 40));
    } catch {
      // Queue is a convenience. Direct order loading still works.
    }
  }, []);

  const loadOrder = useCallback(async (value: string) => {
    const target = value.trim();
    if (!target) return;
    setLoading(true);
    setPacking(false);
    setError(null);
    setNotice(null);
    setScans([]);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(target)}/packing`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to load packing order");
      const loaded = body.order as PackingOrder;
      setOrder(loaded);
      setOrderNumber(loaded.orderNumber);

      if (loaded.status === "CONFIRMED") {
        try {
          const stored = JSON.parse(window.localStorage.getItem(`hidi-packing:${loaded.orderNumber}`) ?? "[]");
          const allowed = new Map<string, number>();
          for (const item of loaded.items) allowed.set(item.barcode, (allowed.get(item.barcode) ?? 0) + item.quantity);
          const restored: string[] = [];
          const used = new Map<string, number>();
          for (const raw of Array.isArray(stored) ? stored : []) {
            const barcode = String(raw).trim().toUpperCase();
            const next = (used.get(barcode) ?? 0) + 1;
            if ((allowed.get(barcode) ?? 0) >= next) {
              restored.push(barcode);
              used.set(barcode, next);
            }
          }
          setScans(restored);
        } catch {
          setScans([]);
        }
      } else if (loaded.status === "PACKED") {
        setNotice("This order is already packed.");
      } else {
        setError(`Scanner packing is available only for CONFIRMED orders. Current status: ${label(loaded.status)}.`);
      }
    } catch (reason) {
      setOrder(null);
      setError(reason instanceof Error ? reason.message : "Unable to load packing order");
    } finally {
      setLoading(false);
      focusScanner();
    }
  }, [focusScanner]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (initialOrderNumber) void loadOrder(initialOrderNumber);
  }, [initialOrderNumber, loadOrder]);

  useEffect(() => {
    if (!order || order.status !== "CONFIRMED") return;
    window.localStorage.setItem(`hidi-packing:${order.orderNumber}`, JSON.stringify(scans));
  }, [order, scans]);

  const requiredByBarcode = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of order?.items ?? []) map.set(item.barcode, (map.get(item.barcode) ?? 0) + item.quantity);
    return map;
  }, [order]);

  const scannedByBarcode = useMemo(() => {
    const map = new Map<string, number>();
    for (const barcode of scans) map.set(barcode, (map.get(barcode) ?? 0) + 1);
    return map;
  }, [scans]);

  const progress = order?.itemCount ? Math.min(100, Math.round((scans.length / order.itemCount) * 100)) : 0;

  async function completePacking(nextScans: string[]) {
    if (!order || packing) return;
    setPacking(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}/packing/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scannedBarcodes: nextScans }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to complete packing");

      window.localStorage.removeItem(`hidi-packing:${order.orderNumber}`);
      setOrder((current) => current ? { ...current, status: "PACKED" } : current);
      setNotice(`✓ ${order.orderNumber} packed successfully. Status changed CONFIRMED → PACKED.`);
      beep(true);
      await loadQueue();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete packing");
      beep(false);
    } finally {
      setPacking(false);
      focusScanner();
    }
  }

  function acceptScan(raw: string) {
    if (!order || order.status !== "CONFIRMED" || packing) return;
    const barcode = raw.trim().toUpperCase();
    setScanValue("");
    setError(null);
    setNotice(null);

    if (!/^H[A-Z0-9]{12}$/.test(barcode)) {
      setError("Barcode not recognised. Scan a HIDI price-tag barcode.");
      beep(false);
      focusScanner();
      return;
    }

    const required = requiredByBarcode.get(barcode) ?? 0;
    if (!required) {
      setError(`Wrong item: ${barcode} is not part of order ${order.orderNumber}.`);
      beep(false);
      focusScanner();
      return;
    }

    const alreadyScanned = scannedByBarcode.get(barcode) ?? 0;
    if (alreadyScanned >= required) {
      setError(`Extra scan rejected. This SKU already has all ${required} required piece${required === 1 ? "" : "s"}.`);
      beep(false);
      focusScanner();
      return;
    }

    const nextScans = [...scans, barcode];
    setScans(nextScans);
    beep(true);

    if (nextScans.length === order.itemCount) {
      const complete = [...requiredByBarcode.entries()].every(
        ([code, quantity]) => nextScans.filter((scan) => scan === code).length === quantity,
      );
      if (complete) void completePacking(nextScans);
    }
    focusScanner();
  }

  function onScannerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      acceptScan(scanValue);
    }
  }

  function resetScans() {
    if (!order || packing) return;
    setScans([]);
    setError(null);
    setNotice("Scan progress cleared for this order.");
    window.localStorage.removeItem(`hidi-packing:${order.orderNumber}`);
    focusScanner();
  }

  function chooseOrder(number: string) {
    setOrderNumber(number);
    void loadOrder(number);
  }

  return (
    <main className={styles.page} onClick={focusScanner}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>HIDI ADMIN</p>
          <AdminNav />
        </div>
        <Link href="/admin/orders">← Orders</Link>
      </header>

      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>WAREHOUSE · SCANNER MODE</p>
          <h1>Packing scanner</h1>
          <p>Choose a confirmed order, then scan every physical HIDI price tag. The order becomes PACKED only after an exact item and quantity match.</p>
        </div>
        <div className={styles.scannerBadge}>2D / 1D USB SCANNER READY</div>
      </section>

      <section className={styles.orderPicker}>
        <form onSubmit={(event: FormEvent) => { event.preventDefault(); void loadOrder(orderNumber); }}>
          <label>
            <span>Order number</span>
            <input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="HIDI…" autoComplete="off" />
          </label>
          <button type="submit" disabled={loading}>{loading ? "Loading…" : "Load order"}</button>
        </form>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <div className={styles.layout}>
        <section className={styles.workspace}>
          {!order ? (
            <div className={styles.empty}>
              <strong>Select a confirmed order to begin.</strong>
              <span>The scanner input will stay focused automatically.</span>
            </div>
          ) : (
            <>
              <div className={styles.orderHeader}>
                <div>
                  <p className={styles.eyebrow}>ORDER</p>
                  <h2>{order.orderNumber}</h2>
                  <span>{order.customerPhone} · {money(order.totalPaise)}</span>
                </div>
                <div className={styles.orderStatus} data-status={order.status}>{label(order.status)}</div>
              </div>

              <div className={styles.progressBlock}>
                <div>
                  <strong>{scans.length} / {order.itemCount} pieces verified</strong>
                  <span>{order.status === "CONFIRMED" ? "Scan each garment tag once per physical piece." : "Packing scan complete."}</span>
                </div>
                <div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div>
              </div>

              <label className={styles.scanField} data-disabled={order.status !== "CONFIRMED" || packing}>
                <span>{packing ? "Completing pack…" : "SCAN HIDI PRICE TAG"}</span>
                <input
                  ref={scanRef}
                  value={scanValue}
                  onChange={(event) => setScanValue(event.target.value)}
                  onKeyDown={onScannerKeyDown}
                  disabled={order.status !== "CONFIRMED" || packing}
                  placeholder="Scanner input stays here"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <small>Scanner should send Enter after each barcode. Tab is also accepted.</small>
              </label>

              <div className={styles.items}>
                {order.items.map((item) => {
                  const scanned = scannedByBarcode.get(item.barcode) ?? 0;
                  const complete = scanned >= item.quantity;
                  return (
                    <article className={styles.item} data-complete={complete} key={item.id}>
                      {item.image ? <img src={item.image} alt="" /> : <div className={styles.imageFallback}>H</div>}
                      <div className={styles.itemInfo}>
                        <strong>{item.productName}</strong>
                        <span>{item.color} · Size {item.size}</span>
                        <small>SKU {item.sku}</small>
                        <small>{item.barcode}</small>
                      </div>
                      <div className={styles.itemCount}>
                        <strong>{scanned} / {item.quantity}</strong>
                        <span>{complete ? "Verified" : "Scan pending"}</span>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className={styles.actions}>
                <button type="button" onClick={resetScans} disabled={packing || scans.length === 0 || order.status !== "CONFIRMED"}>Reset scans</button>
                <Link href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}>Open order details →</Link>
              </div>
            </>
          )}
        </section>

        <aside className={styles.queue}>
          <div className={styles.queueHeader}>
            <div><p className={styles.eyebrow}>QUEUE</p><h2>Confirmed orders</h2></div>
            <button type="button" onClick={() => void loadQueue()}>Refresh</button>
          </div>
          {queue.length === 0 ? <div className={styles.queueEmpty}>No confirmed orders waiting.</div> : queue.map((entry) => (
            <button
              type="button"
              className={styles.queueRow}
              data-active={entry.orderNumber === order?.orderNumber}
              onClick={() => chooseOrder(entry.orderNumber)}
              key={entry.id}
            >
              <span><strong>{entry.orderNumber}</strong><small>{entry.customerPhone}</small></span>
              <b>{entry.itemCount} pc</b>
            </button>
          ))}
        </aside>
      </div>
    </main>
  );
}
