"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Heart, Package, RotateCcw, Sparkles } from "lucide-react";
import { AccountShell } from "@/components/account/account-shell";
import { OrderCard } from "@/components/account/order-card";
import { RetentionPreferences } from "@/components/retention-preferences";
import { WalletBalance } from "@/components/wallet-balance";
import type { AccountPayload } from "@/lib/account-types";
import { BROWSER_API_URL } from "@/lib/browser-api";
import { getWishlistItems, WISHLIST_EVENT } from "@/lib/wishlist";
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
const ACTIVE_RETURN_STATUSES = new Set(["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUND_PROCESSING", "EXCHANGE_SHIPPED"]);

type AccountView = "overview" | "orders";

function titleCase(value?: string | null) {
  if (!value) return "Pending";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function customerName(account: AccountPayload | null) {
  return [account?.customer.firstName, account?.customer.lastName]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())
    .join(" ");
}

export function AccountOrdersClient({ view = "overview" }: { view?: AccountView }) {
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState<string>("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [wishlistCount, setWishlistCount] = useState(0);

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
      const response = await fetch(API + "/account/orders", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to load your account");
      setAccount(data);
      setError("");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to load your account");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = getStoredSession();
    setPhone(String(stored?.user?.phone ?? "").replace(/^\+91/, ""));
    void loadAccount();
  }, []);

  useEffect(() => {
    const sync = () => setWishlistCount(getWishlistItems().length);
    sync();
    window.addEventListener(WISHLIST_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WISHLIST_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const enteredPhone = String(phone ?? "").trim();
    if (!enteredPhone) {
      setError("Enter your mobile number");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const normalized = await sendPhoneOtp(enteredPhone);
      setPhone(normalized);
      setStep("otp");
      setMessage("We sent a 6-digit HIDI sign-in code to " + maskedPhone(normalized) + ".");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to send your sign-in code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const otp = String(data.get("otp") ?? "");
    setBusy(true);
    setError("");
    try {
      await verifyPhoneOtp(String(phone ?? ""), otp);
      setSignedIn(true);
      setLoading(true);
      setMessage("");
      await loadAccount();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "That code is invalid or has expired");
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

  const activity = useMemo(() => {
    if (!account) return [];
    const rows: Array<{ key: string; date: string; eyebrow: string; title: string; detail: string }> = [];
    account.orders.forEach((order) => {
      rows.push({
        key: "order-" + order.orderNumber,
        date: order.createdAt,
        eyebrow: "ORDER",
        title: titleCase(order.status),
        detail: order.orderNumber + " · " + order.itemCount + " item" + (order.itemCount === 1 ? "" : "s"),
      });
      order.items.forEach((item) => item.returnRequests.forEach((request) => {
        rows.push({
          key: "return-" + request.id,
          date: request.createdAt,
          eyebrow: request.type === "EXCHANGE" ? "EXCHANGE" : "AFTERCARE",
          title: (request.type === "EXCHANGE" ? "Exchange" : "Return") + " · " + titleCase(request.status),
          detail: item.productName,
        });
      }));
    });
    return rows.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 5);
  }, [account]);

  if (!authConfigured()) {
    return <div className={styles.standalone}>
      <div className={styles.empty}>
        <h2>Customer sign-in needs configuration.</h2>
        <p>Add the HIDI Supabase public URL and publishable key to the frontend environment before testing mobile OTP.</p>
      </div>
    </div>;
  }

  if (!signedIn && !loading) {
    return <div className={styles.standalone}>
      <div className={styles.authWrap}>
        <div className={styles.authCard}>
          <p className="eyebrow">SECURE SIGN IN</p>
          <h2>{step === "phone" ? "Your HIDI account." : "Enter your OTP."}</h2>
          <p className={styles.authIntro}>{step === "phone"
            ? "Sign in with your mobile number. No password required."
            : "Enter the 6-digit code sent to your mobile number."}</p>

          {step === "phone" ? <form className={styles.authForm} onSubmit={requestOtp}>
            <label htmlFor="account-phone">Mobile number</label>
            <div className={styles.phoneInput}>
              <span>+91</span>
              <input id="account-phone" type="tel" value={phone.replace(/^\+91/, "")} onChange={(event) => setPhone(event.target.value ?? "")} placeholder="98765 43210" inputMode="numeric" autoComplete="tel" maxLength={10} required />
            </div>
            <button className={"button " + styles.authPrimaryButton} disabled={busy}>{busy ? "Sending OTP…" : "Continue"}</button>
          </form> : <form className={styles.authForm} onSubmit={verifyOtp}>
            <label htmlFor="account-otp">6-digit OTP</label>
            <input id="account-otp" name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoComplete="one-time-code" />
            <button className={"button " + styles.authPrimaryButton} disabled={busy}>{busy ? "Signing in…" : "Verify & sign in"}</button>
            <button className={styles.secondaryButton} type="button" onClick={() => { setStep("phone"); setMessage(""); setError(""); }} disabled={busy}>Use a different mobile number</button>
          </form>}

          {message && <p className={styles.authMessage}>{message}</p>}
          {error && <p className="form-error">{error}</p>}
        </div>
      </div>
    </div>;
  }

  if (loading) return <div className={styles.standalone}><p className="muted">Loading your HIDI account…</p></div>;

  if (error && !account) {
    return <div className={styles.standalone}><div className={styles.empty}>
      <h2>We couldn’t load your account.</h2>
      <p>{error}</p>
      <button className={"button " + styles.authPrimaryButton} onClick={logout}>Sign out</button>
    </div></div>;
  }

  const orders = account?.orders ?? [];
  const name = customerName(account);
  const identity = name
    || (account?.customer.phone ? maskedPhone(account.customer.phone) : "")
    || account?.customer.email
    || "HIDI customer";
  const greeting = name ? name.split(" ")[0] : "there";
  const activeAftercare = orders.reduce(
    (sum, order) => sum + order.items.reduce(
      (itemSum, item) => itemSum + item.returnRequests.filter((request) => ACTIVE_RETURN_STATUSES.has(request.status)).length,
      0,
    ),
    0,
  );
  const wardrobePieces = orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);

  return (
    <AccountShell identity={identity} onSignOut={() => { void logout(); }} signingOut={busy}>
      {view === "overview" ? (
        <div className={styles.overview}>
          <section className={styles.studioHero}>
            <div className={styles.welcome}>
              <span className={styles.studioEyebrow}>YOUR HIDI SPACE</span>
              <h1>Welcome back, {greeting}.</h1>
              <p>Your wardrobe, orders, aftercare and rewards — arranged quietly in one place.</p>
              <Link href="/collections/new-arrivals">Discover what’s new <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
            <div id="wallet" className={styles.walletHero}>
              <WalletBalance compact />
            </div>
          </section>

          <section className={styles.summaryGrid} aria-label="Account overview">
            <Link href="/account/orders" className={styles.summaryCard}>
              <Package size={20} strokeWidth={1.45} aria-hidden="true" />
              <span>ORDERS</span>
              <strong>{orders.length}</strong>
              <p>Every HIDI order, item by item.</p>
              <b>View orders <ArrowRight size={12} aria-hidden="true" /></b>
            </Link>
            <Link href="/account/orders#aftercare" className={styles.summaryCard}>
              <RotateCcw size={20} strokeWidth={1.45} aria-hidden="true" />
              <span>AFTERCARE</span>
              <strong>{activeAftercare}</strong>
              <p>{activeAftercare ? "Return or exchange requests in progress." : "No active return or exchange requests."}</p>
              <b>View aftercare <ArrowRight size={12} aria-hidden="true" /></b>
            </Link>
            <Link href="/wishlist" className={styles.summaryCard}>
              <Heart size={20} strokeWidth={1.45} aria-hidden="true" />
              <span>SAVED PIECES</span>
              <strong>{wishlistCount}</strong>
              <p>Your considered shortlist of HIDI styles.</p>
              <b>Open wishlist <ArrowRight size={12} aria-hidden="true" /></b>
            </Link>
            <Link href="/account/orders" className={styles.summaryCard}>
              <Sparkles size={20} strokeWidth={1.45} aria-hidden="true" />
              <span>WARDROBE MEMORY</span>
              <strong>{wardrobePieces}</strong>
              <p>Pieces that have been part of your HIDI journey.</p>
              <b>View wardrobe <ArrowRight size={12} aria-hidden="true" /></b>
            </Link>
          </section>

          <section className={styles.overviewSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.studioEyebrow}>RECENT MOMENTS</span>
                <h2>Your HIDI activity.</h2>
              </div>
              <Link href="/account/orders">All orders <ArrowRight size={13} aria-hidden="true" /></Link>
            </div>

            {activity.length ? <div className={styles.activityList}>
              {activity.map((entry) => (
                <div className={styles.activityItem} key={entry.key}>
                  <span className={styles.activityDot} aria-hidden="true" />
                  <div>
                    <span>{entry.eyebrow}</span>
                    <strong>{entry.title}</strong>
                    <p>{entry.detail}</p>
                  </div>
                  <time>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(entry.date))}</time>
                </div>
              ))}
            </div> : <div className={styles.emptyInline}>
              <h3>Your HIDI story starts here.</h3>
              <p>Orders, returns and rewards will appear here as they happen.</p>
            </div>}
          </section>

          {orders[0] && <section className={styles.overviewSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.studioEyebrow}>MOST RECENT ORDER</span>
                <h2>Continue your wardrobe story.</h2>
              </div>
            </div>
            <OrderCard order={orders[0]} onChanged={loadAccount} />
          </section>}

          <section id="preferences">
            <RetentionPreferences />
          </section>
        </div>
      ) : (
        <div className={styles.ordersPage}>
          <header className={styles.pageHeading}>
            <span className={styles.studioEyebrow}>YOUR HIDI WARDROBE</span>
            <h1>Orders & aftercare.</h1>
            <p>Every piece has its own story — order details, ratings, return eligibility and aftercare status stay with the product that matters.</p>
          </header>

          {activeAftercare > 0 && (
            <div className={styles.aftercareBanner} id="aftercare">
              <RotateCcw size={19} strokeWidth={1.5} aria-hidden="true" />
              <div>
                <strong>{activeAftercare} aftercare request{activeAftercare === 1 ? "" : "s"} in progress</strong>
                <span>We’ll keep each return or exchange attached to its individual HIDI piece.</span>
              </div>
            </div>
          )}

          {orders.length === 0 ? <div className={styles.empty}>
            <h2>No orders yet.</h2>
            <p>Orders placed with this verified mobile number will appear here automatically.</p>
            <Link className={"button " + styles.authPrimaryButton} href="/collections/new-arrivals">Explore new arrivals</Link>
          </div> : <div className={styles.orderList}>
            {orders.map((order) => <OrderCard key={order.orderNumber} order={order} onChanged={loadAccount} />)}
          </div>}
        </div>
      )}
    </AccountShell>
  );
}
