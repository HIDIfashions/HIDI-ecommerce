"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { productApi } from "@/lib/admin-products-client";
import { money, productSlug, receiveVariants, rupees, rupeesToPaise } from "@/lib/admin-products-contract";
import type { ProductOptions, ProductRecord, ProductState, ProductVariant, ReceiveVariant } from "@/lib/admin-products-contract";
import styles from "./products.module.css";
import { uploadSkuPhotoBatch } from "@/lib/sku-photo-batch";

type Fields = { name: string; slug: string; categoryId: string; shortDescription: string; description: string; fabric: string; care: string; collectionIds: string[] };
type Matrix = { colors: Array<{ name: string; hex: string }>; sizes: string[]; price: string; mrp: string; weight: string };
type VariantDraft = {
  variant: ProductVariant;
  price: string;
  mrp: string;
  weight: string;
  active: boolean;
  bust: string;
  waist: string;
  hip: string;
  shoulder: string;
  sleeveLength: string;
  garmentLength: string;
};
const blankFields = (): Fields => ({ name: "", slug: "", categoryId: "", shortDescription: "", description: "", fabric: "", care: "", collectionIds: [] });
const blankMatrix = (): Matrix => ({ colors: [{ name: "", hex: "" }], sizes: ["M", "L", "XL", "XXL"], price: "", mrp: "", weight: "" });
function toFields(p: ProductRecord): Fields {
  return { name: p.name, slug: p.slug, categoryId: p.categoryId ?? "", shortDescription: p.shortDescription ?? "", description: p.description ?? "", fabric: p.fabric ?? "", care: p.care ?? "", collectionIds: p.collections.map(c => c.collectionId) };
}
function weights(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100000) throw new Error("Weight must be a whole number of grams, or left blank.");
  return Number(value);
}
function measurementMm(value: string, label: string, minMm: number, maxMm: number): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+(?:\.\d)?$/.test(normalized)) throw new Error(`${label}: enter centimetres with at most one decimal place, or leave blank.`);
  const mm = Math.round(Number(normalized) * 10);
  if (!Number.isSafeInteger(mm) || mm < minMm || mm > maxMm) throw new Error(`${label}: value is outside the supported garment range.`);
  return mm;
}
function measurementCm(value: number | null) {
  if (value == null) return "";
  const cm = value / 10;
  return Number.isInteger(cm) ? String(cm) : cm.toFixed(1);
}
function matrixPayload(m: Matrix) {
  const pricePaise = rupeesToPaise(m.price, "Selling price");
  const mrpPaise = rupeesToPaise(m.mrp, "MRP");
  if (pricePaise > mrpPaise) throw new Error("Selling price cannot exceed MRP.");
  if (!m.sizes.length) throw new Error("Choose at least one size.");
  return { colors: m.colors.map(c => ({ name: c.name.trim(), hex: c.hex.trim() || null })), sizes: m.sizes, pricePaise, mrpPaise, weightGrams: weights(m.weight) };
}

