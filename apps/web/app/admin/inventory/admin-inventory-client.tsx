"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import styles from "./inventory.module.css";

type InventoryStatus = "HEALTHY" | "LOW" | "OUT";

type InventoryRow = {
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  active: boolean;
  onHand: number;
  reserved: number;
  safetyStock: number;
  reorderLevel: number;
  available: number;
  status: InventoryStatus;
  updatedAt: string;
  lastMovementAt: string | null;
  imageUrl?: string | null;
  photoCount?: number;
};

type InventoryResponse = {
  summary: {
    onHand: number;
    reserved: number;
    available: number;
    lowStock: number;
    outOfStock: number;
    variants: number;
  };
  rows: InventoryRow[];
};

type Movement = {
  id: string;
  delta: number;
  onHandBefore: number;
  onHandAfter: number;
  reason: string;
  note?: string | null;
  reference?: string | null;
  actor?: string | null;
  createdAt: string;
};

type AdjustmentForm = {
  operation: "RECEIVE" | "REMOVE" | "SET";
  quantity: string;
  reason: "RECEIPT" | "CORRECTION" | "DAMAGE" | "RETURN_RESTOCK" | "OTHER";
  reference: string;
  note: string;
  safetyStock: string;
  reorderLevel: string;
};

const emptyInventory: InventoryResponse = {
  summary: { onHand: 0, reserved: 0, available: 0, lowStock: 0, outOfStock: 0, variants: 0 },
  rows: [],
};

const FILTERS = ["ALL", "HEALTHY", "LOW", "OUT"] as const;

