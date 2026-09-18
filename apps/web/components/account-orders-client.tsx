"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { CatalogImage } from "@/components/catalog-image";
import { RetentionPreferences } from "@/components/retention-preferences";
import { formatPaise } from "@/lib/api";
import {
  authConfigured,
  getAccessToken,
  getStoredSession,
  sendEmailOtp,
  signOut,
  verifyEmailOtp,
} from "@/lib/supabase-auth";
import styles from "./account-orders.module.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

type OrderSummary = {
  orderNumber: string;
  status: string;
  createdAt: string;
  totalPaise: number;
  paymentStatus?: string | null;
  itemCount: number;
  items: Array<{
    id: string;
    productName: string;
    slug: string;
    image?: string | null;
    size: string;
    color: string;
    quantity: number;
    totalPaise: number;
  }>;
};

type AccountPayload = {
  customer: { email: string; firstName?: string | null; lastName?: string | null };
  orders: OrderSummary[];
};

function titleCase(value?: string | null) {
  if (!value) return "Pending";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AccountOrdersClient() {
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState<string>("");
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
    setEmail(String(stored?.user?.email ?? ""));
    loadAccount();
  }, []);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email address");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      await sendEmailOtp(normalizedEmail);
      setEmail(normalizedEmail);
      setStep("otp");
      setMessage(`We sent a 6-digit HIDI sign-in code to ${normalizedEmail}.`);
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
      await verifyEmailOtp(String(email ?? ""), otp);
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
    setStep("email");
    setEmail("");
    setMessage("");
    setError("");
    setBusy(false);
  }

  if (!authConfigured()) {
    return <div className={styles.empty}>
      <h2>Customer sign-in needs configuration.</h2>
      <p>Add the HIDI Supabase public URL and publishable key to the frontend environment before testing email OTP.</p>
    </div>;
  }

  if (!signedIn && !loading) {
    return <div className={styles.authWrap}>
      <div className={styles.authCard}>
        <p className="eyebrow">SECURE SIGN IN</p>
        <h2>{step === "email" ? "Your HIDI account." : "Check your inbox."}</h2>
        <p className={styles.authIntro}>{step === "email"
          ? "Sign in with your email to see orders from any device. No password required."
          : "Enter the 6-digit code from HIDI to continue."}</p>

        {step === "email" ? <form className={styles.authForm} onSubmit={requestOtp}>
          <label htmlFor="account-email">Email address</label>
          <input id="account-email" type="email" value={email ?? ""} onChange={(event) => setEmail(event.target.value ?? "")} placeholder="you@example.com" required autoComplete="email" />
          <button className="button button-dark" disabled={busy}>{busy ? "Sending code…" : "Send sign-in code"}</button>
        </form> : <form className={styles.authForm} onSubmit={verifyOtp}>
          <label htmlFor="account-otp">6-digit code</label>
          <input id="account-otp" name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoComplete="one-time-code" />
          <button className="button button-dark" disabled={busy}>{busy ? "Signing in…" : "Verify & sign in"}</button>
          <button className={styles.secondaryButton} type="button" onClick={() => { setStep("email"); setMessage(""); setError(""); }} disabled={busy}>Use a different email</button>
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

  return <>
    <div className={styles.accountBar}>
      <div><span>Signed in as</span><strong>{account?.customer.email}</strong></div>
      <button type="button" onClick={logout} disabled={busy}>Sign out</button>
    </div>

    {orders.length === 0 ? <div className={styles.empty}>
      <h2>No orders yet.</h2>
      <p>Orders placed with this verified email address will appear here automatically.</p>
      <Link className="button button-dark" href="/collections/new-arrivals">Explore new arrivals</Link>
    </div> : <div className={styles.list}>
      {orders.map((order) => {
        const placedAt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(order.createdAt));
        return <article className={styles.card} key={order.orderNumber}>
          <div className={styles.header}>
            <div>
              <p className="eyebrow">ORDER</p>
              <h2>{order.orderNumber}</h2>
              <p className={styles.meta}>{placedAt} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
            </div>
            <div className={styles.statusBlock}>
              <span className={styles.status}>{titleCase(order.status)}</span>
              <strong>{formatPaise(order.totalPaise)}</strong>
            </div>
          </div>

          <div className={styles.items}>
            {order.items.slice(0, 3).map((item) => <div className={styles.item} key={item.id}>
              <Link href={`/products/${item.slug}`} className={styles.thumb} style={{ position: "relative" }}>
                <CatalogImage src={item.image} alt={item.productName} sizes="86px" fallbackLabel={`HIDI / ${item.productName}`} />
              </Link>
              <div>
                <Link className={styles.name} href={`/products/${item.slug}`}>{item.productName}</Link>
                <p>{item.color} · Size {item.size} · Qty {item.quantity}</p>
              </div>
            </div>)}
          </div>

          <div className={styles.footer}>
            <span>Payment: {order.paymentStatus === "CAPTURED" ? "Paid" : titleCase(order.paymentStatus)}</span>
            <Link className="text-link" href={`/order-confirmed?order=${encodeURIComponent(order.orderNumber)}&status=${encodeURIComponent(order.status)}`}>View order →</Link>
          </div>
        </article>;
      })}
    </div>}

    <RetentionPreferences />
  </>;
}
