"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Heart, X, Check, LoaderCircle } from "lucide-react";
import type { ApiProduct } from "@/lib/api";
import { addCatalogueVariant, CatalogCartError } from "@/lib/catalog-cart";
import { cardPrice, money, variantsForColour } from "@/lib/product-card-utils";
import { getWishlistItems, removeWishlistSlug, saveWishlistItem, WISHLIST_EVENT } from "@/lib/wishlist";
import { CatalogImage } from "./catalog-image";
import styles from "./editorial-product-card.module.css";
/** Homepage presentation only. Cart writes use the existing shared client. */
export function EditorialProductCard({ product }: { product: ApiProduct }) {
  const id = useId(), router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), writing = useRef(false);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [ready, setReady] = useState(false);
  const [colour, setColour] = useState(product.variants.find(v => v.available > 0)?.color ?? product.variants[0]?.color ?? "");
  const [variantId, setVariantId] = useState(""), [unavailable, setUnavailable] = useState<string[]>([]), [error, setError] = useState(""), [message, setMessage] = useState("");
  const colours = Array.from(new Set(product.variants.map(v => v.color)));
  const activeColour = colours.includes(colour) ? colour : colours[0] ?? "";
  const variants = variantsForColour(product.variants, activeColour), selected = variants.find(v => v.id === variantId);
  const soldOut = !product.inStock || !product.variants.some(v => v.available > 0 && !unavailable.includes(v.id));
  const price = cardPrice(product.variants, "", product.minPricePaise), selectionPrice = cardPrice(variants, selected?.id ?? "", product.minPricePaise);
  const href = `/products/${encodeURIComponent(product.slug)}`;
  const images = [...(product.images ?? [])].sort((a, b) => a.position - b.position);
  const detail = images.find((image, i) => i > 0 && /detail|texture|weave|close|03-/i.test(image.alt + image.url)) ?? images[1];
  useEffect(() => {
    const sync = () => { setSaved(getWishlistItems().some(item => item.slug === product.slug)); setReady(true); };
    const storage = (event: StorageEvent) => { if (!event.key || event.key === "hidi_wishlist") sync(); };
    sync(); window.addEventListener(WISHLIST_EVENT, sync); window.addEventListener("storage", storage);
    return () => { window.removeEventListener(WISHLIST_EVENT, sync); window.removeEventListener("storage", storage); };
  }, [product.slug]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.showModal();
    return () => { dialog.current?.close(); document.body.style.overflow = previous; trigger.current?.focus({ preventScroll: true }); };
  }, [open]);
  function toggleWishlist() {
    try { if (saved) removeWishlistSlug(product.slug); else saveWishlistItem({ slug: product.slug }); setSaved(!saved); setMessage(saved ? "Removed from wishlist." : "Saved to wishlist."); setError(""); }
    catch { setError("Your browser could not save the wishlist. Please enable browser storage."); }
  }
  function showQuickAdd() { if (soldOut || writing.current) return; setVariantId(""); setError(""); setMessage(""); setOpen(true); }
  async function add() {
    if (writing.current || !selected || selected.available < 1 || unavailable.includes(selected.id) || soldOut) return;
    writing.current = true; setBusy(true); setError(""); setMessage("");
    try { await addCatalogueVariant(selected.id); setMessage(`${selected.size} · ${selected.color} added to your bag.`); setVariantId(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn’t confirm the update. Please check your bag."); if (cause instanceof CatalogCartError && cause.refreshCatalogue) { setUnavailable(values => [...values, selected.id]); setVariantId(""); router.refresh(); } }
    finally { writing.current = false; setBusy(false); }
  }
  return <article className={styles.card} data-editorial-product={product.slug} aria-labelledby={`${id}-name`}>
    <div className={styles.media}>
      <Link href={href} className={styles.imageLink} aria-label={`View ${product.name}`}>
        <CatalogImage src={images[0]?.url} alt={images[0]?.alt || product.name} sizes="(max-width: 760px) 50vw, 33vw" className={styles.primaryImage} />
        {detail && detail.url !== images[0]?.url && <span className={styles.detailImage} aria-hidden="true"><CatalogImage src={detail.url} alt="" sizes="(max-width: 760px) 50vw, 33vw" /></span>}
      </Link>
      <button type="button" className={styles.heart} aria-label={`${saved ? "Remove from" : "Add to"} wishlist — ${product.name}`} aria-pressed={saved} disabled={!ready} onClick={toggleWishlist}><Heart size={19} strokeWidth={1.4} fill={saved ? "currentColor" : "none"} aria-hidden="true" /></button>
      {soldOut ? <span className={styles.soldOut}>Sold out</span> : <button ref={trigger} type="button" className={styles.quickAdd} aria-haspopup="dialog" aria-controls={`${id}-quick-add`} onClick={showQuickAdd} disabled={busy}>Quick add</button>}
    </div>
    <div className={styles.meta}><h3 id={`${id}-name`} title={product.name}><Link href={href}>{product.name}</Link></h3><p className={styles.price}>{price.from ? "From " : ""}{money(price.pricePaise)} {price.mrpPaise && <del aria-label={`Original price ${money(price.mrpPaise)}`}>{money(price.mrpPaise)}</del>}</p></div>
    {!open && error && <p role="alert" className={styles.feedback}>{error}</p>}
    {!open && <span className="sr-only" role="status">{message}</span>}
    <dialog ref={dialog} id={`${id}-quick-add`} className={styles.dialog} aria-labelledby={`${id}-dialog-title`} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={event => { const node = dialog.current; if (node && event.target === node) { const r = node.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setOpen(false); } }}>
      <div className={styles.dialogHeader}><p>QUICK ADD</p><button type="button" className={styles.close} aria-label="Close quick add" onClick={() => setOpen(false)}><X size={20} aria-hidden="true" /></button></div>
      <h2 id={`${id}-dialog-title`}>{product.name}</h2>
      <p className={styles.dialogPrice}>{selectionPrice.from ? "From " : ""}{money(selectionPrice.pricePaise)} {selectionPrice.mrpPaise && <del>{money(selectionPrice.mrpPaise)}</del>}</p>
      {colours.length > 1 && <fieldset className={styles.fieldset} disabled={busy}><legend>Colour</legend><div className={styles.options}>{colours.map(value => <button key={value} type="button" aria-pressed={value === activeColour} onClick={() => { setColour(value); setVariantId(""); setError(""); setMessage(""); }}>{value}</button>)}</div></fieldset>}
      <fieldset className={styles.fieldset} disabled={busy}><legend>Choose your size · {activeColour}</legend><div className={styles.options}>{variants.map(variant => <button key={variant.id} type="button" disabled={variant.available < 1 || !product.inStock || unavailable.includes(variant.id)} aria-pressed={variant.id === variantId} aria-label={`${variant.size}${variant.available < 1 || unavailable.includes(variant.id) ? " — unavailable" : ""}`} onClick={() => { setVariantId(variant.id === variantId ? "" : variant.id); setError(""); setMessage(""); }}>{variant.size}</button>)}</div></fieldset>
      <p className={styles.hint}>No size is selected for you. <Link href={href} onClick={() => setOpen(false)}>View fit &amp; product details</Link></p>
      <button className={styles.addButton} type="button" disabled={busy || !selected || soldOut || unavailable.includes(selected.id)} onClick={add}>{busy ? <><LoaderCircle size={16} aria-hidden="true" /> Adding…</> : "Add to bag"}</button>
      <p role="status" className={styles.feedback}>{message && <><Check size={15} aria-hidden="true" /> {message}</>}</p>
      {error && <p role="alert" className={styles.feedback}>{error}</p>}
      {(message.includes("added to your bag") || error) && <Link className={styles.bagLink} href="/cart" onClick={() => setOpen(false)}>View shopping bag</Link>}
    </dialog>
  </article>;
}
