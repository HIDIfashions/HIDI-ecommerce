import { useEffect } from 'react';
import { config } from '../config.js';
import { useReducedMotion } from './useMediaQuery.js';

/** Gentle desktop wheel settling + measured anchor scrolling.
 * Touch, zoom gestures, keyboard scrolling, nested scrollers and reduced-motion
 * preferences stay native. A scrollbar drag or a new user action cancels motion.
 * No third-party scroll library or pinned full-page scroll sequence is required.
 */
export function useSmoothPageScroll(enabled = true) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!enabled || reduced || config.motion?.smoothScroll === false) return;
    const root = document.documentElement;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let frame = 0;
    let target = window.scrollY;
    let written = window.scrollY;
    let previousTime = 0;
    let mode = '';
    const maximum = () => Math.max(0, root.scrollHeight - window.innerHeight);
    const clamp = (value) => Math.max(0, Math.min(maximum(), value));
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      mode = '';
      target = window.scrollY;
    };
    const write = (value) => {
      written = clamp(value);
      window.scrollTo({ top: written, left: 0, behavior: 'instant' });
      written = window.scrollY;
    };
    const wheelFrame = (time) => {
      if (document.body.classList.contains('dialog-open')) { stop(); return; }
      const elapsed = previousTime ? Math.min(40, time - previousTime) : 16;
      previousTime = time;
      target = clamp(target);
      const difference = target - window.scrollY;
      if (Math.abs(difference) < 3.5) { write(target); stop(); return; }
      write(window.scrollY + difference * (1 - Math.exp(-elapsed / 105)));
      frame = requestAnimationFrame(wheelFrame);
    };
    const hasNestedScroll = (node, direction) => {
      for (let element = node instanceof Element ? node : null; element && element !== document.body; element = element.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1) {
          if ((direction < 0 && element.scrollTop > 0) ||
              (direction > 0 && element.scrollTop + element.clientHeight < element.scrollHeight - 1)) return true;
        }
      }
      return false;
    };
    const wheel = (event) => {
      if (event.defaultPrevented || !finePointer.matches || !event.cancelable || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
          Math.abs(event.deltaX) > Math.abs(event.deltaY) || document.body.classList.contains('dialog-open') ||
          event.target.closest?.('dialog, input, textarea, select, [data-native-scroll]') || hasNestedScroll(event.target, event.deltaY)) {
        stop(); return;
      }
      // Precision trackpad deltas already have natural inertia: do not slow them.
      if (event.deltaMode === 0 && Math.abs(event.deltaY) < 24) { stop(); return; }
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      if (!delta || (delta < 0 && window.scrollY <= 0) || (delta > 0 && window.scrollY >= maximum())) return;
      event.preventDefault();
      if (mode !== 'wheel') stop();
      target = clamp((frame ? target : window.scrollY) + delta);
      mode = 'wheel';
      if (!frame) { previousTime = 0; frame = requestAnimationFrame(wheelFrame); }
    };
    const click = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href^="#"]');
      const hash = anchor?.getAttribute('href');
      if (!hash || hash.startsWith('#/') || hash === '#' || anchor.target === '_blank') return;
      let section;
      try { section = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
      if (!section) return;
      event.preventDefault();
      stop();
      const header = document.querySelector('.site-header')?.getBoundingClientRect().height || 0;
      const destination = clamp(section.id === 'top' ? 0 : window.scrollY + section.getBoundingClientRect().top - header - 18);
      const from = window.scrollY;
      const distance = destination - from;
      const duration = Math.min(1120, Math.max(500, Math.abs(distance) * 0.3));
      const started = performance.now();
      mode = 'anchor';
      if (window.location.hash !== hash) window.history.pushState(null, '', hash);
      const tick = (time) => {
        const progress = Math.min(1, (time - started) / duration);
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
        write(from + distance * eased);
        if (progress < 1) frame = requestAnimationFrame(tick);
        else {
          stop();
          if (event.detail === 0) {
            if (!section.hasAttribute('tabindex')) {
              section.setAttribute('tabindex', '-1');
              section.addEventListener('blur', () => section.removeAttribute('tabindex'), { once: true });
            }
            section.focus({ preventScroll: true });
          }
        }
      };
      frame = requestAnimationFrame(tick);
    };
    const externalScroll = () => { if (frame && Math.abs(window.scrollY - written) > 3) stop(); };
    const key = (event) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab', 'Escape'].includes(event.key)) stop(); };
    root.classList.add('hidi-smooth-scroll');
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('scroll', externalScroll, { passive: true });
    window.addEventListener('pointerdown', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', key);
    window.addEventListener('resize', stop, { passive: true });
    window.addEventListener('popstate', stop);
    window.addEventListener('hashchange', stop);
    document.addEventListener('click', click);
    return () => {
      stop();
      root.classList.remove('hidi-smooth-scroll');
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('scroll', externalScroll);
      window.removeEventListener('pointerdown', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', stop);
      window.removeEventListener('popstate', stop);
      window.removeEventListener('hashchange', stop);
      document.removeEventListener('click', click);
    };
  }, [enabled, reduced]);
}
