import React, { useEffect, useRef, useState } from 'react';
import { asset, safeWebUrl } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import { useMediaQuery, useReducedMotion } from '../hooks/useMediaQuery.js';
import { useDocumentVisible, useInView } from '../hooks/useVisibility.js';

function saveDataEnabled() {
  return typeof navigator !== 'undefined' && Boolean(navigator.connection?.saveData);
}

export default function VideoHero() {
  const { openCollection, dialogOpen } = useHidi();
  const mobile = useMediaQuery('(max-width: 700px)');
  const reduced = useReducedMotion();
  const pageVisible = useDocumentVisible();
  const videoRef = useRef(null);
  const heroRef = useRef(null);
  const heroVisible = useInView(heroRef);
  const [userPaused, setUserPaused] = useState(() => reduced || saveDataEnabled());
  const [readySource, setReadySource] = useState('');
  const [liveHero, setLiveHero] = useState(null);
  const variant = mobile ? 'mobile' : 'desktop';
  const source = asset(`video/hidi-hero-${variant}-luminous-v1.mp4`);
  const poster = asset(`images/hero-${variant}-luminous-first-frame-v1.webp`);
  const ready = readySource === source;
  const shouldPlay = !liveHero && !userPaused && heroVisible && pageVisible && !dialogOpen;

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
    setUserPaused(reduced || saveDataEnabled());
  }, [reduced]);

  useEffect(() => {
    if (liveHero) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    let cancelled = false;
    let videoFrame = null;
    let animationFrame = 0;

    const reveal = () => {
      if (!cancelled && video.readyState >= 2 && video.videoWidth > 0) setReadySource(source);
    };

    const queueFrame = () => {
      if (video.readyState < 2) return;
      if (typeof video.requestVideoFrameCallback === 'function') {
        if (videoFrame !== null) video.cancelVideoFrameCallback?.(videoFrame);
        videoFrame = video.requestVideoFrameCallback(() => {
          videoFrame = null;
          reveal();
        });
      }
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = window.requestAnimationFrame(() => {
          if (videoFrame === null || !video.paused || video.currentTime > 0) reveal();
        });
      });
    };

    video.addEventListener('loadeddata', queueFrame);
    video.addEventListener('playing', queueFrame);
    if (video.readyState >= 2) queueFrame();

    return () => {
      cancelled = true;
      if (videoFrame !== null) video.cancelVideoFrameCallback?.(videoFrame);
      window.cancelAnimationFrame(animationFrame);
      video.removeEventListener('loadeddata', queueFrame);
      video.removeEventListener('playing', queueFrame);
    };
  }, [liveHero, source]);

  useEffect(() => {
    if (liveHero) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    let cancelled = false;
    if (!shouldPlay) {
      video.pause();
      return undefined;
    }

    video.muted = true;
    video.defaultMuted = true;
    if (video.getAttribute('src') !== source || video.error) {
      video.src = source;
      video.load();
    }
    video.play().catch(() => {
      if (!cancelled) setReadySource('');
    });

    return () => {
      cancelled = true;
      video.pause();
    };
  }, [liveHero, shouldPlay, source]);

  return (
    <section ref={heroRef} className="hero hero--campaign" aria-labelledby="hero-title">
      <div className="hero-media" aria-hidden="true" data-frame-ready={ready || undefined}>
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
          <>
            <picture>
              <source media="(max-width: 700px)" srcSet={asset('images/hero-mobile-luminous-first-frame-v1.webp')} />
              <img
                className="hero-poster"
                src={asset('images/hero-desktop-luminous-first-frame-v1.webp')}
                alt=""
                width="1920"
                height="1080"
                loading="eager"
                fetchPriority="high"
              />
            </picture>
            <video
              key={source}
              ref={videoRef}
              id="hero-video"
              className={`hero-video${ready ? ' is-ready' : ''}`}
              poster={poster}
              loop
              muted
              playsInline
              preload={shouldPlay ? 'auto' : 'none'}
              tabIndex={-1}
              onError={() => {
                setReadySource('');
                setUserPaused(true);
              }}
            />
          </>
        )}
      </div>
      <div className="hero-shade" />
      <h1 id="hero-title" className="sr-only">HIDI — Wear the feeling. Indian wear for work, everyday and occasions.</h1>
      <div className="campaign-hero-action">
        <button type="button" className="campaign-shop-button" onClick={() => openCollection()}>Shop Now</button>
      </div>
    </section>
  );
}