export function AdminInventoryClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [inventory, setInventory] = useState<InventoryResponse>(emptyInventory);
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InventoryRow | null>(null);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (committedQuery) params.set("q", committedQuery);
      if (status !== "ALL") params.set("status", status);

      const response = await fetch(`/api/admin/inventory?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthenticated(false);
        setInventory(emptyInventory);
        return;
      }
      if (!response.ok) throw new Error(body?.message ?? "Unable to load inventory");

      setAuthenticated(true);
      setInventory({ summary: body.summary ?? emptyInventory.summary, rows: body.rows ?? [] });
    } catch (caught) {
      setInventory(emptyInventory);
      setError(caught instanceof Error ? caught.message : "Unable to load inventory");
    } finally {
      setLoading(false);
    }
  }, [committedQuery, status]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    const key = draftKey.trim();
    if (!key) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to sign in");

      setDraftKey("");
      setAuthenticated(true);
      await loadInventory();
    } catch (caught) {
      setAuthenticated(false);
      setError(caught instanceof Error ? caught.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  async function lock() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    setAuthenticated(false);
    setInventory(emptyInventory);
    setError(null);
  }

  function search(event: FormEvent) {
    event.preventDefault();
    setCommittedQuery(query.trim());
  }

  if (authenticated === null) {
    return <main className={styles.loginPage}><section className={styles.loginCard}><p>Checking admin session…</p></section></main>;
  }

  if (!authenticated) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.loginCard}>
          <p className={styles.eyebrow}>HIDI OPERATIONS</p>
          <h1>Admin access</h1>
          <p>Enter the private admin key configured for this environment.</p>
          {error && <div className={styles.error} role="alert">{error}</div>}
          <form onSubmit={unlock} className={styles.loginForm}>
            <input type="password" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Admin key" autoComplete="current-password" autoFocus />
            <button type="submit" disabled={loading}>{loading ? "Opening…" : "Open dashboard"}</button>
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
          <nav aria-label="Admin navigation">
            <Link href="/admin/orders">Orders</Link>
            <Link href="/admin/products">Products</Link>
            <strong>Inventory</strong>
            <span>Customers</span>
          </nav>
        </div>
        <button className={styles.lockButton} type="button" onClick={() => void lock()}>Lock admin</button>
      </header>

      <section className={styles.pageHeader}>
        <div>
          <h1>Inventory</h1>
          <p>Live stock by product, colour and size. Checkout controls reserved pieces.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.receiveButton} href="/admin/inventory/receive">Receive stock</Link>
          <button className={styles.refreshButton} type="button" onClick={() => void loadInventory()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh stock"}
          </button>
        </div>
      </section>

      <section className={styles.stats} aria-label="Inventory totals">
        <Summary label="Pieces on hand" value={inventory.summary.onHand} detail={`${inventory.summary.variants} variants`} />
        <Summary label="Ready to sell" value={inventory.summary.available} detail="After reservations and safety stock" tone="good" />
        <Summary label="Reserved" value={inventory.summary.reserved} detail="Held by active checkouts" />
        <Summary label="Needs attention" value={inventory.summary.lowStock + inventory.summary.outOfStock} detail={`${inventory.summary.lowStock} low · ${inventory.summary.outOfStock} out`} tone="warning" />
      </section>

      <section className={styles.toolbar}>
        <form className={styles.searchForm} onSubmit={search}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, SKU or colour" />
          <button type="submit">Search</button>
        </form>
        <label className={styles.statusFilter}>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as (typeof FILTERS)[number])}>
            {FILTERS.map((filter) => <option key={filter} value={filter}>{filterLabel(filter)}</option>)}
          </select>
        </label>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {loading && inventory.rows.length === 0 && <div className={styles.loading}>Loading inventory…</div>}

      {!loading && inventory.rows.length === 0 ? (
        <div className={styles.empty}>No variants match the current filters.</div>
      ) : (
        <section className={styles.tableWrap}>
          <div className={styles.tableHeader}>
            <span>Product / SKU</span><span>Variant</span><span>On hand</span><span>Reserved</span><span>Sellable</span><span>Status</span><span />
          </div>
          {inventory.rows.map((row) => (
            <div className={styles.inventoryRow} key={row.variantId}>
              <div className={styles.productCell}>
                {row.imageUrl ? <img src={row.imageUrl} alt="" /> : <span className={styles.imagePlaceholder}>H</span>}
                <div><strong>{row.productName}</strong><small>{row.sku}</small><em>{row.photoCount ?? 0} SKU photo{row.photoCount === 1 ? "" : "s"}</em></div>
              </div>
              <div className={styles.variantCell}><span>{row.color}</span><b>{row.size}</b></div>
              <div className={styles.numberCell}>{row.onHand}</div>
              <div className={styles.numberCell}>{row.reserved}</div>
              <div className={styles.numberCell}>{row.available}</div>
              <div><StatusBadge status={row.status} /></div>
              <div className={styles.actionCell}><button type="button" onClick={() => setSelected(row)}>Adjust</button></div>
            </div>
          ))}
        </section>
      )}

      {selected && (
        <AdjustmentPanel
          row={selected}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(null);
            await loadInventory();
          }}
        />
      )}
    </main>
  );
}

function Summary({ label, value, detail, tone = "neutral" }: { label: string; value: number; detail: string; tone?: "neutral" | "good" | "warning" }) {
  return (
    <div className={`${styles.summary} ${styles[tone]}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString("en-IN")}</strong>
      <small>{detail}</small>
    </div>
  );
}

function StatusBadge({ status }: { status: InventoryStatus }) {
  return <span className={`${styles.status} ${styles[`status${status}`]}`}><i />{filterLabel(status)}</span>;
}

