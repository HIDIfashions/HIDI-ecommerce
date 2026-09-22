"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import styles from "./stock-receipt.module.css";
import { CreateProductInReceipt } from "@/components/admin-products/create-product-in-receipt";
import { appendNewReceiptLines } from "@/lib/admin-products-contract";
import { BulkReceiptCsvImport } from "@/components/admin-import/bulk-receipt-csv-import";
import { uploadSkuPhotoBatch } from "@/lib/sku-photo-batch";
import { AdminNav } from "@/components/admin/admin-nav";

type Variant = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  onHand: number;
  imageUrl?: string | null;
  photoCount?: number;
};

type ReceiptLine = Variant & {
  vendorInvoiceLineId?: string | null;
  purchaseOrderLineId?: string | null;
  expectedQuantity?: number | null;
  acceptedQuantity: string;
  rejectedQuantity: string;
  unitCostRupees: string;
};

type ProcurementInvoice = {
  id: string;
  invoiceNumber: string;
  purchaseOrderId?: string | null;
  invoiceDate: string;
  purchaseReference?: string | null;
  status: string;
  vendor: { id: string; name: string };
  lines: Array<{
    id: string;
    purchaseOrderLineId?: string | null;
    invoiceQuantity: number;
    unitCostPaise?: number | null;
    vendorProduct?: { id: string; product: { id: string; name: string } } | null;
    expectedVariants: Array<{
      expectedQuantity: number;
      variant: { id: string; sku: string; color: string; size: string };
    }>;
    receiptLines: Array<{
      variantId: string;
      acceptedQuantity: number;
      rejectedQuantity: number;
    }>;
  }>;
};

type Receipt = {
  id: string;
  receiptNumber: string;
  supplierName: string;
  invoiceNumber?: string | null;
  purchaseOrderNumber?: string | null;
  receivedAt: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  totalAccepted: number;
  totalRejected: number;
  lines: Array<{ id: string }>;
};

