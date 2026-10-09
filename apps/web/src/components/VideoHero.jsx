import React, { useEffect, useRef, useState } from 'react';
import { asset, safeWebUrl } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import { useMediaQuery, useReducedMotion } from '../hooks/useMediaQuery.js';
import { useDocumentVisible, useInView } from '../hooks/useVisibility.js';
import useMediaSequence from '../hooks/useMediaSequence.js';
import MediaSequenceControls from './MediaSequenceControls.jsx';

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
  const [liveItems, setLiveItems] = useState([]);
  const [heroAutoPlay, setHeroAutoPlay] = useState(true);
  const [heroInterval, setHeroInterval] = useState(6);
  const [failedSource, setFailedSource] = useState('');
  const liveVideoRef = useRef(null);
  // Pending is NOT a request to display the previous built-in campaign.
  const [heroConfigStatus, setHeroConfigStatus] = useState('loading');
  const [liveReadySource, setLiveReadySource] = useState('');
  const [videoAllowed, setVideoAllowed] = useState(false);
  const variant = mobile ? 'mobile' : 'desktop';
  const source = asset(`video/hidi-hero-${variant}-luminous-v1.mp4`);
  const poster = asset(`images/hero-${variant}-luminous-first-frame-v1.webp`);
  const sequence = useMediaSequence({ items: liveItems, autoPlay: heroAutoPlay, intervalSeconds: heroInterval, readySource: liveReadySource, visible: heroVisible && pageVisible && !dialogOpen });
  const liveHero = liveItems[sequence.index] || null;
  const liveFailed = Boolean(liveHero && failedSource === liveHero.url);
  const showBundled = heroConfigStatus === 'bundled';
  const liveReady = Boolean(liveHero && liveReadySource === liveHero.url);
  const ready = showBundled && readySource === source;
  const shouldPlay = showBundled && videoAllowed && !userPaused && heroVisible && pageVisible && !dialogOpen;

  useEffect(() => {
    let disposed = false;
    let controller;
    let timeout;
    let retryTimer;
    let attempts = 0;

    const loadSelection = async () => {
      attempts += 1;
      controller = new AbortController();
      timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/hidi/hero-config', {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Hero configuration unavailable');
        const value = await response.json();
        if (disposed) return;
        if (value?.active === false && value?.source === 'bundled') {
          setHeroConfigStatus('bundled');
          return;
        }
        const url = value?.active === true && ['image', 'video'].includes(value.type)
          ? safeWebUrl(value.url) : '';
        if (!url) throw new Error('Invalid hero configuration');
        setLiveReadySource('');
        const items = (Array.isArray(value.items) && value.items.length ? value.items : [value]).map(item => ({
          type: item.type, url: safeWebUrl(item.url), assetId: item.assetId,
          desktopPosition: typeof item.desktopPosition === 'string' ? item.desktopPosition : '50% 50%',
          mobilePosition: typeof item.mobilePosition === 'string' ? item.mobilePosition : '50% 50%',
        })).filter(item => ['image', 'video'].includes(item.type) && item.url).slice(0, 20);
        if (!items.length) throw new Error('Invalid hero media list');
        setLiveItems(items);
        setHeroAutoPlay(value.autoPlay !== false);
        setHeroInterval(Math.max(3, Math.min(30, Number(value.intervalSeconds) || 6)));
        setHeroConfigStatus('uploaded');
      } catch {
        if (disposed) return;
        // A temporary error must never reveal the earlier campaign.
        if (attempts < 3) retryTimer = window.setTimeout(loadSelection, attempts * 500);
        else setHeroConfigStatus('error');
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

  useEffect(() => {
    setUserPaused(reduced || saveDataEnabled());
  }, [reduced]);

  useEffect(() => {
    if (!showBundled || reduced || saveDataEnabled()) {
      setVideoAllowed(false);
      return undefined;
    }

    setVideoAllowed(false);
    let idleId = null;
    const delay = mobile ? 300 : 1200;
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => setVideoAllowed(true), { timeout: 900 });
      } else {
        setVideoAllowed(true);
      }
    }, delay);

    return () => {
      window.clearTimeout(timer);
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [showBundled, mobile, reduced]);

  useEffect(() => {
    if (!showBundled) return undefined;
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
  }, [showBundled, source]);

  useEffect(() => {
    if (!showBundled) return undefined;
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
  }, [showBundled, shouldPlay, source]);

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return undefined;
    if (reduced || saveDataEnabled() || sequence.paused || !heroVisible || !pageVisible || dialogOpen) video.pause();
    else video.play().catch(() => {});
    return () => video.pause();
  }, [liveHero?.url, reduced, sequence.paused, heroVisible, pageVisible, dialogOpen]);

  const revealLiveVideo = (event) => {
    const video = event.currentTarget;
    if (video.readyState >= 2 && video.videoWidth > 0) setLiveReadySource(liveHero.url);
  };

  return (
    <section ref={heroRef} className="hero hero--campaign" aria-labelledby="hero-title" aria-busy={heroConfigStatus === 'loading'} {...sequence.handlers}>
      <div className="hero-media" aria-hidden="true" data-hero-config-status={liveFailed ? 'error' : heroConfigStatus} data-media-index={sequence.index} data-frame-ready={ready || liveReady || undefined}>
        {heroConfigStatus === 'uploaded' && liveHero && !liveFailed ? (liveHero.type === 'video' ?
          <video
            key={liveHero.url}
            className="hero-live-media"
            ref={liveVideoRef}
            src={liveHero.url}
            autoPlay={!reduced && !sequence.paused && heroVisible && pageVisible && !dialogOpen}
            muted
            loop={liveItems.length === 1}
            onEnded={sequence.ended}
            playsInline
            preload="auto"
            onLoadedData={revealLiveVideo}
            onCanPlay={revealLiveVideo}
            onError={() => setFailedSource(liveHero.url)}
            style={{ visibility: liveReady ? 'visible' : 'hidden', '--hero-position-desktop': liveHero.desktopPosition, '--hero-position-mobile': liveHero.mobilePosition }}
          /> :
          <img
            key={liveHero.url}
            className="hero-live-media"
            src={liveHero.url}
            alt=""
            loading="eager"
            fetchPriority="high"
            onLoad={(event) => {
              const image = event.currentTarget;
              const selectedUrl = liveHero.url;
              const show = () => { if (image.isConnected && image.naturalWidth > 0) setLiveReadySource(selectedUrl); };
              if (typeof image.decode === 'function') image.decode().then(show).catch(() => { if (image.isConnected) setFailedSource(selectedUrl); });
              else show();
            }}
            onError={() => setFailedSource(liveHero.url)}
            style={{ visibility: liveReady ? 'visible' : 'hidden', '--hero-position-desktop': liveHero.desktopPosition, '--hero-position-mobile': liveHero.mobilePosition }}
          />
        ) : showBundled ? (
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
        ) : null}
      </div>
      <div className="hero-shade" />
      <MediaSequenceControls items={liveItems} sequence={sequence} label="hero media" />
      <h1 id="hero-title" className="sr-only">HIDI — Wear the feeling. Indian wear for work, everyday and occasions.</h1>
      <div className="campaign-hero-action">
        <button type="button" className="campaign-shop-button" onClick={() => openCollection()}>Shop Now</button>
      </div>
    </section>
  );
}