function filterLabel(value: string) {
  return ({ ALL: "All", HEALTHY: "Healthy", LOW: "Low stock", OUT: "Out of stock" } as Record<string, string>)[value] ?? value;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function AdjustmentPanel({ row, onClose, onSaved }: { row: InventoryRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<AdjustmentForm>({
    operation: "RECEIVE",
    quantity: "",
    reason: "RECEIPT",
    reference: "",
    note: "",
    safetyStock: String(row.safetyStock),
    reorderLevel: String(row.reorderLevel),
  });
  const [movements, setMovements] = useState<Movement[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/admin/inventory/${encodeURIComponent(row.variantId)}/history`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : { movements: [] })
      .then((body) => { if (active) setMovements(body.movements ?? []); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [row.variantId]);

  const projected = useMemo(() => {
    const quantity = Number(form.quantity || 0);
    if (form.operation === "SET") return quantity;
    if (form.operation === "REMOVE") return row.onHand - quantity;
    return row.onHand + quantity;
  }, [form.operation, form.quantity, row.onHand]);

  function selectOperation(operation: AdjustmentForm["operation"]) {
    setForm((current) => ({
      ...current,
      operation,
      reason: operation === "RECEIVE" ? "RECEIPT" : operation === "REMOVE" ? "DAMAGE" : "CORRECTION",
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/inventory/${encodeURIComponent(row.variantId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
          safetyStock: Number(form.safetyStock),
          reorderLevel: Number(form.reorderLevel),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to update inventory");
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update inventory");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="adjust-stock-title">
        <header className={styles.panelHeader}>
          <div><p className={styles.eyebrow}>{row.sku}</p><h2 id="adjust-stock-title">Adjust stock</h2><span>{row.productName} · {row.color} / {row.size}</span></div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className={styles.currentStock}>
          <div><span>On hand</span><strong>{row.onHand}</strong></div>
          <div><span>Reserved</span><strong>{row.reserved}</strong></div>
          <div><span>Sellable</span><strong>{row.available}</strong></div>
        </div>

        <form className={styles.adjustmentForm} onSubmit={save}>
          <fieldset className={styles.operationChoice}>
            <legend>Adjustment</legend>
            {(["RECEIVE", "REMOVE", "SET"] as const).map((operation) => (
              <button key={operation} type="button" className={form.operation === operation ? styles.active : ""} onClick={() => selectOperation(operation)}>
                {{ RECEIVE: "+ Receive", REMOVE: "− Remove", SET: "= Set exact" }[operation]}
              </button>
            ))}
          </fieldset>

          <label>Quantity<input type="number" min="0" step="1" required value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label>
          <div className={styles.projected}><span>New on-hand quantity</span><strong className={projected < row.reserved ? styles.invalid : ""}>{projected}</strong></div>

          <label>Reason
            <select value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value as AdjustmentForm["reason"] })}>
              <option value="RECEIPT">Stock received</option>
              <option value="CORRECTION">Manual correction</option>
              <option value="DAMAGE">Damaged stock</option>
              <option value="RETURN_RESTOCK">Customer return restocked</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <div className={styles.twoFields}>
            <label>Safety stock<input type="number" min="0" step="1" required value={form.safetyStock} onChange={(event) => setForm({ ...form, safetyStock: event.target.value })} /></label>
            <label>Low-stock alert at<input type="number" min="0" step="1" required value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })} /></label>
          </div>
          <label>Purchase order / reference <span>(optional)</span><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="e.g. PO-JPR-0021" /></label>
          <label>Note <span>(optional)</span><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Add a short reason for the audit trail" /></label>
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.panelActions}><button type="button" className={styles.cancelButton} onClick={onClose}>Cancel</button><button type="submit" className={styles.saveButton} disabled={saving || form.quantity === ""}>{saving ? "Saving…" : "Save adjustment"}</button></div>
        </form>

        <section className={styles.history}>
          <h3>Recent stock activity</h3>
          {movements.length === 0 ? <p>No manual adjustments yet.</p> : movements.slice(0, 8).map((movement) => (
            <div key={movement.id}>
              <strong className={movement.delta >= 0 ? styles.positive : styles.negative}>{movement.delta >= 0 ? "+" : ""}{movement.delta}</strong>
              <span>{movement.reason}{movement.reference ? ` · ${movement.reference}` : ""}</span>
              <small>{movement.onHandBefore} → {movement.onHandAfter} · {dateTime(movement.createdAt)}</small>
            </div>
          ))}
        </section>
      </section>
    </div>
  );
}
