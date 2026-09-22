"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import styles from "./procurement.module.css";

type Vendor = {
  id: string;
  code: string;
  name: string;
  gstin?: string | null;
  city?: string | null;
  state?: string | null;
};

type Variant = {
  id: string;
  sku: string;
  color: string;
  size: string;
  mrpPaise?: number;
  pricePaise?: number;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  status: string;
  variants: Variant[];
};

type VendorProduct = {
  id: string;
  vendorStyleCode: string;
  hidiStyleCode?: string | null;
  vendorProductName?: string | null;
  hsn?: string | null;
  defaultUnitCostPaise?: number | null;
  vendor: { id: string; code: string; name: string };
  product: Product;
  packPattern: Array<{
    id: string;
    quantity: number;
    variant: Variant;
  }>;
};

type ExpectedVariant = {
  id: string;
  expectedQuantity: number;
  source: string;
  variant: Variant;
};

type InvoiceLine = {
  id: string;
  rawDescription: string;
  vendorStyleCode?: string | null;
  invoiceQuantity: number;
  unitCostPaise?: number | null;
  amountPaise?: number | null;
  breakupSource?: string | null;
  mappingConfirmed: boolean;
  vendorProduct?: {
    id: string;
    vendorStyleCode: string;
    product: { id: string; name: string };
  } | null;
  expectedVariants: ExpectedVariant[];
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  purchaseReference?: string | null;
  status: string;
  invoiceQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  vendor: { id: string; code: string; name: string };
  lines: InvoiceLine[];
};

type Dashboard = {
  vendors: Vendor[];
  vendorProducts: VendorProduct[];
  products: Product[];
  invoices: Invoice[];
};

type InvoiceDraftLine = {
  rawDescription: string;
  vendorStyleCode: string;
  quantity: string;
  unitCost: string;
  amount: string;
};

