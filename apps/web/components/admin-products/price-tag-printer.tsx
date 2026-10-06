"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { productApi } from "@/lib/admin-products-client";
import type { PriceTagList, PriceTagVariant } from "@/lib/admin-products-contract";
import { encodeCode128B } from "@/lib/code128";
import base from "./products.module.css";
import styles from "./price-tags.module.css";

type StockFilter = "ALL" | "IN_STOCK";
type ProductFilter = "ALL" | "DRAFT" | "ACTIVE" | "ARCHIVED";
type PresetKey = "50x90" | "50x80" | "60x100";
type PrintLine = { item: PriceTagVariant; quantity: number };
type BusinessDetails = {
  legalName: string;
  address: string;
  consumerCareEmail: string;
  consumerCarePhone: string;
  website: string;
  countryOfOrigin: string;
};

const EMPTY_RESULT: PriceTagList = {
  items: [],
  total: 0,
  productCount: 0,
  totalOnHand: 0,
  truncated: false,
};
const DETAILS_STORAGE_KEY = "hidi.price-tags.business-details.v1";
const PRESET_STORAGE_KEY = "hidi.price-tags.preset.v1";
const MAX_PRINT_TAGS = 5000;
const MAX_SKU_QUANTITY = 5000;
const DEFAULT_DETAILS: BusinessDetails = {
  legalName: "",
  address: "",
  consumerCareEmail: "",
  consumerCarePhone: "",
  website: "thehidi.com",
  countryOfOrigin: "India",
};
const PRESETS: Record<PresetKey, { label: string; width: number; height: number; note: string }> = {
  "50x90": { label: "50 × 90 mm", width: 50, height: 90, note: "Recommended for the complete legal footer" },
  "50x80": { label: "50 × 80 mm", width: 50, height: 80, note: "Compact swing tag" },
  "60x100": { label: "60 × 100 mm", width: 60, height: 100, note: "Large, easiest to scan" },
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatMoney(paise: number) {
  return inr.format(paise / 100);
}

function cm(value: number | null) {
  if (value == null) return null;
  const result = value / 10;
  return Number.isInteger(result) ? String(result) : result.toFixed(1);
}

function measurements(item: PriceTagVariant) {
  const values = [
    ["Bust", item.bustMm],
    ["Waist", item.waistMm],
    ["Hip", item.hipMm],
    ["Shoulder", item.shoulderMm],
    ["Sleeve", item.sleeveLengthMm],
    ["Length", item.garmentLengthMm],
  ] as const;
  return values.flatMap(([label, value]) => {
    const metric = cm(value);
    return metric ? [`${label} ${metric} cm`] : [];
  });
}

function hasMetricSize(item: PriceTagVariant) {
  return measurements(item).length > 0;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function compactText(value: string | null, maxLength: number) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function barcodeMarkup(value: string) {
  const encoded = encodeCode128B(value);
  const bars = encoded.bars.map((bar) => `<rect x="${bar.x}" y="0" width="${bar.width}" height="${encoded.height}"/>`).join("");
  return `<svg viewBox="0 0 ${encoded.width} ${encoded.height}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">${bars}</svg>`;
}

function labelMarkup(item: PriceTagVariant, details: BusinessDetails, logoUrl: string) {
  const metric = measurements(item);
  const sizeLine = [`Size ${item.size}`, ...metric].join(" · ");
  const fabric = compactText(item.fabric, 62);
  const care = compactText(item.care, 78) || "Refer to the sewn-in care label";
  const address = escapeHtml(details.address).replace(/\r?\n/g, "<br>");
  const website = details.website.trim() ? `<div class="website">${escapeHtml(details.website.trim())}</div>` : "";
  return `<article class="price-tag">
    <header class="brand"><img src="${escapeHtml(logoUrl)}" alt="HIDI"></header>
    <section class="identity">
      <div class="product-name">${escapeHtml(item.productName)}</div>
      <div class="product-meta">${escapeHtml(item.category ?? "HIDI Womenswear")} · ${escapeHtml(item.color)}</div>
      <div class="sku">SKU ${escapeHtml(item.sku)}</div>
      <div class="size-line">${escapeHtml(sizeLine)}</div>
      ${fabric ? `<div class="fabric">Fabric: ${escapeHtml(fabric)}</div>` : ""}
    </section>
    <section class="price-block">
      <span>MRP</span><strong>${escapeHtml(formatMoney(item.mrpPaise))}</strong>
      <small>INCLUSIVE OF ALL TAXES</small>
    </section>
    <section class="barcode">${barcodeMarkup(item.barcode)}<div>${escapeHtml(item.barcode)}</div></section>
    <section class="legal">
      <div><b>Marketed by:</b> ${escapeHtml(details.legalName.trim())}</div>
      <div>${address}</div>
      <div><b>Country of origin:</b> ${escapeHtml(details.countryOfOrigin.trim())}</div>
      <div><b>Consumer care:</b> ${escapeHtml(details.consumerCareEmail.trim())} · ${escapeHtml(details.consumerCarePhone.trim())}</div>
      <div><b>Care:</b> ${escapeHtml(care)}</div>
      ${website}
    </section>
  </article>`;
}

function printDocument(lines: PrintLine[], details: BusinessDetails, presetKey: PresetKey, logoUrl: string) {
  const preset = PRESETS[presetKey];
  const compact = preset.height <= 80;
  const labels: string[] = [];
  for (const line of lines) {
    const label = labelMarkup(line.item, details, logoUrl);
    for (let copy = 0; copy < line.quantity; copy++) labels.push(label);
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>HIDI Price Tags</title>
<style>
  @page { size: ${preset.width}mm ${preset.height}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  .price-tag { width: ${preset.width}mm; height: ${preset.height}mm; padding: ${compact ? 2.6 : 3.1}mm; overflow: hidden; display: flex; flex-direction: column; page-break-after: always; break-after: page; }
  .price-tag:last-child { page-break-after: auto; break-after: auto; }
  .brand { height: ${compact ? 11.5 : 13.5}mm; display: flex; align-items: center; justify-content: center; border-bottom: .25mm solid #000; padding-bottom: ${compact ? 1.2 : 1.5}mm; flex: 0 0 auto; }
  .brand img { display: block; width: ${compact ? 30 : 34}mm; height: 100%; object-fit: contain; }
  .identity { padding: ${compact ? 1.4 : 1.8}mm 0 ${compact ? 1.1 : 1.5}mm; border-bottom: .2mm solid #000; text-align: center; flex: 0 0 auto; }
  .product-name { font-family: Georgia, "Times New Roman", serif; font-size: ${compact ? 8.1 : 9.2}pt; font-weight: 700; line-height: 1.12; text-transform: uppercase; }
  .product-meta, .sku, .fabric { margin-top: .7mm; font-size: ${compact ? 5.6 : 6.1}pt; line-height: 1.15; text-transform: uppercase; letter-spacing: .02em; }
  .size-line { margin-top: .9mm; font-size: ${compact ? 6.2 : 6.8}pt; line-height: 1.18; font-weight: 700; text-transform: uppercase; }
  .price-block { display: grid; grid-template-columns: auto 1fr; column-gap: 1.8mm; align-items: baseline; justify-items: center; padding: ${compact ? 1.2 : 1.6}mm 0 ${compact ? .8 : 1.1}mm; flex: 0 0 auto; }
  .price-block span { justify-self: end; font-size: ${compact ? 7 : 7.8}pt; font-weight: 700; }
  .price-block strong { justify-self: start; font-size: ${compact ? 17.5 : 20}pt; line-height: 1; }
  .price-block small { grid-column: 1 / -1; font-size: ${compact ? 5.1 : 5.7}pt; letter-spacing: .06em; margin-top: .5mm; }
  .barcode { text-align: center; padding: 0 ${compact ? .8 : 1.2}mm ${compact ? .7 : 1}mm; flex: 0 0 auto; }
  .barcode svg { display: block; width: 100%; height: ${compact ? 9.2 : 11.2}mm; fill: #000; }
  .barcode div { margin-top: .3mm; font-size: ${compact ? 5.3 : 5.8}pt; letter-spacing: .18em; }
  .legal { border-top: .2mm solid #000; padding-top: ${compact ? .8 : 1.1}mm; font-size: ${compact ? 4.7 : 5.25}pt; line-height: 1.22; text-align: left; overflow: hidden; flex: 1 1 auto; }
  .legal div + div { margin-top: .35mm; }
  .website { text-align: center; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
</style></head><body>${labels.join("")}</body></html>`;
}

async function printInFrame(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "HIDI price tag print job");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDoc = frame.contentDocument;
  if (!printWindow || !printDoc) {
    frame.remove();
    throw new Error("The browser could not create the print preview.");
  }
  printDoc.open();
  printDoc.write(html);
  printDoc.close();

  await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
  const images = Array.from(printDoc.images);
  await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  })));
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };
  printWindow.onafterprint = cleanup;
  printWindow.focus();
  printWindow.print();
  window.setTimeout(cleanup, 120_000);
}

function BarcodeSvg({ value }: { value: string }) {
  const encoded = encodeCode128B(value);
  return <svg viewBox={`0 0 ${encoded.width} ${encoded.height}`} preserveAspectRatio="none" shapeRendering="crispEdges" role="img" aria-label={`Barcode ${value}`}>
    {encoded.bars.map((bar, index) => <rect key={`${bar.x}-${index}`} x={bar.x} y={0} width={bar.width} height={encoded.height} />)}
  </svg>;
}

function TagPreview({ item, details }: { item: PriceTagVariant | undefined; details: BusinessDetails }) {
  if (!item) return <div className={styles.previewEmpty}>Choose a product or load in-stock SKUs to preview the tag.</div>;
  const metric = measurements(item);
  return <div className={styles.previewTag}>
    <img src="/brand/hidi-logo-price-tag.svg" alt="HIDI — Wear the Feeling" />
    <div className={styles.previewIdentity}>
      <strong>{item.productName}</strong>
      <span>{item.category ?? "HIDI Womenswear"} · {item.color}</span>
      <small>SKU {item.sku}</small>
      <b>{[`Size ${item.size}`, ...metric].join(" · ")}</b>
    </div>
    <div className={styles.previewPrice}><span>MRP</span><strong>{formatMoney(item.mrpPaise)}</strong><small>INCLUSIVE OF ALL TAXES</small></div>
    <div className={styles.previewBarcode}><BarcodeSvg value={item.barcode} /><span>{item.barcode}</span></div>
    <div className={styles.previewLegal}>
      <div><b>Marketed by:</b> {details.legalName || "Your legal entity"}</div>
      <div>{details.address || "Complete postal address"}</div>
      <div><b>Country of origin:</b> {details.countryOfOrigin || "—"}</div>
      <div><b>Consumer care:</b> {details.consumerCareEmail || "email"} · {details.consumerCarePhone || "phone"}</div>
    </div>
  </div>;
}

function validateBusiness(details: BusinessDetails) {
  const errors: string[] = [];
  if (!details.legalName.trim()) errors.push("Legal entity / marketed-by name");
  if (!details.address.trim()) errors.push("Complete postal address");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.consumerCareEmail.trim())) errors.push("Valid consumer-care email");
  if (details.consumerCarePhone.replace(/\D/g, "").length < 8) errors.push("Valid consumer-care phone");
  if (!details.countryOfOrigin.trim()) errors.push("Country of origin");
  return errors;
}

export function PriceTagPrinter({ initialProductId }: { initialProductId?: string }) {
  const [result, setResult] = useState<PriceTagList>(EMPTY_RESULT);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProductFilter>(initialProductId ? "ALL" : "ACTIVE");
  const [stock, setStock] = useState<StockFilter>("IN_STOCK");
  const [reload, setReload] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [details, setDetails] = useState<BusinessDetails>(DEFAULT_DETAILS);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [preset, setPreset] = useState<PresetKey>("50x90");
  const autoSelected = useRef(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DETAILS_STORAGE_KEY);
      if (stored) setDetails({ ...DEFAULT_DETAILS, ...JSON.parse(stored) as Partial<BusinessDetails> });
      const savedPreset = window.localStorage.getItem(PRESET_STORAGE_KEY);
      if (savedPreset && savedPreset in PRESETS) setPreset(savedPreset as PresetKey);
    } catch {
      // Corrupt local preferences should never block catalogue access.
    } finally {
      setDetailsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!detailsLoaded) return;
    window.localStorage.setItem(DETAILS_STORAGE_KEY, JSON.stringify(details));
  }, [details, detailsLoaded]);

  useEffect(() => {
    if (!detailsLoaded) return;
    window.localStorage.setItem(PRESET_STORAGE_KEY, preset);
  }, [preset, detailsLoaded]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSuccess(null);
    const params = new URLSearchParams({ q: query, status, stock });
    if (initialProductId) params.set("productId", initialProductId);
    void productApi<PriceTagList>(`/price-tags?${params}`).then((data) => {
      if (!active) return;
      setResult(data);
      if (initialProductId && !autoSelected.current) {
        const initial: Record<string, number> = {};
        for (const item of data.items) if (item.onHand > 0) initial[item.variantId] = Math.min(item.onHand, MAX_SKU_QUANTITY);
        setQuantities(initial);
        autoSelected.current = true;
      } else {
        setQuantities({});
      }
    }).catch((reason) => {
      if (!active) return;
      setResult(EMPTY_RESULT);
      setQuantities({});
      setError(reason instanceof Error ? reason.message : "Unable to load price-tag data.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [initialProductId, query, reload, status, stock]);

  const selectedLines = useMemo<PrintLine[]>(() => result.items.flatMap((item) => {
    const quantity = quantities[item.variantId] ?? 0;
    return quantity > 0 ? [{ item, quantity }] : [];
  }), [quantities, result.items]);
  const selectedTags = selectedLines.reduce((sum, line) => sum + line.quantity, 0);
  const selectedSkus = selectedLines.length;
  const selectedMissingMetrics = selectedLines.filter((line) => !hasMetricSize(line.item));
  const missingMetrics = result.items.filter((item) => !hasMetricSize(item)).length;
  const businessErrors = useMemo(() => validateBusiness(details), [details]);
  const previewItem = selectedLines[0]?.item ?? result.items[0];

  function setQuantity(variantId: string, rawValue: number) {
    const value = Number.isFinite(rawValue) ? Math.min(MAX_SKU_QUANTITY, Math.max(0, Math.trunc(rawValue))) : 0;
    setQuantities((previous) => {
      const next = { ...previous };
      if (value > 0) next[variantId] = value;
      else delete next[variantId];
      return next;
    });
  }

  function selectStockQuantities() {
    const next: Record<string, number> = {};
    for (const item of result.items) if (item.onHand > 0) next[item.variantId] = Math.min(item.onHand, MAX_SKU_QUANTITY);
    setQuantities(next);
  }

  function selectOneEach() {
    setQuantities(Object.fromEntries(result.items.map((item) => [item.variantId, 1])));
  }

  async function performPrint(lines: PrintLine[], label: string, truncated = false) {
    if (truncated) throw new Error("This result exceeds 5,000 SKUs. Narrow the filters before printing.");
    if (!lines.length) throw new Error("Select at least one SKU and quantity.");
    const total = lines.reduce((sum, line) => sum + line.quantity, 0);
    if (total > MAX_PRINT_TAGS) throw new Error(`A single print job can contain at most ${MAX_PRINT_TAGS.toLocaleString("en-IN")} tags.`);
    const missing = lines.filter((line) => !hasMetricSize(line.item));
    if (missing.length) {
      const names = [...new Set(missing.slice(0, 3).map((line) => `${line.item.productName} / ${line.item.size}`))].join(", ");
      throw new Error(`${missing.length} selected SKU${missing.length === 1 ? " is" : "s are"} missing metric garment measurements (${names}). Add a bust, waist, hip, shoulder, sleeve or garment-length value before printing.`);
    }
    const legal = validateBusiness(details);
    if (legal.length) throw new Error(`Complete the saved tag details before printing: ${legal.join(", ")}.`);
    if (total > 1000 && !window.confirm(`This will send ${total.toLocaleString("en-IN")} individual tags to the printer. Continue?`)) return;
    const html = printDocument(lines, details, preset, `${window.location.origin}/brand/hidi-logo-price-tag.svg`);
    await printInFrame(html);
    setSuccess(`${label}: ${total.toLocaleString("en-IN")} tag${total === 1 ? "" : "s"} prepared. In the print dialog use 100% / Actual size, no margins, and disable headers and footers.`);
  }

  async function printSelected() {
    if (printing) return;
    setPrinting(true);
    setError(null);
    setSuccess(null);
    try { await performPrint(selectedLines, "Selected print job", result.truncated); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to prepare the print job."); }
    finally { setPrinting(false); }
  }

  async function printAllActiveStock() {
    if (printing) return;
    setPrinting(true);
    setError(null);
    setSuccess(null);
    try {
      const params = new URLSearchParams({ status: "ACTIVE", stock: "IN_STOCK" });
      const all = await productApi<PriceTagList>(`/price-tags?${params}`);
      const lines = all.items.filter((item) => item.onHand > 0).map((item) => ({ item, quantity: Math.min(item.onHand, MAX_SKU_QUANTITY) }));
      await performPrint(lines, "All active in-stock products", all.truncated);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to prepare all stock tags."); }
    finally { setPrinting(false); }
  }

  return <>
    <div className={base.heading}>
      <div>
        <p className={base.eyebrow}>HIDI OPERATIONS · THERMAL PRINT</p>
        <h1>Price tags & barcodes</h1>
        <p>One clean workflow for a single product, selected SKUs, or the complete active stock quantity.</p>
      </div>
      <div className={base.buttonGroup}>
        <Link href="/admin/products">← Products</Link>
        <button className={base.primary} type="button" onClick={() => void printAllActiveStock()} disabled={printing || loading}>
          {printing ? "Preparing…" : "Print all active stock"}
        </button>
      </div>
    </div>

    {initialProductId && <div className={base.notice}><strong>Product mode:</strong> in-stock SKUs for the selected product are preselected. Adjust quantities, complete the saved business details once, then print.</div>}
    {error && <div className={base.error} role="alert">{error}</div>}
    {success && <div className={base.success} role="status">{success}</div>}

    <div className={styles.workspace}>
      <div>
        <section className={base.card}>
          <div className={base.sectionTitle}><span>01</span><div><h2>Find and select labels</h2><p>The barcode is a short, stable HIDI item code; the full SKU remains printed below the product details.</p></div></div>
          <div className={styles.filters}>
            <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setQuery(search.trim()); }} className={styles.searchForm}>
              <label>Product, SKU or barcode<input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Search name, SKU or scan H… barcode" maxLength={160} /></label>
              <button type="submit" disabled={loading}>Search</button>
            </form>
            <label>Status<select value={status} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStatus(event.target.value as ProductFilter)}><option value="ACTIVE">Published</option><option value="DRAFT">Drafts</option><option value="ARCHIVED">Archived</option><option value="ALL">All products</option></select></label>
            <label>Stock<select value={stock} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStock(event.target.value as StockFilter)}><option value="IN_STOCK">In stock</option><option value="ALL">All active SKUs</option></select></label>
            <button type="button" onClick={() => setReload((value) => value + 1)} disabled={loading}>Refresh</button>
          </div>

          <div className={styles.summary} aria-live="polite">
            <div><strong>{loading ? "—" : result.productCount}</strong><span>Products</span></div>
            <div><strong>{loading ? "—" : result.total}</strong><span>SKUs</span></div>
            <div><strong>{loading ? "—" : result.totalOnHand.toLocaleString("en-IN")}</strong><span>Pieces on hand</span></div>
            <div data-warning={missingMetrics > 0}><strong>{loading ? "—" : missingMetrics}</strong><span>Need metric size</span></div>
          </div>

          <div className={styles.selectionBar}>
            <div><strong>{selectedSkus} SKUs · {selectedTags.toLocaleString("en-IN")} labels</strong><small>Quantities default to physical on-hand stock when selected in bulk.</small></div>
            <div>
              <button type="button" onClick={selectStockQuantities} disabled={loading || !result.items.length}>Select stock qty</button>
              <button type="button" onClick={selectOneEach} disabled={loading || !result.items.length}>One each</button>
              <button type="button" onClick={() => setQuantities({})} disabled={!selectedSkus}>Clear</button>
            </div>
          </div>

          {result.truncated && <div className={base.error}>The response was capped at 5,000 SKUs. Narrow the search before printing.</div>}
          {loading ? <div className={styles.loading}>Loading printable SKUs…</div> : result.items.length === 0 ? <div className={base.empty}>No SKUs match this view. Adjust the product status, stock filter or search.</div> : <div className={base.tableWrap}>
            <table className={`${base.table} ${styles.table}`}>
              <thead><tr><th>Select</th><th>Product / codes</th><th>Colour</th><th>Size & metric</th><th>MRP</th><th>Stock</th><th>Labels</th><th /></tr></thead>
              <tbody>{result.items.map((item) => {
                const quantity = quantities[item.variantId] ?? 0;
                const metric = measurements(item);
                const missing = metric.length === 0;
                return <tr key={item.variantId} data-invalid={missing}>
                  <td><input className={styles.checkbox} type="checkbox" aria-label={`Select ${item.sku}`} checked={quantity > 0} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuantity(item.variantId, event.target.checked ? Math.max(1, item.onHand) : 0)} /></td>
                  <td><div className={styles.productCell}><strong>{item.productName}</strong><small>{item.sku}</small><small>Barcode {item.barcode}</small></div></td>
                  <td>{item.color}</td>
                  <td><strong>{item.size}</strong>{missing ? <small className={styles.missing}>Metric measurement required</small> : <small>{metric.join(" · ")}</small>}</td>
                  <td>{formatMoney(item.mrpPaise)}</td>
                  <td><strong>{item.onHand}</strong><small>{item.reserved} reserved</small></td>
                  <td><input className={styles.quantity} type="number" min={0} max={MAX_SKU_QUANTITY} inputMode="numeric" value={quantity || ""} placeholder="0" aria-label={`Labels for ${item.sku}`} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuantity(item.variantId, Number(event.target.value))} /></td>
                  <td><Link href={`/admin/products/${encodeURIComponent(item.productId)}`}>{missing ? "Add size →" : "Edit →"}</Link></td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
        </section>

        <section className={base.card}>
          <div className={base.sectionTitle}><span>02</span><div><h2>Saved legal & consumer-care details</h2><p>Enter these once on this computer. They are automatically reused for every print job and are never added to the product database.</p></div></div>
          <div className={styles.detailsGrid}>
            <label>Legal entity / marketed by<input value={details.legalName} onChange={(event: ChangeEvent<HTMLInputElement>) => setDetails((value) => ({ ...value, legalName: event.target.value }))} placeholder="Registered business / proprietor name" maxLength={120} /></label>
            <label>Country of origin<input value={details.countryOfOrigin} onChange={(event: ChangeEvent<HTMLInputElement>) => setDetails((value) => ({ ...value, countryOfOrigin: event.target.value }))} maxLength={80} /></label>
            <label className={styles.address}>Complete postal address<textarea value={details.address} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDetails((value) => ({ ...value, address: event.target.value }))} placeholder="Door / street, area, city, state and PIN code" rows={3} maxLength={320} /></label>
            <label>Consumer-care email<input type="email" value={details.consumerCareEmail} onChange={(event: ChangeEvent<HTMLInputElement>) => setDetails((value) => ({ ...value, consumerCareEmail: event.target.value }))} placeholder="care@thehidi.com" maxLength={120} /></label>
            <label>Consumer-care phone<input value={details.consumerCarePhone} onChange={(event: ChangeEvent<HTMLInputElement>) => setDetails((value) => ({ ...value, consumerCarePhone: event.target.value }))} placeholder="+91 …" maxLength={40} /></label>
            <label>Website (optional)<input value={details.website} onChange={(event: ChangeEvent<HTMLInputElement>) => setDetails((value) => ({ ...value, website: event.target.value }))} maxLength={120} /></label>
          </div>
          <div className={styles.savedState} data-complete={businessErrors.length === 0}>{businessErrors.length ? `Still required: ${businessErrors.join(", ")}.` : "Complete · saved automatically on this device."}</div>
        </section>

        <section className={base.card}>
          <div className={base.sectionTitle}><span>03</span><div><h2>Tag size & print</h2><p>The output is vector-based for sharp 300-DPI thermal-transfer printing. One tag is sent per physical page.</p></div></div>
          <div className={styles.presets}>{(Object.keys(PRESETS) as PresetKey[]).map((key) => <label key={key} data-active={preset === key}><input type="radio" name="tag-preset" value={key} checked={preset === key} onChange={() => setPreset(key)} /><strong>{PRESETS[key].label}</strong><small>{PRESETS[key].note}</small></label>)}</div>
          <div className={styles.printChecklist}><strong>Printer dialog settings</strong><span>Thermal printer · Actual size / 100% · Margins none · Headers and footers off · Correct media size loaded</span></div>
          {selectedMissingMetrics.length > 0 && <div className={base.error}>{selectedMissingMetrics.length} selected SKU{selectedMissingMetrics.length === 1 ? " is" : "s are"} missing a metric garment measurement and will block printing.</div>}
          <div className={styles.finalActions}>
            <div><strong>{selectedTags.toLocaleString("en-IN")} tags ready</strong><small>Maximum {MAX_PRINT_TAGS.toLocaleString("en-IN")} tags per job.</small></div>
            <button className={base.primary} type="button" onClick={() => void printSelected()} disabled={printing || loading || selectedTags === 0}>{printing ? "Preparing print…" : "Print selected tags"}</button>
          </div>
        </section>
      </div>

      <aside className={styles.previewPanel}>
        <div className={styles.previewHeader}><div><p className={base.eyebrow}>LIVE PREVIEW</p><strong>{PRESETS[preset].label}</strong></div><span>MONOCHROME · 300 DPI READY</span></div>
        <TagPreview item={previewItem} details={details} />
        <p className={styles.previewNote}>The on-screen preview is scaled. The print job uses the exact millimetre dimensions selected on the left.</p>
      </aside>
    </div>
  </>;
}
