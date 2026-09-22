"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { CreateProductInReceipt } from "@/components/admin-products/create-product-in-receipt";
import type { ReceiveVariant } from "@/lib/admin-products-contract";
import styles from "./procurement.module.css";

type Vendor = { id: string; code: string; name: string };
type Variant = { id: string; sku: string; color: string; size: string; active?: boolean; mrpPaise?: number; pricePaise?: number };
type Product = {
  id: string; internalCode: string; internalName?: string | null; name: string; slug: string; status: string; variants: Variant[];
};
type VendorProduct = {
  id: string; vendorStyleCode: string; vendorProductName?: string | null; hsn?: string | null;
  defaultUnitCostPaise?: number | null; vendor: Vendor; product: Product;
};
type PurchaseOrderLine = {
  id: string; lineNumber: number; vendorProductId?: string | null; productId: string;
  vendorStyleCode: string; orderedQuantity: number; unitCostPaise?: number | null;
  product: Pick<Product, "id" | "internalCode" | "internalName" | "name">;
  variants?: Array<{ variantId: string; orderedQuantity: number; variant: Variant }>;
};
type PurchaseOrder = {
  id: string; poNumber: string; vendorId: string; orderDate: string; status: string;
  orderedQuantity?: number; invoicedQuantity?: number; receivedQuantity?: number;
  vendor: Vendor; lines: PurchaseOrderLine[];
};
type Dashboard = {
  vendors: Vendor[]; vendorProducts: VendorProduct[]; products: Product[];
  purchaseOrders: PurchaseOrder[]; invoices: Array<{ id: string; invoiceNumber: string; status: string; purchaseOrderId?: string | null }>;
};
type ExtractedLine = {
  rawDescription: string; vendorStyleCode: string | null; hsn: string | null;
  quantity: number | null; unitCostRupees: number | null; amountRupees: number | null;
};
type Extraction = {
  vendorName: string | null; vendorGstin: string | null; invoiceNumber: string | null; invoiceDate: string | null;
  subtotalRupees: number | null; taxRupees: number | null; totalRupees: number | null;
  lines: ExtractedLine[]; warnings: string[]; originalFilename: string;
};
type PoDraftLine = {
  key: string; vendorStyleCode: string; description: string; hsn: string;
  orderedQuantity: string; unitCostRupees: string;
  vendorProductId: string | null; productId: string | null; selectedProductId: string;
  sizeQty: Record<string, string>; quantityLocked: boolean;
};
type IrLine = ExtractedLine & {
  key: string; poLineId: string | null; vendorProductId: string | null; productId: string | null;
  vendorStyleCodeDraft: string; sizeQty: Record<string, string>;
};

function canonical(value: string | null | undefined) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
}
function looseName(value: string | null | undefined) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .map((token) => token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token).join(" ");
}
function paise(rupees: number | null) { return rupees == null ? null : Math.round(rupees * 100); }
function moneyRupees(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}
function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
function blankPoLine(index: number): PoDraftLine {
  return {
    key: "po-" + index + "-" + Date.now(),
    vendorStyleCode: "", description: "", hsn: "", orderedQuantity: "", unitCostRupees: "",
    vendorProductId: null, productId: null, selectedProductId: "", sizeQty: {}, quantityLocked: false,
  };
}

