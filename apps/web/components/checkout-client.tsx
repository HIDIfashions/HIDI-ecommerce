"use client";

import Link from "next/link";
import Script from "next/script";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adoptCartSession, getCartSession, newCheckoutToken, startNewCartSession } from "@/lib/cart-session";
import { getAccessToken, getStoredSession } from "@/lib/supabase-auth";
import { useWalletSummary } from "@/components/wallet-balance";
import { CatalogImage } from "@/components/catalog-image";
import { checkoutFingerprint, formatWalletPaise, parsePreparedCheckout, walletAccountId, walletAmountPaise, walletEnabled, WALLET_UPDATED_EVENT, type PreparedCheckout } from "@/lib/wallet-client";
import walletStyles from "./wallet.module.css";

import { BROWSER_API_URL } from "@/lib/browser-api";
const API = BROWSER_API_URL;

declare global {
  interface Window { Razorpay?: new (options: any) => { open: () => void; close?: () => void; on: (event: string, cb: (payload: any) => void) => void } }
}

type CheckoutCart = {
  subtotalPaise: number;
  totalPaise?: number;
  itemCount: number;
  items: Array<{
    id: string;
    quantity: number;
    lineTotalPaise: number;
    product: { slug: string; name: string; image?: string | null };
    variant: { id: string; size: string; color: string };
  }>;
};
type Attempt = { fingerprint: string; token: string; walletPaise: number };

function cartSignature(cart: CheckoutCart) {
  return JSON.stringify([cart.subtotalPaise, cart.totalPaise, cart.items.map((item) => [item.id, item.variant?.id, item.quantity, item.lineTotalPaise])]);
}

