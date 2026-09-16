"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiProduct } from "@/lib/api";
import { getCartSession } from "@/lib/cart-session";
import { getWishlistSlugs, setWishlistSlugs, WISHLIST_EVENT } from "@/lib/wishlist";
import { ProductCard } from "./product-card";
import styles from "./wishlist-page.module.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

export function WishlistPageClient({ products }: { products: ApiProduct[] }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    const sync = () => setSlugs(getWishlistSlugs());
    sync();
    window.addEventListener(WISHLIST_EVENT, sync);
    return () => window.removeEventListener(WISHLIST_EVENT, sync);
  }, []);

  const saved = useMemo(
    () => products.filter((product) => slugs.includes(product.slug)),
    [products, slugs],
  );

  function remove(product: ApiProduct) {
    const next = getWishlistSlugs().filter((slug) => slug !== product.slug);
    setWishlistSlugs(next);
    setMessages((current) => {
      const copy = { ...current };
      delete copy[product.slug];
      return copy;
    });
  }

  async function addToBag(product: ApiProduct) {
    const variantId = selectedVariants[product.slug];
    if (!variantId) {
      setMessages((current) => ({ ...current, [product.slug]: "Please select a size first." }));
      return;
    }

    setBusySlug(product.slug);
    setMessages((current) => ({ ...current, [product.slug]: "" }));

    try {
      const response = await fetch(`${API}/carts/${getCartSession()}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity: 1 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to add item");

      setMessages((current) => ({ ...current, [product.slug]: "Added to your bag." }));
      window.dispatchEvent(new CustomEvent("hidi-cart-updated", { detail: data.itemCount }));
    } catch (error: any) {
      setMessages((current) => ({ ...current, [product.slug]: error?.message ?? "Unable to add item" }));
    } finally {
      setBusySlug(null);
    }
  }

  if (!saved.length) {
    return <div className="catalog-empty"><h2>Your wishlist is empty.</h2><p>Save pieces you love and they’ll appear here.</p></div>;
  }

  return <div className={styles.grid}>
    {saved.map((product) => {
      const availableVariants = product.variants.filter((variant) => variant.available > 0);
      const multipleColours = new Set(availableVariants.map((variant) => variant.color)).size > 1;

      return <div className={styles.itemWrap} key={product.id}>
        <ProductCard product={product} />

        <div className={styles.controls}>
          <div className={styles.selectRow}>
            <label htmlFor={`wishlist-variant-${product.slug}`}>Select size{multipleColours ? " / colour" : ""}</label>
            <select
              id={`wishlist-variant-${product.slug}`}
              className={styles.select}
              value={selectedVariants[product.slug] ?? ""}
              onChange={(event) => {
                setSelectedVariants((current) => ({ ...current, [product.slug]: event.target.value }));
                setMessages((current) => ({ ...current, [product.slug]: "" }));
              }}
              disabled={!availableVariants.length}
            >
              <option value="">Choose size</option>
              {availableVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.size}{multipleColours ? ` · ${variant.color}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.removeButton}
              onClick={() => remove(product)}
              disabled={busySlug === product.slug}
            >
              Remove
            </button>
            <button
              type="button"
              className={styles.addButton}
              onClick={() => addToBag(product)}
              disabled={busySlug === product.slug || !product.inStock}
            >
              {busySlug === product.slug ? "Adding…" : product.inStock ? "Add to bag" : "Sold out"}
            </button>
          </div>

          {messages[product.slug] && <p className={styles.message} role="status">{messages[product.slug]}</p>}
        </div>
      </div>;
    })}
  </div>;
}
