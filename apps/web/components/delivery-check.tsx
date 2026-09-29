"use client";

import { useState } from "react";
import { BROWSER_API_URL } from "@/lib/browser-api";

export function DeliveryCheck() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function check(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[1-9]\d{5}$/.test(pin)) {
      setMessage("Enter a valid six-digit Indian PIN code.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${BROWSER_API_URL}/checkout/delivery-serviceability?pin=${encodeURIComponent(pin)}`, {
        cache: "no-store", signal: AbortSignal.timeout(10000),
      });
      const body = await response.json();
      if (!response.ok || typeof body?.serviceable !== "boolean") {
        setMessage("Delivery availability cannot be checked right now. Please try again later.");
      } else {
        setMessage(body.serviceable ? `Delivery is available to ${pin}. Final charges are shown at checkout.` : `Delivery is currently unavailable to ${pin}.`);
      }
    } catch {
      setMessage("Delivery availability cannot be checked right now. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="delivery-box" onSubmit={check}>
    <strong>Delivery</strong>
    <div>
      <input aria-label="Delivery PIN code" placeholder="Enter PIN code" inputMode="numeric" maxLength={6}
        value={pin} disabled={busy} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setMessage(""); }} />
      <button type="submit" disabled={busy} aria-label="Check delivery PIN code">{busy ? "Checking…" : "Check"}</button>
    </div>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
