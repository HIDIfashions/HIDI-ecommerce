"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { productApi } from "@/lib/admin-products-client";
import type { Option, ProductList, ProductOptions, ProductRecord } from "@/lib/admin-products-contract";
import { rupeesToPaise } from "@/lib/admin-products-contract";
import { normalizeProductRows, comboKey, skuKey, variantFor, sha256Text, importDetails } from "@/lib/hidi-bulk-import";
import type { BulkProductRow, InventoryRowLite } from "@/lib/hidi-bulk-import";
import { downloadCsv, makeCsv, readSpreadsheet } from "@/lib/hidi-spreadsheet";
import { photoCandidatesFromFiles, photoCandidatesFromZip, uploadPhotoCandidate } from "@/lib/hidi-bulk-photos";
import type { PhotoCandidate } from "@/lib/hidi-bulk-photos";
import { preflightMappings, saveImageSku } from "../../../../deploy/admin-tools/image-sku-client.mjs";
import styles from "./bulk-import.module.css";

const PRODUCT_HEADERS = ["mode", "product_name", "product_slug", "category", "short_description", "description", "fabric", "care", "color", "color_hex", "size", "selling_price", "mrp", "weight_grams", "opening_qty", "sku", "image_sku"];
const PRODUCT_SAMPLE = [
  ["NEW", "HIDI Meera Cotton Kurta", "hidi-meera-cotton-kurta", "Kurtas", "Soft cotton workwear kurta", "", "Cotton", "Gentle wash", "Maroon", "#800000", "M", "1499.00", "1799.00", 350, 10, ""],
  ["NEW", "HIDI Meera Cotton Kurta", "hidi-meera-cotton-kurta", "Kurtas", "Soft cotton workwear kurta", "", "Cotton", "Gentle wash", "Maroon", "#800000", "L", "1499.00", "1799.00", 350, 8, ""],
  ["STOCK", "", "", "", "", "", "", "", "", "", "", "", "", "", 5, "HIDI-EXISTING-SKU"],
];
const RECEIPT_HEADERS = ["sku", "accepted_qty", "rejected_qty", "unit_cost"];
const RECEIPT_SAMPLE = [["HIDI-EXISTING-SKU-M", 10, 0, "825.00"], ["HIDI-EXISTING-SKU-L", 8, 1, "825.00"]];

type ImportLog = { row: number; state: "DONE" | "SKIPPED" | "FAILED"; message: string };
type InventoryResponse = { rows?: InventoryRowLite[] };
type Movement = { reference?: string | null };

