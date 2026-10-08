import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { asset, safeWebUrl } from '../config.js';

const LandingMediaContext = createContext({});

function cleanPosition(value) {
  return typeof value === 'string' && /^\d{1,3}%\s+\d{1,3}%$/.test(value.trim())
    ? value.trim()
    : '50% 50%';
}

function cleanFitMode(value) {
  return value === 'contain' ? 'contain' : 'cover';
}

function cleanSlot(value) {
  if (!value?.active || value.type !== 'image') return null;
  const url = safeWebUrl(value.url);
  if (!url) return null;
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
  const [slots, setSlots] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/hidi/landing-media-config', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => {
        const next = {};
        if (value?.slots && typeof value.slots === 'object') {
          for (const [id, slot] of Object.entries(value.slots)) {
            const clean = cleanSlot(slot);
            if (clean) next[id] = clean;
          }
        }
        setSlots(next);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setSlots({});
      });
    return () => controller.abort();
  }, []);

  const value = useMemo(() => slots, [slots]);
  return <LandingMediaContext.Provider value={value}>{children}</LandingMediaContext.Provider>;
}

export function useLandingMedia() {
  return useContext(LandingMediaContext);
}

export function landingImageProps(slots, slotId, fallbackPath, fallbackAlt = '') {
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
