"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import {
  getRetentionPreferences, retentionAccountId, retentionEnabled, updateRetentionPreferences,
  type RetentionPreferences as Preferences,
} from "@/lib/retention-client";
import styles from "./retention-preferences.module.css";

export function RetentionPreferences() {
  const [userId, setUserId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [personalizationOptIn, setPersonalizationOptIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    if (!retentionEnabled) return;
    let lastUserId: string | null = null;
    function syncAuth() {
      const nextUserId = retentionAccountId();
      if (nextUserId === lastUserId) return;
      lastUserId = nextUserId;
      revision.current += 1;
      request.current?.abort();
      setPreferences(null);
      setWhatsappOptIn(false);
      setPersonalizationOptIn(false);
      setError("");
      setMessage("");
      setSaving(false);
      setUserId(nextUserId);
    }
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === "hidi_supabase_session") syncAuth();
    }
    syncAuth();
    window.addEventListener("hidi-auth-updated", syncAuth);
    window.addEventListener("storage", onStorage);
    return () => {
      revision.current += 1;
      request.current?.abort();
      window.removeEventListener("hidi-auth-updated", syncAuth);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!retentionEnabled || !userId) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const currentRevision = ++revision.current;
    setLoading(true);
    setError("");
    const current = () => !controller.signal.aborted && revision.current === currentRevision && retentionAccountId() === userId;
    getRetentionPreferences(userId, controller.signal).then((data) => {
      if (!current()) return;
      setPreferences(data);
      setWhatsappOptIn(data.whatsappOptIn);
      setPersonalizationOptIn(data.personalizationOptIn);
    }).catch((cause: unknown) => {
      if (current()) setError(cause instanceof Error ? cause.message : "We couldn’t load your preferences.");
    }).finally(() => { if (current()) setLoading(false); });
    return () => controller.abort();
  }, [userId, reload]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !preferences || saving || loading) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const currentRevision = ++revision.current;
    const current = () => !controller.signal.aborted && revision.current === currentRevision && retentionAccountId() === userId;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await updateRetentionPreferences(userId, { whatsappOptIn, personalizationOptIn }, controller.signal);
      if (!current()) return;
      setPreferences(data);
      setWhatsappOptIn(data.whatsappOptIn);
      setPersonalizationOptIn(data.personalizationOptIn);
      setMessage("Your choices have been saved.");
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : "We couldn’t save your preferences.");
    } finally { if (current()) setSaving(false); }
  }

  if (!retentionEnabled || !userId) return null;
  const changed = preferences && (preferences.whatsappOptIn !== whatsappOptIn || preferences.personalizationOptIn !== personalizationOptIn);
  // Existing consent can always be withdrawn, even when new opt-ins are paused.
  const whatsappDisabled = saving || !preferences || (!preferences.whatsappOptIn && (!preferences.enabled || !preferences.phoneVerified));
  const personalizationDisabled = saving || !preferences || (!preferences.personalizationOptIn && !preferences.enabled);

  return <section className={styles.panel} aria-labelledby="retention-heading" aria-busy={loading || saving}>
    <div className={styles.intro}>
      <span className={styles.eyebrow}><ShieldCheck size={16} aria-hidden="true" /> YOUR CHOICES</span>
      <h2 id="retention-heading">A little more personal.<br />Always on your terms.</h2>
      <p>Choose what you share and how you hear from HIDI. Both options are optional; you can shop with either switched off.</p>
      <span className={styles.status}>WhatsApp reminders are not active yet</span>
    </div>
    <div className={styles.controls}>
      {loading ? <p className={styles.loading} role="status">Loading your preferences…</p> : preferences ? <form onSubmit={save}>
        <label className={styles.choice}>
          <input type="checkbox" checked={personalizationOptIn} disabled={personalizationDisabled}
            onChange={(event) => { setPersonalizationOptIn(event.target.checked); setMessage(""); }} />
          <span><strong><Sparkles size={17} aria-hidden="true" /> Remember my product interests</strong>
            <span>Allow HIDI to save meaningful product views and size selections to my signed-in account for personalised recommendations and reminders.</span>
          </span>
        </label>
        <label className={styles.choice}>
          <input type="checkbox" checked={whatsappOptIn} disabled={whatsappDisabled}
            onChange={(event) => { setWhatsappOptIn(event.target.checked); setMessage(""); }} />
          <span><strong><MessageCircle size={17} aria-hidden="true" /> WhatsApp shopping updates</strong>
            <span>Allow HIDI to send marketing messages, including product reminders, offers and reward updates, to my verified WhatsApp number. This is separate from order updates.</span>
          </span>
        </label>
        <p className={styles.note}>{preferences.phoneVerified
          ? `Verified number${preferences.maskedPhone ? `: ${preferences.maskedPhone}` : " on your account"}.`
          : "WhatsApp opt-in requires a verified mobile number. Email sign-in and a shipping phone number do not verify your number."}</p>
        {!preferences.enabled && <p className={styles.note}>New opt-ins are paused. You can still turn off existing preferences and save.</p>}
        <p className={styles.note}>Product-based WhatsApp reminders need both options. Turn either off here and save to withdraw consent. When reminders become available, you can also reply STOP to opt out.</p>
        <div className={styles.actions}>
          <button type="submit" disabled={saving || !changed}>{saving ? "Saving…" : "Save preferences"}</button>
          {message && <span className={styles.success} role="status">{message}</span>}
        </div>
      </form> : <button className={styles.retry} type="button" onClick={() => setReload((value) => value + 1)}>Try loading preferences again</button>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  </section>;
}
