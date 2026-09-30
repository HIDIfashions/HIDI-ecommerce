import React, { useEffect, useRef, useState } from 'react';
import { config, safeWebUrl } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import Icon from './Icon.jsx';

export default function Newsletter() {
  const { openNotice } = useHidi();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const controllerRef = useRef(null);
  const timeoutRef = useRef(null);
  const mounted = useRef(true);
  const endpoint = safeWebUrl(config.newsletterEndpoint);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controllerRef.current?.abort();
      window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const subscribe = async (event) => {
    event.preventDefault();
    if (busy) return;
    // Inline validation avoids a second browser validation bubble over the footer.
    if (!email.trim() || !inputRef.current?.validity.valid) {
      setError('Please enter a valid email address.');
      inputRef.current?.focus();
      return;
    }
    setError('');
    if (!endpoint) { openNotice('newsletter-preview'); return; }
    setBusy(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    timeoutRef.current = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }), signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true) throw new Error('Subscription not confirmed.');
      if (mounted.current) { setEmail(''); openNotice('newsletter-success'); }
    } catch {
      if (mounted.current) openNotice('newsletter-error');
    } finally {
      window.clearTimeout(timeoutRef.current);
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <form className="newsletter" id="newsletter-form" onSubmit={subscribe} aria-busy={busy} autoComplete="off" noValidate>
      <label htmlFor="newsletter-email">Email address</label>
      <div className={`newsletter-field${error ? ' has-error' : ''}`}>
        <input ref={inputRef} id="newsletter-email" name="hidi_updates_subscription" type="email" autoComplete="off"
          placeholder="Email address" required maxLength={254} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          aria-invalid={error ? 'true' : undefined} aria-describedby={`newsletter-note${error ? ' newsletter-error' : ''}`}
          value={email} onChange={(event) => { setEmail(event.target.value); if (error) setError(''); }} />
        <button type="submit" disabled={busy} aria-label={busy ? 'Submitting subscription' : 'Subscribe to HIDI updates'}><Icon name="arrow" /></button>
      </div>
      {error && <p id="newsletter-error" className="newsletter-error" role="alert">{error}</p>}
      <p className="newsletter-note" id="newsletter-note">{endpoint
        ? 'By subscribing, you agree to receive HIDI updates. Unsubscribe at any time.'
        : 'Preview form. Email delivery is not connected.'}</p>
    </form>
  );
}
