import React, { useCallback, useEffect, useRef, useState } from 'react';
import { asset, config } from '../config.js';
import { collections } from '../data/collections.js';
import { useHidi } from '../context/HidiContext.jsx';
import { useMediaQuery, useReducedMotion } from '../hooks/useMediaQuery.js';
import { useDocumentVisible, useInView } from '../hooks/useVisibility.js';
import { useRollingCarousel } from '../hooks/useRollingCarousel.js';
import Icon from './Icon.jsx';
import Reveal from './Reveal.jsx';
import '../styles/collection-spotlight.css';

const count = collections.length;

export default function RangeCarousel() {
  const { openAuth, dialogOpen } = useHidi();
  const mobile = useMediaQuery('(max-width: 700px)');
  const reduced = useReducedMotion();
  const documentVisible = useDocumentVisible();
  const section = useRef(null);
  const visible = useInView(section, .08);
  const [paused, setPaused] = useState(() => mobile || reduced);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const onInteraction = useCallback(() => setPaused(true), []);
  const { galleryRef, stageRef, active, moving, dragging, move, goTo, canOpen } = useRollingCarousel({
    count, initialIndex: count > 1 ? 1 : 0, reduced, onInteraction,
  });

  useEffect(() => { setPaused(mobile || reduced); }, [mobile, reduced]);
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    // Decode each photograph before autoplay starts; the first turn never waits
    // for an image fetch or decode. The DOM contains only five real cards.
    Promise.all(collections.map((item) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        if (image.decode) image.decode().catch(() => {}).then(resolve);
        else resolve();
      };
      image.onerror = resolve;
      image.src = asset(item.image);
    }))).then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [visible]);

  useEffect(() => {
    if (!ready || paused || reduced || hovered || focused || dragging || moving || !visible || !documentVisible || dialogOpen) return undefined;
    const timer = window.setTimeout(() => move(1, false), Math.max(4200, Number(config.carouselInterval) || 6200));
    return () => window.clearTimeout(timer);
  }, [ready, paused, reduced, hovered, focused, dragging, moving, visible, documentVisible, dialogOpen, move]);

  const browse = (step) => {
    move(step);
    setStatus(step > 0 ? 'Moving to the next collection.' : 'Moving to the previous collection.');
  };
  const select = (index) => {
    goTo(index);
    setStatus(`${collections[index].name} selected.`);
  };
  const openCollection = (index) => {
    if (!canOpen()) return;
    setPaused(true);
    openAuth('signup', collections[index].name);
  };
  const keyboard = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ' && event.target === event.currentTarget && !reduced) {
      event.preventDefault();
      setPaused((value) => !value);
      setStatus(paused ? 'Automatic rotation resumes when you leave the carousel.' : 'Automatic rotation paused.');
    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.target.closest('.hidi-collection-link')) galleryRef.current?.focus({ preventScroll: true });
      if (event.key === 'Home' || event.key === 'End') select(event.key === 'Home' ? 0 : count - 1);
      else browse(event.key === 'ArrowRight' ? 1 : -1);
    }
  };

  return (
    <section ref={section} className="range-section range-section--spotlight" id="our-range" aria-labelledby="range-title">
      <Reveal className="section-heading container">
        <p className="eyebrow">A WARDROBE FOR EVERY YOU</p>
        <h2 id="range-title">Explore our <em>range.</em></h2>
        <p>Your next favourite is waiting to be found.</p>
      </Reveal>
      <div ref={galleryRef} id="range-carousel" className="hidi-collection-gallery"
        role="region" tabIndex={0} aria-roledescription="carousel" aria-label="HIDI collection previews" aria-describedby="collection-keyboard-help"
        data-active-index={active} data-transitioning={moving} data-motion="smooth-rolling-gallery"
        onKeyDown={keyboard}
        onMouseEnter={() => { if (window.matchMedia('(hover: hover)').matches) setHovered(true); }}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        <div ref={stageRef} className="hidi-collection-stage">
          <div className="hidi-collection-track">
            {collections.map((item, index) => (
              <article key={item.id} className="hidi-collection-card" data-card={index}
                role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}: ${item.name}`}>
                <button type="button" className="hidi-collection-link" aria-label={`Explore ${item.name}`} onClick={() => openCollection(index)}>
                  <div className="hidi-collection-photo">
                    <img src={asset(item.image)} alt={item.alt} width="355" height="593" draggable={false} decoding="async" loading="eager" />
                  </div>
                  <div className="hidi-collection-caption">
                    <h3>{item.name}</h3>
                    <p className="sr-only">{item.description}</p>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </div>
        <button type="button" className="hidi-collection-arrow hidi-collection-arrow--previous"
          aria-label="Previous collection" aria-controls="range-carousel" onClick={() => browse(-1)}><Icon name="chevronLeft" /></button>
        <button type="button" className="hidi-collection-arrow hidi-collection-arrow--next"
          aria-label="Next collection" aria-controls="range-carousel" onClick={() => browse(1)}><Icon name="chevronRight" /></button>
        <div className="hidi-collection-controls">
          <button type="button" className="hidi-rotation-access" onClick={() => setPaused((value) => !value)}>
            {paused ? 'Resume automatic collection rotation' : 'Pause automatic collection rotation'}
          </button>
          <div className="hidi-collection-dots" role="group" aria-label="Choose a collection">
            {collections.map((item, index) => <button key={item.id} type="button"
              className={`hidi-collection-dot${active === index ? ' is-active' : ''}`}
              aria-label={`Show ${item.name}`} aria-pressed={active === index} onClick={() => select(index)}><span /></button>)}
          </div>
        </div>
        <p className="sr-only" id="collection-keyboard-help">Use the arrow keys to browse. Automatic rotation pauses on hover or focus. Press Space while this carousel is focused to pause or resume rotation.</p>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</p>
      </div>
      <p className="range-join">A little preview of what’s inside.
        <button type="button" className="text-link" onClick={() => openAuth('signup')}>Sign up to explore <Icon name="arrow" /></button>
      </p>
    </section>
  );
}
