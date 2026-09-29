"use client";

import { FormEvent, useState } from "react";
import { BROWSER_API_URL } from "@/lib/browser-api";

export function NewsletterSignup() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    if (!email) {
      setError("Enter your email address.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${BROWSER_API_URL}/marketing/newsletter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "FOOTER" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "Unable to subscribe right now.");
      setMessage(payload?.message ?? "You’re subscribed to HIDI.");
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to subscribe right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="newsletter" onSubmit={submit}>
        <input
          name="email"
          aria-label="Email address"
          type="email"
          placeholder="Email address"
          autoComplete="email"
          aria-describedby="newsletter-status"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "Subscribing…" : "Subscribe"}
        </button>
      </form>
      <p id="newsletter-status" className="newsletter-status" role={error ? "alert" : "status"} aria-live="polite">
        {error || message}
      </p>
    </>
  );
}
