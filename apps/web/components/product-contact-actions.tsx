"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, Minus, Plus, Share2, X } from "lucide-react";
import type { ApiProduct } from "@/lib/api";
import { formatPaise } from "@/lib/api";
import {
  PRODUCT_VARIANT_EVENT,
  clampOrderQuantity,
  configuredWhatsAppNumber,
  productUrl,
  publishProductSelection,
  shareProduct,
  whatsappOrderUrl,
  type ProductVariantSelection,
} from "@/lib/product-sharing";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import styles from "./product-contact-actions.module.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

export function ProductContactActions({ product }: { product: ApiProduct }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const selectedId = useRef("");
  const quantityRef = useRef(1);
  const dialogOpen = useRef(false);
  const routeHandled = useRef("");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(product);
  const [variantId, setVariantId] = useState("");
  const [color, setColor] = useState(product.variants[0]?.color ?? "");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [checking, setChecking] = useState(false);
  const [stockVerified, setStockVerified] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [manualShare, setManualShare] = useState(false);
  const availableColors = useMemo(() => Array.from(new Set(snapshot.variants.map((variant) => variant.color))), [snapshot]);
  const colorVariants = snapshot.variants.filter((variant) => variant.color === color);
  const selected = snapshot.variants.find((variant) => variant.id === variantId);
  const image = snapshot.images?.[0];
  const configured = Boolean(configuredWhatsAppNumber());
  const unitPrice = selected?.pricePaise ?? snapshot.minPricePaise;

  function updateQuantity(value: number) {
    quantityRef.current = value;
    setQuantity(value);
  }

  function chooseVariant(nextId: string, nextColor = color) {
    const variant = snapshot.variants.find((item) => item.id === nextId);
    selectedId.current = nextId;
    setVariantId(nextId);
    setColor(variant?.color ?? nextColor);
    updateQuantity(variant ? Math.max(1, clampOrderQuantity(quantityRef.current, variant.available)) : 1);
    setError("");
    publishProductSelection({
      slug: product.slug,
      variantId: nextId,
      color: variant?.color ?? nextColor,
      size: variant?.size,
    });
  }

  useEffect(() => {
    function syncVariant(event: Event) {
      const detail = (event as CustomEvent<ProductVariantSelection>).detail;
      if (detail?.slug !== product.slug) return;
      selectedId.current = detail.variantId;
      setVariantId(detail.variantId);
      setColor(detail.color);
      setError("");
    }
    window.addEventListener(PRODUCT_VARIANT_EVENT, syncVariant);
    return () => window.removeEventListener(PRODUCT_VARIANT_EVENT, syncVariant);
  }, [product.slug]);

  useEffect(() => {
    if (routeHandled.current === product.slug) return;
    routeHandled.current = product.slug;
    const query = new URLSearchParams(window.location.search);
    if (query.get("whatsapp") !== "1") return;
    const initial = product.variants.find((variant) => variant.id === query.get("variant") && variant.available > 0);
    const nextColor = initial?.color ?? (product.variants.some((variant) => variant.color === query.get("colour")) ? query.get("colour")! : product.variants[0]?.color ?? "");
    publishProductSelection({ slug: product.slug, variantId: initial?.id ?? "", color: nextColor, size: initial?.size });
    trigger.current?.click();
  }, [product.slug, product.variants]);

  useEffect(() => {
    dialogOpen.current = open;
    const element = dialog.current;
    if (!open || !element) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Native showModal makes the rest of the page inert and traps keyboard focus.
    element.showModal();
    return () => {
      dialogOpen.current = false;
      request.current?.abort();
      document.body.style.overflow = previousOverflow;
      element.close();
      trigger.current?.focus();
    };
  }, [open]);

  async function refreshStock(): Promise<ApiProduct | null> {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    setChecking(true);
    setStockVerified(false);
    setStockNote("");
    setError("");
    try {
      const response = await fetch(API + "/products/" + encodeURIComponent(product.slug), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("We couldn't check availability. Please try again.");
      const fresh: ApiProduct = await response.json();
      if (fresh.id !== product.id || !Array.isArray(fresh.variants) || fresh.variants.some((variant) =>
        typeof variant.id !== "string" || typeof variant.size !== "string" || typeof variant.color !== "string" ||
        !Number.isInteger(variant.available) || variant.available < 0 ||
        !Number.isInteger(variant.pricePaise) || variant.pricePaise < 0
      )) throw new Error("We couldn't verify this product. Please try again.");
      if (request.current !== controller) return null;
      setSnapshot(fresh);
      setStockVerified(true);
      const current = fresh.variants.find((variant) => variant.id === selectedId.current);
      if (selectedId.current && (!current || current.available < 1)) {
        selectedId.current = "";
        setVariantId("");
        updateQuantity(1);
        publishProductSelection({ slug: product.slug, variantId: "", color });
        setError("That option is now sold out. Please choose another available size or colour.");
      } else if (current) {
        const maximum = clampOrderQuantity(quantityRef.current, current.available);
        if (maximum !== quantityRef.current) {
          updateQuantity(maximum);
          setStockNote("Availability changed. Your quantity has been updated to " + maximum + ".");
        }
      }
      return fresh;
    } catch (cause) {
      if (request.current !== controller) return null;
      if (controller.signal.aborted && !dialogOpen.current) return null;
      setError(cause instanceof Error && cause.name !== "AbortError"
        ? cause.message : "The stock check timed out. Please try again.");
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) setChecking(false);
    }
  }

  function openDialog() {
    if (!configured) return;
    dialogOpen.current = true;
    setOpen(true);
    setHandoff(false);
    void refreshStock();
  }

  async function share() {
    setShareNotice("");
    setManualShare(false);
    try {
      const result = await shareProduct({ slug: product.slug, name: product.name });
      if (result === "copied") setShareNotice("Product link copied.");
      if (result === "unsupported") {
        setManualShare(true);
        setShareNotice("Select and copy the product link below.");
      }
    } catch {
      setManualShare(true);
      setShareNotice("Select and copy the product link below.");
    }
  }

  async function continueToWhatsApp() {
    if (checking || handoff) return;
    if (!selected || selected.available < 1) {
      setError("Please select an available size and colour to continue.");
      return;
    }
    const intended = { id: selected.id, price: selected.pricePaise, quantity };
    setHandoff(true);
    const fresh = await refreshStock();
    if (!fresh || !dialogOpen.current) { setHandoff(false); return; }
    const current = fresh.variants.find((variant) => variant.id === intended.id);
    if (!current || current.available < 1) { setHandoff(false); return; }
    if (current.pricePaise !== intended.price || clampOrderQuantity(intended.quantity, current.available) !== intended.quantity) {
      setError("Price or availability has changed. Please review the updated selection and continue again.");
      setHandoff(false);
      return;
    }
    const url = whatsappOrderUrl({
      slug: fresh.slug,
      name: fresh.name,
      priceText: formatPaise(current.pricePaise),
      color: current.color,
      size: current.size,
      quantity: intended.quantity,
      sku: current.sku,
    });
    if (!url) {
      setError("WhatsApp ordering is not available right now. You can still use Add to bag.");
      setHandoff(false);
      return;
    }
    // Same-tab handoff is reliable after an async stock check (no popup blocker).
    window.location.assign(url);
    setHandoff(false);
  }

  return (
    <>
      <div className={styles.actions}>
        <button type="button" onClick={() => void share()}>
          <Share2 size={18} aria-hidden="true" />Share product
        </button>
        <button ref={trigger} type="button" className={styles.whatsapp} disabled={!configured}
          aria-haspopup="dialog" aria-controls={id + "-dialog"} aria-describedby={!configured ? id + "-unavailable" : undefined}
          onClick={openDialog}>
          <WhatsAppIcon size={23} />
          <span><strong>Order on WhatsApp</strong><small>Review your selection, then start a chat</small></span>
        </button>
      </div>
      {!configured && <p id={id + "-unavailable"} className={styles.availabilityNote}>WhatsApp ordering is not available yet. You can still shop using Add to bag.</p>}
      <p className={styles.shareNotice} role="status">{shareNotice}</p>
      {manualShare && <input className={styles.shareLink} aria-label="Product link to copy" readOnly value={productUrl(product.slug)} onFocus={(event) => event.target.select()} />}

      <dialog ref={dialog} id={id + "-dialog"} className={styles.modal}
        aria-labelledby={id + "-title"} aria-describedby={id + "-note"}
        onCancel={() => setOpen(false)}
        onClose={() => { if (!dialog.current?.open) setOpen(false); }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
        }}>
        <button className={styles.close} type="button" aria-label="Close WhatsApp selection" onClick={() => setOpen(false)}><X size={20} aria-hidden="true" /></button>
        <div className={styles.modalHeading}>
          <span className={styles.whatsappMark}><WhatsAppIcon size={26} /></span>
          <div><p>LET’S FIND YOUR HIDI</p><h2 id={id + "-title"}>Your selection, ready to share.</h2></div>
        </div>
        <p className={styles.intro}>A few details help us pick up right where you left off.</p>

        <div className={styles.productSummary}>
          {image ? <div className={styles.thumb}><Image src={image.url} alt={image.alt || snapshot.name} fill sizes="88px" /></div> : <div className={styles.thumb} aria-hidden="true" />}
          <div><strong>{snapshot.name}</strong><span>{formatPaise(unitPrice)} <small>each</small></span><small>{selected?.sku ? "SKU " + selected.sku : "Choose your colour and size below"}</small></div>
        </div>

        <fieldset className={styles.selectionFields} disabled={checking || handoff}>
          <legend className={styles.srOnly}>Product selection</legend>
          <div className={styles.optionGrid}>
            <div>
              <label className={styles.fieldLabel} htmlFor={id + "-color"}>Colour</label>
              <select id={id + "-color"} value={color} onChange={(event) => chooseVariant("", event.target.value)}>
                {availableColors.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor={id + "-size"}>Size</label>
              <select id={id + "-size"} value={variantId} onChange={(event) => chooseVariant(event.target.value)}>
                <option value="">Select size</option>
                {colorVariants.map((variant) => <option key={variant.id} value={variant.id} disabled={variant.available < 1}>{variant.size}{variant.available < 1 ? " · Sold out" : ""}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.quantityRow}>
            <div><span>Quantity</span><small>{selected && stockVerified ? Math.floor(selected.available) + " available at last check" : "Choose a size to set quantity"}</small></div>
            <div className={styles.quantityControl}>
              <button type="button" aria-label="Decrease quantity" disabled={!selected || quantity <= 1} onClick={() => updateQuantity(Math.max(1, quantity - 1))}><Minus size={16} aria-hidden="true" /></button>
              <output aria-label="Quantity" aria-live="polite">{quantity}</output>
              <button type="button" aria-label="Increase quantity" disabled={!selected || quantity >= Math.floor(selected.available)} onClick={() => updateQuantity(Math.max(1, clampOrderQuantity(quantity + 1, selected?.available ?? 0)))}><Plus size={16} aria-hidden="true" /></button>
            </div>
          </div>
        </fieldset>
        {selected && <div className={styles.totalRow}><span>Items subtotal</span><strong>{formatPaise(unitPrice * quantity)}</strong></div>}
        <div className={styles.stockStatus} role="status">
          {checking ? <><LoaderCircle size={15} className={styles.spinner} aria-hidden="true" />Checking current price & stock…</> : stockVerified ? <><Check size={15} aria-hidden="true" />{stockNote || "Availability checked. Stock is not reserved."}</> : null}
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {!checking && !stockVerified && <button type="button" className={styles.retryButton} onClick={() => void refreshStock()}>Check availability again</button>}
        {stockVerified && !snapshot.variants.some((variant) => variant.available > 0) && <p className={styles.error}>This product is currently sold out.</p>}
        <button type="button" className={styles.continueButton}
          disabled={!configured || checking || handoff || !stockVerified || !selected || selected.available < 1}
          onClick={() => void continueToWhatsApp()}>
          {checking || handoff ? <LoaderCircle size={21} className={styles.spinner} aria-hidden="true" /> : <WhatsAppIcon size={21} />}
          {handoff ? "Checking before you continue…" : "Continue on WhatsApp"}
        </button>
        <p id={id + "-note"} className={styles.handoffNote}>Opens WhatsApp with your selection. Send the message to begin your enquiry. This does not place an order or reserve stock; final price and delivery are confirmed before payment.</p>
      </dialog>
    </>
  );
}
