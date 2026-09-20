"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminAuthConfigured,
  sendAdminEmailOtp,
  verifyAdminEmailOtp,
} from "@/lib/admin-supabase-auth";
import styles from "./sign-in.module.css";

export function AdminSignInClient() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => {
        if (active && response.ok) router.replace("/admin/orders");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [router]);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const normalized = await sendAdminEmailOtp(email);
      setEmail(normalized);
      setStep("otp");
      setMessage("A 6-digit HIDI Admin code was sent to your verified email.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send admin code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await verifyAdminEmailOtp(email, otp);
      router.replace("/admin/orders");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  if (!adminAuthConfigured()) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>HIDI OPERATIONS</p>
          <h1>Admin sign-in needs configuration.</h1>
          <p>Configure the Supabase public URL and publishable key before staff sign-in.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>HIDI OPERATIONS</p>
        <h1>{step === "email" ? "Staff sign in" : "Verify your code"}</h1>
        <p className={styles.intro}>
          {step === "email"
            ? "Use your authorized HIDI staff email. Access is controlled by your assigned role."
            : "Enter the code sent to " + email + "."}
        </p>

        {step === "email" ? (
          <form className={styles.form} onSubmit={requestOtp}>
            <label htmlFor="admin-email">Staff email</label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="name@hidi.in"
              required
              autoFocus
            />
            <button type="submit" disabled={busy}>
              {busy ? "Checking…" : "Send secure code"}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={verifyOtp}>
            <label htmlFor="admin-otp">6-digit code</label>
            <input
              id="admin-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\\D/g, "").slice(0, 6))}
              placeholder="000000"
              required
              autoFocus
            />
            <button type="submit" disabled={busy || otp.length !== 6}>
              {busy ? "Signing in…" : "Open HIDI Admin"}
            </button>
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => { setStep("email"); setOtp(""); setError(""); setMessage(""); }}
            >
              Use a different email
            </button>
          </form>
        )}

        {message && <p className={styles.message}>{message}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.security}>
          <strong>Protected admin access</strong>
          <span>Verified identity · role-based permissions · auditable actions</span>
        </div>
      </section>
    </main>
  );
}