export function CheckoutClient() {
  const router = useRouter();
  const wallet = useWalletSummary();
  const [cart, setCart] = useState<CheckoutCart | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState("");
  const [signedInPhone, setSignedInPhone] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [walletInput, setWalletInput] = useState("");
  const [prepared, setPrepared] = useState<PreparedCheckout | null>(null);
  const [reloadCart, setReloadCart] = useState(0);
  const [showAddressDetail, setShowAddressDetail] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const lock = useRef(false);
  const lifecycle = useRef({ active: false, revision: 0, userId: null as string | null, cartSignature: "" });
  const request = useRef<AbortController | null>(null);
  const payment = useRef<InstanceType<NonNullable<Window["Razorpay"]>> | null>(null);

  function invalidate(resetChoice: boolean) {
    lifecycle.current.revision += 1;
    request.current?.abort();
    payment.current?.close?.();
    payment.current = null;
    attempt.current = null;
    lock.current = false;
    setBusy(false); setPrepared(null);
    if (resetChoice) { setUseWallet(false); setWalletInput(""); }
  }

  useEffect(() => {
    lifecycle.current.active = true;
    function syncAuth() {
      const nextUserId = walletAccountId();
      if (nextUserId !== lifecycle.current.userId) {
        invalidate(true);
        lifecycle.current.userId = nextUserId;
        setAccountId(nextUserId);
      }
      try {
        const session = getStoredSession();
        setSignedInEmail(session?.user?.email ?? "");
        setSignedInPhone(session?.user?.phone ?? "");
      } catch {
        setSignedInEmail("");
        setSignedInPhone("");
      }
    }
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === "hidi_supabase_session") syncAuth();
      if (event.key === null || event.key === "hidi_cart_session") { invalidate(true); setReloadCart((value) => value + 1); }
    }
    const refreshCart = () => { setReloadCart((value) => value + 1); };
    syncAuth();
    window.addEventListener("hidi-auth-updated", syncAuth);
    window.addEventListener("storage", onStorage);
    window.addEventListener("hidi-cart-updated", refreshCart);
    return () => {
      lifecycle.current.active = false;
      lifecycle.current.revision += 1;
      request.current?.abort();
      payment.current?.close?.();
      window.removeEventListener("hidi-auth-updated", syncAuth);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("hidi-cart-updated", refreshCart);
    };
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const whatsappCart = query.get("waCart");
    if (!whatsappCart) return;
    if (!adoptCartSession(whatsappCart)) {
      setError("This WhatsApp checkout link is invalid or has expired.");
      return;
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const sessionId = getCartSession();
    fetch(`${API}/carts/${sessionId}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to load bag");
      if (!Array.isArray(data.items) || !Number.isSafeInteger(data.subtotalPaise) || data.subtotalPaise < 0) throw new Error("Your bag is temporarily unavailable.");
      if (controller.signal.aborted || getCartSession() !== sessionId) return;
      const signature = cartSignature(data);
      if (lifecycle.current.cartSignature && signature !== lifecycle.current.cartSignature) invalidate(true);
      lifecycle.current.cartSignature = signature;
      setCart(data);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load bag"); });
    return () => controller.abort();
  }, [reloadCart]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !cart) return;
    const expectedUserId = walletAccountId();
    if (expectedUserId !== lifecycle.current.userId) { invalidate(true); setError("Your sign-in changed. Please reload checkout before paying."); return; }
    const requestedWallet = useWallet && walletEnabled ? walletAmountPaise(walletInput, cart.totalPaise ?? cart.subtotalPaise, cart.totalPaise ?? cart.subtotalPaise) : 0;
    if (requestedWallet === null || (useWallet && !expectedUserId)) { setError("Enter a valid rewards amount and sign in to use your wallet."); return; }
    const expectedCash = (cart.totalPaise ?? cart.subtotalPaise) - requestedWallet;
    lock.current = true; setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const details = Object.fromEntries(["email", "phone", "firstName", "lastName", "line1", "line2", "postalCode", "city", "state"].map((key) => [key, String(data.get(key) ?? "")]));
    const sessionId = getCartSession();
    const fingerprint = checkoutFingerprint({ userId: expectedUserId, sessionId, cartSignature: cartSignature(cart), walletPaise: requestedWallet, details });
    const retrying = attempt.current?.fingerprint === fingerprint;
    if (expectedCash > 0 && !window.Razorpay && !retrying) {
      lock.current = false; setBusy(false); setError("Secure payment is still loading. Please try again."); return;
    }
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    const revision = lifecycle.current.revision;
    const current = () => lifecycle.current.active && !controller.signal.aborted && lifecycle.current.revision === revision && walletAccountId() === expectedUserId && getCartSession() === sessionId;
    const release = () => { if (current()) { lock.current = false; setBusy(false); } };

    try {
      if (requestedWallet > 0 && expectedUserId) {
        const latest = await wallet.refresh();
        if (!current()) return;
        if (!latest?.enabled) throw new Error("Wallet redemption is currently unavailable. Turn off rewards to continue.");
        // A retry may already own a reservation excluded from availablePaise.
        // The original idempotency key lets the server reuse that exact reservation.
        if (!retrying && requestedWallet > latest.availablePaise) throw new Error(`Your available rewards changed to ${formatWalletPaise(latest.availablePaise)}. Please review the amount before continuing.`);
      }
      const accessToken = expectedUserId ? await getAccessToken() : null;
      if (!current()) return;
      if (expectedUserId && !accessToken) throw new Error("Please sign in again before completing your order.");
      if (!retrying) attempt.current = { fingerprint, token: newCheckoutToken(), walletPaise: requestedWallet };
      const response = await fetch(`${API}/checkout/prepare`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({
          sessionId, checkoutToken: attempt.current!.token, walletPaise: requestedWallet, expectedTotalPaise: cart.subtotalPaise,
          customerEmail: details.email, customerPhone: details.phone,
          shippingAddress: { firstName: details.firstName, lastName: details.lastName, phone: details.phone, line1: details.line1, line2: details.line2, postalCode: details.postalCode, city: details.city, state: details.state, countryCode: "IN" },
        }),
      });
      const payload = await response.json();
      if (!current()) return;
      if (!response.ok) {
        if (response.status === 409) setReloadCart((value) => value + 1);
        if (payload?.message === "This checkout attempt has ended. Please retry payment." || payload?.message === "Checkout identity or wallet amount changed. Start a new checkout attempt.") {
          attempt.current = null;
          setPrepared(null);
        }
        throw new Error(typeof payload?.message === "string" ? payload.message : "Unable to prepare checkout");
      }
      const result = parsePreparedCheckout(payload);
      setPrepared(result);
      if (result.captured) {
        window.dispatchEvent(new CustomEvent(WALLET_UPDATED_EVENT));
        router.push(`/order-confirmed?order=${encodeURIComponent(result.orderNumber)}&status=${encodeURIComponent(result.status)}`);
        return;
      }
      const RazorpayCheckout = window.Razorpay;
      if (!RazorpayCheckout) throw new Error("Your checkout is reserved, but secure payment is still loading. Please retry this checkout; do not start a new order.");
      const rzp = new RazorpayCheckout({
        key: result.razorpayKeyId, amount: result.amountPaise, currency: result.currency,
        name: "HIDI", description: `Order ${result.orderNumber}`, order_id: result.providerOrderId,
        prefill: { name: `${details.firstName} ${details.lastName}`.trim(), email: details.email, contact: details.phone },
        notes: { hidi_order_number: result.orderNumber }, theme: { color: "#1d1d1a" },
        handler: async (paymentResult: any) => {
          if (!current()) return;
          try {
            const verify = await fetch(`${API}/payments/razorpay/verify`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(paymentResult) });
            const confirmed = await verify.json();
            if (!current()) return;
            if (!verify.ok) throw new Error(confirmed?.message ?? "Payment verification failed");
            window.dispatchEvent(new CustomEvent(WALLET_UPDATED_EVENT));
            router.push(`/order-confirmed?order=${encodeURIComponent(confirmed.orderNumber)}&status=${encodeURIComponent(confirmed.status)}`);
          } catch (cause) {
            if (current()) setError(`${cause instanceof Error ? cause.message : "Payment verification failed"}. If money was debited, do not pay again; HIDI will reconcile the payment automatically.`);
            release();
          }
        },
        modal: { ondismiss: () => { release(); if (current()) window.dispatchEvent(new CustomEvent(WALLET_UPDATED_EVENT)); } },
      });
      payment.current = rzp;
      rzp.on("payment.failed", (failure: any) => {
        if (current()) setError(failure?.error?.description ?? "Payment did not complete. Please retry this checkout.");
        release();
      });
      rzp.open();
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : "Unable to start payment");
      // Preserve the key on ambiguous failure: a server-side reservation may exist.
      release();
    }
  }

  if (!cart) return <div><p className="muted">Preparing secure checkout…</p>{error && <p className="form-error" role="alert">{error}</p>}</div>;
  if (cart.items.length === 0) return <p>Your bag is empty.</p>;
  const gross = cart.totalPaise ?? cart.subtotalPaise;
  const maxWallet = Math.min(wallet.summary?.enabled ? wallet.summary.availablePaise : 0, gross);
  const previewWallet = useWallet ? (walletAmountPaise(walletInput, gross, gross) ?? 0) : 0;
  const applied = prepared?.walletAppliedPaise ?? previewWallet;
  const payable = prepared?.amountPaise ?? Math.max(0, gross - previewWallet);

  return <>
    <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

    <details className="checkout-mobile-summary">
      <summary>
        <span><b>Order summary</b><small>{cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}</small></span>
        <strong>{formatWalletPaise(prepared?.totalPaise ?? gross)}</strong>
      </summary>
      <div className="checkout-mobile-summary-body">
        {cart.items.map((item) => (
          <Link key={item.id} href={`/products/${item.product.slug}`} className="checkout-mobile-summary-item">
            <span className="checkout-mobile-summary-thumb">
              <CatalogImage
                src={item.product.image}
                alt={item.product.name}
                sizes="56px"
                fallbackLabel={`HIDI / ${item.product.name}`}
              />
            </span>
            <span>
              <b>{item.product.name}</b>
              <small>{item.variant.color} · {item.variant.size} · Qty {item.quantity}</small>
            </span>
            <strong>{formatWalletPaise(item.lineTotalPaise)}</strong>
          </Link>
        ))}
        <div className="checkout-mobile-total-row"><span>Amount to pay</span><strong>{formatWalletPaise(payable)}</strong></div>
      </div>
    </details>

    <div className="checkout-grid">
      <form className="checkout-form" onSubmit={submit} onChange={() => { if (!lock.current) { invalidate(false); setError(""); } }}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <section>
            <div className="checkout-section-heading">
              <span className="checkout-step">01</span>
              <div>
                <h2>Contact</h2>
                <p>{accountId ? "We’ll use these details for your order." : "Checkout as guest — no account required."}</p>
              </div>
            </div>

            <label className="checkout-field">
              <span>Email address</span>
              <input
                key={`${accountId ?? "guest"}:${signedInEmail}`}
                name="email"
                aria-label="Email address"
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                defaultValue={signedInEmail}
                required
              />
            </label>

            {accountId && signedInPhone ? <>
              <input type="hidden" name="phone" value={signedInPhone} />
              <div className="checkout-verified-phone" aria-label="Verified mobile number" title="Verified mobile number used to sign in">
                <span>
                  <small>Mobile number</small>
                  <strong>{signedInPhone.replace(/^\+91/, "+91 ")}</strong>
                </span>
                <b>Verified</b>
              </div>
            </> : (
              <label className="checkout-field">
                <span>Mobile number</span>
                <input
                  name="phone"
                  aria-label="Mobile number"
                  placeholder="+91"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={18}
                  required
                />
                <small>Required for delivery and order updates.</small>
              </label>
            )}
          </section>

          <section>
            <div className="checkout-section-heading">
              <span className="checkout-step">02</span>
              <div>
                <h2>Delivery address</h2>
                <p>Where should we send your HIDI order?</p>
              </div>
            </div>

            <div className="two-col">
              <label className="checkout-field">
                <span>First name</span>
                <input name="firstName" aria-label="First name" autoComplete="shipping given-name" autoCapitalize="words" required />
              </label>
              <label className="checkout-field">
                <span>Last name <small>Optional</small></span>
                <input name="lastName" aria-label="Last name" autoComplete="shipping family-name" autoCapitalize="words" />
              </label>
            </div>

            <label className="checkout-field">
              <span>House / building / street</span>
              <input name="line1" aria-label="House, building and street address" autoComplete="shipping address-line1" autoCapitalize="words" required />
            </label>

            <button
              type="button"
              className="checkout-optional-toggle"
              aria-expanded={showAddressDetail}
              aria-controls="checkout-address-detail"
              onClick={() => setShowAddressDetail((value) => !value)}
            >
              {showAddressDetail ? "Remove apartment / landmark" : "+ Add apartment / landmark"}
              <span>Optional</span>
            </button>

            {showAddressDetail && (
              <label className="checkout-field" id="checkout-address-detail">
                <span>Apartment, floor or landmark <small>Optional</small></span>
                <input name="line2" aria-label="Apartment, floor or landmark" autoComplete="shipping address-line2" autoCapitalize="words" />
              </label>
            )}

            <div className="two-col">
              <label className="checkout-field">
                <span>PIN code</span>
                <input
                  name="postalCode"
                  aria-label="PIN code"
                  inputMode="numeric"
                  autoComplete="shipping postal-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  title="Enter a 6-digit PIN code"
                  required
                />
              </label>
              <label className="checkout-field">
                <span>City</span>
                <input name="city" aria-label="City" autoComplete="shipping address-level2" autoCapitalize="words" required />
              </label>
            </div>

            <div className="two-col">
              <label className="checkout-field">
                <span>State</span>
                <input name="state" aria-label="State" autoComplete="shipping address-level1" autoCapitalize="words" required />
              </label>
              <label className="checkout-field">
                <span>Country</span>
                <input aria-label="Country" autoComplete="shipping country-name" value="India" disabled readOnly />
              </label>
            </div>
          </section>

          <section>
            <div className="checkout-section-heading">
              <span className="checkout-step">03</span>
              <div>
                <h2>Payment</h2>
                <p>Review rewards, then continue to secure payment.</p>
              </div>
            </div>
            {walletEnabled && <div className={walletStyles.checkoutWallet}>
              {!accountId ? <p className={walletStyles.note}><Link href="/account">Sign in</Link> to view and use your HIDI rewards. You can also continue as a guest.</p>
                : wallet.loading && !wallet.summary ? <p role="status">Loading your rewards…</p>
                : wallet.error ? <div><p className={walletStyles.warning} role="alert">{wallet.error}</p><button className={walletStyles.textButton} type="button" onClick={() => { void wallet.refresh().catch(() => undefined); }}>Try loading rewards again</button></div>
                : wallet.unavailable ? <p className={walletStyles.note}>Wallet redemption is temporarily unavailable. You can pay securely without rewards.</p>
                : wallet.summary ? <>
                  <label className={walletStyles.toggle}><input type="checkbox" checked={useWallet} disabled={busy || wallet.loading || (maxWallet <= 0 && !useWallet)} onChange={(event) => { setUseWallet(event.target.checked); setWalletInput(event.target.checked ? (maxWallet / 100).toFixed(2) : ""); }} />Use HIDI rewards</label>
                  <p className={walletStyles.note}>{formatWalletPaise(wallet.summary.availablePaise)} available · {formatWalletPaise(wallet.summary.pendingPaise)} pending</p>
                  {useWallet && <label className={walletStyles.amount}>Rewards to use (₹)<input type="number" inputMode="decimal" min="0.01" step="0.01" max={Math.min(gross, Math.max(maxWallet, attempt.current?.walletPaise ?? 0)) / 100} value={walletInput} required aria-describedby="wallet-checkout-note" onChange={(event) => setWalletInput(event.target.value)} /><span id="wallet-checkout-note" className={walletStyles.note}>Use any amount up to your available rewards and order total. Your balance is checked again before payment.</span></label>}
                </> : null}
              {useWallet && (wallet.error || wallet.unavailable) && <button className={walletStyles.textButton} type="button" onClick={() => { invalidate(false); setUseWallet(false); setWalletInput(""); setError(""); }}>Continue without rewards</button>}
            </div>}
            {payable > 0 ? <div className="payment-placeholder"><strong>Razorpay secure payment</strong><span>UPI · Cards · Net banking · Wallets</span></div> : <div className="payment-placeholder"><strong>Pay with HIDI rewards</strong><span>No cash payment needed if the final amount is fully covered.</span></div>}
            <p className="fine-print left">{walletEnabled && useWallet ? "Stock and selected rewards are" : "Stock is"} reserved for 15 minutes when checkout is prepared. Closing payment does not immediately release a reservation; retry the same checkout or wait for it to expire.</p>
          </section>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        {error === "This bag belongs to another account" && <div><p className={walletStyles.note}>Sign in to the account that owns this bag, or start a new bag. The original bag will not be deleted.</p><button className={walletStyles.textButton} type="button" onClick={() => { invalidate(true); startNewCartSession(); router.push("/collections/new-arrivals"); }}>Start a new bag</button></div>}
        <button className="button checkout-pay-button" type="submit" disabled={busy || (useWallet && (wallet.loading || !wallet.summary?.enabled || !!wallet.error))}>
          <span>{busy ? "Preparing your order…" : payable === 0 ? "Place order with rewards" : "Pay securely"}</span>
          <strong className="checkout-mobile-pay-amount">{formatWalletPaise(payable)}</strong>
        </button>
      </form>
      <aside className="checkout-summary">
        <p>Order summary</p>
        <strong>{formatWalletPaise(prepared?.totalPaise ?? gross)}</strong>
        <span>{cart.itemCount} item(s) · Taxes included</span>

        <div className="checkout-summary-items">
          {cart.items.map((item) => (
            <Link key={item.id} href={`/products/${item.product.slug}`} className="checkout-summary-item">
              <span className="checkout-summary-thumb">
                <CatalogImage
                  src={item.product.image}
                  alt={item.product.name}
                  sizes="72px"
                  fallbackLabel={`HIDI / ${item.product.name}`}
                />
              </span>
              <span className="checkout-summary-copy">
                <b>{item.product.name}</b>
                <small>{item.variant.color} · Size {item.variant.size}</small>
                <small>Qty {item.quantity} · {formatWalletPaise(item.lineTotalPaise)}</small>
              </span>
            </Link>
          ))}
        </div>

        <div className={walletStyles.summaryRows} aria-live="polite"><div><span>Order total</span><strong>{formatWalletPaise(prepared?.totalPaise ?? gross)}</strong></div>{walletEnabled && <div><span>HIDI rewards{prepared ? " applied" : " selected"}</span><strong>−{formatWalletPaise(applied)}</strong></div>}<div className={walletStyles.payable}><span>Amount to pay</span><strong>{formatWalletPaise(payable)}</strong></div></div>
        {useWallet && !prepared && <p className={walletStyles.note}>Rewards are applied only after server confirmation.</p>}
        {!!prepared?.walletAppliedPaise && prepared.provider === "RAZORPAY" && <p className={walletStyles.note}>{formatWalletPaise(prepared.walletAppliedPaise)} is reserved for this checkout while the remaining payment is completed.</p>}
      </aside>
    </div>
  </>;
}
