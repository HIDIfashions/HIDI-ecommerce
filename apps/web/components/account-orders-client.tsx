"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { CatalogImage } from "@/components/catalog-image";
import { RetentionPreferences } from "@/components/retention-preferences";
import { ReturnExchangeRequest } from "@/components/return-exchange-request";
import { AccountReviewPrompt } from "@/components/account/account-review-prompt";
import { formatPaise } from "@/lib/api";
import { formatWalletPaise } from "@/lib/wallet-client";
import { BROWSER_API_URL } from "@/lib/browser-api";
import {
  authConfigured,
  getAccessToken,
  getStoredSession,
  maskedPhone,
  sendPhoneOtp,
  signOut,
  verifyPhoneOtp,
} from "@/lib/supabase-auth";
import styles from "./account-orders.module.css";

const API = BROWSER_API_URL;

type OrderSummary = {
  orderNumber: string;
  status: string;
  afterSales?: { id: string; type: string; status: string; createdAt: string } | null;
  createdAt: string;
  totalPaise: number;
  walletAppliedPaise?: number;
  cashPayablePaise?: number;
  paymentStatus?: string | null;
  deliveredAt?: string | null;
  returnWindowEndsAt?: string | null;
  canReturnOrExchange?: boolean;
  itemCount: number;
  items: Array<{
    id: string;
    productName: string;
    slug: string;
    image?: string | null;
    size: string;
    color: string;
    quantity: number;
    returnableQuantity: number;
    totalPaise: number;
    exchangeSizes: string[];
    review?: {
      id: string;
      rating: number;
      title?: string | null;
      body: string;
      createdAt: string;
    } | null;
    returnRequests: Array<{
      id: string;
      type: string;
      reason: string;
      quantity: number;
      refundDestination?: string | null;
      requestedSize?: string | null;
      refundPaise: number;
      status: string;
      createdAt: string;
    }>;
  }>;
};

type AccountPayload = {
  customer: { email?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null };
  orders: OrderSummary[];
};