const emptyDashboard: Dashboard = {
  vendors: [],
  vendorProducts: [],
  products: [],
  invoices: [],
};

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function money(paise?: number | null) {
  if (paise === null || paise === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function AdminProcurementClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [data, setData] = useState<Dashboard>(emptyDashboard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [vendorForm, setVendorForm] = useState({
    code: "",
    name: "",
    gstin: "",
    city: "",
    state: "",
  });

  const [mappingForm, setMappingForm] = useState({
    vendorId: "",
    productId: "",
    vendorStyleCode: "",
    hidiStyleCode: "",
    vendorProductName: "",
    hsn: "",
    defaultUnitCost: "",
  });
  const [packQty, setPackQty] = useState<Record<string, string>>({});

  const [invoiceForm, setInvoiceForm] = useState({
    vendorId: "",
    invoiceNumber: "",
    invoiceDate: today(),
    purchaseReference: "",
  });
  const [invoiceLines, setInvoiceLines] = useState<InvoiceDraftLine[]>([
    { rawDescription: "", vendorStyleCode: "", quantity: "", unitCost: "", amount: "" },
  ]);

  const [traceOrder, setTraceOrder] = useState("");
  const [trace, setTrace] = useState<any>(null);
  const [traceBusy, setTraceBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/procurement", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthenticated(false);
        setData(emptyDashboard);
        return;
      }
      if (!response.ok) throw new Error(body?.message ?? "Unable to load procurement");
      setAuthenticated(true);
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load procurement");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProduct = useMemo(
    () => data.products.find((product) => product.id === mappingForm.productId) ?? null,
    [data.products, mappingForm.productId],
  );

  async function unlock(event: FormEvent) {
    event.preventDefault();
    const key = draftKey.trim();
    if (!key) return;
    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body?.message ?? "Unable to sign in");
      setAuthenticated(false);
      return;
    }
    setDraftKey("");
    setAuthenticated(true);
    await load();
  }

  async function saveVendor(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/procurement/vendors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(vendorForm),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to save vendor");
      setVendorForm({ code: "", name: "", gstin: "", city: "", state: "" });
      setNotice("Vendor added to HIDI Vendor Master.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save vendor");
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const pattern = Object.entries(packQty)
        .map(([variantId, value]) => ({ variantId, quantity: Number(value) }))
        .filter((row) => Number.isInteger(row.quantity) && row.quantity > 0);

      const response = await fetch("/api/admin/procurement/vendor-products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorId: mappingForm.vendorId,
          productId: mappingForm.productId,
          vendorStyleCode: mappingForm.vendorStyleCode.trim(),
          hidiStyleCode: mappingForm.hidiStyleCode.trim(),
          vendorProductName: mappingForm.vendorProductName.trim(),
          hsn: mappingForm.hsn.trim(),
          defaultUnitCostPaise:
            mappingForm.defaultUnitCost === ""
              ? null
              : Math.round(Number(mappingForm.defaultUnitCost) * 100),
          packPattern: pattern,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to save product master mapping");
      setMappingForm({
        vendorId: mappingForm.vendorId,
        productId: "",
        vendorStyleCode: "",
        hidiStyleCode: "",
        vendorProductName: "",
        hsn: "",
        defaultUnitCost: "",
      });
      setPackQty({});
      setNotice("Vendor dress code mapped to the existing HIDI product. Repeat purchases will reuse this mapping.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save product master mapping");
    } finally {
      setBusy(false);
    }
  }

  function updateInvoiceLine(index: number, field: keyof InvoiceDraftLine, value: string) {
    setInvoiceLines((current) =>
      current.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    );
  }

  async function saveInvoice(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const lines = invoiceLines
        .filter((line) => line.rawDescription.trim() || line.vendorStyleCode.trim())
        .map((line) => ({
          rawDescription: line.rawDescription.trim() || line.vendorStyleCode.trim(),
          vendorStyleCode: line.vendorStyleCode.trim(),
          invoiceQuantity: Number(line.quantity),
          unitCostPaise:
            line.unitCost === "" ? null : Math.round(Number(line.unitCost) * 100),
          amountPaise:
            line.amount === "" ? null : Math.round(Number(line.amount) * 100),
        }));

      const response = await fetch("/api/admin/procurement/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorId: invoiceForm.vendorId,
          invoiceNumber: invoiceForm.invoiceNumber.trim(),
          invoiceDate: new Date(invoiceForm.invoiceDate + "T12:00:00").toISOString(),
          purchaseReference: invoiceForm.purchaseReference.trim(),
          lines,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to save vendor invoice");
      setInvoiceForm({
        vendorId: invoiceForm.vendorId,
        invoiceNumber: "",
        invoiceDate: today(),
        purchaseReference: "",
      });
      setInvoiceLines([
        { rawDescription: "", vendorStyleCode: "", quantity: "", unitCost: "", amount: "" },
      ]);
      setNotice(
        body?.status === "AWAITING_STOCK"
          ? "Vendor invoice mapped successfully. Warehouse can receive against the expected variants."
          : "Vendor invoice saved. One or more lines need Product Master mapping/size breakup before receiving.",
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save vendor invoice");
    } finally {
      setBusy(false);
    }
  }

  async function runTrace(event: FormEvent) {
    event.preventDefault();
    const orderNumber = traceOrder.trim();
    if (!orderNumber) return;
    setTraceBusy(true);
    setError(null);
    setTrace(null);
    try {
      const response = await fetch(
        "/api/admin/procurement/trace/order/" + encodeURIComponent(orderNumber),
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to trace order");
      setTrace(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to trace order");
    } finally {
      setTraceBusy(false);
    }
  }

  if (authenticated === null) {
    return <main className={styles.loginPage}><section className={styles.loginCard}>Checking admin session…</section></main>;
  }

  if (!authenticated) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.loginCard}>
          <p className={styles.eyebrow}>HIDI OPERATIONS</p>
          <h1>Procurement</h1>
          <p>Open the vendor, invoice and stock trace workspace.</p>
          {error && <div className={styles.error}>{error}</div>}
          <form onSubmit={unlock}>
            <input type="password" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} placeholder="Admin key" autoFocus />
            <button type="submit">Open procurement</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><p className={styles.eyebrow}>HIDI ADMIN</p><AdminNav /></div>
        <button type="button" onClick={() => void load()} disabled={busy}>Refresh</button>
      </header>

      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>SOURCE TO SALE</p>
          <h1>Procurement & Trace</h1>
          <p>Vendor style → HIDI product → invoice → GRN/lot → packed order → customer invoice.</p>
        </div>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.success}>{notice}</div>}

      <section className={styles.stats}>
        <div><span>Vendors</span><strong>{data.vendors.length}</strong></div>
        <div><span>Mapped styles</span><strong>{data.vendorProducts.length}</strong></div>
        <div><span>Vendor invoices</span><strong>{data.invoices.length}</strong></div>
        <div><span>Awaiting stock</span><strong>{data.invoices.filter((i) => i.status === "AWAITING_STOCK" || i.status === "PARTIALLY_RECEIVED").length}</strong></div>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHeader}><div><p className={styles.eyebrow}>01</p><h2>Vendor Master</h2></div><span>{data.vendors.length} vendors</span></div>
          <form className={styles.form} onSubmit={saveVendor}>
            <div className={styles.two}>
              <label><span>Vendor code *</span><input value={vendorForm.code} onChange={(e) => setVendorForm({ ...vendorForm, code: e.target.value })} placeholder="e.g. JYOTI" required /></label>
              <label><span>Vendor name *</span><input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="Jyoti Creation" required /></label>
            </div>
            <div className={styles.three}>
              <label><span>GSTIN</span><input value={vendorForm.gstin} onChange={(e) => setVendorForm({ ...vendorForm, gstin: e.target.value })} /></label>
              <label><span>City</span><input value={vendorForm.city} onChange={(e) => setVendorForm({ ...vendorForm, city: e.target.value })} /></label>
              <label><span>State</span><input value={vendorForm.state} onChange={(e) => setVendorForm({ ...vendorForm, state: e.target.value })} /></label>
            </div>
            <button type="submit" disabled={busy}>Add vendor</button>
          </form>
          <div className={styles.compactList}>
            {data.vendors.map((vendor) => <div key={vendor.id}><strong>{vendor.name}</strong><code>{vendor.code}</code><span>{vendor.city ?? "—"}</span></div>)}
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}><div><p className={styles.eyebrow}>02</p><h2>Vendor ↔ HIDI Product Master</h2></div><span>One mapping, reused forever</span></div>
          <form className={styles.form} onSubmit={saveMapping}>
            <div className={styles.two}>
              <label><span>Vendor *</span><select value={mappingForm.vendorId} onChange={(e) => setMappingForm({ ...mappingForm, vendorId: e.target.value })} required><option value="">Select vendor</option>{data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
              <label><span>Existing HIDI product *</span><select value={mappingForm.productId} onChange={(e) => { setMappingForm({ ...mappingForm, productId: e.target.value }); setPackQty({}); }} required><option value="">Select product</option>{data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            </div>
            <div className={styles.four}>
              <label><span>Vendor dress code *</span><input value={mappingForm.vendorStyleCode} onChange={(e) => setMappingForm({ ...mappingForm, vendorStyleCode: e.target.value })} placeholder="JC4U 2548" required /></label>
              <label><span>HIDI dress code</span><input value={mappingForm.hidiStyleCode} onChange={(e) => setMappingForm({ ...mappingForm, hidiStyleCode: e.target.value })} placeholder="HIDI-KR-02548" /></label>
              <label><span>Vendor description</span><input value={mappingForm.vendorProductName} onChange={(e) => setMappingForm({ ...mappingForm, vendorProductName: e.target.value })} /></label>
              <label><span>HSN</span><input value={mappingForm.hsn} onChange={(e) => setMappingForm({ ...mappingForm, hsn: e.target.value })} /></label>
            </div>
            <label><span>Default purchase cost ₹</span><input type="number" min="0" step="0.01" value={mappingForm.defaultUnitCost} onChange={(e) => setMappingForm({ ...mappingForm, defaultUnitCost: e.target.value })} /></label>

            {selectedProduct && (
              <div className={styles.packPattern}>
                <strong>Standard vendor pack pattern</strong>
                <p>Enter only the variants normally included in one vendor pack. Invoice multiples expand automatically.</p>
                <div className={styles.variantGrid}>
                  {selectedProduct.variants.map((variant) => (
                    <label key={variant.id}>
                      <span>{variant.color} · {variant.size}</span>
                      <small>{variant.sku}</small>
                      <input type="number" min="0" step="1" value={packQty[variant.id] ?? ""} onChange={(e) => setPackQty({ ...packQty, [variant.id]: e.target.value })} placeholder="0" />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button type="submit" disabled={busy}>Save product mapping</button>
          </form>

          <div className={styles.mappingList}>
            {data.vendorProducts.slice(0, 30).map((mapping) => (
              <div key={mapping.id}>
                <div><strong>{mapping.vendor.name}</strong><code>{mapping.vendorStyleCode}</code></div>
                <span>→</span>
                <div><strong>{mapping.hidiStyleCode ? mapping.hidiStyleCode + " · " : ""}{mapping.product.name}</strong><small>{mapping.packPattern.map((p) => p.variant.size + "×" + p.quantity).join(" · ") || "No default pack"}</small></div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}><div><p className={styles.eyebrow}>03</p><h2>Vendor Invoice Intake</h2></div><span>PO / purchase reference is optional</span></div>
        <form className={styles.form} onSubmit={saveInvoice}>
          <div className={styles.four}>
            <label><span>Vendor *</span><select value={invoiceForm.vendorId} onChange={(e) => setInvoiceForm({ ...invoiceForm, vendorId: e.target.value })} required><option value="">Select vendor</option>{data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
            <label><span>Invoice no. *</span><input value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} required /></label>
            <label><span>Invoice date *</span><input type="date" value={invoiceForm.invoiceDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })} required /></label>
            <label><span>PO / purchase ref. (optional)</span><input value={invoiceForm.purchaseReference} onChange={(e) => setInvoiceForm({ ...invoiceForm, purchaseReference: e.target.value })} /></label>
          </div>

          <div className={styles.invoiceLines}>
            <div className={styles.invoiceHeader}><span>Raw description</span><span>Vendor style code</span><span>Qty</span><span>Unit cost ₹</span><span>Amount ₹</span><span /></div>
            {invoiceLines.map((line, index) => (
              <div className={styles.invoiceLine} key={index}>
                <input value={line.rawDescription} onChange={(e) => updateInvoiceLine(index, "rawDescription", e.target.value)} placeholder="KURTI JC4U 2548" />
                <input value={line.vendorStyleCode} onChange={(e) => updateInvoiceLine(index, "vendorStyleCode", e.target.value)} placeholder="JC4U 2548" />
                <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => updateInvoiceLine(index, "quantity", e.target.value)} />
                <input type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => updateInvoiceLine(index, "unitCost", e.target.value)} />
                <input type="number" min="0" step="0.01" value={line.amount} onChange={(e) => updateInvoiceLine(index, "amount", e.target.value)} />
                <button type="button" onClick={() => setInvoiceLines((rows) => rows.filter((_, i) => i !== index))}>×</button>
              </div>
            ))}
          </div>
          <div className={styles.invoiceActions}>
            <button type="button" className={styles.secondary} onClick={() => setInvoiceLines((rows) => [...rows, { rawDescription: "", vendorStyleCode: "", quantity: "", unitCost: "", amount: "" }])}>+ Add invoice line</button>
            <button type="submit" disabled={busy}>Save vendor invoice</button>
          </div>
        </form>

        <div className={styles.invoiceList}>
          {data.invoices.map((invoice) => (
            <div className={styles.invoiceCard} key={invoice.id}>
              <header>
                <div><strong>{invoice.vendor.name} · {invoice.invoiceNumber}</strong><span>{new Date(invoice.invoiceDate).toLocaleDateString("en-IN")} · {invoice.invoiceQuantity} pcs</span></div>
                <b data-status={invoice.status}>{invoice.status.replaceAll("_", " ")}</b>
              </header>
              {invoice.lines.map((line) => (
                <div className={styles.invoiceMappedLine} key={line.id}>
                  <div><code>{line.vendorStyleCode || "UNMAPPED"}</code><span>{line.rawDescription}</span></div>
                  <div><strong>{line.invoiceQuantity} pcs</strong><small>{money(line.unitCostPaise)} / pc</small></div>
                  <div>
                    <strong>{line.vendorProduct?.product.name ?? "Needs Product Master mapping"}</strong>
                    <small>{line.expectedVariants.map((v) => v.variant.size + " " + v.expectedQuantity).join(" · ") || "Expected size breakup not ready"}</small>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}><div><p className={styles.eyebrow}>04</p><h2>Source-to-Customer Trace</h2></div><span>Invoice → GRN → lot → order → customer invoice</span></div>
        <form className={styles.traceForm} onSubmit={runTrace}>
          <input value={traceOrder} onChange={(e) => setTraceOrder(e.target.value)} placeholder="Enter HIDI order number" />
          <button type="submit" disabled={traceBusy}>{traceBusy ? "Tracing…" : "Trace order"}</button>
        </form>

        {trace && (
          <div className={styles.traceResult}>
            <header>
              <div><span>ORDER</span><strong>{trace.orderNumber}</strong></div>
              <div><span>CUSTOMER INVOICE</span><strong>{trace.customerInvoice?.invoiceNumber ?? "Not issued / legacy order"}</strong></div>
              <div><span>STATUS</span><strong>{trace.orderStatus}</strong></div>
            </header>
            {trace.items.map((item: any) => (
              <div className={styles.traceItem} key={item.orderItemId}>
                <div><strong>{item.productName}</strong><span>{item.color} · {item.size} · {item.sku} · Qty {item.quantity}</span></div>
                {item.sources.length ? item.sources.map((source: any, i: number) => (
                  <div className={styles.sourceChain} key={source.lotCode + i}>
                    <span>{source.vendor}</span><b>Invoice {source.vendorInvoiceNumber ?? "—"}</b><span>{source.vendorStyleCode ?? "—"}</span><b>{source.grn}</b><code>{source.lotCode}</code><strong>{source.quantity} pc</strong>
                  </div>
                )) : <p className={styles.legacy}>No lot allocation recorded for this item (legacy stock/order).</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
