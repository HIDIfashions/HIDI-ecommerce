"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogImage } from "@/components/catalog-image";
import { formatPaise } from "@/lib/api";
import { getCartSession } from "@/lib/cart-session";

import { BROWSER_API_URL } from "@/lib/browser-api";
const API = BROWSER_API_URL;

type Cart = any;

export function CartClient() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    try {
      const response = await fetch(`${API}/carts/${getCartSession()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to load bag");
      setCart(data);
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function mutate(itemId: string, method: "PATCH" | "DELETE", quantity?: number) {
    setBusy(itemId); setError("");
    try {
      const options: RequestInit = { method };

      if (method === "PATCH") {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify({ quantity });
      }

      const response = await fetch(
        `${API}/carts/${getCartSession()}/items/${itemId}`,
        options,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to update bag");
      setCart(data);
      window.dispatchEvent(new CustomEvent("hidi-cart-updated", { detail: data.itemCount }));
    } catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  }

  if (!cart) return <p className="muted">Loading your bag…</p>;
  if (cart.items.length === 0) return <div className="empty-state"><h2>Your bag is waiting.</h2><p>Find something you love from the latest HIDI edit.</p><Link className="button button-dark" href="/collections/new-arrivals">Browse new arrivals</Link></div>;

  return <>
    {error && <p className="form-error">{error}</p>}
    <div className="cart-layout">
      <section>
        {cart.items.map((item: any) => <article className="cart-item" key={item.id}>
          <Link
            href={`/products/${item.product.slug}`}
            className="cart-thumb"
            aria-label={`View ${item.product.name}`}
            style={{ position: "relative", display: "block", overflow: "hidden", background: "#eee8df" }}
          >
            <CatalogImage
              src={item.product.image}
              alt={item.product.name}
              sizes="180px"
              fallbackLabel={`HIDI / ${item.product.name}`}
            />
          </Link>
          <div className="cart-item-info">
            <div><h2>{item.product.name}</h2><p>{item.variant.color}</p><p>Size: {item.variant.size}</p></div>
            <strong>{formatPaise(item.lineTotalPaise)}</strong>
            <div className="cart-actions">
              <button
                disabled={busy === item.id}
                onClick={() => item.quantity === 1
                  ? mutate(item.id, "DELETE")
                  : mutate(item.id, "PATCH", item.quantity - 1)}
                aria-label={item.quantity === 1 ? `Remove ${item.product.name} from bag` : `Decrease ${item.product.name} quantity`}
                title={item.quantity === 1 ? "Remove item" : "Decrease quantity"}
              >−</button>
              <span>{item.quantity}</span>
              <button disabled={busy === item.id || item.quantity >= Math.min(10, item.variant.available)} onClick={() => mutate(item.id, "PATCH", item.quantity + 1)}>+</button>
              <button className="remove" disabled={busy === item.id} onClick={() => mutate(item.id, "DELETE")}>Remove</button>
            </div>
          </div>
        </article>)}
      </section>
      <aside className="order-summary">
        <h2>Order summary</h2>
        <div><span>Subtotal</span><strong>{formatPaise(cart.subtotalPaise)}</strong></div>
        <div><span>Shipping</span><span>Calculated at checkout</span></div>
        <div className="summary-total"><span>Total</span><strong>{formatPaise(cart.subtotalPaise)}</strong></div>
        <Link className="button button-dark" href="/checkout">Continue to checkout</Link>
        <p className="fine-print">Secure checkout · UPI · Cards · Net banking</p>
      </aside>
    </div>
  </>;
}
