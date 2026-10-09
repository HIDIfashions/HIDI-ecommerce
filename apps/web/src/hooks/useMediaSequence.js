import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useMediaQuery.js';

export default function useMediaSequence({ items, autoPlay = false, intervalSeconds = 6, readySource, visible }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(!autoPlay);
  const [held, setHeld] = useState(false);
  const touch = useRef(null);
  const signature = items.map(item => item.url).join('|');
  const current = items[index] || items[0];
  const running = items.length > 1 && !paused && !reduced && !navigator.connection?.saveData;
  useEffect(() => { setIndex(0); setPaused(!autoPlay); }, [signature, autoPlay]);
  const move = (delta, manual = true) => {
    if (manual) setPaused(true);
    setIndex(value => (value + delta + items.length) % Math.max(1, items.length));
  };
  useEffect(() => {
    if (!running || held || !visible || !current || readySource !== current.url || current.type === 'video') return undefined;
    const timer = window.setTimeout(() => setIndex(value => (value + 1) % items.length), intervalSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [running, held, visible, current?.url, current?.type, readySource, intervalSeconds, items.length]);
  return {
    index: Math.min(index, Math.max(0, items.length - 1)), paused, running,
    previous: () => move(-1), next: () => move(1),
    ended: () => { if (running && visible && !held) move(1, false); },
    select: value => { setPaused(true); setIndex(value); },
    toggle: () => setPaused(value => !value),
    handlers: {
      onMouseEnter: () => setHeld(true), onMouseLeave: () => setHeld(false),
      onFocusCapture: () => setHeld(true),
      onBlurCapture: event => { if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false); },
      onKeyDown: event => { if (items.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowLeft' ? -1 : 1); } },
      onTouchStart: event => { const point = event.touches[0]; touch.current = point ? { x: point.clientX, y: point.clientY } : null; },
      onTouchEnd: event => { const start = touch.current, end = event.changedTouches[0]; touch.current = null; if (!start || !end || items.length < 2) return; const x = end.clientX - start.x, y = end.clientY - start.y; if (Math.abs(x) > 50 && Math.abs(x) > Math.abs(y) * 1.5) move(x < 0 ? 1 : -1); },
    },
  };
}
