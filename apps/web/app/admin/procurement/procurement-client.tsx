"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { CreateProductInReceipt } from "@/components/admin-products/create-product-in-receipt";
import type { ReceiveVariant } from "@/lib/admin-products-contract";
import styles from "./procurement.module.css";

type Vendor = {
  id: string;
  code: string;
  name: string;
};

type Variant = {
  id: string;
  sku: string;
  color: string;
  size: string;
  active?: boolean;
  mrpPaise?: number;
  pricePaise?: number;
};

type Product = {
  id: string;
  internalCode: string;
  internalName?: string | null;
  name: string;
  slug: string;
  status: string;
  variants: Variant[];
};

type VendorProduct = {
  id: string;
  vendorStyleCode: string;
  vendorProductName?: string | null;
  hsn?: string | null;
  defaultUnitCostPaise?: number | null;
  vendor: Vendor;
  product: Product;
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  vendorId: string;
  orderDate: string;
  status: string;
  orderedQuantity: number;
  invoicedQuantity: number;
  receivedQuantity: number;
  vendor: Vendor;
  lines: Array<{
    id: string;
    lineNumber: number;
    vendorProductId?: string | null;
    productId: string;
    vendorStyleCode: string;
    orderedQuantity: number;
    unitCostPaise?: number | null;
    product: Pick<Product, "id" | "internalCode" | "internalName" | "name">;
  }>;
};

type VendorInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  purchaseOrderId?: string | null;
  vendor: Vendor;
  invoiceQuantity: number;
};

type Dashboard = {
  vendors: Vendor[];
  vendorProducts: VendorProduct[];
  products: Product[];
  purchaseOrders: PurchaseOrder[];
  invoices: VendorInvoice[];
};

type ExtractedLine = {
  rawDescription: string;
  vendorStyleCode: string | null;
  hsn: string | null;
  quantity: number | null;
  unitCostRupees: number | null;
  amountRupees: number | null;
};

type Extraction = {
  vendorName: string | null;
  vendorGstin: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  subtotalRupees: number | null;
  taxRupees: number | null;
  totalRupees: number | null;
  lines: ExtractedLine[];
  warnings: string[];
  originalFilename: string;
};

type WorkLine = ExtractedLine & {
  key: string;
  vendorStyleCodeDraft: string;
  vendorProductId: string | null;
  productId: string | null;
  selectedProductId: string;
  sizeQty: Record<string, string>;
};

function canonical(value: string | null | undefined) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
}

function paise(rupees: number | null) {
  return rupees == null ? null : Math.round(rupees * 100);
}