type Props = {
  productId?: string;
  onUse?: (variants: ReceiveVariant[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
};
export function ProductEditor({ productId, onUse, onDirtyChange, onBusyChange }: Props) {
  const router = useRouter();
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [options, setOptions] = useState<ProductOptions>({ categories: [], collections: [] });
  const [form, setForm] = useState<Fields>(blankFields);
  const [matrix, setMatrix] = useState<Matrix>(blankMatrix);
  const [adding, setAdding] = useState<Matrix>(blankMatrix);
  const [dirty, setDirty] = useState(false);
  const [addDirty, setAddDirty] = useState(false);
  const [editing, setEditing] = useState<VariantDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [photoForColor, setPhotoForColor] = useState(true);
  const busyRef = useRef(false);
  const requestId = useRef<string | null>(null);
  const pending = dirty || addDirty || editing !== null;

  useEffect(() => { onDirtyChange?.(pending); }, [onDirtyChange, pending]);
  useEffect(() => { onBusyChange?.(busy || loading); }, [onBusyChange, busy, loading]);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setMessage(null);

    // Next.js may reuse this client component when moving from an edited product
    // to /admin/products/new. Explicitly reset every draft field so the next
    // product always starts from a genuinely blank workspace.
    if (!productId) {
      setProduct(null);
      setForm(blankFields());
      setMatrix(blankMatrix());
      setAdding(blankMatrix());
      setEditing(null);
      setDirty(false);
      setAddDirty(false);
      setPhotoForColor(true);
      requestId.current = null;
    }

    void Promise.all([
      productApi<ProductOptions>("/options"),
      productId ? productApi<ProductRecord>(`/${encodeURIComponent(productId)}`) : Promise.resolve(null),
    ]).then(([nextOptions, record]) => {
      if (!active) return;
      setOptions(nextOptions);
      if (record) {
        setProduct(record);
        setForm(toFields(record));
      }
      setDirty(false);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Unable to open product form."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId]);

  function change<K extends keyof Fields>(key: K, value: Fields[K]) {
    setForm(previous => ({ ...previous, [key]: value })); setDirty(true);
  }
  function accept(record: ProductRecord) { setProduct(record); setForm(toFields(record)); setDirty(false); }
  async function run(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setMessage(null);
    try { await work(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to complete this change."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const { slug, ...details } = form;
      const body = { ...details, categoryId: form.categoryId || null };
      if (!product) {
        const combinations = matrixPayload(matrix);
        requestId.current ??= crypto.randomUUID();
        const result = await productApi<ProductRecord>("", "POST", { ...body, ...combinations, slug: slug || productSlug(form.name), requestId: requestId.current });
        accept(result);
        setMessage(`Draft created with ${result.variants.length} SKUs. Every SKU starts with zero stock.`);
        if (!onUse) router.replace(`/admin/products/${encodeURIComponent(result.id)}`);
      } else {
        const result = await productApi<ProductRecord>(`/${encodeURIComponent(product.id)}`, "PATCH", { ...body, expectedUpdatedAt: product.updatedAt });
        accept(result); setMessage("Product details saved. Inventory quantities and existing SKUs were not changed.");
      }
    });
  }

  function addCategory() {
    const name = window.prompt("New category name (English, for example: Cotton Kurtas)");
    if (!name?.trim()) return;
    void run(async () => {
      const category = await productApi<{ id: string }>("/categories", "POST", { name: name.trim() });
      const nextOptions = await productApi<ProductOptions>("/options");
      setOptions(nextOptions); change("categoryId", category.id); setMessage("Category added. Save the product to use it.");
    });
  }

  function addVariants(event: FormEvent) {
    event.preventDefault(); if (!product) return;
    void run(async () => {
      const previousCount = product.variants.length;
      const result = await productApi<ProductRecord>(`/${encodeURIComponent(product.id)}/variants`, "POST", { ...matrixPayload(adding), expectedUpdatedAt: product.updatedAt });
      accept(result); setAdding(blankMatrix()); setAddDirty(false);
      setMessage(`${result.variants.length - previousCount} new SKUs created at zero stock. Existing combinations were skipped and stock was preserved.`);
    });
  }

  function saveVariant(event: FormEvent) {
    event.preventDefault(); if (!product || !editing) return;
    void run(async () => {
      const pricePaise = rupeesToPaise(editing.price, "Selling price"); const mrpPaise = rupeesToPaise(editing.mrp, "MRP");
      if (pricePaise > mrpPaise) throw new Error("Selling price cannot exceed MRP.");
      const result = await productApi<ProductRecord>(`/${encodeURIComponent(product.id)}/variants/${encodeURIComponent(editing.variant.id)}`, "PATCH", {
        pricePaise,
        mrpPaise,
        weightGrams: weights(editing.weight),
        active: editing.active,
        bustMm: measurementMm(editing.bust, "Garment bust", 200, 3000),
        waistMm: measurementMm(editing.waist, "Garment waist", 200, 3000),
        hipMm: measurementMm(editing.hip, "Garment hip", 200, 3000),
        shoulderMm: measurementMm(editing.shoulder, "Shoulder", 100, 1000),
        sleeveLengthMm: measurementMm(editing.sleeveLength, "Sleeve length", 50, 1500),
        garmentLengthMm: measurementMm(editing.garmentLength, "Garment length", 100, 2500),
        expectedUpdatedAt: product.updatedAt,
      });
      accept(result); setEditing(null); setMessage("SKU selling details saved. Historical orders and stock quantities were not changed.");
    });
  }

  function setStatus(status: ProductState) {
    if (!product || pending || !window.confirm(status === "ACTIVE"
      ? "Publish this product to the customer website? Stock is still controlled by posted receipts."
      : `Move this product to ${status.toLowerCase()} and hide it from the storefront? Existing stock and orders will be retained.`)) return;
    void run(async () => {
      const result = await productApi<ProductRecord>(`/${encodeURIComponent(product.id)}/status`, "POST", { status, expectedUpdatedAt: product.updatedAt });
      accept(result);

      if (status === "ACTIVE" && !onUse) {
        // Publishing completes this product-entry cycle. Move straight to a fresh
        // blank form so details from the published product cannot leak into the next one.
        requestId.current = null;
        router.replace("/admin/products/new");
        return;
      }

      setMessage(status === "ACTIVE"
        ? "Product published. Check its customer page."
        : "Product hidden from the storefront. Stock and order history are retained.");
    });
  }

  function upload(variant: ProductVariant, files: File[]) {
    if (!product || pending || !files.length) return;
    const productId = product.id;
    const applyToColor = photoForColor;
    void run(async () => {
      let failure: Error | null = null;
      let uploaded = 0;
      try {
        const result = await uploadSkuPhotoBatch({
          variantId: variant.id, files, applyToColor,
          onProgress: ({ current, total }) => setMessage(`Uploading photo ${current} of ${total}…`),
        });
        uploaded = result.uploaded;
      } catch (error) {
        failure = error instanceof Error ? error : new Error("Unable to upload photos.");
      }
      setMessage(null);
      try {
        accept(await productApi<ProductRecord>(`/${encodeURIComponent(productId)}`));
      } catch {
        const saved = failure ? failure.message : `${uploaded} photos confirmed saved.`;
        throw new Error(`${saved} The photo list could not refresh. Reload the product before uploading again.`);
      }
      if (failure) throw failure;
      setMessage(`${uploaded} photo${uploaded === 1 ? "" : "s"} attached ${applyToColor ? `to all existing ${variant.color} sizes` : `to ${variant.sku}`}.`);
    });
  }

  function removePhoto(variant: ProductVariant, photo: ProductVariant["images"][number]) {
    if (!product || pending || busy) return;
    const applyToColor = photoForColor;
    const scope = applyToColor ? `all existing ${variant.color} sizes` : variant.sku;
    if (!window.confirm(`Remove this photo from ${scope}? This removes it from the HIDI product gallery.`)) return;

    const productId = product.id;
    void run(async () => {
      const params = new URLSearchParams({
        imageId: photo.id,
        applyToColor: String(applyToColor),
      });
      const response = await fetch(
        `/api/admin/inventory/${encodeURIComponent(variant.id)}/images?${params}`,
        { method: "DELETE", cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(body?.message) ? body.message.join(". ") : body?.message;
        throw new Error(typeof detail === "string" ? detail : "Unable to remove photo.");
      }

      accept(await productApi<ProductRecord>(`/${encodeURIComponent(productId)}`));
      setMessage(`Photo removed from ${scope}.`);
    });
  }

  if (loading) return <div className={styles.empty} role="status">Opening product workspace…</div>;
  if (productId && !product) return <div><p className={styles.error} role="alert">{error ?? "Product could not be loaded."}</p><Link href="/admin/products">Back to products</Link></div>;

  return <div className={styles.editor}>
    <div className={styles.editorHeading}><div><p className={styles.eyebrow}>HIDI PRODUCT WORKSPACE</p><h1>{product ? product.name : "Create new product"}</h1><p>{product ? "Edit catalogue details without changing your warehouse quantities." : "Add a design once. Generate its colour-and-size SKUs automatically."}</p></div><span className={styles.badge} data-status={product?.status ?? "DRAFT"}>{product?.status ?? "NEW DRAFT"}</span></div>
    {error && <div className={styles.error} role="alert">{error}<br /><small>Nothing here requires resetting or seeding the database.</small></div>}
    {message && <div className={styles.success} role="status">{message}</div>}

    <form onSubmit={save} className={styles.card}>
      <div className={styles.sectionTitle}><span>01</span><div><h2>Product details</h2><p>Customer-facing information. Purchase costs stay in stock receipts.</p></div></div>
      <fieldset disabled={busy || editing !== null || addDirty} className={styles.fieldset}>
        <div className={styles.grid}>
          <label className={styles.wide}>Product name *<input required maxLength={160} value={form.name} onChange={e => change("name", e.target.value)} placeholder="HIDI Meera Cotton Kurta" /></label>
          <label>Product URL<input disabled={Boolean(product)} maxLength={100} value={form.slug} onChange={e => change("slug", e.target.value)} placeholder={productSlug(form.name) || "hidi-meera-cotton-kurta"} /><small>{product ? "The URL and existing SKUs remain stable when a product is renamed." : "Leave blank to generate from the name. English lowercase words and hyphens."}</small></label>
          <label>Category<select value={form.categoryId} onChange={e => change("categoryId", e.target.value)}><option value="">Uncategorised</option>{product?.category && !options.categories.some(c => c.id === product.categoryId) && <option value={product.category.id}>{product.category.name} (inactive)</option>}{options.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="button" className={styles.textButton} onClick={addCategory}>+ Add category</button></label>
          <label className={styles.wide}>Short description<textarea rows={2} maxLength={400} value={form.shortDescription} onChange={e => change("shortDescription", e.target.value)} placeholder="A comfortable cotton kurta for everyday workwear." /></label>
          <label className={styles.wide}>Full description<textarea rows={4} maxLength={10000} value={form.description} onChange={e => change("description", e.target.value)} /></label>
          <label>Fabric<input maxLength={300} value={form.fabric} onChange={e => change("fabric", e.target.value)} placeholder="Cotton" /></label>
          <label>Wash care<textarea rows={2} maxLength={2000} value={form.care} onChange={e => change("care", e.target.value)} placeholder="Follow the manufacturer's wash-care instructions." /></label>
          <div className={styles.wide}><p className={styles.label}>Website collections</p><div className={styles.checks}>{options.collections.length ? options.collections.map(c => <label key={c.id}><input type="checkbox" checked={form.collectionIds.includes(c.id)} onChange={e => change("collectionIds", e.target.checked ? [...form.collectionIds, c.id] : form.collectionIds.filter(v => v !== c.id))} />{c.name}</label>) : <small>No active collections configured. This does not prevent saving a draft.</small>}</div><small>Choose the existing website collections where this design belongs.</small></div>
        </div>
        {!product && <><div className={styles.sectionTitle}><span>02</span><div><h2>Colours, sizes and selling prices</h2><p>One SKU for each combination. All initial stock quantities are zero.</p></div></div><VariantMatrix value={matrix} onChange={value => { setMatrix(value); setDirty(true); }} /></>}
        <div className={styles.actions}><p>{product ? "Saving does not change the publication status." : "Photos can be uploaded after the draft and its SKUs exist."}</p><button className={styles.primary} type="submit" disabled={busy}>{busy ? "Saving…" : product ? "Save product details" : "Create draft & generate SKUs"}</button></div>
      </fieldset>
    </form>

    {product && <>
      <section className={styles.card}>
        <div className={styles.sectionTitle}><span>02</span><div><h2>SKUs & photography</h2><p>{product.variants.length} SKUs · {product.variants.reduce((n, v) => n + (v.inventory?.onHand ?? 0), 0)} pieces on hand. Add quantities only through Receive Stock.</p></div></div>
        <label className={styles.inlineCheck}><input type="checkbox" checked={photoForColor} onChange={e => setPhotoForColor(e.target.checked)} disabled={busy || pending} /> Apply photo changes (add or remove) to all existing sizes of that colour</label>
        <p className={styles.notice}>Select up to 8 photos at a time, up to 5 MB each. Choosing files starts the upload. Uploads are saved separately from stock receipts. Keep this page open until the batch finishes.</p>
        {pending && <p className={styles.notice}>Save or cancel your pending edits before uploading photos, publishing or returning SKUs to a receipt.</p>}
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>SKU / colour / size</th><th>Selling / MRP</th><th>Stock</th><th>Photos</th><th>Actions</th></tr></thead><tbody>
          {product.variants.map(v => <tr key={v.id}><td><strong>{v.color} / {v.size}</strong><small>{v.sku}</small><span className={styles.smallBadge}>{v.active ? "Enabled" : "Disabled"}</span></td><td>{money(v.pricePaise)}<small>MRP {money(v.mrpPaise)}</small></td><td>{v.inventory?.onHand ?? 0} on hand<small>{v.inventory?.reserved ?? 0} reserved</small></td><td><div className={styles.thumbnails}>{v.images.length ? v.images.map(photo => <span className={styles.photoThumb} key={photo.id}><img src={photo.url} alt={photo.alt || `${v.color} ${v.size}`} loading="lazy" /><button type="button" className={styles.photoRemove} disabled={busy || pending} onClick={() => removePhoto(v, photo)} aria-label={`Remove photo from ${photoForColor ? `all ${v.color} sizes` : v.sku}`} title="Remove photo">×</button></span>) : <small>No photos</small>}</div><small>{v.images.length} photo{v.images.length === 1 ? "" : "s"}</small></td><td><div className={styles.rowActions}><button type="button" disabled={busy || pending} onClick={() => setEditing({
  variant: v,
  price: rupees(v.pricePaise),
  mrp: rupees(v.mrpPaise),
  weight: v.weightGrams?.toString() ?? "",
  active: v.active,
  bust: measurementCm(v.bustMm),
  waist: measurementCm(v.waistMm),
  hip: measurementCm(v.hipMm),
  shoulder: measurementCm(v.shoulderMm),
  sleeveLength: measurementCm(v.sleeveLengthMm),
  garmentLength: measurementCm(v.garmentLengthMm),
})}>Edit SKU</button><label className={styles.fileButton} aria-disabled={busy || pending}>Add photos<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy || pending} onChange={e => { const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ""; if (files.length) upload(v, files); }} /></label></div></td></tr>)}
        </tbody></table></div>
        {editing && <form onSubmit={saveVariant} className={styles.variantEdit}><h3>Edit {editing.variant.color} / {editing.variant.size}</h3><p>SKU, colour, size and stock remain unchanged.</p><fieldset disabled={busy} className={styles.fieldset}><div className={styles.grid}>
          <label>Selling price ₹<input required inputMode="decimal" value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} /></label><label>MRP ₹<input required inputMode="decimal" value={editing.mrp} onChange={e => setEditing({ ...editing, mrp: e.target.value })} /></label><label>Weight (grams)<input inputMode="numeric" value={editing.weight} onChange={e => setEditing({ ...editing, weight: e.target.value })} /></label><label className={styles.inlineCheck}><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />SKU enabled</label>
          <div className={styles.wide}>
            <p className={styles.label}>HIDI Fit · verified garment measurements (cm)</p>
            <p className={styles.notice}>Enter the finished garment measurements for this exact size. Bust, waist and hip are full garment circumferences—not body measurements. Leave any unverified value blank.</p>
            <div className={styles.threeGrid}>
              <label>Garment bust (cm)<input inputMode="decimal" value={editing.bust} onChange={e => setEditing({ ...editing, bust: e.target.value })} placeholder="e.g. 101.6" /></label>
              <label>Garment waist (cm)<input inputMode="decimal" value={editing.waist} onChange={e => setEditing({ ...editing, waist: e.target.value })} placeholder="e.g. 96.5" /></label>
              <label>Garment hip (cm)<input inputMode="decimal" value={editing.hip} onChange={e => setEditing({ ...editing, hip: e.target.value })} placeholder="e.g. 106.7" /></label>
              <label>Shoulder (cm)<input inputMode="decimal" value={editing.shoulder} onChange={e => setEditing({ ...editing, shoulder: e.target.value })} placeholder="e.g. 38.1" /></label>
              <label>Sleeve length (cm)<input inputMode="decimal" value={editing.sleeveLength} onChange={e => setEditing({ ...editing, sleeveLength: e.target.value })} placeholder="e.g. 55.9" /></label>
              <label>Garment length (cm)<input inputMode="decimal" value={editing.garmentLength} onChange={e => setEditing({ ...editing, garmentLength: e.target.value })} placeholder="e.g. 114.3" /></label>
            </div>
          </div>
        </div><div className={styles.actions}><button type="button" onClick={() => setEditing(null)}>Cancel SKU edit</button><button type="submit" className={styles.primary}>Save SKU</button></div></fieldset></form>}
      </section>

      <section className={styles.card}>
        <div className={styles.sectionTitle}><span>03</span><div><h2>Add a colour or size</h2><p>Use the same product. Existing combinations are skipped, not replaced.</p></div></div>
        <form onSubmit={addVariants}><fieldset disabled={busy || dirty || editing !== null || product.status === "ARCHIVED"} className={styles.fieldset}>
          <VariantMatrix value={adding} onChange={value => { setAdding(value); setAddDirty(true); }} />
          <div className={styles.actions}><button type="button" disabled={!addDirty} onClick={() => { setAdding(blankMatrix()); setAddDirty(false); }}>Clear new variants</button><button type="submit" className={styles.primary}>Create missing SKUs · zero stock</button></div>
        </fieldset></form>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionTitle}><span>04</span><div><h2>Publish when ready</h2><p>Draft and archived products are hidden from customers. Publishing never adds warehouse stock.</p></div></div>
        <div className={styles.actions}><div className={styles.buttonGroup}>
          {product.status !== "ACTIVE" && <button type="button" className={styles.primary} disabled={busy || pending} onClick={() => setStatus("ACTIVE")}>Publish product</button>}
          {product.status !== "DRAFT" && <button type="button" disabled={busy || pending} onClick={() => setStatus("DRAFT")}>Move to draft</button>}
          {product.status !== "ARCHIVED" && <button type="button" disabled={busy || pending} onClick={() => setStatus("ARCHIVED")}>Archive</button>}
        </div>{product.status === "ACTIVE" && <Link href={`/products/${product.slug}`} target="_blank" rel="noopener noreferrer">View customer page ↗</Link>}</div>
        <p className={styles.notice}>Photo uploads use your existing HIDI storage setup. A database migration alone does not configure photo storage.</p>
      </section>
      {onUse ? <div className={styles.stickyAction}><div><strong>Continue this delivery</strong><small>Your supplier details, quantities and existing receipt lines remain in place.</small></div><button type="button" className={styles.primary} disabled={busy || pending || !product.variants.some(v => v.active)} onClick={() => onUse(receiveVariants(product))}>Use {product.variants.filter(v => v.active).length} SKUs in this receipt</button></div>
        : <div className={styles.buttonGroup}><Link href="/admin/inventory/receive">Receive stock for this product →</Link><button type="button" disabled={busy} onClick={() => { if (!pending || window.confirm("Discard unsaved product edits and reload?")) { setEditing(null); setAddDirty(false); setAdding(blankMatrix()); void run(async () => { accept(await productApi<ProductRecord>(`/${encodeURIComponent(product.id)}`)); setMessage("Latest product loaded."); }); } }}>Reload saved product</button></div>}
    </>}
  </div>;
}

function VariantMatrix({ value, onChange }: { value: Matrix; onChange: (value: Matrix) => void }) {
  const [customSize, setCustomSize] = useState("");
  const sizes = [...new Set(["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "FREE SIZE", ...value.sizes])];
  return <div className={styles.matrix}>
    <p className={styles.label}>Colours *</p>
    {value.colors.map((color, index) => <div className={styles.colorRow} key={index}><label>Colour name<input required maxLength={40} value={color.name} placeholder="Maroon" onChange={e => onChange({ ...value, colors: value.colors.map((c, i) => i === index ? { ...c, name: e.target.value } : c) })} /></label><label>Hex colour (optional)<input maxLength={7} value={color.hex} placeholder="#800000" pattern="#[0-9A-Fa-f]{6}" onChange={e => onChange({ ...value, colors: value.colors.map((c, i) => i === index ? { ...c, hex: e.target.value } : c) })} /></label><button type="button" disabled={value.colors.length <= 1} onClick={() => onChange({ ...value, colors: value.colors.filter((_, i) => i !== index) })} aria-label={`Remove colour ${index + 1}`}>Remove</button></div>)}
    <button type="button" disabled={value.colors.length >= 20} onClick={() => onChange({ ...value, colors: [...value.colors, { name: "", hex: "" }] })}>+ Add colour</button>
    <p className={styles.label}>Sizes *</p><div className={styles.checks}>{sizes.map(size => <label key={size}><input type="checkbox" checked={value.sizes.includes(size)} onChange={e => onChange({ ...value, sizes: e.target.checked ? [...value.sizes, size] : value.sizes.filter(v => v !== size) })} />{size}</label>)}</div>
    <div className={styles.customSize}><label>Other size<input value={customSize} maxLength={20} onChange={e => setCustomSize(e.target.value)} placeholder="For example: 6XL" /></label><button type="button" onClick={() => { const size = customSize.trim().replace(/\s+/g, " ").toUpperCase(); if (size && !value.sizes.includes(size)) onChange({ ...value, sizes: [...value.sizes, size] }); setCustomSize(""); }}>Add size</button></div>
    <p className={styles.notice}><strong>{value.colors.length} colours × {value.sizes.length} sizes = {value.colors.length * value.sizes.length} combinations.</strong> New SKUs start with 0 on hand, 0 reserved and 0 safety stock. Limit: 200 SKUs per product.</p>
    <div className={styles.threeGrid}><label>Selling price ₹ *<input required inputMode="decimal" value={value.price} onChange={e => onChange({ ...value, price: e.target.value })} placeholder="1499.00" /></label><label>MRP ₹ *<input required inputMode="decimal" value={value.mrp} onChange={e => onChange({ ...value, mrp: e.target.value })} placeholder="1799.00" /></label><label>Weight (grams)<input inputMode="numeric" value={value.weight} onChange={e => onChange({ ...value, weight: e.target.value })} placeholder="Optional" /></label></div>
    <small>These prices apply to newly created combinations only. Edit individual SKU prices after saving.</small>
  </div>;
}
