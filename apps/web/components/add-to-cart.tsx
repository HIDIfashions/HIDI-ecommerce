"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { formatPaise, type ApiProduct } from "@/lib/api";
import { WishlistButton } from "@/components/wishlist-button";
import { getCartSession } from "@/lib/cart-session";
import { PRODUCT_VARIANT_EVENT, publishProductSelection, type ProductVariantSelection } from "@/lib/product-sharing";

import { BROWSER_API_URL } from "@/lib/browser-api";
const API = BROWSER_API_URL;
export { PRODUCT_VARIANT_EVENT } from "@/lib/product-sharing";

export function AddToCart({ product }: { product: ApiProduct }) {
  const fitHelpId = useId();
  const colors = useMemo(() => Array.from(new Set(product.variants.map((v) => v.color))), [product]);
  const [color, setColor] = useState(colors[0] ?? "");
  const sizes = useMemo(
    () => product.variants.filter((v) => v.color === color).sort((a, b) => ["XS","S","M","L","XL","XXL","3XL"].indexOf(a.size) - ["XS","S","M","L","XL","XXL","3XL"].indexOf(b.size)),
    [product, color],
  );
  const [variantId, setVariantId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fitHelp, setFitHelp] = useState(false);

  useEffect(() => {
    function syncSelection(event: Event) {
      const detail = (event as CustomEvent<ProductVariantSelection>).detail;
      if (detail?.slug !== product.slug) return;
      const variant = product.variants.find((item) => item.id === detail.variantId);
      setColor(variant?.color ?? detail.color ?? colors[0] ?? "");
      setVariantId(variant?.id ?? "");
      setMessage("");
    }
    window.addEventListener(PRODUCT_VARIANT_EVENT, syncSelection);
    return () => window.removeEventListener(PRODUCT_VARIANT_EVENT, syncSelection);
  }, [product, colors]);

  function selectVariant(variant: ApiProduct["variants"][number]) {
    setVariantId(variant.id);
    setMessage("");
    publishProductSelection({ slug: product.slug, variantId: variant.id, size: variant.size, color: variant.color });
  }

  async function add() {
    if (!variantId) { setMessage("Please select a size."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${API}/carts/${getCartSession()}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity: 1 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to add item");
      setMessage("Added to your bag.");
      window.dispatchEvent(new CustomEvent("hidi-cart-updated", { detail: data.itemCount }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add item. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div>
      {colors.length > 1 && <>
        <div className="size-row-title"><strong>Colour</strong></div>
        <div className="colour-options">
          {colors.map((value) => <button key={value} type="button" aria-pressed={value === color} className={value === color ? "selected" : ""} onClick={() => {
            setColor(value);
            setVariantId("");
            setMessage("");
            publishProductSelection({ slug: product.slug, variantId: "", color: value });
          }}>{value}</button>)}
        </div>
      </>}
      <div className="size-row-title"><strong>Select size</strong><button type="button" aria-expanded={fitHelp} aria-controls={fitHelpId} onClick={() => setFitHelp((value) => !value)}>Fit help</button></div>
      {fitHelp && <p id={fitHelpId} className="inline-message">Fit can vary by style. Check the product details before choosing a size. If measurements are not listed, ask HIDI for this garment’s measurements before ordering.</p>}
      <div className="sizes">
        {sizes.map((variant) => (
          <button
            key={variant.id}
            type="button"
            disabled={variant.available < 1}
            aria-pressed={variant.id === variantId}
            className={variant.id === variantId ? "selected" : ""}
            onClick={() => selectVariant(variant)}
            title={variant.available < 1 ? "Sold out" : `${variant.available} available`}
          >{variant.size}</button>
        ))}
      </div>
      <button className="button button-dark add-to-bag pdp-desktop-add" type="button" disabled={busy || !product.inStock} onClick={add}>
        {busy ? "Adding…" : product.inStock ? "Add to bag" : "Sold out"}
      </button>
      {message && <p className="inline-message pdp-add-message" role="status">{message}</p>}

      <div className="pdp-mobile-buybar" aria-label="Mobile purchase actions">
        <div className="pdp-mobile-buybar-price">
          <span>{variantId ? "Selected" : "From"}</span>
          <strong>{formatPaise(product.variants.find((variant) => variant.id === variantId)?.pricePaise ?? product.minPricePaise)}</strong>
        </div>
        <WishlistButton slug={product.slug} compact />
        <button
          className="pdp-mobile-add-button"
          type="button"
          disabled={busy || !product.inStock}
          onClick={add}
        >
          {busy ? "Adding…" : !product.inStock ? "Sold out" : variantId ? "Add to bag" : "Choose size"}
        </button>
      </div>
    </div>
  );
}
