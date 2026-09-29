"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogImage } from "@/components/catalog-image";
import { formatPaise } from "@/lib/api";
import { getCartSession } from "@/lib/cart-session";

import { BROWSER_API_URL } from "@/lib/browser-api";
const API = BROWSER_API_URL;

type CartItem = {
  id: string;
  quantity: number;
  lineTotalPaise: number;
  product: { id: string; slug: string; name: string; image?: string | null };
  variant: { id: string; size: string; color: string; available: number };
};

type Cart = {
  subtotalPaise: number;
  itemCount: number;
  items: CartItem[];
};

type CartGroup = {
  key: string;
  product: CartItem["product"];
  color: string;
  items: CartItem[];
  quantity: number;
  lineTotalPaise: number;
};

function groupCartItems(items: CartItem[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();

  for (const item of items) {
    const key = `${item.product.id}::${item.variant.color}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      existing.quantity += item.quantity;
      existing.lineTotalPaise += item.lineTotalPaise;
      continue;
    }

    groups.set(key, {
      key,
      product: item.product,
      color: item.variant.color,
      items: [item],
      quantity: item.quantity,
      lineTotalPaise: item.lineTotalPaise,
    });
  }

  return [...groups.values()];
}

export function CartClient() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setError("");
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

  if (!cart) return error ? (
    <div className="empty-state">
      <h2>We couldn’t load your bag.</h2>
      <p className="form-error" role="alert">{error}</p>
      <button className="button button-dark" type="button" onClick={() => void load()}>Try again</button>
    </div>
  ) : <p className="muted" role="status">Loading your bag…</p>;
  if (cart.items.length === 0) return <div className="empty-state"><h2>Your bag is waiting.</h2><p>Find something you love from the latest HIDI edit.</p><Link className="button button-dark" href="/collections/new-arrivals">Browse new arrivals</Link></div>;

  const groups = groupCartItems(cart.items);
  const complimentaryShipping = cart.subtotalPaise >= 149900;

  return <>
    {error && <p className="form-error">{error}</p>}
    <div className="cart-layout">
      <section className="cart-items">
        {groups.map((group) => (
          <article className="cart-item cart-item-group" key={group.key}>
            <Link
              href={`/products/${group.product.slug}`}
              className="cart-thumb"
              aria-label={`View ${group.product.name}`}
              style={{ position: "relative", display: "block", overflow: "hidden", background: "var(--hidi-page-bg, #fbf6f2)" }}
            >
              <CatalogImage
                src={group.product.image}
                alt={group.product.name}
                sizes="180px"
                fallbackLabel={`HIDI / ${group.product.name}`}
              />
            </Link>

            <div className="cart-item-info cart-group-info">
              <div className="cart-group-heading">
                <div>
                  <h2>{group.product.name}</h2>
                  <p>{group.color} · Qty {group.quantity}</p>
                </div>
                <strong>{formatPaise(group.lineTotalPaise)}</strong>
              </div>

              <div className="cart-variant-list" aria-label={`${group.product.name} selected sizes`}>
                {group.items.map((item) => (
                  <div className="cart-variant-row" key={item.id}>
                    <div className="cart-variant-label">
                      <strong>Size {item.variant.size}</strong>
                      <span>{item.quantity > 1 ? `Qty ${item.quantity}` : "1 piece"}</span>
                    </div>
                    <div className="cart-actions">
                      <button
                        disabled={busy === item.id}
                        onClick={() => item.quantity === 1
                          ? mutate(item.id, "DELETE")
                          : mutate(item.id, "PATCH", item.quantity - 1)}
                        aria-label={item.quantity === 1 ? `Remove size ${item.variant.size} from bag` : `Decrease size ${item.variant.size} quantity`}
                        title={item.quantity === 1 ? "Remove size" : "Decrease quantity"}
                      >−</button>
                      <span>{item.quantity}</span>
                      <button
                        disabled={busy === item.id || item.quantity >= Math.min(10, item.variant.available)}
                        onClick={() => mutate(item.id, "PATCH", item.quantity + 1)}
                        aria-label={`Increase size ${item.variant.size} quantity`}
                      >+</button>
                      <button className="remove" disabled={busy === item.id} onClick={() => mutate(item.id, "DELETE")}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>
      <aside className="order-summary">
        <h2>Order summary</h2>
        <div><span>Subtotal</span><strong>{formatPaise(cart.subtotalPaise)}</strong></div>
        <div><span>Shipping</span><span>{complimentaryShipping ? "Complimentary" : "Calculated at checkout"}</span></div>
        <div className="summary-total"><span>Total</span><strong>{formatPaise(cart.subtotalPaise)}</strong></div>
        <Link className="button button-dark cart-checkout-button" href="/checkout">Continue to checkout</Link>
        <p className="fine-print">Secure checkout · UPI · Cards · Net banking</p>
      </aside>
    </div>

    <div className="mobile-cart-checkout" aria-label="Bag checkout summary">
      <div>
        <span>Subtotal · {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}</span>
        <strong>{formatPaise(cart.subtotalPaise)}</strong>
      </div>
      <Link href="/checkout">Checkout</Link>
    </div>
  </>;
}
