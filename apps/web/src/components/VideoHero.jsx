import React, { useEffect, useRef, useState } from 'react';
import { asset, safeWebUrl } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import { useReducedMotion } from '../hooks/useMediaQuery.js';
import { useDocumentVisible, useInView } from '../hooks/useVisibility.js';

const HERO_SLIDES = [
  {
    desktop: 'images/hidi-premium-ai-full-banner-lossless.png',
    mobile: 'images/hidi-premium-ai-full-banner-lossless.png',
    className: 'hero-drop-slide--banner',
  },
  {
    desktop: 'images/hidi-cinematic-dupatta-model.webp',
    mobile: 'images/hero-portrait.webp',
    className: 'hero-drop-slide--dupatta',
  },
];

const SLIDE_INTERVAL_MS = 3600;
const SLIDE_TRANSITION_MS = 1200;

export default function VideoHero() {
  const { openCollection, dialogOpen } = useHidi();
  const reduced = useReducedMotion();
  const pageVisible = useDocumentVisible();
  const heroRef = useRef(null);
  const heroVisible = useInView(heroRef);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liveHero, setLiveHero] = useState(null);
  const [outgoingIndex, setOutgoingIndex] = useState(null);
  const [incomingIndex, setIncomingIndex] = useState(null);
  const animating = outgoingIndex !== null && incomingIndex !== null;
  const canAdvance = !liveHero && HERO_SLIDES.length > 1 && !reduced && heroVisible && pageVisible && !dialogOpen;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/hidi/hero-config', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => {
        if (!value?.active || !['image', 'video'].includes(value.type)) return;
        const url = safeWebUrl(value.url);
        if (!url) return;
        setLiveHero({
          type: value.type,
          url,
          desktopPosition: typeof value.desktopPosition === 'string' ? value.desktopPosition : '50% 50%',
          mobilePosition: typeof value.mobilePosition === 'string' ? value.mobilePosition : '50% 50%',
        });
      })
      .catch((error) => { if (error?.name !== 'AbortError') setLiveHero(null); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!canAdvance || animating) return undefined;

    const timer = window.setTimeout(() => {
      setOutgoingIndex(currentIndex);
      setIncomingIndex((currentIndex + 1) % HERO_SLIDES.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [animating, canAdvance, currentIndex]);

  useEffect(() => {
    if (!animating || incomingIndex === null) return undefined;

    const timer = window.setTimeout(() => {
      setCurrentIndex(incomingIndex);
      setOutgoingIndex(null);
      setIncomingIndex(null);
    }, SLIDE_TRANSITION_MS + 120);

    return () => window.clearTimeout(timer);
  }, [animating, incomingIndex]);

  useEffect(() => {
    if (!reduced) return;
    setOutgoingIndex(null);
    setIncomingIndex(null);
  }, [reduced]);

  const finishTransition = (index) => {
    if (index !== incomingIndex) return;
    setCurrentIndex(index);
    setOutgoingIndex(null);
    setIncomingIndex(null);
  };

  const slideClassName = (index, slide) => {
    const classes = ['hero-drop-slide', slide.className];

    if (index === currentIndex && !animating) classes.push('is-current');
    if (index === outgoingIndex) classes.push('is-current', 'move-down');
    if (index === incomingIndex) classes.push('is-next', 'is-active');
    if (index !== currentIndex && index !== outgoingIndex && index !== incomingIndex) classes.push('is-next');

    return classes.join(' ');
  };

  return (
    <section ref={heroRef} className="hero hero--campaign" aria-labelledby="hero-title">
      <div className="hero-media hero-drop-slider" aria-hidden="true">
        {liveHero ? (liveHero.type === 'video' ?
          <video
            className="hero-live-media"
            src={liveHero.url}
            autoPlay={!reduced}
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setLiveHero(null)}
            style={{ '--hero-position-desktop': liveHero.desktopPosition, '--hero-position-mobile': liveHero.mobilePosition }}
          /> :
          <img
            className="hero-live-media"
            src={liveHero.url}
            alt=""
            loading="eager"
            fetchPriority="high"
            onError={() => setLiveHero(null)}
            style={{ '--hero-position-desktop': liveHero.desktopPosition, '--hero-position-mobile': liveHero.mobilePosition }}
          />
        ) : HERO_SLIDES.map((slide, index) => (
          <picture
            key={slide.desktop}
            className={slideClassName(index, slide)}
            onTransitionEnd={(event) => {
              if (event.propertyName === 'transform' && event.currentTarget === event.target) {
                finishTransition(index);
              }
            }}
          >
            <source media="(max-width: 700px)" srcSet={asset(slide.mobile)} />
            <img
              src={asset(slide.desktop)}
              alt=""
              width="1920"
              height="1080"
              loading="eager"
              fetchPriority={index === 0 ? 'high' : 'low'}
            />
          </picture>
        ))}
      </div>
      <div className="hero-shade" />
      <h1 id="hero-title" className="sr-only">HIDI — Wear the feeling. Indian wear for work, everyday and occasions.</h1>
      <div className="campaign-hero-action">
        <button type="button" className="campaign-shop-button" onClick={() => openCollection()}>Shop Now</button>
      </div>
    </section>
  );
}