async function adminJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(". ") : body?.message ?? `Request failed (${response.status}).`);
  return body as T;
}
function canonical(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
function weight(row: BulkProductRow) { return row.weightGrams ? Number(row.weightGrams) : null; }
function rowPrices(row: BulkProductRow) { return { pricePaise: rupeesToPaise(row.sellingPrice, "Selling price"), mrpPaise: rupeesToPaise(row.mrp, "MRP"), weightGrams: weight(row) }; }
function optionMatches(option: Option, value: string) { const key = canonical(value); return canonical(option.name) === key || canonical(option.slug) === key; }

export function BulkImportClient() {
  const productInput = useRef<HTMLInputElement>(null); const imagesInput = useRef<HTMLInputElement>(null); const zipInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BulkProductRow[]>([]); const [sheetName, setSheetName] = useState(""); const [batchRef, setBatchRef] = useState("");
  const [logs, setLogs] = useState<ImportLog[]>([]); const [importing, setImporting] = useState(false); const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  const [variants, setVariants] = useState<InventoryRowLite[]>([]); const [photos, setPhotos] = useState<PhotoCandidate[]>([]); const [photoSource, setPhotoSource] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false); const [photoProgress, setPhotoProgress] = useState(""); const [applyToColor, setApplyToColor] = useState(false);

  async function refreshVariants() {
    const body = await adminJson<InventoryResponse>("/api/admin/inventory?status=ALL"); setVariants(body.rows ?? []);
  }
  useEffect(() => { void refreshVariants().catch(e => setError(e instanceof Error ? e.message : "Unable to load inventory SKUs.")); }, []);

  async function chooseProducts(file?: File) {
    if (!file || importing) return;
    setError(null); setMessage(null); setLogs([]); setRows([]); setSheetName(file.name);
    try {
      const sheet = await readSpreadsheet(file); const normalized = normalizeProductRows(sheet);
      if (!normalized.length) throw new Error("No import rows were found below the header.");
      const hash = await sha256Text(JSON.stringify(sheet)); setBatchRef(`BULK-${hash.slice(0, 20).toUpperCase()}`); setRows(normalized);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to read product spreadsheet."); }
  }

  const invalidRows = useMemo(() => rows.filter(row => row.errors.length), [rows]);
  const counts = useMemo(() => ({ newRows: rows.filter(r => r.mode === "NEW").length, stockRows: rows.filter(r => r.mode === "STOCK").length, openingPieces: rows.reduce((n, r) => n + r.openingQty, 0) }), [rows]);

  async function ensureCategory(name: string, options: ProductOptions): Promise<{ id: string | null; options: ProductOptions }> {
    if (!name) return { id: null, options };
    const found = options.categories.find(option => optionMatches(option, name)); if (found) return { id: found.id, options };
    try {
      const created = await productApi<Option>("/categories", "POST", { name });
      return { id: created.id, options: { ...options, categories: [...options.categories, created] } };
    } catch (caught) {
      // A concurrent import may have created it; refresh before failing.
      const latest = await productApi<ProductOptions>("/options"); const retry = latest.categories.find(option => optionMatches(option, name));
      if (retry) return { id: retry.id, options: latest }; throw caught;
    }
  }

  async function exactProduct(slug: string, cache: Map<string, ProductRecord | null>) {
    if (cache.has(slug)) return cache.get(slug) ?? null;
    const list = await productApi<ProductList>(`?${new URLSearchParams({ q: slug, status: "ALL", page: "1" })}`);
    const summary = list.items.find(item => item.slug === slug); const product = summary ? await productApi<ProductRecord>(`/${encodeURIComponent(summary.id)}`) : null;
    cache.set(slug, product); return product;
  }

  async function alreadyReceived(variantId: string, reference: string) {
    const body = await adminJson<{ movements?: Movement[] }>(`/api/admin/inventory/${encodeURIComponent(variantId)}/history`);
    return (body.movements ?? []).some(item => item.reference === reference);
  }

  async function receiveOpening(variantId: string, quantity: number, reference: string) {
    if (quantity < 1) return "No opening stock";
    if (await alreadyReceived(variantId, reference)) return "Opening stock already recorded for this batch";
    await adminJson(`/api/admin/inventory/${encodeURIComponent(variantId)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "RECEIVE", quantity, reason: "RECEIPT", reference, note: "Bulk catalogue/opening-stock import" }),
    });
    return `+${quantity} opening stock`;
  }

  async function applyProducts() {
    if (!rows.length || invalidRows.length || importing) return;
    if (!window.confirm(`Import ${rows.length} rows? This can create draft products/SKUs and add ${counts.openingPieces} opening-stock pieces. Purchase cost is NOT recorded here; use Bulk Receipt for supplier deliveries.`)) return;
    setImporting(true); setError(null); setMessage(null); setLogs([]); setProgress("");
    window.dispatchEvent(new CustomEvent("hidi:bulk-busy", { detail: { busy: true } }));
    const report: ImportLog[] = []; const productCache = new Map<string, ProductRecord | null>();
    const detailsSaved = new Set<string>(); const failedProducts = new Set<string>(); const savedImageSkus = new Set<string>();
    try {
      await preflightMappings(rows);
      let options = await productApi<ProductOptions>("/options");
      const inventory = await adminJson<InventoryResponse>("/api/admin/inventory?status=ALL"); let inventoryBySku = new Map((inventory.rows ?? []).map(row => [skuKey(row.sku), row]));
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index]; setProgress(`Processing row ${index + 1} of ${rows.length}…`);
        try {
          if (row.mode === "STOCK") {
            const found = inventoryBySku.get(skuKey(row.sku)); if (!found) throw new Error(`SKU ${row.sku} was not found.`);
            const result = await receiveOpening(found.variantId, row.openingQty, batchRef); report.push({ row: row.rowNumber, state: result.startsWith("Opening stock already") ? "SKIPPED" : "DONE", message: `${row.sku}: ${result}.` }); continue;
          }
          let product = await exactProduct(row.productSlug, productCache);
          if (!product) {
            const category = await ensureCategory(row.category, options); options = category.options;
            product = await productApi<ProductRecord>("", "POST", {
              requestId: crypto.randomUUID(), name: row.productName, slug: row.productSlug, categoryId: category.id, collectionIds: [], shortDescription: row.shortDescription || null,
              description: row.description || null, fabric: row.fabric || null, care: row.care || null, colors: [{ name: row.color, hex: row.colorHex || null }], sizes: [row.size], ...rowPrices(row),
            });
            productCache.set(row.productSlug, product);
          } else if (!detailsSaved.has(row.productSlug)) {
            const category = row.category ? await ensureCategory(row.category, options) : { id: product.categoryId, options }; options = category.options;
            const payload = importDetails(row, product, category.id);
            if (payload) { product = await productApi<ProductRecord>(`/${encodeURIComponent(product.id)}`, "PATCH", payload); productCache.set(row.productSlug, product); }
          }
          detailsSaved.add(row.productSlug);
          let variant = variantFor(product, row.color, row.size);
          if (!variant) {
            product = await productApi<ProductRecord>(`/${encodeURIComponent(product.id)}/variants`, "POST", { expectedUpdatedAt: product.updatedAt, colors: [{ name: row.color, hex: row.colorHex || null }], sizes: [row.size], ...rowPrices(row) });
            productCache.set(row.productSlug, product); variant = variantFor(product, row.color, row.size);
            if (!variant) throw new Error("SKU was created but could not be reloaded.");
          } else {
            const desired = rowPrices(row);
            if (variant.pricePaise !== desired.pricePaise || variant.mrpPaise !== desired.mrpPaise || variant.weightGrams !== desired.weightGrams) {
              product = await productApi<ProductRecord>(`/${encodeURIComponent(product.id)}/variants/${encodeURIComponent(variant.id)}`, "PATCH", { ...desired, active: variant.active, expectedUpdatedAt: product.updatedAt });
              productCache.set(row.productSlug, product); variant = variantFor(product, row.color, row.size)!;
            }
          }
          if (row.imageSku && !savedImageSkus.has(row.imageSku)) { await saveImageSku(row, product); savedImageSkus.add(row.imageSku); }
          const stockResult = await receiveOpening(variant.id, row.openingQty, batchRef);
          report.push({ row: row.rowNumber, state: stockResult.startsWith("Opening stock already") ? "SKIPPED" : "DONE", message: `${row.imageSku ? `Image SKU ${row.imageSku}` : product.name} · ${variant.color}/${variant.size} · ${variant.sku}: ${stockResult}.` });
          inventoryBySku.set(skuKey(variant.sku), { variantId: variant.id, productName: product.name, sku: variant.sku, color: variant.color, size: variant.size, onHand: variant.inventory?.onHand ?? 0 });
        } catch (caught) { if (row.mode === "NEW") failedProducts.add(row.productSlug); report.push({ row: row.rowNumber, state: "FAILED", message: caught instanceof Error ? caught.message : "Import failed." }); }
        setLogs([...report]);
      }
      const failed = report.filter(item => item.state === "FAILED").length; setMessage(failed ? `Import finished with ${failed} failed row${failed === 1 ? "" : "s"}. Correct only those rows and retry.` : `Import complete. ${report.length} rows saved. Upload photos, then use Publish products in bulk below. Existing publication status is retained until you choose to publish.`);
      window.dispatchEvent(new CustomEvent("hidi:bulk-products-saved", { detail: { ids: [...productCache.entries()].filter(([slug, product]) => product && !failedProducts.has(slug)).map(([, product]) => product!.id) } }));
      await refreshVariants();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Bulk import stopped unexpectedly."); }
    finally { setLogs([...report]); setProgress(""); setImporting(false); window.dispatchEvent(new CustomEvent("hidi:bulk-busy", { detail: { busy: false } })); }
  }

  async function choosePhotoFiles(files: File[]) {
    if (!files.length || photoBusy) return; setError(null); setMessage(null); setPhotos([]); setPhotoSource(`${files.length} selected images`);
    try { setPhotos(await photoCandidatesFromFiles(files, variants)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to prepare photos."); }
  }
  async function chooseZip(file?: File) {
    if (!file || photoBusy) return; setError(null); setMessage(null); setPhotos([]); setPhotoSource(file.name); setPhotoProgress("Reading ZIP…");
    try { setPhotos(await photoCandidatesFromZip(file, variants)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to read photo ZIP."); }
    finally { setPhotoProgress(""); }
  }
  async function uploadPhotos() {
    const invalid = photos.filter(item => item.error); if (!photos.length || invalid.length || photoBusy) return;
    if (!window.confirm(`Upload ${photos.length} photos${applyToColor ? " and apply each to all existing sizes of its matched colour" : " to their matched SKUs"}?`)) return;
    setPhotoBusy(true); setError(null); setMessage(null); let uploaded = 0;
    try {
      for (let i = 0; i < photos.length; i++) {
        setPhotoProgress(`Uploading ${i + 1} of ${photos.length}: ${photos[i].sourceName}`);
        await uploadPhotoCandidate(photos[i], applyToColor); uploaded++;
      }
      setMessage(`${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded successfully.`); setPhotos([]); setPhotoSource(""); await refreshVariants();
    } catch (caught) { setError(`${caught instanceof Error ? caught.message : "Photo upload failed."} ${uploaded} upload${uploaded === 1 ? "" : "s"} were confirmed before the stop. Check saved photos before retrying.`); }
    finally { setPhotoProgress(""); setPhotoBusy(false); if (uploaded) window.dispatchEvent(new CustomEvent("hidi:bulk-photos-saved")); }
  }

  const invalidPhotos = photos.filter(item => item.error).length; const matchedSkus = new Set(photos.filter(item => item.sku).map(item => item.sku)).size;
  return <>
    <div className={styles.hero}><div><p className={styles.eyebrow}>HIDI BULK OPERATIONS</p><h1>Import products, stock & photography</h1><p>Designed for launch inventory: preview first, then process many SKUs without opening 96 product rows one by one.</p></div><div className={styles.heroLinks}><Link href="/admin/products">← Products</Link><Link href="/admin/inventory/receive">Receive stock →</Link></div></div>
    {error && <div className={styles.error} role="alert">{error}</div>}{message && <div className={styles.success}>{message}</div>}
    <nav className={styles.jumpNav} aria-label="Bulk import sections"><a href="#products-stock">Products / opening stock</a><a href="#photos">Bulk photos</a><a href="#receipt">Supplier receipt</a></nav>

    <section id="products-stock" className={styles.card}>
      <div className={styles.sectionTitle}><span>01</span><div><h2>Products + opening stock</h2><p>Upload CSV or XLSX. NEW rows create/update draft products and SKUs. STOCK rows add pieces to an existing SKU.</p></div></div>
      <div className={styles.warning}><strong>Purchase costs are intentionally not recorded here.</strong> Use this for catalogue setup/opening quantities. For a manufacturer delivery where unit cost matters, use the supplier-receipt import below.</div>
      <div className={styles.actionRow}><button type="button" onClick={() => downloadCsv("HIDI-products-stock-import-template.csv", makeCsv(PRODUCT_HEADERS, PRODUCT_SAMPLE))}>Download Excel-compatible template</button><button type="button" className={styles.primary} disabled={importing} onClick={() => productInput.current?.click()}>Choose CSV / XLSX</button><input ref={productInput} className={styles.hiddenInput} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void chooseProducts(file); }} /></div>
      <div className={styles.templateNotes}><code>NEW</code><span>Leave <strong>sku</strong> blank. HIDI generates it from product + colour + size.</span><code>STOCK</code><span>Enter an existing <strong>sku</strong> and opening_qty. Other product columns may be blank.</span></div>
      {rows.length > 0 && <><div className={styles.summaryGrid}><div><span>File</span><strong>{sheetName}</strong></div><div><span>Rows</span><strong>{rows.length}</strong></div><div><span>New product/SKU rows</span><strong>{counts.newRows}</strong></div><div><span>Existing SKU stock rows</span><strong>{counts.stockRows}</strong></div><div><span>Opening pieces</span><strong>{counts.openingPieces.toLocaleString("en-IN")}</strong></div><div><span>Errors</span><strong>{invalidRows.length}</strong></div></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Row</th><th>Mode</th><th>Product / SKU</th><th>Variant</th><th>Price</th><th>Opening qty</th><th>Validation</th></tr></thead><tbody>{rows.slice(0, 150).map(row => <tr key={row.rowNumber} data-invalid={Boolean(row.errors.length)}><td>{row.rowNumber}</td><td>{row.mode}</td><td>{row.mode === "NEW" ? <><strong>{row.productName}</strong><small>{row.productSlug}</small></> : <strong>{row.sku}</strong>}</td><td>{row.mode === "NEW" ? `${row.color} / ${row.size}` : "Existing SKU"}</td><td>{row.mode === "NEW" ? `₹${row.sellingPrice} / MRP ₹${row.mrp}` : "—"}</td><td>{row.openingQty}</td><td>{row.errors.length ? <span className={styles.bad}>{row.errors.join(" ")}</span> : <span className={styles.good}>Ready</span>}</td></tr>)}</tbody></table></div>{rows.length > 150 && <p className={styles.muted}>Showing first 150 of {rows.length} rows. All rows will be processed.</p>}
        <div className={styles.actionRow}><button type="button" disabled={importing} onClick={() => { setRows([]); setLogs([]); setSheetName(""); setBatchRef(""); }}>Clear</button><div className={styles.pushRight}><small>{batchRef && `Safe retry reference: ${batchRef}`}</small><button type="button" className={styles.primary} disabled={importing || Boolean(invalidRows.length)} onClick={() => void applyProducts()}>{importing ? progress || "Importing…" : `Import ${rows.length} rows`}</button></div></div>
      </>}
      {logs.length > 0 && <div className={styles.logBox}><h3>Import results</h3><div className={styles.logScroll}>{logs.map(item => <p key={`${item.row}-${item.message}`} data-state={item.state}><strong>Row {item.row} · {item.state}</strong> {item.message}</p>)}</div></div>}
    </section>

    <section id="photos" className={styles.card}>
      <div className={styles.sectionTitle}><span>02</span><div><h2>Bulk SKU photos</h2><p>Upload hundreds of images together, or a ZIP. HIDI matches each filename to the SKU automatically.</p></div></div>
      <div className={styles.photoRule}><strong>Filename rule</strong><code>KUR_001_1.jpeg</code><code>KUR_001_2.webp</code><span>Add image_sku to the product Excel, for example KUR_001. Numbered photos automatically attach to all sizes of that colour. Existing HIDI SKU filenames also work.</span></div>
      <label className={styles.check}><input type="checkbox" checked={applyToColor} disabled={photoBusy} onChange={event => setApplyToColor(event.target.checked)} /> Apply every uploaded image to all existing sizes of the matched SKU's colour</label>
      <div className={styles.actionRow}><button type="button" disabled={photoBusy} onClick={() => imagesInput.current?.click()}>Select many photos</button><button type="button" disabled={photoBusy} onClick={() => zipInput.current?.click()}>Choose photo ZIP</button><input ref={imagesInput} className={styles.hiddenInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void choosePhotoFiles(files); }} /><input ref={zipInput} className={styles.hiddenInput} type="file" accept=".zip,application/zip" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void chooseZip(file); }} /></div>
      <p className={styles.muted}>{variants.length.toLocaleString("en-IN")} inventory SKUs available for filename matching. Images: JPG/PNG/WebP/AVIF, max 12 MB each, up to 1,000 per batch.</p>
      {photoProgress && <div className={styles.notice} role="status">{photoProgress}</div>}
      {photos.length > 0 && <><div className={styles.summaryGrid}><div><span>Source</span><strong>{photoSource}</strong></div><div><span>Images</span><strong>{photos.length}</strong></div><div><span>Matched SKUs</span><strong>{matchedSkus}</strong></div><div><span>Problems</span><strong>{invalidPhotos}</strong></div></div>
        <div className={styles.photoPreview}>{photos.slice(0, 120).map((item, index) => <div key={`${item.sourceName}-${index}`} data-invalid={Boolean(item.error)}><span>{item.sourceName}</span><strong>{item.sku ?? "Not matched"}</strong><small>{item.error ?? "Ready"}</small></div>)}</div>{photos.length > 120 && <p className={styles.muted}>Showing first 120 of {photos.length} images.</p>}
        <div className={styles.actionRow}><button type="button" disabled={photoBusy} onClick={() => { setPhotos([]); setPhotoSource(""); }}>Clear</button><button type="button" className={styles.primary} disabled={photoBusy || Boolean(invalidPhotos)} onClick={() => void uploadPhotos()}>{photoBusy ? "Uploading…" : `Upload ${photos.length} photos`}</button></div></>}
    </section>

    <section id="receipt" className={styles.card}>
      <div className={styles.sectionTitle}><span>03</span><div><h2>Bulk supplier receipt</h2><p>For manufacturer deliveries, preserve purchase cost and the warehouse receipt audit trail instead of using opening-stock import.</p></div></div>
      <div className={styles.receiptFlow}><div><strong>1. Download template</strong><span>SKU · accepted qty · rejected qty · unit cost</span></div><div><strong>2. Open Receive Stock</strong><span>Use the new Bulk receipt lines control</span></div><div><strong>3. Review and Post once</strong><span>Stock changes only when the receipt is posted</span></div></div>
      <div className={styles.actionRow}><button type="button" onClick={() => downloadCsv("HIDI-receipt-import-template.csv", makeCsv(RECEIPT_HEADERS, RECEIPT_SAMPLE))}>Download receipt template</button><Link className={styles.primaryLink} href="/admin/inventory/receive">Open Receive Stock →</Link></div>
    </section>
  </>;
}
