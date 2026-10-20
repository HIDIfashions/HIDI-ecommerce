"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "./order-detail.module.css";

type SupportEvent = {
  id: string; kind: string; actorName: string; createdAt: string; text?: string;
  tags?: string[]; status?: string; dueAt?: string; type?: string;
  amountPaise?: number; requestId?: string; decision?: string;
};

export function AdminSupport({ orderNumber, role }: { orderNumber: string; role?: string }) {
  const [events, setEvents] = useState<SupportEvent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState("NOTE");
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [dueAt, setDueAt] = useState("");
  const [type, setType] = useState("REFUND");
  const [amount, setAmount] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const endpoint = `/api/admin/orders/${encodeURIComponent(orderNumber)}/support`;
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message ?? "Unable to load support history");
    setEvents(body.events ?? []);
    setLoaded(true);
  }, [endpoint]);
  useEffect(() => { void load().catch(err => setError(err.message)); }, [load]);

  async function save(payload: Record<string, unknown>, suffix = "") {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint + suffix, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Unable to save support update");
      await load();
      setNotice("Support update saved.");
      setText("");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save support update"); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void save({ kind, text, ...(kind === "TAGS" ? { tags: tags.split(",").map(tag => tag.trim()).filter(Boolean) } : {}),
      ...(kind === "FOLLOW_UP" ? { status, dueAt: dueAt ? new Date(dueAt).toISOString() : null } : {}),
      ...(kind === "APPROVAL_REQUEST" ? { type, ...(amount ? { amountPaise: Math.round(Number(amount) * 100) } : {}) } : {}),
    });
  }
  const currentTags = events.filter(event => event.kind === "TAGS").at(-1)?.tags ?? [];
  const followUp = events.filter(event => event.kind === "FOLLOW_UP").at(-1);
  const canWrite = ["OWNER", "OPERATIONS", "SUPPORT"].includes(role ?? "");
  return <section className={styles.card}>
    <p className={styles.eyebrow}>CUSTOMER SUPPORT</p><h2>Notes and follow-ups</h2>
    <p>Internal only. Refunds, cancellations, compensation and order changes need an Owner decision. Approval records permission; the Owner carries out the action separately.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {!loaded && !error && <p>Loading support history…</p>}
    <p><strong>Issue tags:</strong> {currentTags.join(", ") || "None"}</p>
    {followUp && <p><strong>Follow-up:</strong> {followUp.status?.replaceAll("_", " ")} {followUp.dueAt && `· ${new Date(followUp.dueAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`}<br />{followUp.text}</p>}
    {canWrite && <form onSubmit={submit} className={styles.shippingForm}>
      <label>Action<select aria-label="Action" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="NOTE">Add internal note</option><option value="TAGS">Update issue tags</option>
        <option value="FOLLOW_UP">Update follow-up</option><option value="APPROVAL_REQUEST">Request Owner approval</option>
      </select></label>
      {kind === "TAGS" ? <label>Issue tags (comma separated; replaces current tags)<input maxLength={409} value={tags} onChange={event => setTags(event.target.value)} placeholder="delivery-delay, payment-query" /></label> :
        <label>{kind === "APPROVAL_REQUEST" ? "Exact action requested and reason" : "Details"}<textarea required maxLength={2000} value={text} onChange={event => setText(event.target.value)} /></label>}
      {kind === "FOLLOW_UP" && <><label>Status<select aria-label="Follow-up status" value={status} onChange={event => setStatus(event.target.value)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="DONE">Done</option></select></label>
        <label>Follow-up date and time<input type="datetime-local" required={status !== "DONE"} value={dueAt} onChange={event => setDueAt(event.target.value)} /></label></>}
      {kind === "APPROVAL_REQUEST" && <><label>Approval type<select aria-label="Approval type" value={type} onChange={event => setType(event.target.value)}><option value="REFUND">Refund</option><option value="CANCELLATION">Cancellation</option><option value="COMPENSATION">Compensation</option><option value="ORDER_CHANGE">Order change</option></select></label>
        <label>Amount in ₹ (if applicable)<input type="number" min="0.01" step="0.01" max="21474836.47" value={amount} onChange={event => setAmount(event.target.value)} /></label></>}
      <button type="submit" disabled={busy || !loaded}>{busy ? "Saving…" : kind === "APPROVAL_REQUEST" ? "Submit for Owner approval" : "Save support update"}</button>
    </form>}
    <h3>Support history</h3>
    {loaded && events.length === 0 && <p>No support updates yet.</p>}
    {[...events].reverse().map(event => {
      const decision = events.find(row => row.kind === "APPROVAL_DECISION" && row.requestId === event.id);
      return <article key={event.id} className={styles.auditEvent}><span className={styles.auditDot} aria-hidden="true" /><div className={styles.auditContent}>
        <strong>{event.kind.replaceAll("_", " ")}{event.type ? ` · ${event.type.replaceAll("_", " ")}` : ""}</strong>
        {event.text && <p style={{ whiteSpace: "pre-wrap" }}>{event.text}</p>}
        {event.tags && <p>{event.tags.join(", ") || "Tags cleared"}</p>}
        {event.status && <p>{event.status.replaceAll("_", " ")}{event.dueAt ? ` · ${new Date(event.dueAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}</p>}
        {event.amountPaise != null && <p>₹{(event.amountPaise / 100).toFixed(2)}</p>}
        <small>{event.actorName} · {new Date(event.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</small>
        {event.decision && <strong>{event.decision}</strong>}
        {event.kind === "APPROVAL_REQUEST" && <><strong>{decision?.decision ?? "PENDING OWNER APPROVAL"}</strong>
          {!decision && role === "OWNER" && <form className={styles.shippingForm} onSubmit={e => e.preventDefault()}>
            <label>Decision reason<textarea required maxLength={2000} value={reasons[event.id] ?? ""} onChange={e => setReasons(previous => ({ ...previous, [event.id]: e.target.value }))} /></label>
            <button type="button" disabled={busy || !reasons[event.id]?.trim()} onClick={() => void save({ decision: "APPROVED", text: reasons[event.id] }, `/${encodeURIComponent(event.id)}/decision`)}>Approve</button>
            <button type="button" disabled={busy || !reasons[event.id]?.trim()} onClick={() => void save({ decision: "REJECTED", text: reasons[event.id] }, `/${encodeURIComponent(event.id)}/decision`)}>Reject</button>
          </form>}
        </>}
      </div></article>;
    })}
  </section>;
}
