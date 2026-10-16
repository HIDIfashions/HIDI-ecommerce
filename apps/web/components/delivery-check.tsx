"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Truck, Banknote, RefreshCw } from "lucide-react";
import { BROWSER_API_URL } from "@/lib/browser-api";
import { courierDateLabel, courierTransitLabel } from "@/lib/delivery-estimate";

type DeliveryResult = { pin: string; serviceable: boolean; cod: boolean; city?: string | null; estimatedDeliveryDate?: string | null; estimatedTransitDays?: number | null };

export function DeliveryCheck() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<DeliveryResult | null>(null);
  const pinInput = useRef<HTMLInputElement>(null);

  async function check(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || result) return;
    if (!/^[1-9]\d{5}$/.test(pin)) {
      setMessage("Enter a valid six-digit Indian PIN code.");
      setResult(null);
      return;
    }
    setBusy(true); setMessage(""); setResult(null);
    try {
      const response = await fetch(`${BROWSER_API_URL}/checkout/delivery-serviceability?pin=${encodeURIComponent(pin)}`, {
        cache: "no-store", signal: AbortSignal.timeout(10000),
      });
      const body = await response.json();
      if (!response.ok || typeof body?.serviceable !== "boolean") {
        setMessage("Delivery availability cannot be checked right now. Please try again later.");
      } else if (!body.serviceable) {
        setMessage(`Delivery is currently unavailable to ${pin}.`);
      } else {
        setResult({ ...body, pin });
      }
    } catch {
      setMessage("Delivery availability cannot be checked right now. Please try again later.");
    } finally { setBusy(false); }
  }
  const date = courierDateLabel(result?.estimatedDeliveryDate);
  const transit = courierTransitLabel(result?.estimatedTransitDays);

  return <section className="delivery-box" aria-label="Delivery options">
    <strong className="delivery-heading">Delivery options <Truck size={21} aria-hidden="true" /></strong>
    <form onSubmit={check}>
      <div className="delivery-pin-entry">
        <input ref={pinInput} aria-label="Delivery PIN code" placeholder="Enter PIN code" inputMode="numeric" maxLength={6}
          value={pin} disabled={busy} readOnly={Boolean(result)} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setMessage(""); setResult(null); }} />
        {result ? <button type="button" onClick={() => { setResult(null); requestAnimationFrame(() => pinInput.current?.focus()); }}>Change</button> : <button type="submit" disabled={busy} aria-label="Check delivery PIN code">{busy ? "Checking…" : "Check"}</button>}
      </div>
    </form>
    <div role="status" aria-live="polite" className="delivery-result">
      {message && <p>{message}</p>}
      {result && <>
        <ul className="delivery-benefits">
          <li><Truck size={28} aria-hidden="true" /><div><strong>{date ? `Estimated delivery by ${date}` : transit || "Delivery available to your PIN"}</strong><small>{date ? "Courier estimate; timing may change." : transit ? "Delhivery estimate from courier handover; dispatch time is additional." : "The courier has not supplied an arrival estimate yet."}</small></div></li>
          <li><Banknote size={28} aria-hidden="true" /><div><strong>{result.cod ? "Pay on delivery available" : "Online payment available"}</strong><small>{result.cod ? "Select an available payment method at checkout." : "Pay on delivery is unavailable for this PIN."}</small></div></li>
          <li><RefreshCw size={28} aria-hidden="true" /><div><strong>7-day returns on eligible items</strong><Link href="/returns">View returns &amp; exchange policy →</Link></div></li>
        </ul>
      </>}
    </div>
  </section>;
}
