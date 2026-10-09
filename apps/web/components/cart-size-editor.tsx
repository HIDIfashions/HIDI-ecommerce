"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiProduct, ApiVariant } from "@/lib/api";
import { formatPaise } from "@/lib/api";
import { BROWSER_API_URL } from "@/lib/browser-api";
import styles from "./cart-size-editor.module.css";

export function CartSizeEditor({ slug, name, colour, currentVariantId, quantity, quantities, busy, onSave, onCancel }: {
  slug: string; name: string; colour: string; currentVariantId: string; quantity: number;
  quantities: Record<string, number>; busy: boolean;
  onSave: (variantId: string) => Promise<boolean>; onCancel: () => void;
}) {
  const [variants, setVariants] = useState<ApiVariant[]>([]);
  const [selectedId, setSelectedId] = useState(currentVariantId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const writing = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`${BROWSER_API_URL}/products/${encodeURIComponent(slug)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const data: ApiProduct = await response.json();
        if (!response.ok || !Array.isArray(data.variants)) throw new Error("Unable to load available sizes. Please try again.");
        if (controller.signal.aborted) return;
        setVariants(data.variants.filter(variant => variant.color === colour).map(variant => data.inStock ? variant : { ...variant, available: 0 }));
        setLoading(false);
        window.requestAnimationFrame(() => fieldset.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true }));
      })
      .catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Unable to load sizes."); setLoading(false); } });
    return () => controller.abort();
  }, [slug, colour, attempt]);
  const selected = variants.find(variant => variant.id === selectedId);
  const canChoose = (variant: ApiVariant) => {
    const total = quantity + (variant.id === currentVariantId ? 0 : quantities[variant.id] ?? 0);
    return total <= Math.min(10, variant.available);
  };
  async function save() {
    if (writing.current || busy || !selected || !canChoose(selected) || selected.id === currentVariantId) return;
    writing.current = true;
    try { if (!await onSave(selected.id)) setAttempt(value => value + 1); }
    finally { writing.current = false; }
  }
  return <div className={styles.editor} aria-busy={loading || busy}>
    {loading ? <p role="status">Loading available sizes...</p> : error ? <><p role="alert">{error}</p><button type="button" className={styles.cancel} onClick={() => setAttempt(value => value + 1)}>Try again</button></> : <>
      <fieldset ref={fieldset} disabled={busy}>
        <legend>Size for {name}</legend>
        <div className={styles.sizes}>{variants.map(variant => <button type="button" key={variant.id} aria-pressed={variant.id === selectedId} disabled={!canChoose(variant)} title={canChoose(variant) ? `Size ${variant.size}` : "Not enough stock for this quantity"} onClick={() => setSelectedId(variant.id)}>{variant.size}</button>)}</div>
      </fieldset>
      <p className={styles.price} aria-live="polite">{selected ? `Item total ${formatPaise(selected.pricePaise * quantity)}` : "No sizes available"}</p>
      <button type="button" className={styles.save} disabled={busy || !selected || !canChoose(selected) || selected.id === currentVariantId} onClick={() => void save()}>{busy ? "Updating..." : "Save size"}</button>
    </>}
    <button type="button" className={styles.cancel} disabled={busy} onClick={onCancel}>Cancel</button>
  </div>;
}
