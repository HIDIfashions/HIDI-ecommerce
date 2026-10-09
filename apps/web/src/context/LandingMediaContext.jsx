import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { asset, safeWebUrl } from '../config.js';

const LandingMediaContext = createContext({ status: 'loading' });

function cleanPosition(value) {
  return typeof value === 'string' && /^\d{1,3}%\s+\d{1,3}%$/.test(value.trim())
    ? value.trim()
    : '50% 50%';
}

function cleanFitMode(value) {
  return value === 'contain' ? 'contain' : 'cover';
}

function cleanSlot(value) {
  if (value?.active === false) return null;
  if (value?.active !== true || value.type !== 'image') throw new Error('Invalid landing media');
  const url = safeWebUrl(value.url);
  if (!url) throw new Error('Invalid landing media URL');
  return {
    active: true,
    type: 'image',
    url,
    altText: typeof value.altText === 'string' ? value.altText.trim() : '',
    desktopPosition: cleanPosition(value.desktopPosition),
    mobilePosition: cleanPosition(value.mobilePosition),
    fitMode: cleanFitMode(value.fitMode),
  };
}

export function LandingMediaProvider({ children }) {
  const [slots, setSlots] = useState({ status: 'loading' });

  useEffect(() => {
    let disposed = false, controller, timeout, retryTimer, attempts = 0;
    const loadSelection = async () => {
      attempts += 1;
      controller = new AbortController();
      timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/hidi/landing-media-config', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Landing media unavailable');
        const value = await response.json();
        if (!value?.slots || typeof value.slots !== 'object' || Array.isArray(value.slots)) throw new Error('Invalid landing configuration');
        const next = { status: 'ready' };
        for (const [id, slot] of Object.entries(value.slots)) {
          const clean = cleanSlot(slot);
          if (clean) next[id] = clean;
        }
        if (value.ananya != null) {
          const list = value.ananya;
          if (list.active !== true && list.active !== false) throw new Error('Invalid Ananya media');
          const items = list.active ? (Array.isArray(list.items) ? list.items : []).map(item => cleanSlot({ ...item, active: true })) : [];
          if (list.active && (!items.length || items.length > 20)) throw new Error('Invalid Ananya media list');
          next.ananya = { active: list.active, autoPlay: list.autoPlay === true,
            intervalSeconds: Math.max(3, Math.min(30, Number(list.intervalSeconds) || 6)), items };
        }
        if (!disposed) setSlots(next);
      } catch {
        if (disposed) return;
        // A failed request is never permission to show an earlier campaign.
        if (attempts < 3) retryTimer = window.setTimeout(loadSelection, attempts * 500);
        else setSlots({ status: 'error' });
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void loadSelection();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      window.clearTimeout(retryTimer);
      controller?.abort();
    };
  }, []);

  const value = useMemo(() => slots, [slots]);
  return <LandingMediaContext.Provider value={value}>{children}</LandingMediaContext.Provider>;
}

export function useLandingMedia() {
  return useContext(LandingMediaContext);
}

export function landingImageProps(slots, slotId, fallbackPath, fallbackAlt = '') {
  if (slots?.status && slots.status !== 'ready') return { alt: fallbackAlt };
  const slot = slots?.[slotId] || null;
  if (!slot) {
    return {
      src: asset(fallbackPath),
      alt: fallbackAlt,
    };
  }

  return {
    src: slot.url,
    alt: slot.altText || fallbackAlt,
    'data-landing-media-slot': slotId,
    style: {
      '--landing-media-desktop-position': slot.desktopPosition,
      '--landing-media-mobile-position': slot.mobilePosition,
      '--landing-media-fit': slot.fitMode,
    },
  };
}
