"use client";

import Script from "next/script";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/lib/api";
import { getCartSession, newCheckoutToken } from "@/lib/cart-session";
import { getStoredSession } from "@/lib/supabase-auth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

declare global {
  interface Window { Razorpay?: new (options: any) => { open: () => void; on: (event: string, cb: (payload: any) => void) => void } }
}

export function CheckoutClient() {
  const router = useRouter();
  const [cart, setCart] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState("");
  const token = useRef<string>("");

  useEffect(() => {
    token.current = newCheckoutToken();
    setSignedInEmail(getStoredSession()?.user?.email ?? "");
    fetch(`${API}/carts/${getCartSession()}`).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message ?? "Unable to load bag");
      setCart(data);
    }).catch((e) => setError(e.message));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const RazorpayCheckout = window.Razorpay;
    if (!RazorpayCheckout) { setError("Secure payment is still loading. Please try again."); return; }
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API}/checkout/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getCartSession(),
          checkoutToken: token.current,
          customerEmail: data.get("email"),
          customerPhone: data.get("phone"),
          shippingAddress: {
            firstName: data.get("firstName"), lastName: data.get("lastName"), phone: data.get("phone"),
            line1: data.get("line1"), line2: data.get("line2"), postalCode: data.get("postalCode"),
            city: data.get("city"), state: data.get("state"), countryCode: "IN",
          },
        }),
      });
      const prepared = await response.json();
      if (!response.ok) throw new Error(prepared?.message ?? "Unable to prepare checkout");

      const rzp = new RazorpayCheckout({
        key: prepared.razorpayKeyId,
        amount: prepared.amountPaise,
        currency: prepared.currency,
        name: "HIDI",
        description: `Order ${prepared.orderNumber}`,
        order_id: prepared.providerOrderId,
        prefill: {
          name: `${data.get("firstName") ?? ""} ${data.get("lastName") ?? ""}`.trim(),
          email: data.get("email") ?? "",
          contact: data.get("phone") ?? "",
        },
        notes: { hidi_order_number: prepared.orderNumber },
        theme: { color: "#1d1d1a" },
        handler: async (paymentResult: any) => {
          try {
            const verify = await fetch(`${API}/payments/razorpay/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(paymentResult),
            });
            const result = await verify.json();
            if (!verify.ok) throw new Error(result?.message ?? "Payment verification failed");
            router.push(`/order-confirmed?order=${encodeURIComponent(result.orderNumber)}&status=${encodeURIComponent(result.status)}`);
          } catch (e: any) {
            setError(`${e.message}. If money was debited, do not pay again; HIDI will reconcile the payment automatically.`);
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", (failure: any) => {
        setError(failure?.error?.description ?? "Payment did not complete. No order will be fulfilled until payment is confirmed.");
        setBusy(false);
      });
      rzp.open();
    } catch (e: any) {
      token.current = newCheckoutToken();
      setError(e.message ?? "Unable to start payment");
      setBusy(false);
    }
  }

  if (!cart) return <p className="muted">Preparing secure checkout…</p>;
  if (cart.items.length === 0) return <p>Your bag is empty.</p>;

  return <>
    <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
    <div className="checkout-grid">
      <form className="checkout-form" onSubmit={submit}>
        <section><h2>Contact</h2><input name="email" placeholder="Email address" type="email" defaultValue={signedInEmail} required /><input name="phone" placeholder="Mobile number" inputMode="tel" required /></section>
        <section><h2>Delivery address</h2><div className="two-col"><input name="firstName" placeholder="First name" required /><input name="lastName" placeholder="Last name" /></div><input name="line1" placeholder="Address" required /><input name="line2" placeholder="Apartment, suite, landmark (optional)" /><div className="two-col"><input name="postalCode" placeholder="PIN code" inputMode="numeric" pattern="[0-9]{6}" required /><input name="city" placeholder="City" required /></div><div className="two-col"><input name="state" placeholder="State" required /><input value="India" disabled readOnly /></div></section>
        <section><h2>Payment</h2><div className="payment-placeholder"><strong>Razorpay secure payment</strong><span>UPI · Cards · Net banking · Wallets</span></div><p className="fine-print left">Stock is reserved for 15 minutes only after you press Pay securely.</p></section>
        {error && <p className="form-error">{error}</p>}
        <button className="button button-dark" type="submit" disabled={busy}>{busy ? "Opening secure payment…" : "Pay securely"}</button>
      </form>
      <aside className="checkout-summary"><p>Order total</p><strong>{formatPaise(cart.subtotalPaise)}</strong><span>{cart.itemCount} item(s) · Taxes included. Shipping policy can be applied before go-live.</span></aside>
    </div>
  </>;
}
