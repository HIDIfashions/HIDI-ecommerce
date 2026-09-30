import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { wrapIndex } from '../data/carousel.js';
import { rollingPose, springStep } from '../data/rollingMotion.js';

/** Five persistent cards; one animation clock. React does not render per frame.
 * Motion retargets from its current position and velocity, even on rapid clicks. */
export function useRollingCarousel({ count, initialIndex = 0, reduced = false, onInteraction }) {
  const galleryRef = useRef(null);
  const stageRef = useRef(null);
  const api = useRef(null);
  const activeRef = useRef(initialIndex);
  const interactionRef = useRef(onInteraction);
  interactionRef.current = onInteraction;
  const [active, setActive] = useState(initialIndex);
  const [moving, setMoving] = useState(false);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const gallery = galleryRef.current;
    const stage = stageRef.current;
    if (!gallery || !stage || count < 1) return undefined;
    const cards = [...stage.querySelectorAll('.hidi-collection-card')];
    const links = cards.map((card) => card.querySelector('button'));
    let phase = activeRef.current, target = phase, velocity = 0;
    let frame = 0, previousTime = 0, width = 380, height = 536, stepRatio = .73;
    let motion = false, gesture = null, skipClickUntil = 0, disposed = false;
    setMoving(false);
    setDragging(false);
    let activeNow = activeRef.current;
    let mobile = window.matchMedia('(max-width: 700px)').matches;

    const setMotion = (value) => {
      if (value === motion || disposed) return;
      motion = value;
      gallery.classList.toggle('is-moving', value);
      gallery.dataset.transitioning = String(value);
      setMoving(value);
    };
    const paint = () => {
      const nearest = wrapIndex(Math.round(phase), count);
      for (let index = 0; index < cards.length; index += 1) {
        const pose = rollingPose(index, phase, count, width, height, stepRatio);
        const card = cards[index];
        const depth = pose.distance < .5 ? 'active' : pose.distance < 1.5 ? 'near' : pose.opacity > .005 ? 'edge' : 'hidden';
        card.style.transform = `translate3d(${pose.x.toFixed(3)}px,${pose.y.toFixed(3)}px,0) rotateY(${pose.rotate.toFixed(3)}deg) scale(${pose.scale.toFixed(5)})`;
        card.style.opacity = pose.opacity.toFixed(4);
        card.style.zIndex = String(pose.z);
        if (card.dataset.depth !== depth) card.dataset.depth = depth;
        const interactive = pose.opacity > .12 && (!mobile || nearest === index);
        card.setAttribute('aria-hidden', String(!interactive));
        if (links[index]) links[index].tabIndex = interactive ? 0 : -1;
      }
      gallery.dataset.phase = phase.toFixed(5);
      gallery.dataset.activeIndex = String(nearest);
      if (nearest !== activeNow) {
        activeNow = nearest;
        activeRef.current = nearest;
        setActive(nearest); // Only at the centre crossover, never per frame.
      }
    };
    const cancelFrame = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
    };
    const tick = (time) => {
      frame = 0;
      if (disposed) return;
      const dt = previousTime ? (time - previousTime) / 1000 : 1 / 60;
      previousTime = time;
      if (!gesture?.horizontal) {
        const next = springStep(phase, velocity, target, dt);
        phase = next.position;
        velocity = next.velocity;
      }
      const settled = !gesture?.horizontal && Math.abs(target - phase) < .0007 && Math.abs(velocity) < .008;
      if (settled) {
        // Periodic poses mean normalization produces the exact same pixels.
        phase = wrapIndex(target, count);
        target = phase;
        velocity = 0;
      }
      paint();
      if (!settled && !gesture?.horizontal) frame = requestAnimationFrame(tick);
      else if (settled) { previousTime = 0; setMotion(false); }
    };
    const animate = () => {
      if (reduced) {
        cancelFrame(); phase = wrapIndex(target, count); target = phase; velocity = 0;
        paint(); setMotion(false); return;
      }
      setMotion(true);
      if (!frame) { previousTime = 0; frame = requestAnimationFrame(tick); }
    };
    const move = (step, manual = true) => {
      if (!step || count < 2 || disposed || gesture?.horizontal) return false;
      if (manual) interactionRef.current?.();
      // Cap a rapid-click backlog without dropping direction changes.
      target = Math.round(target) + step;
      target = Math.max(Math.round(phase) - count, Math.min(Math.round(phase) + count, target));
      gallery.dataset.targetIndex = String(wrapIndex(target, count));
      animate();
      return true;
    };
    const goTo = (index) => {
      if (gesture?.horizontal || disposed) return;
      interactionRef.current?.();
      const anchor = Math.round(phase);
      let distance = wrapIndex(index - wrapIndex(anchor, count), count);
      if (distance > count / 2) distance -= count;
      target = anchor + distance;
      gallery.dataset.targetIndex = String(index);
      animate();
    };
    const measure = () => {
      if (!cards[0]) return;
      const style = getComputedStyle(gallery);
      width = cards[0].offsetWidth || 380;
      height = cards[0].querySelector('.hidi-collection-photo')?.offsetHeight || width * 1.41;
      stepRatio = Number.parseFloat(style.getPropertyValue('--collection-step-ratio')) || .73;
      mobile = window.matchMedia('(max-width: 700px)').matches;
      paint();
    };
    const down = (event) => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || event.ctrlKey || event.metaKey) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false,
        origin: phase, lastPhase: phase, lastTime: performance.now() };
    };
    const pointerMove = (event) => {
      const g = gesture;
      if (!g || g.id !== event.pointerId) return;
      if (event.pointerType === 'mouse' && !(event.buttons & 1)) { end(event, true); return; }
      const dx = event.clientX - g.x, dy = event.clientY - g.y;
      if (!g.horizontal && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
      if (!g.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        g.horizontal = true;
        // Take over from the actual displayed position, not an old target.
        g.origin = phase + dx / (width * stepRatio);
        g.lastPhase = phase; g.lastTime = performance.now();
        cancelFrame(); setMotion(false);
        setDragging(true); gallery.classList.add('is-dragging');
        interactionRef.current?.();
        try { stage.setPointerCapture(g.id); } catch { /* Window release handlers remain. */ }
      }
      if (!g.horizontal) return;
      if (event.cancelable) event.preventDefault();
      const now = performance.now();
      const nextPhase = g.origin - dx / (width * stepRatio);
      const dt = Math.max(.008, (now - g.lastTime) / 1000);
      velocity = Math.max(-3.5, Math.min(3.5, (nextPhase - g.lastPhase) / dt));
      phase = nextPhase;
      g.lastPhase = phase; g.lastTime = now;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(); });
    };
    function end(event, cancelled = false) {
      const g = gesture;
      if (!g || (event?.pointerId !== undefined && event.pointerId !== g.id)) return;
      gesture = null; // Clear before lostpointercapture can run.
      if (!g.horizontal) return;
      skipClickUntil = performance.now() + 450;
      try { if (stage.hasPointerCapture(g.id)) stage.releasePointerCapture(g.id); } catch { /* Already released. */ }
      cancelFrame(); setDragging(false); gallery.classList.remove('is-dragging');
      const displacement = phase - g.origin;
      if (performance.now() - g.lastTime > 100 || cancelled) velocity = 0;
      if (cancelled || reduced) target = Math.round(phase);
      else if (Math.abs(displacement) > .14 || Math.abs(velocity) > .45) {
        const direction = Math.abs(displacement) > .14 ? Math.sign(displacement) : Math.sign(velocity);
        target = Math.round(g.origin) + direction * Math.max(1, Math.round(Math.abs(displacement)));
        // A release may approach its destination, never move away then reverse.
        if (Math.sign(velocity) !== Math.sign(target - phase)) velocity = 0;
      } else { target = Math.round(g.origin); velocity = 0; }
      if (reduced) { phase = target; paint(); }
      animate();
    }
    const clickCapture = (event) => {
      if (performance.now() < skipClickUntil || motion) { event.preventDefault(); event.stopPropagation(); }
    };
    const pointerCancel = (event) => end(event, true);
    // Touch begins with implicit capture on the child photograph. Its capture-
    // loss bubbles when we transfer capture to the stage; that is NOT cancellation.
    const captureLost = (event) => {
      if (event.target === stage && !stage.hasPointerCapture(event.pointerId)) end(event, true);
    };
    const leaveWindow = (event) => { if (event.pointerType === 'mouse' && !event.relatedTarget) end(event, true); };
    const blur = () => end(null, true);
    const visibility = () => {
      if (!document.hidden) return;
      end(null, true); cancelFrame(); phase = Math.round(target); target = phase; velocity = 0;
      paint(); setMotion(false);
    };
    stage.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', pointerCancel);
    stage.addEventListener('lostpointercapture', captureLost);
    window.addEventListener('pointerout', leaveWindow);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    stage.addEventListener('click', clickCapture, true);
    const preventDrag = (event) => event.preventDefault();
    stage.addEventListener('dragstart', preventDrag);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(gallery);
    window.addEventListener('resize', measure);
    measure();
    api.current = { move, goTo, canOpen: () => !motion && performance.now() >= skipClickUntil };
    return () => {
      disposed = true; cancelFrame(); observer?.disconnect();
      const held = gesture; gesture = null;
      try { if (held && stage.hasPointerCapture(held.id)) stage.releasePointerCapture(held.id); } catch { /* Optional cleanup. */ }
      api.current = null;
      stage.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', pointerCancel);
      stage.removeEventListener('lostpointercapture', captureLost);
      window.removeEventListener('pointerout', leaveWindow);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      stage.removeEventListener('click', clickCapture, true);
      stage.removeEventListener('dragstart', preventDrag);
      window.removeEventListener('resize', measure);
      gallery.classList.remove('is-moving', 'is-dragging');
    };
  }, [count, reduced]);

  const move = useCallback((step, manual = true) => api.current?.move(step, manual), []);
  const goTo = useCallback((index) => api.current?.goTo(index), []);
  const canOpen = useCallback(() => api.current?.canOpen() ?? true, []);
  return { galleryRef, stageRef, active, moving, dragging, move, goTo, canOpen };
}
