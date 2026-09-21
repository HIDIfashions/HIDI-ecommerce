"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { Code128Barcode } from "@/components/admin/code128-barcode";
import styles from "./labels.module.css";

type InventoryRow = {
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  available: number;
  onHand: number;
  imageUrl?: string | null;
};

type QueueItem = InventoryRow & { quantity: number };

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

export function AdminLabelsClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [labelSize, setLabelSize] = useState<"50x30" | "50x25">("50x30");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInventory = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch("/api/admin/inventory?" + params.toString(), { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthenticated(false);
        setRows([]);
        return;
      }
      if (!response.ok) throw new Error(body?.message ?? "Unable to load SKUs");
      setAuthenticated(true);
      setRows(body.rows ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load SKUs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

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
    await loadInventory();
  }

  function search(event: FormEvent) {
    event.preventDefault();
    void loadInventory(query);
  }

  function addToQueue(row: InventoryRow) {
    setQueue((current) => {
      const existing = current.find((item) => item.variantId === row.variantId);
      if (existing) {
        return current.map((item) =>
          item.variantId === row.variantId
            ? { ...item, quantity: clampQuantity(item.quantity + 1) }
            : item,
        );
      }
      return [...current, { ...row, quantity: 1 }];
    });
  }

  function setQueueQuantity(variantId: string, value: number) {
    setQueue((current) =>
      current.map((item) =>
        item.variantId === variantId ? { ...item, quantity: clampQuantity(value) } : item,
      ),
    );
  }

  function removeFromQueue(variantId: string) {
    setQueue((current) => current.filter((item) => item.variantId !== variantId));
  }

  const printableLabels = useMemo(
    () =>
      queue.flatMap((item) =>
        Array.from({ length: item.quantity }, (_, index) => ({
          key: item.variantId + "-" + index,
          value: "HIDI-SKU:" + item.sku,
          humanValue: item.sku,
          title: item.productName,
          meta: item.color + " · Size " + item.size,
        })),
      ),
    [queue],
  );

  const totalLabels = printableLabels.length;

  function printLabels() {
    if (!totalLabels) return;
    window.print();
  }

  if (authenticated === null) {
    return <main className={styles.loginPage}><section className={styles.loginCard}>Checking admin session…</section></main>;
  }

  if (!authenticated) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.loginCard}>
          <p className={styles.eyebrow}>HIDI OPERATIONS</p>
          <h1>Product labels</h1>
          <p>Sign in to generate SKU labels for received inventory.</p>
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
            <button type="submit">Open product labels</button>
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
      </header>

      <section className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>INVENTORY</p>
          <h1>Product barcode labels</h1>
          <p>
            SKU labels are for garments and stock. Order labels are generated automatically inside Admin → Orders.
          </p>
        </div>
        <div className={styles.printControls}>
          <label>
            <span>Label size</span>
            <select value={labelSize} onChange={(event) => setLabelSize(event.target.value as "50x30" | "50x25")}>
              <option value="50x30">50 × 30 mm</option>
              <option value="50x25">50 × 25 mm</option>
            </select>
          </label>
          <button type="button" onClick={printLabels} disabled={!totalLabels}>
            Print {totalLabels || ""} label{totalLabels === 1 ? "" : "s"}
          </button>
        </div>
      </section>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.workspace}>
        <div className={styles.cataloguePanel}>
          <form className={styles.searchForm} onSubmit={search}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product, SKU or colour"
            />
            <button type="submit">{loading ? "Searching…" : "Search"}</button>
          </form>

          <div className={styles.resultList}>
            {rows.map((row) => (
              <div className={styles.resultRow} key={row.variantId}>
                <div className={styles.thumb}>
                  {row.imageUrl ? <img src={row.imageUrl} alt="" /> : <span>H</span>}
                </div>
                <div className={styles.resultCopy}>
                  <strong>{row.productName}</strong>
                  <span>{row.color} · Size {row.size}</span>
                  <code>{row.sku}</code>
                </div>
                <div className={styles.stock}>
                  <span>{row.available} sellable</span>
                  <small>{row.onHand} on hand</small>
                </div>
                <button type="button" onClick={() => addToQueue(row)}>Add</button>
              </div>
            ))}
            {!loading && rows.length === 0 && <div className={styles.empty}>No SKUs match your search.</div>}
          </div>
        </div>

        <aside className={styles.queuePanel}>
          <div className={styles.queueHeader}>
            <div>
              <p className={styles.eyebrow}>PRINT QUEUE</p>
              <h2>{queue.length} SKU{queue.length === 1 ? "" : "s"}</h2>
            </div>
            {queue.length > 0 && <button type="button" onClick={() => setQueue([])}>Clear</button>}
          </div>

          {queue.length === 0 ? (
            <p className={styles.queueEmpty}>Add one or more SKUs, then choose how many garment labels to print.</p>
          ) : (
            <div className={styles.queueList}>
              {queue.map((item) => (
                <div className={styles.queueRow} key={item.variantId}>
                  <div>
                    <strong>{item.sku}</strong>
                    <span>{item.productName} · {item.color} / {item.size}</span>
                  </div>
                  <label>
                    <span>Labels</span>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={item.quantity}
                      onChange={(event) => setQueueQuantity(item.variantId, Number(event.target.value))}
                    />
                  </label>
                  <button type="button" onClick={() => removeFromQueue(item.variantId)} aria-label={"Remove " + item.sku}>×</button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewHeader}>
          <div>
            <p className={styles.eyebrow}>PRINT PREVIEW</p>
            <h2>{totalLabels} product label{totalLabels === 1 ? "" : "s"}</h2>
          </div>
          <small>Use printer scaling at 100%. Disable “fit to page” on a label printer.</small>
        </div>

        <div className={styles.labelSheet + " " + styles["size" + labelSize.replace("x", "_")]}>
          {printableLabels.map((label) => (
            <article className={styles.label} key={label.key}>
              <div className={styles.brandRow}>
                <strong>HIDI</strong>
                <span>PRODUCT</span>
              </div>
              <Code128Barcode className={styles.barcode} value={label.value} height={46} />
              <div className={styles.humanValue}>{label.humanValue}</div>
              <div className={styles.labelTitle}>{label.title}</div>
              <div className={styles.labelMeta}>{label.meta}</div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