function titleCase(value?: string | null) {
  if (!value) return "Pending";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AccountOrdersClient({ view = "overview" }: { view?: "overview" | "orders" }) {
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState<string>("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAccount() {
    const token = await getAccessToken();
    if (!token) {
      setSignedIn(false);
      setAccount(null);
      setLoading(false);
      return;
    }

    setSignedIn(true);
    try {
      const response = await fetch(`${API}/account/orders`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to load your account");
      setAccount(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = getStoredSession();
    setPhone(String(stored?.user?.phone ?? "").replace(/^\+91/, ""));
    loadAccount();
  }, []);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const enteredPhone = String(phone ?? "").trim();
    if (!enteredPhone) {
      setError("Enter your mobile number");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const normalized = await sendPhoneOtp(enteredPhone);
      setPhone(normalized);
      setStep("otp");
      setMessage(`We sent a 6-digit HIDI sign-in code to ${maskedPhone(normalized)}.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const otp = String(data.get("otp") ?? "");
    setBusy(true); setError("");
    try {
      await verifyPhoneOtp(String(phone ?? ""), otp);
      setSignedIn(true);
      setLoading(true);
      setMessage("");
      await loadAccount();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    await signOut();
    setAccount(null);
    setSignedIn(false);
    setStep("phone");
    setPhone("");
    setMessage("");
    setError("");
    setBusy(false);
  }

  if (!authConfigured()) {
    return <div className={styles.empty}>
      <h2>Customer sign-in needs configuration.</h2>
      <p>Add the HIDI Supabase public URL and publishable key to the frontend environment before testing mobile OTP.</p>
    </div>;
  }

  if (!signedIn && !loading) {
    return <div className={styles.authWrap}>
      <div className={styles.authCard}>
        <p className="eyebrow">SECURE SIGN IN</p>
        <h2>{step === "phone" ? "Your HIDI account." : "Enter your OTP."}</h2>
        <p className={styles.authIntro}>{step === "phone"
          ? "Sign in with your mobile number. No password required."
          : "Enter the 6-digit code sent to your mobile number."}</p>

        {step === "phone" ? <form className={styles.authForm} onSubmit={requestOtp}>
          <label htmlFor="account-phone">Mobile number</label>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", padding: "0 12px", border: "1px solid #d8d3cb", borderRadius: 8 }}>+91</span>
            <input id="account-phone" type="tel" value={phone.replace(/^\+91/, "")} onChange={(event) => setPhone(event.target.value ?? "")} placeholder="98765 43210" inputMode="numeric" autoComplete="tel" maxLength={10} required />
          </div>
          <button className={`button ${styles.authPrimaryButton}`} disabled={busy}>{busy ? "Sending OTP…" : "Continue"}</button>
        </form> : <form className={styles.authForm} onSubmit={verifyOtp}>
          <label htmlFor="account-otp">6-digit OTP</label>
          <input id="account-otp" name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoComplete="one-time-code" />
          <button className={`button ${styles.authPrimaryButton}`} disabled={busy}>{busy ? "Signing in…" : "Verify & sign in"}</button>
          <button className={styles.secondaryButton} type="button" onClick={() => { setStep("phone"); setMessage(""); setError(""); }} disabled={busy}>Use a different mobile number</button>
        </form>}

        {message && <p className={styles.authMessage}>{message}</p>}
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>;
  }

  if (loading) return <p className="muted">Loading your HIDI account…</p>;

  if (error && !account) {
    return <div className={styles.empty}>
      <h2>We couldn’t load your account.</h2>
      <p>{error}</p>
      <button className="button button-dark" onClick={logout}>Sign out</button>
    </div>;
  }

  const orders = account?.orders ?? [];
  const customerName = [account?.customer.firstName, account?.customer.lastName]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())
    .join(" ");
  const customerIdentity = customerName
    || (account?.customer.phone ? maskedPhone(account.customer.phone) : "")
    || account?.customer.email
    || "HIDI customer";

  const activeStatuses = new Set(["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUND_PROCESSING", "EXCHANGE_SHIPPED"]);
  const activeReturnCount = orders.reduce((sum, order) => sum + order.items.reduce(
    (itemSum, item) => itemSum + item.returnRequests.filter((request) => activeStatuses.has(request.status)).length,
    0,
  ), 0);
  const deliveredCount = orders.filter((order) => order.status === "DELIVERED").length;
  const totalItems = orders.reduce((sum, order) => sum + order.itemCount, 0);
  const recentOrders = orders.slice(0, 2);

  if (view === "overview") {
    return <>
      <div className={styles.accountBar}>
        <div className={styles.customerIdentity}>
          <span>WELCOME BACK</span>
          <strong>{customerIdentity}</strong>
        </div>
      </div>

      <section className={styles.overviewIntro}>
        <div>
          <p className="eyebrow">YOUR HIDI SPACE</p>
          <h2>Your wardrobe, aftercare and rewards — together.</h2>
        </div>
        <p>Everything you need after choosing HIDI, without the marketplace clutter.</p>
      </section>

      <div className={styles.summaryGrid}>
        <Link href="/account/orders" className={styles.summaryCard}>
          <span>ORDERS</span><strong>{orders.length}</strong><small>{totalItems} piece{totalItems === 1 ? "" : "s"} across your HIDI history</small>
        </Link>
        <Link href="/account/returns" className={styles.summaryCard}>
          <span>AFTERCARE</span><strong>{activeReturnCount}</strong><small>{activeReturnCount ? "Return or exchange in progress" : "No active return requests"}</small>
        </Link>
        <Link href="/account/orders" className={styles.summaryCard}>
          <span>DELIVERED</span><strong>{deliveredCount}</strong><small>Pieces already in your wardrobe</small>
        </Link>
        <Link href="/wishlist" className={styles.summaryCard}>
          <span>SAVED</span><strong>♡</strong><small>Revisit the pieces you loved</small>
        </Link>
      </div>

      <section className={styles.recentSection}>
        <div className={styles.sectionTitle}>
          <div><p className="eyebrow">RECENT ORDERS</p><h2>Your latest HIDI moments.</h2></div>
          <Link href="/account/orders" className="text-link">View all orders →</Link>
        </div>

        {recentOrders.length === 0 ? <div className={styles.empty}>
          <h2>Your wardrobe story starts here.</h2>
          <p>Orders placed with this verified account will appear automatically.</p>
          <Link className="button button-dark" href="/collections/new-arrivals">Explore new arrivals</Link>
        </div> : <div className={styles.recentOrderGrid}>
          {recentOrders.map((order) => {
            const placedAt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(order.createdAt));
            const heroItem = order.items[0];
            return <Link href={`/account/orders/${encodeURIComponent(order.orderNumber)}`} className={styles.recentOrderCard} key={order.orderNumber}>
              <div className={styles.recentThumb}>
                <CatalogImage src={heroItem?.image} alt={heroItem?.productName ?? "HIDI order"} sizes="120px" fallbackLabel="HIDI order" />
              </div>
              <div>
                <span>{titleCase(order.status)}</span>
                <strong>{heroItem?.productName ?? order.orderNumber}</strong>
                <small>{placedAt} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"} · {formatPaise(order.totalPaise)}</small>
              </div>
            </Link>;
          })}
        </div>}
      </section>

      <RetentionPreferences />
    </>;
  }

  return <>
    <div className={styles.accountBar}>
      <div className={styles.customerIdentity}><strong>{customerIdentity}</strong></div>
    </div>

    {orders.length === 0 ? <div className={styles.empty}>
      <h2>No orders yet.</h2>
      <p>Orders placed with this verified mobile number will appear here automatically.</p>
      <Link className="button button-dark" href="/collections/new-arrivals">Explore new arrivals</Link>
    </div> : <div className={styles.list}>
      {orders.map((order) => {
        const placedAt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(order.createdAt));
        const activeReturnQuantity = order.items.reduce((sum, item) => sum + item.returnRequests.filter((request) => activeStatuses.has(request.status)).reduce((itemSum, request) => itemSum + request.quantity, 0), 0);
        return <article className={styles.card} key={order.orderNumber}>
          <div className={styles.header}>
            <div>
              <p className="eyebrow">ORDER</p>
              <h2>{order.orderNumber}</h2>
              <p className={styles.meta}>{placedAt} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
            </div>
            <div className={styles.statusBlock}>
              <span className={styles.status}>
                {order.afterSales && activeReturnQuantity > 0 ? `${activeReturnQuantity} of ${order.itemCount} item${order.itemCount === 1 ? "" : "s"} · ${order.afterSales.type === "EXCHANGE" ? "Exchange" : "Return"} in progress` : titleCase(order.status)}
              </span>
              {order.afterSales && activeReturnQuantity > 0 && <span className={styles.meta}>{titleCase(order.afterSales.status)} · Order {titleCase(order.status)}</span>}
              <strong>{formatPaise(order.totalPaise)}</strong>
              {!!order.walletAppliedPaise && <span className={styles.meta}>Rewards: {formatWalletPaise(order.walletAppliedPaise)} · Cash: {formatWalletPaise(order.cashPayablePaise ?? Math.max(0, order.totalPaise - order.walletAppliedPaise))}</span>}
            </div>
          </div>

          <div className={styles.items}>
            {order.items.map((item) => {
              const latestRequest = item.returnRequests[0] ?? null;
              const aftercareLabel = latestRequest
                ? latestRequest.type === "EXCHANGE"
                  ? `Exchange · ${titleCase(latestRequest.status)}`
                  : `Return · ${titleCase(latestRequest.status)}`
                : order.status === "DELIVERED" ? "Delivered" : titleCase(order.status);

              return <article className={styles.item} key={item.id}>
                <Link href={`/products/${item.slug}`} className={styles.thumb}>
                  <CatalogImage src={item.image} alt={item.productName} sizes="110px" fallbackLabel={`HIDI / ${item.productName}`} />
                </Link>

                <div className={styles.itemBody}>
                  <div className={styles.itemTop}>
                    <div>
                      <span className={styles.itemStatus}>{aftercareLabel}</span>
                      <Link className={styles.name} href={`/products/${item.slug}`}>{item.productName}</Link>
                      <p>{item.color} · Size {item.size} · Qty {item.quantity}</p>
                    </div>
                    <strong className={styles.itemPrice}>{formatPaise(item.totalPaise)}</strong>
                  </div>

                  <ReturnExchangeRequest
                    orderNumber={order.orderNumber}
                    item={item}
                    eligible={Boolean(order.canReturnOrExchange)}
                    returnWindowEndsAt={order.returnWindowEndsAt}
                    onCreated={loadAccount}
                  />

                  {order.status === "DELIVERED" && (
                    <AccountReviewPrompt
                      orderNumber={order.orderNumber}
                      item={item}
                      onSubmitted={loadAccount}
                    />
                  )}

                  <div className={styles.itemActions}>
                    <Link href={`/products/${item.slug}`}>View piece</Link>
                    <Link href={`/products/${item.slug}`}>Buy again</Link>
                  </div>
                </div>
              </article>;
            })}
          </div>

          <div className={styles.footer}>
            <span>Payment: {order.paymentStatus === "CAPTURED" ? "Paid" : titleCase(order.paymentStatus)}</span>
            <Link className="text-link" href={`/account/orders/${encodeURIComponent(order.orderNumber)}`}>View order →</Link>
          </div>
        </article>;
      })}
    </div>}
  </>;
}
