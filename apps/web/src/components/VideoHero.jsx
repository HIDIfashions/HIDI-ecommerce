import React, { useCallback, useEffect, useRef, useState } from 'react';
import { asset, safeWebUrl } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import { topPicks } from '../data/topPicks.js';
import { useReducedMotion } from '../hooks/useMediaQuery.js';
import { useDocumentVisible, useInView } from '../hooks/useVisibility.js';
import Icon from './Icon.jsx';

export default function VideoHero() {
  const { openCollection, dialogOpen } = useHidi();
  const reduced = useReducedMotion();
  const pageVisible = useDocumentVisible();
  const heroRef = useRef(null);
  const slideTimerRef = useRef(null);
  const heroVisible = useInView(heroRef);
  const [liveHero, setLiveHero] = useState(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [previousSlide, setPreviousSlide] = useState(null);
  const [slideAnimating, setSlideAnimating] = useState(false);

  const advanceSlide = useCallback(() => {
    if (slideAnimating || topPicks.length < 2) return;
    window.clearTimeout(slideTimerRef.current);
    setActiveSlide((current) => {
      setPreviousSlide(current);
      setSlideAnimating(true);
      slideTimerRef.current = window.setTimeout(() => {
        setPreviousSlide(null);
        setSlideAnimating(false);
      }, 980);
      return (current + 1) % topPicks.length;
    });
  }, [slideAnimating]);

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

  useEffect(() => () => window.clearTimeout(slideTimerRef.current), []);

  useEffect(() => {
    if (liveHero || reduced || dialogOpen || !heroVisible || !pageVisible || topPicks.length < 2) return undefined;
    const timer = window.setTimeout(advanceSlide, 5400);
    return () => window.clearTimeout(timer);
  }, [activeSlide, advanceSlide, dialogOpen, heroVisible, liveHero, pageVisible, reduced]);

  return (
    <section ref={heroRef} className="hero hero--campaign" aria-labelledby="hero-title">
      <div className="hero-media" aria-hidden="true">
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
        ) : (
          <div className="hero-editorial-slider" data-animating={slideAnimating || undefined}>
            {topPicks.map((item, index) => {
              const current = index === activeSlide;
              const exiting = index === previousSlide;
              const slideClass = [
                'hero-drop-slide',
                `hero-drop-slide--${item.id}`,
                current && previousSlide === null ? 'is-current' : '',
                current && previousSlide !== null ? 'is-next is-active' : '',
                exiting ? 'is-current move-down' : '',
                !current && !exiting ? 'is-next' : '',
              ].filter(Boolean).join(' ');

              return (
                <div className={slideClass} key={item.id}>
                  <img className="hero-slide-backdrop" src={asset(item.image)} alt="" aria-hidden="true" />
                  <img className="hero-slide-model" src={asset(item.image)} alt="" width="1024" height="1536"
                    loading={index < 2 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="hero-shade" />
      <h1 id="hero-title" className="sr-only">HIDI — Wear the feeling. Indian wear for work, everyday and occasions.</h1>
      <div className="campaign-hero-action">
        <button type="button" className="campaign-shop-button" onClick={() => openCollection()}>Shop Now</button>
      </div>
      {!liveHero && (
        <button type="button" className="hero-slide-control" onClick={advanceSlide} disabled={slideAnimating}
          aria-label="Show next HIDI hero look">
          <Icon name="down" />
        </button>
      )}
    </section>
  );
}