export function AdminProcurementClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [data, setData] = useState<Dashboard>({ vendors: [], vendorProducts: [], products: [], purchaseOrders: [], invoices: [] });
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [poVendorId, setPoVendorId] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [poLines, setPoLines] = useState<PoDraftLine[]>([blankPoLine(1)]);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [createdPo, setCreatedPo] = useState<PurchaseOrder | null>(null);

  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [irLines, setIrLines] = useState<IrLine[]>([]);
  const [ir, setIr] = useState<any>(null);
  const [traceOrder, setTraceOrder] = useState("");
  const [trace, setTrace] = useState<any>(null);
  const [traceBusy, setTraceBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/procurement", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) { setAuthenticated(false); return; }
      if (!response.ok) throw new Error(body?.message ?? "Unable to load procurement");
      setAuthenticated(true);
      setData({
        vendors: body.vendors ?? [], vendorProducts: body.vendorProducts ?? [], products: body.products ?? [],
        purchaseOrders: body.purchaseOrders ?? [], invoices: body.invoices ?? [],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load procurement");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activePo = useMemo(
    () => createdPo?.id === selectedPoId ? createdPo : data.purchaseOrders.find((item) => item.id === selectedPoId) ?? null,
    [createdPo, data.purchaseOrders, selectedPoId],
  );

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!draftKey.trim()) return;
    const response = await fetch("/api/admin/session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: draftKey.trim() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setAuthenticated(false); setError(body?.message ?? "Unable to sign in"); return; }
    setDraftKey(""); setAuthenticated(true); await load();
  }

  async function createVendor(name: string, gstin?: string | null) {
    const response = await fetch("/api/admin/procurement/vendors", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, gstin: gstin ?? "" }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message ?? "Unable to resolve vendor");
    await load();
    return body as Vendor & { reused?: boolean };
  }

  async function addManualVendor() {
    if (!newVendorName.trim()) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const vendor = await createVendor(newVendorName.trim());
      setPoVendorId(vendor.id); setNewVendorName("");
      setNotice((vendor as any).reused ? "Existing vendor #" + vendor.code + " reused." : "Vendor #" + vendor.code + " created.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create vendor"); }
    finally { setBusy(false); }
  }

  async function resolvePoLine(line: PoDraftLine, vendorId = poVendorId) {
    if (!vendorId || !line.vendorStyleCode.trim()) return;
    setBusy(true); setError(null);
    try {
      const params = new URLSearchParams({ vendorId, vendorStyleCode: canonical(line.vendorStyleCode) });
      const response = await fetch("/api/admin/procurement/material?" + params, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to resolve vendor material");
      setPoLines((current) => current.map((item) => item.key === line.key
        ? body.mapped
          ? { ...item, vendorStyleCode: body.vendorStyleCode, vendorProductId: body.mapping.id, productId: body.mapping.productId, selectedProductId: body.mapping.productId, sizeQty: {} }
          : { ...item, vendorStyleCode: body.vendorStyleCode, vendorProductId: null, productId: null, selectedProductId: "", sizeQty: {} }
        : item));
      if (!body.mapped) setNotice("Vendor material is new. Select or create the HIDI material once, then save the mapping.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to resolve vendor material"); }
    finally { setBusy(false); }
  }

  async function mapPoLine(line: PoDraftLine, productId: string) {
    if (!poVendorId || !line.vendorStyleCode.trim() || !productId) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/admin/procurement/vendor-products", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorId: poVendorId, productId, vendorStyleCode: canonical(line.vendorStyleCode),
          vendorProductName: line.description, hsn: line.hsn,
          defaultUnitCostPaise: line.unitCostRupees ? Math.round(Number(line.unitCostRupees) * 100) : null,
          packPattern: [],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to map vendor material");
      setPoLines((current) => current.map((item) => item.key === line.key
        ? { ...item, vendorProductId: body.id, productId: body.productId, selectedProductId: body.productId, sizeQty: {} }
        : item));
      setNotice("Vendor material " + canonical(line.vendorStyleCode) + " → " + body.product.internalCode + " saved.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to map vendor material"); }
    finally { setBusy(false); }
  }

  function editPoLine(key: string, field: keyof PoDraftLine, value: string) {
    setPoLines((current) => current.map((line) => line.key === key
      ? {
          ...line,
          [field]: value,
          ...(field === "vendorStyleCode" ? { vendorProductId: null, productId: null, selectedProductId: "", sizeQty: {} } : {}),
          ...(field === "selectedProductId" ? { sizeQty: {} } : {}),
        }
      : line));
  }

  function poProduct(line: PoDraftLine) {
    return data.products.find((product) => product.id === line.productId) ?? null;
  }

  function uniqueSizeVariants(product: Product) {
    const bySize = new Map<string, Variant>();
    for (const variant of product.variants.filter((item) => item.active !== false)) {
      if (!bySize.has(variant.size)) bySize.set(variant.size, variant);
    }
    return [...bySize.values()];
  }

  function poSizeTotal(line: PoDraftLine) {
    return Object.values(line.sizeQty).reduce((sum, value) => sum + Number(value || 0), 0);
  }

  function setPoSizeQty(lineKey: string, variantId: string, value: string) {
    if (value && !/^\d+$/.test(value)) return;
    setPoLines((current) => current.map((line) =>
      line.key === lineKey ? { ...line, sizeQty: { ...line.sizeQty, [variantId]: value } } : line,
    ));
  }

  const poReady = useMemo(() => Boolean(poVendorId) && poLines.length > 0 && poLines.every((line) => {
    const quantity = Number(line.orderedQuantity);
    return Boolean(line.vendorProductId && line.productId && line.vendorStyleCode.trim()) &&
      Number.isInteger(quantity) && quantity > 0 &&
      poSizeTotal(line) === quantity &&
      (!line.unitCostRupees || Number(line.unitCostRupees) >= 0);
  }), [poVendorId, poLines]);

  async function createPo() {
    if (!poReady) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/admin/procurement/purchase-orders", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorId: poVendorId, orderDate: new Date(todayIso() + "T12:00:00").toISOString(),
          lines: poLines.map((line) => ({
            vendorProductId: line.vendorProductId, productId: line.productId,
            vendorStyleCode: canonical(line.vendorStyleCode), description: line.description,
            orderedQuantity: Number(line.orderedQuantity),
            unitCostPaise: line.unitCostRupees ? Math.round(Number(line.unitCostRupees) * 100) : null,
            hsn: line.hsn,
            variants: Object.entries(line.sizeQty)
              .map(([variantId, value]) => ({ variantId, quantity: Number(value || 0) }))
              .filter((row) => row.quantity > 0),
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to create Purchase Order");
      setCreatedPo(body); setSelectedPoId(body.id); setIr(null);
      if (extraction) buildIrLines(extraction, body);
      setNotice(
        "Purchase Order " + body.poNumber +
        " created with the size quantities. Next: post Goods Receipt against this PO. The uploaded invoice is retained for IR."
      );
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create Purchase Order"); }
    finally { setBusy(false); }
  }

  async function prefillPoFromExtraction(extracted: Extraction, resolvedVendor: Vendor) {
    const lines: PoDraftLine[] = [];
    for (let index = 0; index < extracted.lines.length; index += 1) {
      const raw = extracted.lines[index];
      const style = canonical(raw.vendorStyleCode);
      let vendorProductId: string | null = null;
      let productId: string | null = null;
      if (style) {
        const params = new URLSearchParams({ vendorId: resolvedVendor.id, vendorStyleCode: style });
        const response = await fetch("/api/admin/procurement/material?" + params, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.mapped) { vendorProductId = body.mapping.id; productId = body.mapping.productId; }
      }
      lines.push({
        key: "po-upload-" + index + "-" + Date.now(), vendorStyleCode: style, description: raw.rawDescription,
        hsn: raw.hsn ?? "", orderedQuantity: raw.quantity == null ? "" : String(raw.quantity),
        unitCostRupees: raw.unitCostRupees == null ? "" : String(raw.unitCostRupees),
        vendorProductId, productId, selectedProductId: productId ?? "", sizeQty: {},
        quantityLocked: raw.quantity != null,
      });
    }
    setPoVendorId(resolvedVendor.id); setPoLines(lines);
  }

  function buildIrLines(extracted: Extraction, po: PurchaseOrder) {
    const lines: IrLine[] = extracted.lines.map((raw, index) => {
      const style = canonical(raw.vendorStyleCode);
      const poLine = po.lines.find((candidate) => canonical(candidate.vendorStyleCode) === style) ?? null;
      return {
        ...raw, key: "ir-" + index + "-" + style, poLineId: poLine?.id ?? null,
        vendorProductId: poLine?.vendorProductId ?? null, productId: poLine?.productId ?? null,
        vendorStyleCodeDraft: style, sizeQty: {},
      };
    });
    setIrLines(lines);
  }

  async function uploadInvoice(file: File) {
    setExtracting(true); setError(null); setNotice(null); setIr(null);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/admin/procurement/invoice-extract", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to read vendor invoice");
      const extracted = body as Extraction;
      if (!extracted.vendorName?.trim()) throw new Error("Vendor name could not be read from this invoice.");
      if (!extracted.lines?.length) throw new Error("No garment/material lines could be read from this invoice.");

      setExtraction(extracted);

      if (activePo) {
        if (looseName(extracted.vendorName) !== looseName(activePo.vendor.name)) {
          throw new Error("Invoice vendor '" + extracted.vendorName + "' does not match PO vendor '" + activePo.vendor.name + "'.");
        }
        buildIrLines(extracted, activePo);
        setNotice("Invoice read and matched to " + activePo.poNumber + ". Enter size quantities for IR.");
      } else {
        const resolvedVendor = await createVendor(extracted.vendorName, extracted.vendorGstin);
        await prefillPoFromExtraction(extracted, resolvedVendor);
        setNotice("Invoice read. Vendor #" + resolvedVendor.code + " resolved and PO draft prefilled. Resolve any new materials, then create the PO.");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to process invoice"); }
    finally { setExtracting(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  function productForIr(line: IrLine) { return data.products.find((product) => product.id === line.productId) ?? null; }
  function uniqueSizeVariants(product: Product) {
    const bySize = new Map<string, Variant>();
    for (const variant of product.variants.filter((item) => item.active !== false)) if (!bySize.has(variant.size)) bySize.set(variant.size, variant);
    return [...bySize.values()];
  }
  function irSizeTotal(line: IrLine) { return Object.values(line.sizeQty).reduce((sum, value) => sum + Number(value || 0), 0); }
  function setIrSizeQty(lineKey: string, variantId: string, value: string) {
    if (value && !/^\d+$/.test(value)) return;
    setIrLines((current) => current.map((line) => line.key === lineKey ? { ...line, sizeQty: { ...line.sizeQty, [variantId]: value } } : line));
  }

  const irReady = useMemo(() =>
    Boolean(activePo && extraction && (activePo.receivedQuantity ?? 0) > 0) &&
    irLines.length > 0 &&
    irLines.every((line) =>
      Boolean(line.poLineId && line.vendorProductId && line.productId) &&
      Number.isInteger(line.quantity) && Number(line.quantity) > 0
    ),
  [activePo, extraction, irLines]);

  async function runTrace(event: FormEvent) {
    event.preventDefault();
    const orderNumber = traceOrder.trim();
    if (!orderNumber) return;
    setTraceBusy(true); setError(null); setTrace(null);
    try {
      const response = await fetch("/api/admin/procurement/trace/order/" + encodeURIComponent(orderNumber), { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to trace order");
      setTrace(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to trace order");
    } finally { setTraceBusy(false); }
  }

  async function postIr() {
    if (!activePo || !extraction || !irReady) return;
    if (!extraction.invoiceNumber || !extraction.invoiceDate) { setError("Invoice number/date must be readable before IR can be posted."); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/admin/procurement/invoices", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorId: activePo.vendor.id, invoiceNumber: extraction.invoiceNumber,
          invoiceDate: new Date(extraction.invoiceDate + "T12:00:00").toISOString(),
          purchaseReference: activePo.poNumber, purchaseOrderId: activePo.id,
          originalFilename: extraction.originalFilename,
          subtotalPaise: paise(extraction.subtotalRupees), taxPaise: paise(extraction.taxRupees), totalPaise: paise(extraction.totalRupees),
          lines: irLines.map((line) => ({
            rawDescription: line.rawDescription, vendorStyleCode: line.vendorStyleCodeDraft,
            hsn: line.hsn, invoiceQuantity: line.quantity, unitCostPaise: paise(line.unitCostRupees), amountPaise: paise(line.amountRupees),
            purchaseOrderLineId: line.poLineId,
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to post Invoice Receipt");
      setIr(body); setNotice("IR " + body.invoiceNumber + " posted against " + activePo.poNumber + ". Ready for Goods Receipt.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to post Invoice Receipt"); }
    finally { setBusy(false); }
  }

  if (authenticated === null) return <main className={styles.loginPage}><section className={styles.loginCard}>Checking admin session…</section></main>;
  if (!authenticated) return (
    <main className={styles.loginPage}><section className={styles.loginCard}>
      <p className={styles.eyebrow}>HIDI OPERATIONS</p><h1>Procurement</h1><p>Purchase Order → Invoice Receipt → Goods Receipt.</p>
      {error && <div className={styles.error}>{error}</div>}
      <form onSubmit={unlock}><input type="password" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} placeholder="Admin key" autoFocus /><button type="submit">Open procurement</button></form>
    </section></main>
  );

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><p className={styles.eyebrow}>HIDI ADMIN</p><AdminNav /></div>
        <button type="button" className={styles.secondary} onClick={() => void load()} disabled={busy}>Refresh</button>
      </header>

      <section className={styles.heading}>
        <p className={styles.eyebrow}>PROCUREMENT · SAP-STYLE DOCUMENT FLOW</p>
        <h1>Purchase Order → GR → IR</h1>
        <p>Vendor and Material are master data. Reuse existing records; create them only when a new vendor or vendor material appears.</p>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.success} role="status">{notice}</div>}

      <section className={styles.flow}>
        <div data-active={!activePo}><span>01</span><strong>Purchase Order</strong><small>Vendor + Material + Qty</small></div>
        <div data-active={Boolean(activePo && activePo.receivedQuantity === 0)}><span>02</span><strong>Goods Receipt</strong><small>Physical actual + barcode</small></div>
        <div data-active={Boolean(activePo && (activePo.receivedQuantity ?? 0) > 0 && !ir)}><span>03</span><strong>Invoice Receipt</strong><small>Invoice vs PO / GR</small></div>
        <div><span>04</span><strong>Customer fulfilment</strong><small>Exact barcode scan</small></div>
        <div><span>05</span><strong>Trace</strong><small>PO → IR → GR → sale</small></div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}>
          <div><p className={styles.eyebrow}>STEP 01</p><h2>Create Purchase Order</h2></div>
          <span>Vendor + HIDI Material</span>
        </div>

        <div className={styles.invoicePrefill}>
          <strong>Upload vendor invoice / purchase document</strong>
          <span>PDF/JPEG/PNG is read automatically. HIDI resolves Vendor + Vendor Material, locks the document line quantity, and then asks staff only for the size split.</span>
          <label className={styles.compactUpload} aria-disabled={extracting}><input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" disabled={extracting} onChange={(e) => { const file=e.currentTarget.files?.[0]; if(file) void uploadInvoice(file); }} />{extracting ? "Reading document…" : "Upload document"}</label>
        </div>

        <div className={styles.poVendorRow}>
          <label><span>Existing vendor</span><select value={poVendorId} onChange={(e) => { setPoVendorId(e.target.value); setPoLines([blankPoLine(1)]); }}>
            <option value="">Select vendor</option>{data.vendors.map((item) => <option key={item.id} value={item.id}>#{item.code} · {item.name}</option>)}
          </select></label>
          <div className={styles.or}>OR</div>
          <label><span>New vendor name</span><input value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)} placeholder="Only when vendor does not exist" /></label>
          <button type="button" disabled={busy || !newVendorName.trim()} onClick={() => void addManualVendor()}>Create / reuse vendor</button>
        </div>

        <div className={styles.poLines}>
          {poLines.map((line, index) => {
            const product = data.products.find((item) => item.id === line.productId) ?? null;
            return <article className={styles.poLine} key={line.key}>
              <header><strong>PO ITEM {String(index + 1).padStart(2, "0")}</strong>{poLines.length > 1 && <button type="button" className={styles.textDanger} onClick={() => setPoLines((rows) => rows.filter((item) => item.key !== line.key))}>Remove</button>}</header>
              <div className={styles.poLineGrid}>
                <label><span>Vendor material / dress code *</span><input value={line.vendorStyleCode} onChange={(e) => editPoLine(line.key, "vendorStyleCode", e.target.value)} placeholder="JC4U 2548" onBlur={() => void resolvePoLine(line)} /></label>
                {product && line.vendorProductId ? (
                  <div className={styles.hidiMaterial}><span>HIDI MATERIAL</span><strong>{product.internalCode}</strong><small>{product.internalName || product.name}</small><em>Existing mapping</em></div>
                ) : (
                  <div className={styles.resolveBox}>
                    <label><span>HIDI material</span><select value={line.selectedProductId} onChange={(e) => editPoLine(line.key, "selectedProductId", e.target.value)}>
                      <option value="">Select existing material</option>
                      {data.products.map((item) => <option key={item.id} value={item.id}>{item.internalCode} · {item.internalName || item.name}</option>)}
                    </select></label>
                    <button type="button" disabled={busy || !poVendorId || !line.vendorStyleCode.trim() || !line.selectedProductId} onClick={() => void mapPoLine(line, line.selectedProductId)}>Map</button>
                    <div className={styles.createInline}><CreateProductInReceipt disabled={busy || !poVendorId || !line.vendorStyleCode.trim()} onVariants={(variants: ReceiveVariant[]) => {
                      const id = variants[0]?.productId; if (id) void mapPoLine(line, id);
                    }} /></div>
                  </div>
                )}
                <label><span>{line.quantityLocked ? "Invoice quantity · locked" : "PO quantity *"}</span><input type="number" min="1" step="1" value={line.orderedQuantity} readOnly={line.quantityLocked} onChange={(e) => editPoLine(line.key, "orderedQuantity", e.target.value)} /></label>
                <label><span>Unit cost ₹</span><input type="number" min="0" step="0.01" value={line.unitCostRupees} onChange={(e) => editPoLine(line.key, "unitCostRupees", e.target.value)} /></label>
                <label><span>Description</span><input value={line.description} onChange={(e) => editPoLine(line.key, "description", e.target.value)} /></label>
                <label><span>HSN</span><input value={line.hsn} onChange={(e) => editPoLine(line.key, "hsn", e.target.value)} /></label>
              </div>
              {product && line.vendorProductId && (() => {
                const variants = uniqueSizeVariants(product);
                const total = poSizeTotal(line);
                const qty = Number(line.orderedQuantity || 0);
                return <div className={styles.sizeEntry}>
                  <div className={styles.sizeHeader}>
                    <div>
                      <strong>{product.internalCode} · {product.internalName || product.name}</strong>
                      <span>Enter only size quantities. Total must equal {line.quantityLocked ? "invoice" : "PO"} quantity.</span>
                    </div>
                    <b data-match={qty > 0 && total === qty}>{total} / {qty || "?"}</b>
                  </div>
                  <div className={styles.sizeGrid}>
                    {variants.map((variant) => <label key={variant.id}>
                      <span>SIZE {variant.size}</span>
                      <input type="number" min="0" step="1" value={line.sizeQty[variant.id] ?? ""} onChange={(e) => setPoSizeQty(line.key, variant.id, e.target.value)} placeholder="0" />
                    </label>)}
                  </div>
                  {qty > 0 && total !== qty && <div className={styles.qtyMismatch}>Size quantity total must equal {qty}. Difference: {qty - total}.</div>}
                </div>;
              })()}
            </article>;
          })}
        </div>
        <div className={styles.poActions}>
          <button type="button" className={styles.secondary} onClick={() => setPoLines((rows) => [...rows, blankPoLine(rows.length + 1)])}>+ Add PO item</button>
          <button type="button" disabled={busy || !poReady} onClick={() => void createPo()}>Create Purchase Order</button>
        </div>

      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}><div><p className={styles.eyebrow}>STEP 02</p><h2>Goods Receipt (GR)</h2></div><span>Receive directly against PO</span></div>
        <div className={styles.irPoSelect}>
          <label><span>Purchase Order *</span><select value={selectedPoId} onChange={(e) => { setSelectedPoId(e.target.value); setCreatedPo(null); setExtraction(null); setIrLines([]); setIr(null); }}>
            <option value="">Select open PO</option>
            {data.purchaseOrders.filter((item) => !["CANCELLED","CLOSED"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.poNumber} · #{item.vendor.code} {item.vendor.name}</option>)}
          </select></label>
          {activePo && <div className={styles.poSummary}><strong>{activePo.poNumber}</strong><span>Vendor #{activePo.vendor.code} · {activePo.vendor.name} · Ordered {activePo.orderedQuantity ?? activePo.lines.reduce((s,l)=>s+l.orderedQuantity,0)} · GR {activePo.receivedQuantity ?? 0}</span></div>}
        </div>

        {!activePo ? <div className={styles.empty}>Select or create a Purchase Order first.</div> :
          <div className={styles.grReady}>
            <div>
              <strong>{activePo.poNumber} is ready for Goods Receipt</strong>
              <span>Warehouse receives physical size quantities directly against the PO. Accepted stock creates GR lots and garment barcodes; no IR is required before GR.</span>
            </div>
            <Link href={"/admin/inventory/receive?po="+encodeURIComponent(activePo.id)}>Open Goods Receipt →</Link>
          </div>}
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}><div><p className={styles.eyebrow}>STEP 03</p><h2>Invoice Receipt (IR)</h2></div><span>Three-way match · PO ↔ GR ↔ Invoice</span></div>

        {!activePo ? <div className={styles.empty}>Select the PO in Goods Receipt first.</div> :
        (activePo.receivedQuantity ?? 0) <= 0 ? <div className={styles.empty}>Post Goods Receipt first. IR becomes available after GR has received quantity.</div> : <>
          {!extraction && <label className={styles.uploadZone} aria-disabled={extracting}>
            <strong>{extracting ? "Reading invoice…" : "Upload vendor invoice for IR"}</strong>
            <span>PDF · JPEG · PNG. HIDI reads vendor, vendor material code, invoice quantity and value, then matches them against this PO and posted GR.</span>
            <small>No size quantities are re-entered at IR; the PO/GR size schedule is reused.</small>
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" disabled={extracting} onChange={(e) => { const file=e.currentTarget.files?.[0]; if(file) void uploadInvoice(file); }} />
          </label>}

          {extraction && <>
            <div className={styles.documentSummary}>
              <div><span>FILE</span><strong>{extraction.originalFilename}</strong></div>
              <div><span>VENDOR</span><strong>{extraction.vendorName ?? "Unreadable"}</strong></div>
              <div><span>INVOICE</span><strong>{extraction.invoiceNumber ?? "Unreadable"}</strong></div>
              <div><span>DATE</span><strong>{extraction.invoiceDate ?? "Unreadable"}</strong></div>
              <div><span>TOTAL</span><strong>{moneyRupees(extraction.totalRupees)}</strong></div>
            </div>
            {extraction.warnings?.length ? <div className={styles.warnings}><strong>Document review</strong>{extraction.warnings.map((warning,index)=><span key={index}>{warning}</span>)}</div> : null}

            <div className={styles.materialLines}>
              {irLines.map((line,index)=>{
                const product=productForIr(line);
                const poLine=activePo.lines.find((row)=>row.id===line.poLineId) ?? null;
                const qty=line.quantity;
                const poQty=poLine?.orderedQuantity ?? null;
                const matches=Boolean(poLine && qty != null && qty <= poLine.orderedQuantity);
                return <article className={styles.materialLine} key={line.key}>
                  <header>
                    <div><span>IR ITEM {String(index+1).padStart(2,"0")}</span><strong>{line.rawDescription}</strong></div>
                    <div className={styles.fixedQty}><span>INVOICE QTY · LOCKED</span><strong>{qty ?? "?"}</strong></div>
                  </header>
                  {!poLine || !product ? <div className={styles.blockedLine}><strong>Not found in selected PO</strong><span>Vendor material {line.vendorStyleCodeDraft || "unreadable"} must exist on the PO before IR can be posted.</span></div> :
                  <div className={styles.irMatch}>
                    <div><span>HIDI MATERIAL</span><strong>{product.internalCode} · {product.internalName || product.name}</strong></div>
                    <div><span>PO QTY</span><strong>{poQty}</strong></div>
                    <div><span>GR QTY</span><strong>{activePo.receivedQuantity ?? 0}</strong></div>
                    <div><span>INVOICE QTY</span><strong>{qty ?? "?"}</strong></div>
                    <b data-match={matches}>{matches ? "MATCH / WITHIN PO" : "REVIEW REQUIRED"}</b>
                  </div>}
                </article>;
              })}
            </div>
            <div className={styles.irAction}><button type="button" disabled={busy||!irReady} onClick={()=>void postIr()}>{busy?"Posting…":"Post Invoice Receipt"}</button></div>
          </>}
        </>}
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}><div><p className={styles.eyebrow}>SOURCE-TO-CUSTOMER TRACE</p><h2>PO → GR → IR → Customer Invoice</h2></div><span>Audit trail</span></div>
        <form className={styles.traceForm} onSubmit={runTrace}>
          <input value={traceOrder} onChange={(e) => setTraceOrder(e.target.value)} placeholder="Enter HIDI customer order number" />
          <button type="submit" disabled={traceBusy}>{traceBusy ? "Tracing…" : "Trace order"}</button>
        </form>
        {trace && <div className={styles.traceResult}>
          <header><div><span>CUSTOMER ORDER</span><strong>{trace.orderNumber}</strong></div><div><span>CUSTOMER INVOICE</span><strong>{trace.customerInvoice?.invoiceNumber ?? "Legacy / not issued"}</strong></div><div><span>STATUS</span><strong>{trace.orderStatus}</strong></div></header>
          {trace.items.map((item:any)=><div className={styles.traceItem} key={item.orderItemId}><strong>{item.productName} · {item.color} · {item.size} · Qty {item.quantity}</strong>
            {item.sources.length?item.sources.map((source:any,index:number)=><div className={styles.sourceChain} key={source.lotCode+index}><b>{source.purchaseOrderNumber ?? "PO —"}</b><span>IR {source.vendorInvoiceNumber ?? "—"}</span><span>{source.grn}</span><code>{source.lotCode}</code><span>{source.vendorStyleCode ?? "Vendor material —"}</span><b>{source.hidiProductCode ?? "Legacy material"}</b></div>):<small>No lot allocation recorded for this legacy item.</small>}
          </div>)}
        </div>}
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}><div><p className={styles.eyebrow}>DOCUMENT HISTORY</p><h2>Recent PO / IR / GR</h2></div><span>Document flow</span></div>
        <div className={styles.historyTable}><div className={styles.historyHead}><span>PO</span><span>Vendor</span><span>Ordered</span><span>IR</span><span>GR</span><span>Status</span></div>
          {data.purchaseOrders.length===0?<div className={styles.empty}>No purchase orders yet.</div>:data.purchaseOrders.slice(0,20).map((item)=><div className={styles.historyRow} key={item.id}><strong>{item.poNumber}</strong><span>#{item.vendor.code} · {item.vendor.name}</span><span>{item.orderedQuantity??item.lines.reduce((s,l)=>s+l.orderedQuantity,0)}</span><span>{item.invoicedQuantity??0}</span><span>{item.receivedQuantity??0}</span><b>{item.status.replaceAll("_"," ")}</b></div>)}
        </div>
      </section>
    </main>
  );
}
