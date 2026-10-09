import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { landingImageProps, useLandingMedia } from '../context/LandingMediaContext.jsx';
import { useMediaQuery, useReducedMotion } from '../hooks/useMediaQuery.js';
import { useDocumentVisible, useInView } from '../hooks/useVisibility.js';

const topPicks = [
  {
    name: 'Orange embroidered kurta set',
    slotId: 'ananya-orange',
    image: 'images/ananya-top-picks/ananya-orange.webp',
    accent: '#f05a25',
    tone: 'Festive orange',
  },
  {
    name: 'Pink embroidered dupatta set',
    slotId: 'ananya-pink',
    image: 'images/ananya-top-picks/ananya-pink.webp',
    accent: '#ef8fb3',
    tone: 'Soft occasion',
  },
  {
    name: 'Maroon festive kurta set',
    slotId: 'ananya-maroon',
    image: 'images/ananya-top-picks/ananya-maroon.webp',
    accent: '#8e1d3d',
    tone: 'Evening rich',
  },
  {
    name: 'Black embellished kurta set',
    slotId: 'ananya-black',
    image: 'images/ananya-top-picks/ananya-black.webp',
    accent: '#262c31',
    tone: 'Quiet statement',
  },
  {
    name: 'Olive green embroidered set',
    slotId: 'ananya-green',
    image: 'images/ananya-top-picks/ananya-green.webp',
    accent: '#58662f',
    tone: 'Everyday luxe',
  },
];

export default function MeetHidi() {
  const landingMedia = useLandingMedia();
  const sectionRef = useRef(null);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(null);
  const [interacting, setInteracting] = useState(false);
  const [landscapeSources, setLandscapeSources] = useState({});
  const touchLayout = useMediaQuery('(max-width: 700px), (pointer: coarse)');
  const reducedMotion = useReducedMotion();
  const visible = useInView(sectionRef);
  const documentVisible = useDocumentVisible();
  const activePick = topPicks[activeIndex];
  const fullPagePhoto = landscapeSources[activePick.slotId] === landingMedia[activePick.slotId]?.url && Boolean(landingMedia[activePick.slotId]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || touchLayout) return undefined;

    let frameId = 0;

    const syncPickToScroll = () => {
      frameId = 0;
      const scrollableDistance = Math.max(1, section.offsetHeight - window.innerHeight);
      const sectionTop = section.getBoundingClientRect().top;
      const progress = Math.min(Math.max(-sectionTop / scrollableDistance, 0), 1);
      const nextIndex = Math.min(topPicks.length - 1, Math.floor(progress * topPicks.length));

      if (nextIndex === activeIndexRef.current) return;
      setPreviousIndex(activeIndexRef.current);
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
    };

    const requestSync = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(syncPickToScroll);
    };

    syncPickToScroll();
    window.addEventListener('scroll', requestSync, { passive: true });
    window.addEventListener('resize', requestSync);

    return () => {
      window.removeEventListener('scroll', requestSync);
      window.removeEventListener('resize', requestSync);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [touchLayout]);

  useEffect(() => {
    if (!touchLayout || reducedMotion || !visible || !documentVisible || interacting) return undefined;
    const timer = window.setInterval(() => {
      const previous = activeIndexRef.current;
      const next = (previous + 1) % topPicks.length;
      setPreviousIndex(previous);
      activeIndexRef.current = next;
      setActiveIndex(next);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [touchLayout, reducedMotion, visible, documentVisible, interacting]);

  return (
    <section ref={sectionRef} className="meet-section meet-section--cinematic" id="meet-hidi" aria-labelledby="meet-title" style={{ '--pick-count': topPicks.length }}>
    <div className="container">
    <div className={`meet-cinematic${fullPagePhoto ? ' meet-cinematic--photo' : ''}`} style={{ '--pick-accent': activePick.accent }}>
    <p className="meet-cinematic__label">Ananya's pick</p>
    <div className="meet-cinematic__content">
    <h2 id="meet-title" className="sr-only">Ananya's pick</h2>
    <a className="button button--gold meet-cinematic__button" href="/collections/all">Shop now <Icon name="arrow" />
    </a>
    </div>
    <div className="meet-cinematic__stage" aria-live="polite">
    <div className="meet-cinematic__prism" aria-hidden="true" />
    <div className="meet-cinematic__tone" aria-hidden="true">
    <span>{activePick.tone}</span>
    <strong>{String(activeIndex + 1).padStart(2, '0')}</strong>
    </div>
    {topPicks.map((pick, index) => {
      const isActive = index === activeIndex;
      const isLeaving = index === previousIndex && index !== activeIndex;
      const slideState = isActive ? 'active' : isLeaving ? 'leaving' : 'waiting';
      const image = landingImageProps(landingMedia, pick.slotId, pick.image, pick.name);
      const isLandscapePhoto = landscapeSources[pick.slotId] === image.src;

      return (
        <div className={`meet-cinematic__slide is-${slideState}`} key={pick.name} style={{ '--pick-accent': pick.accent }} aria-hidden={!isActive}>
        <img className="meet-cinematic__model" {...image} data-ananya-layout={isLandscapePhoto ? 'photo' : 'portrait'} style={{ ...image.style, objectFit: isLandscapePhoto ? 'var(--ananya-photo-fit, cover)' : 'contain' }} alt={image.alt || pick.name} loading={index === 0 || isActive ? 'eager' : 'lazy'} decoding="async" onLoad={event => {
          const element = event.currentTarget;
          if (image['data-landing-media-slot'] && element.naturalWidth >= element.naturalHeight && element.naturalHeight > 0) {
            setLandscapeSources(current => current[pick.slotId] === image.src ? current : { ...current, [pick.slotId]: image.src });
          }
        }} />
        </div>
      );
    })}
    </div>
    <div className="meet-cinematic__scroll" aria-hidden={touchLayout ? undefined : true} onFocus={() => setInteracting(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}>
    <span className="meet-cinematic__count">{String(activeIndex + 1).padStart(2, '0')} / {String(topPicks.length).padStart(2, '0')}</span>
    <span className="meet-cinematic__scroll-track">
    {topPicks.map((pick, index) => (
      touchLayout ? <button type="button" className="meet-cinematic__pick-control" key={pick.name} aria-label={`Show ${pick.name}`} aria-pressed={index === activeIndex} onClick={() => { setPreviousIndex(activeIndexRef.current); activeIndexRef.current = index; setActiveIndex(index); }}><span className={`meet-cinematic__step ${index === activeIndex ? 'is-active' : ''}`} /></button> : <span className={`meet-cinematic__step ${index === activeIndex ? 'is-active' : ''}`} key={pick.name} />
    ))}
    </span>
    <span className="meet-cinematic__scroll-copy">Scroll down</span>
    </div>
    </div>
    </div>
    </section>
  );
}
