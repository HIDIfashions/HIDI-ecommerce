"use client";

import { useEffect, useRef, useState } from "react";
import { getAccessToken, getStoredSession } from "@/lib/supabase-auth";
import { getCartSession } from "@/lib/cart-session";
import { BROWSER_API_URL } from "@/lib/browser-api";
import { localMobileDigits, localOtpDigits, proofMatches, validLocalMobile, type PhoneProof } from "@/lib/checkout-phone";
import styles from "./checkout-phone-verification.module.css";

type Policy = { required: boolean; available: boolean };
type Challenge = { challengeId: string; maskedPhone: string; expiresAt: string; resendAt: string };

export function useCheckoutPhoneVerification(accountId: string | null, sessionId: string, signedInPhone: string) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyError, setPolicyError] = useState("");
  const [policyReload, setPolicyReload] = useState(0);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [proof, setProof] = useState<PhoneProof | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "checking">("idle");
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const controller = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const revision = useRef(0);
  const phoneInput = useRef<HTMLInputElement>(null);
  const otpInput = useRef<HTMLInputElement>(null);
  const currentIdentity = useRef({ accountId, sessionId, phone });
  currentIdentity.current = { accountId, sessionId, phone };
  const local = signedInPhone ? localMobileDigits(signedInPhone) : phone;
  const valid = validLocalMobile(local);
  const canonicalPhone = valid ? `+91${local}` : "";
  const verified = proofMatches(proof, canonicalPhone, clock);
  const remaining = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  const codeExpired = !!challenge && Date.parse(challenge.expiresAt) <= clock;
  const canContinue = valid && (!!signedInPhone || !!policy && (!policy.required || verified));
  const continuationHint = !valid ? "Enter your 10-digit mobile number to continue to payment."
    : !policy && !signedInPhone ? "Checking mobile verification requirements…"
    : "Verify your mobile number to continue to payment.";

  function reset() {
    revision.current++;
    controller.current?.abort();
    pending.current = false;
    setChallenge(null); setProof(null); setOtp(""); setStatus("idle"); setError("");
    // Do not clear resendAt: changing and re-entering a phone must not skip the cooldown.
  }

  useEffect(() => {
    reset();
    setPhone("");
    setPolicy(null); setPolicyError("");
    const ac = new AbortController();
    if (!sessionId) return () => ac.abort();
    fetch(`${BROWSER_API_URL}/checkout/phone/policy`, { cache: "no-store", signal: ac.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || typeof data.required !== "boolean" || typeof data.available !== "boolean") throw new Error();
        if (!ac.signal.aborted) setPolicy({ required: data.required, available: data.available });
      })
      .catch(() => { if (!ac.signal.aborted) setPolicyError("Unable to check mobile verification. Please retry."); });
    return () => { ac.abort(); controller.current?.abort(); revision.current++; pending.current = false; };
  }, [accountId, sessionId, policyReload]);

  useEffect(() => {
    if (!challenge && !proof && resendAt <= Date.now()) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge, proof, resendAt]);

  useEffect(() => {
    if (challenge && !proof) otpInput.current?.focus();
  }, [challenge, proof]);

  function changePhone(value: string) {
    const next = localMobileDigits(value);
    if (next === phone) return;
    reset(); setPhone(next);
  }

  async function action(kind: "send" | "verify") {
    if (pending.current || !valid || !policy?.required) return;
    if (!policy.available) { setError("Mobile verification is temporarily unavailable. Please try again later."); return; }
    if (kind === "send" && Date.now() < resendAt) return;
    if (kind === "verify" && (!challenge || !/^[0-9]{6}$/.test(otp) || Date.parse(challenge.expiresAt) <= Date.now())) {
      setError("Enter the six-digit code, or request a new code if it has expired."); return;
    }
    pending.current = true;
    const ac = new AbortController();
    controller.current?.abort(); controller.current = ac;
    const startedRevision = revision.current;
    const expected = { accountId, sessionId, phone };
    const isCurrent = () => !ac.signal.aborted && startedRevision === revision.current
      && currentIdentity.current.accountId === expected.accountId && currentIdentity.current.sessionId === expected.sessionId
      && currentIdentity.current.phone === expected.phone && getCartSession() === expected.sessionId
      && (getStoredSession()?.user?.id ?? null) === expected.accountId;
    setError(""); setStatus(kind === "send" ? "sending" : "checking");
    try {
      const access = accountId ? await getAccessToken() : null;
      if (!isCurrent()) return;
      if (accountId && !access) throw new Error("Please sign in again before verifying your mobile number.");
      const response = await fetch(`${BROWSER_API_URL}/checkout/phone/${kind}`, {
        method: "POST", cache: "no-store", signal: ac.signal,
        headers: { "Content-Type": "application/json", ...(access ? { Authorization: `Bearer ${access}` } : {}) },
        body: JSON.stringify({ sessionId, phone: canonicalPhone, ...(kind === "verify" ? { challengeId: challenge!.challengeId, otp } : {}) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!response.ok) {
        if (Number.isFinite(payload.retryAfterSeconds) && payload.retryAfterSeconds > 0) {
          setResendAt(Date.now() + Math.min(3600, payload.retryAfterSeconds) * 1000); setClock(Date.now());
        }
        if (kind === "send" && response.status >= 500) { setResendAt(Date.now() + 60_000); setClock(Date.now()); }
        throw new Error(typeof payload.message === "string" ? payload.message : "Mobile verification is unavailable. Please retry.");
      }
      if (kind === "send") {
        if (!/^[0-9a-f-]{36}$/.test(payload.challengeId ?? "") || typeof payload.maskedPhone !== "string"
          || !Number.isFinite(Date.parse(payload.expiresAt)) || !Number.isFinite(Date.parse(payload.resendAt))) throw new Error("Unable to send the verification code. Please retry.");
        setProof(null); setOtp(""); setChallenge(payload);
        setResendAt(Date.parse(payload.resendAt)); setClock(Date.now());
      } else {
        if (payload.verified !== true || !proofMatches(payload, canonicalPhone)) throw new Error("That code could not be verified. Please request a new code.");
        setProof({ phone: payload.phone, token: payload.token, expiresAt: payload.expiresAt });
        setOtp(""); setError(""); setClock(Date.now());
      }
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : "Mobile verification is unavailable. Please retry.");
    } finally {
      if (isCurrent()) { pending.current = false; setStatus("idle"); }
    }
  }

  return { phone, otp, policy, policyError, challenge, proof: verified ? proof : null, status, error, remaining, codeExpired,
    canonicalPhone, valid, verified, canContinue, continuationHint, phoneInput, otpInput, changePhone,
    changeOtp: (value: string) => { setOtp(localOtpDigits(value)); setError(""); },
    changeVerifiedPhone: () => { reset(); phoneInput.current?.focus(); },
    retryPolicy: () => setPolicyReload(v => v + 1),
    send: () => action("send"), verify: () => action("verify"),
  };
}

export function CheckoutPhoneVerification({ control: c }: { control: ReturnType<typeof useCheckoutPhoneVerification> }) {
  return <div className={styles.field}>
    <label htmlFor="checkout-phone">Mobile number</label>
    <div className={styles.row}>
      <div className={styles.number}>
        <span className={styles.prefix} aria-hidden="true">+91</span>
        <input ref={c.phoneInput} id="checkout-phone" name="phone" type="tel" inputMode="numeric"
          autoComplete="tel-national" aria-label="Mobile number" aria-describedby="checkout-phone-help"
          placeholder="10-digit number" maxLength={10} minLength={10} pattern="[6-9][0-9]{9}"
          title="Enter your 10-digit Indian mobile number" value={c.phone} required readOnly={c.verified}
          onChange={e => c.changePhone(e.target.value)}
          onPaste={e => { e.preventDefault(); c.changePhone(e.clipboardData.getData("text")); }} />
      </div>
      {c.verified ? <span className={styles.verified} role="status">✓ Verified</span> :
        c.valid && c.policy?.required && <button type="button" className={styles.verifyButton} onClick={() => void c.send()}
          disabled={c.status !== "idle" || c.remaining > 0}>
          {c.status === "sending" ? "Sending…" : c.challenge ? c.remaining ? `Resend in ${c.remaining}s` : "Resend code" : c.remaining ? `Retry in ${c.remaining}s` : "Verify number"}
        </button>}
    </div>
    <small id="checkout-phone-help" aria-live="polite">
      {c.verified ? "Number verified for this checkout." :
        c.valid && c.policy?.required ? "Verify your number to continue. We send a code only when you select Verify number." :
        "Enter 10 digits. +91 is already included. Required for delivery and order updates."}
    </small>
    {c.verified && <button type="button" className={styles.textButton} onClick={c.changeVerifiedPhone}>Change number</button>}
    {c.policyError && <div role="alert"><p>{c.policyError}</p><button type="button" className={styles.textButton} onClick={c.retryPolicy}>Retry verification setup</button></div>}
    {c.challenge && !c.verified && <div className={styles.otpPanel}>
      <label htmlFor="checkout-phone-otp">Verification code</label>
      <small id="checkout-otp-help">Enter the 6-digit code sent to {c.challenge.maskedPhone}. Valid for 5 minutes.</small>
      <div className={styles.row}>
        <input ref={c.otpInput} id="checkout-phone-otp" className={styles.otp} type="text" inputMode="numeric"
          autoComplete="one-time-code" aria-describedby="checkout-otp-help" aria-label="Verification code"
          maxLength={6} pattern="[0-9]{6}" value={c.otp}
          onChange={e => c.changeOtp(e.target.value)} disabled={c.status !== "idle" || c.codeExpired}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void c.verify(); } }} />
        <button type="button" className={styles.verifyButton} onClick={() => void c.verify()}
          disabled={c.status !== "idle" || c.otp.length !== 6 || c.codeExpired}>
          {c.status === "checking" ? "Checking…" : "Verify code"}
        </button>
      </div>
      {c.codeExpired && <small role="status">This code has expired. Request a new code.</small>}
    </div>}
    {c.error && <p className={styles.error} role="alert">{c.error}</p>}
  </div>;
}
