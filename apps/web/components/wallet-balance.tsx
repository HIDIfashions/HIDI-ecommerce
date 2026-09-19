"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WalletCards, ArrowUpRight } from "lucide-react";
import { formatWalletPaise, getWalletSummary, walletAccountId, walletEnabled, WALLET_UPDATED_EVENT, type WalletSummary } from "@/lib/wallet-client";
import styles from "./wallet.module.css";

export function useWalletSummary() {
  const [userId, setUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const context = useRef<{ userId: string | null; revision: number; controller: AbortController | null; active: boolean }>({ userId: null, revision: 0, controller: null, active: false });

  const refresh = useCallback(async () => {
    const expectedUserId = walletAccountId();
    if (!walletEnabled || !expectedUserId || !context.current.active) return null;
    context.current.controller?.abort();
    const controller = new AbortController();
    context.current.controller = controller;
    const revision = ++context.current.revision;
    const current = () => context.current.active && !controller.signal.aborted && context.current.revision === revision && walletAccountId() === expectedUserId;
    setLoading(true);
    setError("");
    try {
      const data = await getWalletSummary(expectedUserId, controller.signal);
      if (!current()) return null;
      setSummary(data);
      setUnavailable(!data || !data.enabled);
      return data;
    } catch (cause) {
      if (current()) {
        setSummary(null);
        setError(cause instanceof Error ? cause.message : "We couldn’t load your wallet.");
      }
      throw cause;
    } finally { if (current()) setLoading(false); }
  }, []);

  useEffect(() => {
    if (!walletEnabled) return;
    context.current.active = true;
    function syncAuth() {
      const nextUserId = walletAccountId();
      if (nextUserId === context.current.userId) return;
      context.current.userId = nextUserId;
      context.current.revision += 1;
      context.current.controller?.abort();
      setUserId(nextUserId); setSummary(null); setError(""); setUnavailable(false); setLoading(false);
      if (nextUserId) void refresh().catch(() => undefined);
    }
    function onStorage(event: StorageEvent) { if (event.key === null || event.key === "hidi_supabase_session") syncAuth(); }
    const update = () => { if (walletAccountId()) void refresh().catch(() => undefined); };
    syncAuth();
    window.addEventListener("hidi-auth-updated", syncAuth);
    window.addEventListener("storage", onStorage);
    window.addEventListener(WALLET_UPDATED_EVENT, update);
    return () => {
      context.current.active = false;
      context.current.userId = null;
      context.current.revision += 1;
      context.current.controller?.abort();
      window.removeEventListener("hidi-auth-updated", syncAuth);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(WALLET_UPDATED_EVENT, update);
    };
  }, [refresh]);

  return { userId, summary, loading, error, unavailable, refresh };
}

const historyLabels: Record<string, string> = {
  EARN: "Rewards earned",
  REDEEM: "Used at checkout",
  REVERSE_EARN: "Rewards reversed",
  REFUND_REDEEM: "Wallet payment returned",
  RETURN_REFUND: "Return refund credited",
};

export function WalletBalance() {
  const { userId, summary, loading, error, unavailable, refresh } = useWalletSummary();
  if (!walletEnabled || !userId || (unavailable && !summary)) return null;
  return <section className={styles.panel} aria-labelledby="wallet-title" aria-busy={loading}>
    <div className={styles.heading}><span className={styles.eyebrow}><WalletCards size={18} strokeWidth={1.8} aria-hidden="true" /> YOUR HIDI WALLET</span><h2 id="wallet-title">Good choices. A little back.</h2></div>
    {loading && !summary ? <p role="status">Loading your wallet…</p> : error ? <div role="alert"><p>{error}</p><button className={styles.textButton} type="button" onClick={() => { void refresh().catch(() => undefined); }}>Try again</button></div> : summary ? <>
      {!summary.enabled && <p className={styles.note}>Wallet redemption is temporarily unavailable. Your recorded balance and history are shown below.</p>}
      <div className={styles.balances}>
        <div className={styles.primary}><span>{summary.enabled ? "Available to spend" : "Recorded balance"}</span><strong>{formatWalletPaise(summary.enabled ? summary.availablePaise : summary.balancePaise)}</strong><small>{summary.enabled ? "Use at checkout · No percentage cap" : "Redemption paused"}</small></div>
        <div><span>Pending rewards</span><strong>{formatWalletPaise(summary.pendingPaise)}</strong><small>{summary.heldPaise > 0 ? `${formatWalletPaise(summary.heldPaise)} removed from pending while a return is resolved` : "Released 7 days after delivery, subject to returns"}</small></div>
        <div><span>Reserved at checkout</span><strong>{formatWalletPaise(summary.reservedPaise)}</strong><small>Included in your balance, not available while payment is pending</small></div>
      </div>
      {summary.heldPaise > 0 && <p className={styles.note}>{formatWalletPaise(summary.heldPaise)} has been removed from Pending rewards and is on hold while the return or order review is resolved.</p>}
      {summary.debtPaise > 0 && <p className={styles.note}>A return adjustment of {formatWalletPaise(summary.debtPaise)} will be covered by future rewards before new rewards become spendable.</p>}
      <p className={styles.rule}>Earn 2 points per complete ₹100 of eligible merchandise spend after discounts and wallet use. 1 point = ₹1. Rewards do not expire.</p>
      {summary.history.length > 0 ? <div className={styles.history}><h3>Recent activity <ArrowUpRight size={15} aria-hidden="true" /></h3><ul>{summary.history.slice(0, 8).map((entry) => <li key={entry.id}><div><strong>{historyLabels[entry.kind] ?? "Wallet adjustment"}</strong><span>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(entry.createdAt))}{entry.orderNumber ? ` · ${entry.orderNumber}` : ""}</span></div><b className={entry.deltaPaise > 0 ? styles.credit : undefined}>{entry.deltaPaise > 0 ? "+" : ""}{formatWalletPaise(entry.deltaPaise)}</b></li>)}</ul>{(summary.historyTruncated || summary.history.length > 8) && <p className={styles.note}>Showing your most recent wallet activity.</p>}</div> : <p className={styles.empty}>Your rewards story starts with your first eligible purchase.</p>}
    </> : null}
  </section>;
}
