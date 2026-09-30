import React, { useEffect, useRef, useState } from 'react';
import { asset } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import { useMediaQuery, useReducedMotion } from '../hooks/useMediaQuery.js';
import { useDocumentVisible, useInView } from '../hooks/useVisibility.js';

/** Use first-frame posters extracted from the actual, corresponding MP4s.
 * The garden catalogue photograph is NOT the desktop video's loading screen.
 * Source-specific readiness prevents an old decoded frame appearing on resize.
 */
export default function VideoHero() {
  const { openCollection, dialogOpen } = useHidi();
  const mobile = useMediaQuery('(max-width: 700px)');
  const reduced = useReducedMotion();
  const pageVisible = useDocumentVisible();
  const videoRef = useRef(null);
  const heroRef = useRef(null);
  const heroVisible = useInView(heroRef);
  const [userPaused, setUserPaused] = useState(() => reduced || Boolean(navigator.connection?.saveData));
  const [playing, setPlaying] = useState(false);
  const [readySource, setReadySource] = useState('');
  const [retry, setRetry] = useState(0);
  const variant = mobile ? 'mobile' : 'desktop';
  const source = asset(`video/hidi-hero-${variant}-luminous-v1.mp4`);
  const poster = asset(`images/hero-${variant}-luminous-first-frame-v1.webp`);
  const ready = readySource === source;
  const shouldPlay = !userPaused && heroVisible && pageVisible && !dialogOpen;

  useEffect(() => {
    setUserPaused(reduced || Boolean(navigator.connection?.saveData));
  }, [reduced]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let cancelled = false;
    let videoFrame = null;
    let animationFrame = 0;
    setPlaying(false);
    const reveal = () => {
      if (!cancelled && video.readyState >= 2 && video.videoWidth > 0) setReadySource(source);
    };
    // Register after data arrives, not before src/load(): loading a new source
    // can discard an earlier callback. Keep an older-engine paint fallback too.
    const queueFrame = () => {
      if (video.readyState < 2) return;
      if (typeof video.requestVideoFrameCallback === 'function') {
        if (videoFrame !== null) video.cancelVideoFrameCallback?.(videoFrame);
        videoFrame = video.requestVideoFrameCallback(() => { videoFrame = null; reveal(); });
      }
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = window.requestAnimationFrame(() => {
          // Fully transparent videos may have compositor callbacks suppressed.
          // Playback + HAVE_CURRENT_DATA confirms a decoded frame still exists.
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
  }, [source, retry]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let cancelled = false;
    if (!shouldPlay) { video.pause(); return undefined; }
    video.muted = true;
    video.defaultMuted = true;
    if (video.getAttribute('src') !== source || video.error) {
      video.src = source;
      video.load();
    }
    // Failure leaves the matching poster and the existing manual play action.
    video.play().catch(() => { if (!cancelled) setPlaying(false); });
    return () => { cancelled = true; video.pause(); };
  }, [source, shouldPlay, retry]);


  return (
    <section ref={heroRef} className="hero hero--campaign" aria-labelledby="hero-title">
      <div className="hero-media" aria-hidden="true" data-frame-ready={ready}>
        <picture>
          <source media="(max-width: 700px)" srcSet={asset('images/hero-mobile-luminous-first-frame-v1.webp')} />
          <img className="hero-poster" src={asset('images/hero-desktop-luminous-first-frame-v1.webp')}
            alt="" width="1920" height="1080" loading="eager" fetchpriority="high" />
        </picture>
        <video key={source} ref={videoRef} id="hero-video" className={`hero-video${ready ? ' is-ready' : ''}`}
          poster={poster} loop muted playsInline preload={shouldPlay ? 'auto' : 'none'} tabIndex={-1}
          onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onError={() => { setReadySource(''); setPlaying(false); }} />
      </div>
      <div className="hero-shade" />
      <h1 id="hero-title" className="sr-only">HIDI — Wear the feeling. Indian wear for work, everyday and occasions.</h1>
      <div className="campaign-hero-action">
        <button type="button" className="campaign-shop-button" onClick={() => openCollection()}>Shop Now</button>
      </div>
    </section>
  );
}
