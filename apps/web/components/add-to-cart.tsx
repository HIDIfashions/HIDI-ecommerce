"use client";

import { useMemo, useState } from "react";
import { ApiProduct } from "@/lib/api";
import { getCartSession } from "@/lib/cart-session";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";
export const PRODUCT_VARIANT_EVENT = "hidi-product-variant-selected";

export function AddToCart({ product }: { product: ApiProduct }) {
  const colors = useMemo(() => Array.from(new Set(product.variants.map((v) => v.color))), [product]);
  const [color, setColor] = useState(colors[0] ?? "");
  const sizes = useMemo(
    () => product.variants.filter((v) => v.color === color).sort((a, b) => ["XS","S","M","L","XL","XXL","3XL"].indexOf(a.size) - ["XS","S","M","L","XL","XXL","3XL"].indexOf(b.size)),
    [product, color],
  );
  const [variantId, setVariantId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function selectVariant(variant: ApiProduct["variants"][number]) {
    setVariantId(variant.id);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(PRODUCT_VARIANT_EVENT, {
        detail: {
          slug: product.slug,
          variantId: variant.id,
          size: variant.size,
          color: variant.color,
        },
      }));
    }
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
    } catch (error: any) {
      setMessage(error.message ?? "Unable to add item");
    } finally { setBusy(false); }
  }

  return (
    <div>
      {colors.length > 1 && <>
        <div className="size-row-title"><strong>Colour</strong></div>
        <div className="colour-options">
          {colors.map((value) => <button key={value} className={value === color ? "selected" : ""} onClick={() => { setColor(value); setVariantId(""); }}>{value}</button>)}
        </div>
      </>}
      <div className="size-row-title"><strong>Select size</strong><button type="button">Size guide</button></div>
      <div className="sizes">
        {sizes.map((variant) => (
          <button
            key={variant.id}
            type="button"
            disabled={variant.available < 1}
            className={variant.id === variantId ? "selected" : ""}
            onClick={() => selectVariant(variant)}
            title={variant.available < 1 ? "Sold out" : `${variant.available} available`}
          >{variant.size}</button>
        ))}
      </div>
      <button className="button button-dark add-to-bag" type="button" disabled={busy || !product.inStock} onClick={add}>
        {busy ? "Adding…" : product.inStock ? "Add to bag" : "Sold out"}
      </button>
      {message && <p className="inline-message" role="status">{message}</p>}
    </div>
  );
}