function today() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function AdminStockReceiptClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [vendorInvoices, setVendorInvoices] = useState<ProcurementInvoice[]>([]);
  const [vendorInvoiceId, setVendorInvoiceId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const queuedInvoiceRef = useRef<string | null>(null);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [search, setSearch] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [receivedAt, setReceivedAt] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [photoProgress, setPhotoProgress] = useState("");
  const [postedReceipt, setPostedReceipt] = useState<{ id: string; receiptNumber: string; totalAccepted: number } | null>(null);
  const photoLock = useRef(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [inventoryResponse, receiptsResponse, procurementResponse] = await Promise.all([
        fetch("/api/admin/inventory", { cache: "no-store" }),
        fetch("/api/admin/inventory/receipts", { cache: "no-store" }),
        fetch("/api/admin/procurement", { cache: "no-store" }),
      ]);
      if (inventoryResponse.status === 401 || receiptsResponse.status === 401 || procurementResponse.status === 401) {
        setAuthenticated(false);
        return;
      }
      const inventoryBody = await inventoryResponse.json().catch(() => ({}));
      const receiptsBody = await receiptsResponse.json().catch(() => ([]));
      const procurementBody = await procurementResponse.json().catch(() => ({}));
      if (!inventoryResponse.ok) throw new Error(inventoryBody?.message ?? "Unable to load SKUs");
      if (!receiptsResponse.ok) throw new Error(receiptsBody?.message ?? "Unable to load receipts");
      if (!procurementResponse.ok) throw new Error(procurementBody?.message ?? "Unable to load vendor invoices");
      setAuthenticated(true);
      setVariants(inventoryBody.rows ?? []);
      // Refresh photo metadata, not the operator's quantities or purchase costs.
      setLines((current) => current.map((line) => {
        const latest = (inventoryBody.rows ?? []).find((candidate: Variant) => candidate.variantId === line.variantId);
        return latest ? { ...line, onHand: latest.onHand, imageUrl: latest.imageUrl, photoCount: latest.photoCount } : line;
      }));
      setReceipts(Array.isArray(receiptsBody) ? receiptsBody : []);
      setVendorInvoices(
        (procurementBody.invoices ?? []).filter((invoice: ProcurementInvoice) =>
          ["AWAITING_STOCK", "PARTIALLY_RECEIVED", "RECEIVED"].includes(invoice.status),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load stock receiving");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (typeof window === "undefined" || !vendorInvoices.length || vendorInvoiceId) return;
    const queued = new URLSearchParams(window.location.search).get("invoice")?.trim();
    if (!queued || queuedInvoiceRef.current === queued) return;
    if (!vendorInvoices.some((invoice) => invoice.id === queued)) return;
    queuedInvoiceRef.current = queued;
    selectVendorInvoice(queued);
  }, [vendorInvoices, vendorInvoiceId]);

  useEffect(() => {
    if (!photoBusy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [photoBusy]);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    const selected = new Set(lines.map((line) => line.variantId));
    const linkedInvoice = vendorInvoices.find((invoice) => invoice.id === vendorInvoiceId);
    const allowedProducts = linkedInvoice
      ? new Set(linkedInvoice.lines.map((line) => line.vendorProduct?.product.id).filter(Boolean) as string[])
      : null;

    return variants
      .filter((variant) => !selected.has(variant.variantId))
      .filter((variant) => !allowedProducts || allowedProducts.has(variant.productId))
      .filter((variant) =>
        [variant.productName, variant.sku, variant.color, variant.size]
          .some((value) => value.toLowerCase().includes(needle)),
      )
      .slice(0, 12);
  }, [lines, search, variants, vendorInvoiceId, vendorInvoices]);

  const totals = useMemo(() => lines.reduce((result, line) => ({
    accepted: result.accepted + Number(line.acceptedQuantity || 0),
    rejected: result.rejected + Number(line.rejectedQuantity || 0),
    value: result.value + Number(line.acceptedQuantity || 0) * Number(line.unitCostRupees || 0),
  }), { accepted: 0, rejected: 0, value: 0 }), [lines]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!draftKey.trim()) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: draftKey.trim() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAuthenticated(false);
      setError(body?.message ?? "Unable to sign in");
      setBusy(false);
      return;
    }
    setDraftKey("");
    await load();
  }

  async function lock() {
    if (photoLock.current || busy) return;
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    setAuthenticated(false);
    setVariants([]);
    setReceipts([]);
    setVendorInvoices([]);
    setVendorInvoiceId("");
    setPurchaseOrderId("");
  }

  function selectVendorInvoice(nextId: string) {
    setVendorInvoiceId(nextId);
    setError(null);
    setMessage(null);
    setPostedReceipt(null);

    if (!nextId) {
      setSupplierName("");
      setInvoiceNumber("");
      setPurchaseOrderNumber("");
      setPurchaseOrderId("");
      setLines([]);
      return;
    }

    const invoice = vendorInvoices.find((candidate) => candidate.id === nextId);
    if (!invoice) return;

    setSupplierName(invoice.vendor.name);
    setInvoiceNumber(invoice.invoiceNumber);
    setPurchaseOrderNumber(invoice.purchaseReference ?? "");
    setPurchaseOrderId(invoice.purchaseOrderId ?? "");

    const inventoryById = new Map(variants.map((variant) => [variant.variantId, variant]));
    const prepared: ReceiptLine[] = [];

    for (const invoiceLine of invoice.lines) {
      for (const expected of invoiceLine.expectedVariants) {
        const variant = inventoryById.get(expected.variant.id);
        if (!variant) continue;
        const previouslyAccepted = invoiceLine.receiptLines
          .filter((row) => row.variantId === variant.variantId)
          .reduce((sum, row) => sum + row.acceptedQuantity, 0);
        const outstanding = Math.max(0, expected.expectedQuantity - previouslyAccepted);
        if (outstanding === 0) continue;

        prepared.push({
          ...variant,
          vendorInvoiceLineId: invoiceLine.id,
          purchaseOrderLineId: invoiceLine.purchaseOrderLineId ?? null,
          expectedQuantity: outstanding,
          acceptedQuantity: String(outstanding),
          rejectedQuantity: "0",
          unitCostRupees:
            invoiceLine.unitCostPaise === null || invoiceLine.unitCostPaise === undefined
              ? ""
              : String(invoiceLine.unitCostPaise / 100),
        });
      }
    }

    if (!prepared.length) {
      setError("This invoice has no outstanding mapped variants. Review it in Procurement before receiving.");
      setLines([]);
      return;
    }

    setLines(prepared);
    setMessage(
      "Expected variants loaded from vendor invoice " +
        invoice.invoiceNumber +
        ". Edit Accepted/Rejected to the physical warehouse actuals before posting.",
    );
  }

  function addLine(variant: Variant) {
    const invoice = vendorInvoices.find((candidate) => candidate.id === vendorInvoiceId);
    const sourceLine = invoice?.lines.find((line) => line.vendorProduct?.product.id === variant.productId) ?? null;

    setLines((current) => [
      ...current,
      {
        ...variant,
        vendorInvoiceLineId: sourceLine?.id ?? null,
        purchaseOrderLineId: sourceLine?.purchaseOrderLineId ?? null,
        expectedQuantity: 0,
        acceptedQuantity: "",
        rejectedQuantity: "0",
        unitCostRupees:
          sourceLine?.unitCostPaise === null || sourceLine?.unitCostPaise === undefined
            ? ""
            : String(sourceLine.unitCostPaise / 100),
      },
    ]);
    setSearch("");
  }

  function updateLine(variantId: string, field: keyof Pick<ReceiptLine, "acceptedQuantity" | "rejectedQuantity" | "unitCostRupees">, value: string) {
    setLines((current) => current.map((line) => line.variantId === variantId ? { ...line, [field]: value } : line));
  }

  async function uploadPhoto(variantId: string, files: File[], applyToColor: boolean) {
    if (photoLock.current || busy || !files.length) return;
    photoLock.current = true;
    setPhotoBusy(variantId);
    setPhotoProgress("");
    setError(null);
    setMessage(null);
    let failure: string | null = null;
    let success: string | null = null;
    try {
      const result = await uploadSkuPhotoBatch({
        variantId, files, applyToColor,
        onProgress: ({ current, total }) => setPhotoProgress(`Uploading ${current} of ${total}…`),
      });
      success = `${result.uploaded} photo${result.uploaded === 1 ? "" : "s"} attached ${applyToColor ? "to all existing sizes in this colour" : "to this SKU"}.`;
    } catch (caught) {
      failure = caught instanceof Error ? caught.message : "Unable to upload photos";
    } finally {
      // load() preserves receipt quantities/costs through the Product Management patch.
      // It also clears errors, so display any batch failure AFTER the refresh.
      await load();
      if (failure) setError(failure);
      if (success) setMessage(success);
      setPhotoProgress("");
      setPhotoBusy(null);
      photoLock.current = false;
    }
  }

  async function save(action: "DRAFT" | "POST") {
    if (photoLock.current || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/inventory/receipts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          supplierName,
          invoiceNumber,
          purchaseOrderNumber,
          vendorInvoiceId: vendorInvoiceId || null,
          purchaseOrderId: purchaseOrderId || null,
          receivedAt: new Date(`${receivedAt}T12:00:00`).toISOString(),
          note,
          action,
          lines: lines.map((line) => ({
            variantId: line.variantId,
            vendorInvoiceLineId: line.vendorInvoiceLineId ?? null,
            purchaseOrderLineId: line.purchaseOrderLineId ?? null,
            acceptedQuantity: Number(line.acceptedQuantity || 0),
            rejectedQuantity: Number(line.rejectedQuantity || 0),
            unitCostPaise: line.unitCostRupees === "" ? null : Math.round(Number(line.unitCostRupees) * 100),
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(". ") : body?.message ?? "Unable to save receipt");
      setMessage(action === "POST" ? `${body.receiptNumber} posted. Sellable stock is updated and price-tag barcodes are ready.` : `${body.receiptNumber} saved as draft. Stock is unchanged.`);
      if (action === "POST") {
        setPostedReceipt({
          id: body.id,
          receiptNumber: body.receiptNumber,
          totalAccepted: body.totalAccepted ?? totals.accepted,
        });
      } else {
        setPostedReceipt(null);
      }
      setLines([]);
      setSupplierName("");
      setInvoiceNumber("");
      setPurchaseOrderNumber("");
      setVendorInvoiceId("");
      setPurchaseOrderId("");
      setNote("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save receipt");
    } finally {
      setBusy(false);
    }
  }

  async function postDraft(receiptId: string) {
    if (photoLock.current || busy) return;
    if (!window.confirm("Post this receipt and add all accepted pieces to on-hand stock?")) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/inventory/receipts/${encodeURIComponent(receiptId)}/post`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body?.message ?? "Unable to post receipt");
    else {
      setMessage(`${body.receiptNumber} posted. Sellable stock is updated and price-tag barcodes are ready.`);
      setPostedReceipt({
        id: body.id,
        receiptNumber: body.receiptNumber,
        totalAccepted: body.totalAccepted ?? 0,
      });
    }
    await load();
  }

  if (authenticated === null) return <main className={styles.loginPage}><section className={styles.loginCard}>Checking admin session…</section></main>;
  if (!authenticated) return (
    <main className={styles.loginPage}>
      <section className={styles.loginCard}>
        <p className={styles.eyebrow}>HIDI OPERATIONS</p><h1>Admin access</h1>
        <p>Enter the private admin key configured for this environment.</p>
        {error && <div className={styles.error}>{error}</div>}
        <form onSubmit={unlock}><input type="password" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Admin key" autoFocus /><button disabled={busy}>Open dashboard</button></form>
      </section>
    </main>
  );

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><p className={styles.eyebrow}>HIDI ADMIN</p><AdminNav /></div>
        <button type="button" className={styles.secondaryButton} onClick={() => void lock()}>Lock admin</button>
      </header>

      <section className={styles.heading}>
        <div><Link href="/admin/inventory">← Back to inventory</Link><h1>Receive stock</h1><p>Select the uploaded vendor invoice, verify physical size/colour actuals, then post accepted pieces into inventory.</p></div>
        <div className={styles.totals}><span><b>{totals.accepted}</b> accepted</span><span><b>{totals.rejected}</b> rejected</span><span><b>₹{totals.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b> cost</span></div>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {message && <div className={styles.success} role="status">{message}</div>}
      {postedReceipt && (
        <section className={styles.labelReady} aria-label="Price-tag barcodes ready">
          <div>
            <p className={styles.eyebrow}>NEXT STEP</p>
            <strong>Price-tag barcodes ready</strong>
            <span>
              {postedReceipt.totalAccepted} accepted piece{postedReceipt.totalAccepted === 1 ? "" : "s"} from {postedReceipt.receiptNumber}.
              Attach one barcode label to each garment before it is shelved.
            </span>
          </div>
          <Link
            href={"/admin/inventory/receipts/" + encodeURIComponent(postedReceipt.id) + "/labels"}
            target="_blank"
          >
            Print {postedReceipt.totalAccepted} price-tag label{postedReceipt.totalAccepted === 1 ? "" : "s"}
          </Link>
        </section>
      )}

      <section className={styles.card}>
        <div className={styles.sectionTitle}><span>01</span><div><h2>Delivery details</h2><p>Link the vendor invoice whenever possible. A PO / purchase reference is optional.</p></div></div>
        <div className={styles.invoiceSelector}>
          <label>
            <span>Vendor invoice</span>
            <select value={vendorInvoiceId} onChange={(event) => selectVendorInvoice(event.target.value)}>
              <option value="">Manual receipt / legacy stock</option>
              {vendorInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.vendor.name} · {invoice.invoiceNumber} · {invoice.status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <small>
            Expected variants come from explicit invoice sizes or the saved Vendor Product Master pack pattern.
          </small>
        </div>
        <div className={styles.detailsGrid}>
          <label><span>Supplier / manufacturer *</span><input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Manufacturer name" readOnly={Boolean(vendorInvoiceId)} /></label>
          <label><span>Invoice number</span><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="INV-2026-0042" readOnly={Boolean(vendorInvoiceId)} /></label>
          <label><span>PO / purchase ref. (optional)</span><input value={purchaseOrderNumber} onChange={(event) => setPurchaseOrderNumber(event.target.value)} placeholder="Optional reference" readOnly={Boolean(vendorInvoiceId)} /></label>
          <label><span>Received date *</span><input type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} /></label>
          <label className={styles.full}><span>Delivery note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional courier, carton or quality notes" /></label>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionTitle}><span>02</span><div><h2>Verify invoice vs warehouse actuals</h2><p>Expected quantities are prefilled. Change Accepted/Rejected to what warehouse physically verifies.</p></div></div>
        <BulkReceiptCsvImport disabled={busy || Boolean(photoBusy)} variants={variants} onRows={(incoming) => {
          const importedBySku = new Map(incoming.map((row) => [row.sku.trim().toUpperCase(), row]));
          setLines((current) => {
            const byId = new Map(current.map((line) => [line.variantId, line]));
            for (const variant of variants) {
              const imported = importedBySku.get(variant.sku.trim().toUpperCase());
              if (!imported) continue;
              byId.set(variant.variantId, { ...variant, acceptedQuantity: imported.acceptedQuantity, rejectedQuantity: imported.rejectedQuantity, unitCostRupees: imported.unitCostRupees });
            }
            return Array.from(byId.values());
          });
          setSearch("");
          setMessage(`${incoming.length} spreadsheet line${incoming.length === 1 ? "" : "s"} added to this receipt. Review supplier, quantities and costs before posting.`);
        }} />
        <CreateProductInReceipt disabled={busy || Boolean(photoBusy)} onVariants={(incoming) => {
          setVariants((current) => {
            const byId = new Map(current.map((variant) => [variant.variantId, variant]));
            incoming.forEach((variant) => byId.set(variant.variantId, variant));
            return Array.from(byId.values());
          });
          setLines((current) => appendNewReceiptLines(current, incoming));
          setSearch("");
          setMessage("Product SKUs added to this receipt. Enter accepted quantities and purchase costs; stock changes only when you post.");
        }} />
        <div className={styles.searchBox}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, colour or size" />
          {matches.length > 0 && <div className={styles.results}>{matches.map((variant) => <button type="button" key={variant.variantId} onClick={() => addLine(variant)}><span><b>{variant.productName}</b><small>{variant.sku}</small></span><em>{variant.color} · {variant.size}</em><i>{variant.onHand} on hand</i></button>)}</div>}
        </div>

        {lines.length === 0 ? <div className={styles.empty}>No SKUs added yet. Search above to begin this receipt.</div> : <div className={styles.lines}>
          {lines.map((line) => <ReceiptLineRow key={line.variantId} line={line} busy={busy || Boolean(photoBusy)} uploading={photoBusy === line.variantId} progress={photoBusy === line.variantId ? photoProgress : ""} onChange={updateLine} onRemove={() => setLines((current) => current.filter((item) => item.variantId !== line.variantId))} onUpload={uploadPhoto} />)}
        </div>}

        <div className={styles.actions}>
          <p>Posting is final: accepted quantities will be added to on-hand inventory.</p>
          <div><button className={styles.secondaryButton} type="button" disabled={busy || Boolean(photoBusy) || !lines.length} onClick={() => void save("DRAFT")}>Save draft</button><button className={styles.primaryButton} type="button" disabled={busy || Boolean(photoBusy) || !lines.length} onClick={() => void save("POST")}>{busy ? "Saving…" : "Confirm & post receipt"}</button></div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionTitle}><span>03</span><div><h2>Recent receipts</h2><p>Draft receipts do not affect inventory until posted.</p></div></div>
        <div className={styles.receipts}>{receipts.length === 0 ? <div className={styles.empty}>No receipts yet.</div> : receipts.map((receipt) => <div key={receipt.id} className={styles.receipt}><div><strong>{receipt.receiptNumber}</strong><small>{receipt.supplierName} · {new Date(receipt.receivedAt).toLocaleDateString("en-IN")}</small></div><span>{receipt.lines.length} SKUs</span><span>{receipt.totalAccepted} accepted</span><b data-status={receipt.status}>{receipt.status}</b>{receipt.status === "DRAFT" ? (
          <button type="button" disabled={busy || Boolean(photoBusy)} onClick={() => void postDraft(receipt.id)}>Post</button>
        ) : receipt.status === "POSTED" ? (
          <Link
            className={styles.tagLink}
            href={"/admin/inventory/receipts/" + encodeURIComponent(receipt.id) + "/labels"}
            target="_blank"
          >
            Print tags
          </Link>
        ) : <span />}</div>)}</div>
      </section>
    </main>
  );
}

function ReceiptLineRow({ line, busy, uploading, progress, onChange, onRemove, onUpload }: {
  line: ReceiptLine;
  busy: boolean;
  uploading: boolean;
  progress: string;
  onChange: (id: string, field: keyof Pick<ReceiptLine, "acceptedQuantity" | "rejectedQuantity" | "unitCostRupees">, value: string) => void;
  onRemove: () => void;
  onUpload: (id: string, files: File[], applyToColor: boolean) => Promise<void>;
}) {
  const [applyToColor, setApplyToColor] = useState(true);
  return <article className={styles.line}>
    <div className={styles.lineIdentity}>{line.imageUrl ? <img src={line.imageUrl} alt="" /> : <div className={styles.placeholder}>H</div>}<div><strong>{line.productName}</strong><small>{line.sku}</small><span>{line.color} · {line.size} · {line.onHand} currently on hand</span></div></div>
    <div className={styles.expectedQty}><span>Expected</span><strong>{line.expectedQuantity ?? "—"}</strong></div>
    <label><span>Accepted actual</span><input type="number" min="0" step="1" value={line.acceptedQuantity} onChange={(event) => onChange(line.variantId, "acceptedQuantity", event.target.value)} /></label>
    <label><span>Rejected</span><input type="number" min="0" step="1" value={line.rejectedQuantity} onChange={(event) => onChange(line.variantId, "rejectedQuantity", event.target.value)} /></label>
    <label><span>Unit cost ₹</span><input type="number" min="0" step="0.01" value={line.unitCostRupees} onChange={(event) => onChange(line.variantId, "unitCostRupees", event.target.value)} /></label>
    <div className={styles.photoControl}>
      <label className={styles.fileButton} aria-disabled={busy}>
        {uploading ? "Uploading photos…" : line.photoCount ? `Add photos (${line.photoCount})` : "Add SKU photos"}
        <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy}
          aria-label={`Add photos for ${line.sku}`}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (files.length) void onUpload(line.variantId, files, applyToColor);
          }} />
      </label>
      <label className={styles.check}><input type="checkbox" checked={applyToColor} disabled={busy} onChange={(event) => setApplyToColor(event.target.checked)} /> Use for all {line.color} sizes</label>
      <small style={{ display: "block", lineHeight: 1.4 }} role="status" aria-live="polite">{uploading ? progress : "Select up to 8 photos · max 5 MB each. Selection starts upload."}</small>
    </div>
    <button type="button" className={styles.remove} disabled={busy} onClick={onRemove} aria-label={`Remove ${line.sku}`}>×</button>
  </article>;
}