function moneyRupees(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function AdminProcurementClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [data, setData] = useState<Dashboard>({ vendors: [], vendorProducts: [], products: [], purchaseOrders: [], invoices: [] });
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [workLines, setWorkLines] = useState<WorkLine[]>([]);
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [ir, setIr] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/procurement", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error(body?.message ?? "Unable to load procurement");
      setAuthenticated(true);
      setData({
        vendors: body.vendors ?? [],
        vendorProducts: body.vendorProducts ?? [],
        products: body.products ?? [],
        purchaseOrders: body.purchaseOrders ?? [],
        invoices: body.invoices ?? [],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load procurement");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!draftKey.trim()) return;
    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: draftKey.trim() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAuthenticated(false);
      setError(body?.message ?? "Unable to sign in");
      return;
    }
    setDraftKey("");
    setAuthenticated(true);
    await load();
  }

  async function ensureVendor(extracted: Extraction) {
    if (!extracted.vendorName?.trim()) throw new Error("Vendor name could not be read from the invoice. Re-upload a clearer invoice.");
    const response = await fetch("/api/admin/procurement/vendors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: extracted.vendorName,
        gstin: extracted.vendorGstin ?? "",
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message ?? "Unable to resolve vendor master");
    return body as Vendor & { reused?: boolean };
  }

  async function resolveLine(vendorId: string, raw: ExtractedLine, index: number): Promise<WorkLine> {
    const style = canonical(raw.vendorStyleCode);
    let vendorProductId: string | null = null;
    let productId: string | null = null;

    if (style) {
      const params = new URLSearchParams({ vendorId, vendorStyleCode: style });
      const response = await fetch("/api/admin/procurement/material?" + params.toString(), { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.mapped && body?.mapping?.productId) {
        vendorProductId = body.mapping.id;
        productId = body.mapping.productId;
      }
    }

    return {
      ...raw,
      key: String(index) + ":" + (style || raw.rawDescription),
      vendorStyleCodeDraft: style,
      vendorProductId,
      productId,
      selectedProductId: productId ?? "",
      sizeQty: {},
    };
  }

  async function uploadInvoice(file: File) {
    setExtracting(true);
    setError(null);
    setNotice(null);
    setExtraction(null);
    setVendor(null);
    setWorkLines([]);
    setPo(null);
    setIr(null);

    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/procurement/invoice-extract", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to read vendor invoice");

      const extracted = body as Extraction;
      if (!extracted.lines?.length) throw new Error("No garment/material lines could be read from this invoice.");
      const resolvedVendor = await ensureVendor(extracted);
      const lines = await Promise.all(extracted.lines.map((line, index) => resolveLine(resolvedVendor.id, line, index)));

      setExtraction(extracted);
      setVendor(resolvedVendor);
      setWorkLines(lines);
      setNotice(
        (resolvedVendor as any).reused
          ? "Invoice read. Existing vendor #" + resolvedVendor.code + " reused."
          : "Invoice read. New vendor #" + resolvedVendor.code + " created automatically.",
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to process invoice");
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function productFor(line: WorkLine) {
    return data.products.find((product) => product.id === line.productId) ?? null;
  }

  function uniqueSizeVariants(product: Product) {
    const bySize = new Map<string, Variant>();
    for (const variant of product.variants.filter((item) => item.active !== false)) {
      if (!bySize.has(variant.size)) bySize.set(variant.size, variant);
    }
    return [...bySize.values()];
  }

  function lineSizeTotal(line: WorkLine) {
    return Object.values(line.sizeQty).reduce((sum, value) => sum + Number(value || 0), 0);
  }

  const allMapped = useMemo(
    () => workLines.length > 0 && workLines.every((line) => Boolean(line.productId && line.vendorProductId && line.vendorStyleCodeDraft)),
    [workLines],
  );

  const allInvoiceQuantitiesValid = useMemo(
    () => workLines.length > 0 && workLines.every((line) =>
      Number.isInteger(line.quantity) &&
      Number(line.quantity) > 0 &&
      lineSizeTotal(line) === line.quantity,
    ),
    [workLines],
  );

  async function mapLine(line: WorkLine, productId: string) {
    if (!vendor || !productId || !line.vendorStyleCodeDraft) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/procurement/vendor-products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorId: vendor.id,
          productId,
          vendorStyleCode: line.vendorStyleCodeDraft,
          vendorProductName: line.rawDescription,
          hsn: line.hsn ?? "",
          defaultUnitCostPaise: paise(line.unitCostRupees),
          packPattern: [],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to map vendor material");

      setWorkLines((current) => current.map((item) =>
        item.key === line.key
          ? { ...item, vendorProductId: body.id, productId: body.productId, selectedProductId: body.productId, sizeQty: {} }
          : item,
      ));
      setNotice("Vendor material " + line.vendorStyleCodeDraft + " mapped to " + body.product.internalCode + ".");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to map material");
    } finally {
      setBusy(false);
    }
  }

  function setLineStyle(lineKey: string, value: string) {
    setWorkLines((current) => current.map((line) =>
      line.key === lineKey
        ? {
            ...line,
            vendorStyleCodeDraft: canonical(value),
            vendorProductId: null,
            productId: null,
            selectedProductId: "",
            sizeQty: {},
          }
        : line,
    ));
  }

  function setSelectedProduct(lineKey: string, productId: string) {
    setWorkLines((current) => current.map((line) =>
      line.key === lineKey ? { ...line, selectedProductId: productId } : line,
    ));
  }

  function setSizeQty(lineKey: string, variantId: string, value: string) {
    if (value && !/^\d+$/.test(value)) return;
    setWorkLines((current) => current.map((line) =>
      line.key === lineKey ? { ...line, sizeQty: { ...line.sizeQty, [variantId]: value } } : line,
    ));
  }

  async function createPo() {
    if (!vendor || !extraction || !allMapped) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/procurement/purchase-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorId: vendor.id,
          orderDate: new Date((extraction.invoiceDate || todayIso()) + "T12:00:00").toISOString(),
          note: "Created from uploaded vendor invoice " + (extraction.invoiceNumber ?? extraction.originalFilename),
          lines: workLines.map((line) => ({
            vendorProductId: line.vendorProductId,
            productId: line.productId,
            vendorStyleCode: line.vendorStyleCodeDraft,
            description: line.rawDescription,
            orderedQuantity: line.quantity,
            unitCostPaise: paise(line.unitCostRupees),
            hsn: line.hsn,
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to create purchase order");
      setPo(body);
      setNotice("Purchase Order " + body.poNumber + " created. Enter size quantities and post Invoice Receipt.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create purchase order");
    } finally {
      setBusy(false);
    }
  }

  async function postIr() {
    if (!vendor || !extraction || !po || !allMapped || !allInvoiceQuantitiesValid) return;
    if (!extraction.invoiceNumber || !extraction.invoiceDate) {
      setError("Invoice number/date must be readable before IR can be posted.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/procurement/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorId: vendor.id,
          invoiceNumber: extraction.invoiceNumber,
          invoiceDate: new Date(extraction.invoiceDate + "T12:00:00").toISOString(),
          purchaseReference: po.poNumber,
          purchaseOrderId: po.id,
          originalFilename: extraction.originalFilename,
          subtotalPaise: paise(extraction.subtotalRupees),
          taxPaise: paise(extraction.taxRupees),
          totalPaise: paise(extraction.totalRupees),
          lines: workLines.map((line) => {
            const poLine = po.lines.find((candidate) => canonical(candidate.vendorStyleCode) === line.vendorStyleCodeDraft);
            return {
              rawDescription: line.rawDescription,
              vendorStyleCode: line.vendorStyleCodeDraft,
              hsn: line.hsn,
              invoiceQuantity: line.quantity,
              unitCostPaise: paise(line.unitCostRupees),
              amountPaise: paise(line.amountRupees),
              purchaseOrderLineId: poLine?.id,
              manualVariants: Object.entries(line.sizeQty)
                .map(([variantId, value]) => ({ variantId, quantity: Number(value || 0) }))
                .filter((row) => row.quantity > 0),
            };
          }),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to post Invoice Receipt");
      setIr(body);
      setNotice("Invoice Receipt " + body.invoiceNumber + " posted against " + po.poNumber + ". Ready for Goods Receipt.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to post Invoice Receipt");
    } finally {
      setBusy(false);
    }
  }

  function resetDocument() {
    setExtraction(null);
    setVendor(null);
    setWorkLines([]);
    setPo(null);
    setIr(null);
    setError(null);
    setNotice(null);
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
          <p>Purchase Order → Invoice Receipt → Goods Receipt.</p>
          {error && <div className={styles.error}>{error}</div>}
          <form onSubmit={unlock}>
            <input type="password" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Admin key" autoFocus />
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
        <div className={styles.topActions}>
          {extraction && <button type="button" className={styles.secondary} onClick={resetDocument}>New document</button>}
          <button type="button" className={styles.secondary} onClick={() => void load()} disabled={busy}>Refresh</button>
        </div>
      </header>

      <section className={styles.heading}>
        <p className={styles.eyebrow}>PROCUREMENT · SAP-STYLE DOCUMENT FLOW</p>
        <h1>Purchase Order → IR → GR</h1>
        <p>Master data is reused automatically. Create a vendor or HIDI material only when the uploaded invoice introduces something new.</p>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.success} role="status">{notice}</div>}

      <section className={styles.flow}>
        <div data-active={!extraction}><span>01</span><strong>Invoice source</strong><small>PDF / JPEG / PNG</small></div>
        <div data-active={Boolean(extraction && !allMapped)}><span>02</span><strong>Vendor + Material</strong><small>Reuse or create master</small></div>
        <div data-active={Boolean(allMapped && !po)}><span>03</span><strong>Purchase Order</strong><small>Vendor + HIDI material</small></div>
        <div data-active={Boolean(po && !ir)}><span>04</span><strong>Invoice Receipt</strong><small>Size total = invoice qty</small></div>
        <div data-active={Boolean(ir)}><span>05</span><strong>Goods Receipt</strong><small>Warehouse actual + barcode</small></div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}>
          <div><p className={styles.eyebrow}>STEP 01</p><h2>Upload vendor invoice</h2></div>
          <span>Accepted: PDF · JPEG · PNG</span>
        </div>

        {!extraction ? (
          <label className={styles.uploadZone} aria-disabled={extracting}>
            <strong>{extracting ? "Reading invoice…" : "Choose vendor invoice"}</strong>
            <span>HIDI reads vendor, invoice number/date, vendor material code, total line quantity, rate and amount.</span>
            <small>Size quantities are deliberately not auto-created; warehouse/procurement staff enters them after material resolution.</small>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              disabled={extracting}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadInvoice(file);
              }}
            />
          </label>
        ) : (
          <div className={styles.documentSummary}>
            <div><span>SOURCE FILE</span><strong>{extraction.originalFilename}</strong></div>
            <div><span>VENDOR</span><strong>{vendor ? "#" + vendor.code + " · " + vendor.name : extraction.vendorName ?? "Unreadable"}</strong></div>
            <div><span>INVOICE</span><strong>{extraction.invoiceNumber ?? "Unreadable"}</strong></div>
            <div><span>DATE</span><strong>{extraction.invoiceDate ?? "Unreadable"}</strong></div>
            <div><span>INVOICE TOTAL</span><strong>{moneyRupees(extraction.totalRupees)}</strong></div>
          </div>
        )}

        {extraction?.warnings?.length ? (
          <div className={styles.warnings}>
            <strong>Document review</strong>
            {extraction.warnings.map((warning, index) => <span key={index}>{warning}</span>)}
          </div>
        ) : null}
      </section>

      {extraction && vendor && (
        <section className={styles.card}>
          <div className={styles.cardTitle}>
            <div><p className={styles.eyebrow}>STEP 02</p><h2>Vendor & Material resolution</h2></div>
            <span>Vendor #{vendor.code} · {vendor.name}</span>
          </div>

          <div className={styles.materialLines}>
            {workLines.map((line, index) => {
              const product = productFor(line);
              const qty = line.quantity;
              const sizeTotal = lineSizeTotal(line);
              const sizeVariants = product ? uniqueSizeVariants(product) : [];
              const multipleColors = product ? new Set(product.variants.map((variant) => variant.color)).size > 1 : false;

              return (
                <article className={styles.materialLine} key={line.key}>
                  <header>
                    <div>
                      <span>ITEM {String(index + 1).padStart(2, "0")}</span>
                      <strong>{line.rawDescription}</strong>
                    </div>
                    <div className={styles.fixedQty}>
                      <span>INVOICE QTY · READ ONLY</span>
                      <strong>{qty ?? "?"}</strong>
                    </div>
                  </header>

                  <div className={styles.materialIdentity}>
                    <label>
                      <span>Vendor material / dress code</span>
                      <input
                        value={line.vendorStyleCodeDraft}
                        onChange={(event) => setLineStyle(line.key, event.target.value)}
                        placeholder="Could not read code"
                      />
                    </label>

                    {product && line.vendorProductId ? (
                      <div className={styles.hidiMaterial}>
                        <span>HIDI MATERIAL</span>
                        <strong>{product.internalCode}</strong>
                        <small>{product.internalName || product.name}</small>
                        <em>Existing mapping reused</em>
                      </div>
                    ) : (
                      <div className={styles.resolveBox}>
                        <label>
                          <span>HIDI material</span>
                          <select
                            value={line.selectedProductId}
                            onChange={(event) => setSelectedProduct(line.key, event.target.value)}
                          >
                            <option value="">Select existing HIDI material</option>
                            {data.products.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.internalCode} · {item.internalName || item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={busy || !line.selectedProductId || !line.vendorStyleCodeDraft}
                          onClick={() => void mapLine(line, line.selectedProductId)}
                        >
                          Use & map material
                        </button>
                        <div className={styles.createInline}>
                          <CreateProductInReceipt
                            disabled={busy || !line.vendorStyleCodeDraft}
                            onVariants={(variants: ReceiveVariant[]) => {
                              const newProductId = variants[0]?.productId;
                              if (newProductId) void mapLine(line, newProductId);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {product && line.vendorProductId && (
                    <div className={styles.sizeEntry}>
                      <div className={styles.sizeHeader}>
                        <div>
                          <strong>Enter size quantities</strong>
                          <span>Only size quantities are entered by staff. Invoice total quantity stays fixed.</span>
                        </div>
                        <b data-match={qty != null && sizeTotal === qty}>
                          {sizeTotal} / {qty ?? "?"}
                        </b>
                      </div>
                      {multipleColors && (
                        <p className={styles.colorNote}>This HIDI material has multiple colours; size rows show the linked variant colour for audit clarity.</p>
                      )}
                      <div className={styles.sizeGrid}>
                        {sizeVariants.map((variant) => (
                          <label key={variant.id}>
                            <span>SIZE {variant.size}</span>
                            {multipleColors && <small>{variant.color}</small>}
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              value={line.sizeQty[variant.id] ?? ""}
                              onChange={(event) => setSizeQty(line.key, variant.id, event.target.value)}
                              placeholder="0"
                            />
                          </label>
                        ))}
                      </div>
                      {qty != null && sizeTotal !== qty && (
                        <div className={styles.qtyMismatch}>
                          Size quantity total must equal invoice quantity {qty}. Difference: {qty - sizeTotal}.
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {extraction && vendor && (
        <section className={styles.card}>
          <div className={styles.cardTitle}>
            <div><p className={styles.eyebrow}>STEP 03–05</p><h2>PO → IR → GR</h2></div>
            <span>Document flow</span>
          </div>

          <div className={styles.documentActions}>
            <div data-done={Boolean(po)}>
              <span>03 · PURCHASE ORDER</span>
              <strong>{po?.poNumber ?? "Not created"}</strong>
              <small>Vendor + mapped HIDI material + invoice-derived total quantity/rate.</small>
              {!po && (
                <button type="button" onClick={() => void createPo()} disabled={busy || !allMapped}>
                  Create Purchase Order
                </button>
              )}
            </div>

            <div data-done={Boolean(ir)}>
              <span>04 · INVOICE RECEIPT</span>
              <strong>{ir?.invoiceNumber ?? "Not posted"}</strong>
              <small>IR is blocked until every line's entered size quantities equal its fixed invoice quantity.</small>
              {po && !ir && (
                <button type="button" onClick={() => void postIr()} disabled={busy || !allInvoiceQuantitiesValid}>
                  Post Invoice Receipt
                </button>
              )}
            </div>

            <div data-done={Boolean(ir)}>
              <span>05 · GOODS RECEIPT</span>
              <strong>{ir ? "Ready for warehouse" : "Waiting for IR"}</strong>
              <small>GR records physical accepted/rejected sizes and creates the barcode/stock lot.</small>
              {ir && (
                <Link href={"/admin/inventory/receive?invoice=" + encodeURIComponent(ir.id)}>
                  Open Goods Receipt →
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      <section className={styles.card}>
        <div className={styles.cardTitle}>
          <div><p className={styles.eyebrow}>DOCUMENT HISTORY</p><h2>Recent procurement documents</h2></div>
          <span>PO / IR / GR progress</span>
        </div>
        <div className={styles.historyTable}>
          <div className={styles.historyHead}><span>PO</span><span>Vendor</span><span>Ordered</span><span>IR</span><span>GR</span><span>Status</span></div>
          {data.purchaseOrders.length === 0 ? (
            <div className={styles.empty}>No purchase orders yet.</div>
          ) : data.purchaseOrders.slice(0, 20).map((item) => (
            <div className={styles.historyRow} key={item.id}>
              <strong>{item.poNumber}</strong>
              <span>#{item.vendor.code} · {item.vendor.name}</span>
              <span>{item.orderedQuantity}</span>
              <span>{item.invoicedQuantity}</span>
              <span>{item.receivedQuantity}</span>
              <b>{item.status.replaceAll("_", " ")}</b>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
