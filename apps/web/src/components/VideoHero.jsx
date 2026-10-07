import React, { useCallback, useEffect, useRef, useState } from 'react';
import { asset, safeWebUrl } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import { homepageHeroMedia } from '../data/homepageHeroMedia.js';
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
    if (slideAnimating || homepageHeroMedia.length < 2) return;
    window.clearTimeout(slideTimerRef.current);
    setActiveSlide((current) => {
      setPreviousSlide(current);
      setSlideAnimating(true);
      slideTimerRef.current = window.setTimeout(() => {
        setPreviousSlide(null);
        setSlideAnimating(false);
      }, 1120);
      return (current + 1) % homepageHeroMedia.length;
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
    if (liveHero || reduced || dialogOpen || !heroVisible || !pageVisible || homepageHeroMedia.length < 2) return undefined;
    const timer = window.setTimeout(advanceSlide, 5200);
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
          <div className="homepage-hero-media" data-animating={slideAnimating || undefined}>
            {homepageHeroMedia.map((item, index) => {
              const current = index === activeSlide;
              const exiting = index === previousSlide;
              const slideClass = [
                'homepage-hero-media__slide',
                current && previousSlide === null ? 'is-current' : '',
                current && previousSlide !== null ? 'is-next is-active' : '',
                exiting ? 'is-current move-down' : '',
                !current && !exiting ? 'is-next' : '',
              ].filter(Boolean).join(' ');

              return (
                <div
                  className={slideClass}
                  key={item.id}
                  style={{ '--look-tone': item.tone, '--look-bg': item.bg }}
                >
                  <div className="homepage-hero-media__wash" />
                  <img className="homepage-hero-media__backdrop" src={asset(item.image)} alt="" loading="lazy" decoding="async" />
                  <div className="homepage-hero-media__halo" />
                  <img
                    className="homepage-hero-media__model"
                    src={asset(item.image)}
                    alt=""
                    width="1024"
                    height="1536"
                    loading={index < 2 ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : 'auto'}
                    decoding="async"
                  />
                  <span className="sr-only">{item.label}</span>
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
        <button
          type="button"
          className="homepage-hero-media__next"
          onClick={advanceSlide}
          disabled={slideAnimating}
          aria-label="Show next Homepage Hero Media look"
        >
          <Icon name="down" />
        </button>
      )}
    </section>
  );
}
