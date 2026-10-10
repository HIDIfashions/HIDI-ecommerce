"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CatalogImage } from "@/components/catalog-image";
import { formatPaise } from "@/lib/api";
import { getCartSession } from "@/lib/cart-session";
import { CartSizeEditor } from "./cart-size-editor";

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
  shippingPaise?: number;
  totalPaise?: number;
  itemCount: number;
  items: CartItem[];
};

function isCart(value: unknown): value is Cart {
  if (!value || typeof value !== "object") return false;
  const data = value as Cart;
  if (!Array.isArray(data.items) || !Number.isSafeInteger(data.itemCount) || data.itemCount < 0
      || !Number.isSafeInteger(data.subtotalPaise) || data.subtotalPaise < 0) return false;
  if (data.shippingPaise !== undefined && (!Number.isSafeInteger(data.shippingPaise) || data.shippingPaise < 0 || !Number.isSafeInteger(data.totalPaise) || data.totalPaise !== data.subtotalPaise + data.shippingPaise)) return false;
  if (!data.items.every(item => item && typeof item.id === "string"
      && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 10
      && Number.isSafeInteger(item.lineTotalPaise) && item.lineTotalPaise >= 0
      && item.product && [item.product.id, item.product.slug, item.product.name].every(field => typeof field === "string")
      && item.variant && [item.variant.id, item.variant.size, item.variant.color].every(field => typeof field === "string")
      && Number.isInteger(item.variant.available) && item.variant.available >= 0)) return false;
  return data.items.reduce((sum, item) => sum + item.quantity, 0) === data.itemCount
    && data.items.reduce((sum, item) => sum + item.lineTotalPaise, 0) === data.subtotalPaise;
}

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
  const [editingId, setEditingId] = useState("");
  const [notice, setNotice] = useState("");
  const mutating = useRef(false);
  const editButton = useRef<HTMLButtonElement | null>(null);
  function closeEditor() {
    setEditingId("");
    window.requestAnimationFrame(() => {
      const target = editButton.current?.isConnected ? editButton.current : document.querySelector<HTMLButtonElement>('.cart-edit');
      target?.focus({ preventScroll: true });
    });
  }

  async function load() {
    setError("");
    try {
      const response = await fetch(`${API}/carts/${getCartSession()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to load bag");
      if (!isCart(data)) throw new Error("Unable to confirm your bag. Please try again.");
      setCart(data);
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function mutate(itemId: string, method: "PATCH" | "DELETE", quantity?: number, variantId?: string): Promise<boolean> {
    if (mutating.current) return false;
    mutating.current = true;
    setBusy(itemId); setError(""); setNotice("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    const uncertain = "We couldn’t confirm the update. Check your bag before trying again.";
    try {
      const options: RequestInit = { method, signal: controller.signal, cache: "no-store" };

      if (method === "PATCH") {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify({ quantity, ...(variantId ? { variantId } : {}) });
      }

      let response: Response;
      try { response = await fetch(`${API}/carts/${getCartSession()}/items/${itemId}`, options); }
      catch { throw new Error(uncertain); }
      let data: any;
      try { data = await response.json(); } catch { throw new Error(uncertain); }
      if (!response.ok) {
        const message = typeof data?.message === "string" ? data.message
          : Array.isArray(data?.message) ? data.message.filter((entry: unknown) => typeof entry === "string").join(" ") : "Unable to update bag";
        throw new Error(response.status >= 500 ? uncertain
          : response.status === 429 ? "Please wait a moment before updating your bag." : message);
      }
      if (!isCart(data)) throw new Error(uncertain);
      setCart(data);
      window.dispatchEvent(new CustomEvent("hidi-cart-updated", { detail: data.itemCount }));
      if (variantId) { setNotice("Size updated in your bag."); closeEditor(); }
      return true;
    } catch (e: any) { setError(e.message); return false; }
    finally { window.clearTimeout(timeout); mutating.current = false; setBusy(""); }
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
  const shippingLabel = complimentaryShipping ? "Complimentary" : cart.shippingPaise !== undefined ? formatPaise(cart.shippingPaise) : "Calculated at checkout";

  return <>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p role="status" className="cart-status">{notice}</p>
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
                        disabled={Boolean(busy)}
                        onClick={() => item.quantity === 1
                          ? mutate(item.id, "DELETE")
                          : mutate(item.id, "PATCH", item.quantity - 1)}
                        aria-label={item.quantity === 1 ? `Remove size ${item.variant.size} from bag` : `Decrease size ${item.variant.size} quantity`}
                        title={item.quantity === 1 ? "Remove size" : "Decrease quantity"}
                      >−</button>
                      <span>{item.quantity}</span>
                      <button
                        disabled={Boolean(busy) || item.quantity >= Math.min(10, item.variant.available)}
                        onClick={() => mutate(item.id, "PATCH", item.quantity + 1)}
                        aria-label={`Increase size ${item.variant.size} quantity`}
                      >+</button>
                      <button type="button" className="remove cart-edit" disabled={Boolean(busy)} aria-label={`Edit size ${item.variant.size} for ${group.product.name}`} aria-expanded={editingId === item.id} onClick={event => { editButton.current = event.currentTarget; setError(""); setEditingId(editingId === item.id ? "" : item.id); }}>Edit</button>
                      <button className="remove" disabled={Boolean(busy)} onClick={() => mutate(item.id, "DELETE")}>Remove</button>
                    </div>
                    {editingId === item.id && <CartSizeEditor key={item.id} slug={group.product.slug} name={group.product.name} colour={item.variant.color} currentVariantId={item.variant.id} quantity={item.quantity} quantities={Object.fromEntries(cart.items.map(entry => [entry.variant.id, entry.quantity]))} busy={Boolean(busy)} onCancel={closeEditor} onSave={variantId => mutate(item.id, "PATCH", item.quantity, variantId)} />}
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
        <div><span>Shipping</span><span>{shippingLabel}</span></div>
        <div className="summary-total"><span>Total</span><strong>{formatPaise(cart.totalPaise ?? cart.subtotalPaise)}</strong></div>
        <p className="checkout-shipping-policy">₹99 shipping below ₹1,499. Free shipping from ₹1,499 before rewards.</p>
        <Link className="button button-dark cart-checkout-button" href="/checkout" aria-disabled={Boolean(busy)} onClick={event => { if (mutating.current) event.preventDefault(); }}>Continue to checkout</Link>
        <p className="fine-print">Secure checkout · UPI · Cards · Net banking</p>
      </aside>
    </div>

    <div className="mobile-cart-checkout" aria-label="Bag checkout summary">
      <div>
        <span>Total · {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}</span>
        <strong>{formatPaise(cart.totalPaise ?? cart.subtotalPaise)}</strong>
      </div>
      <Link href="/checkout" aria-disabled={Boolean(busy)} onClick={event => { if (mutating.current) event.preventDefault(); }}>Checkout</Link>
    </div>
  </>;
}
