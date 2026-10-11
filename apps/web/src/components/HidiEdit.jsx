import React from 'react';
import { landingImageProps, useLandingMedia } from '../context/LandingMediaContext.jsx';
import '../styles/next-chapter.css';

export default function HidiEdit() {
  const landingMedia = useLandingMedia();
  const [chapter, setChapter] = React.useState('everyday');
  const [paused, setPaused] = React.useState(false);
  const [motionAllowed, setMotionAllowed] = React.useState(false);
  const [readySource, setReadySource] = React.useState('');
  const [failedSource, setFailedSource] = React.useState('');
  const sectionRef = React.useRef(null);
  const chapters = [
    { id: 'everyday', label: 'Everyday', description: 'Little plans. Beautiful everyday moments.', action: 'Explore casual wear', href: '/collections/casual-wear' },
    { id: 'work', label: 'Work', description: 'New ambitions. Your own way forward.', action: 'Explore workwear', href: '/collections/work-wear' },
    { id: 'celebrations', label: 'Celebrations', description: 'Your people. Your moments. Your celebrations.', action: 'Explore occasion wear', href: '/collections/occasional-wear' },
  ];
  const current = chapters.find(item => item.id === chapter) || chapters[0];
  const banner = landingImageProps(
    landingMedia,
    'hidi-edit-banner',
    'images/hidi-premium-ai-full-banner-lossless.png',
    'Four views of a HIDI ivory kurta with blue embroidery in a sunlit courtyard',
  );
  const slot = landingMedia['hidi-edit-banner'];
  const position = value => {
    const match = /^(\d{1,3})%\s+(\d{1,3})%$/.exec(value || '');
    // Frame the model on the right of a landscape image. Explicit Admin
    // focal-point settings still take precedence over the neutral default.
    return !match || value === '50% 50%' ? '72% 50%' : value;
  };
  const desktopPosition = position(slot?.desktopPosition);
  const mobilePosition = position(slot?.mobilePosition);
  const drift = value => {
    const [x, y] = value.split(' ');
    return `${Math.min(100, parseInt(x, 10) + 2)}% ${y}`;
  };
  const ready = Boolean(banner.src && readySource === banner.src && failedSource !== banner.src);
  const playing = ready && motionAllowed && !paused && slot?.fitMode !== 'contain';

  React.useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = !('IntersectionObserver' in window);
    const update = () => setMotionAllowed(visible && !document.hidden && !reduced.matches && !navigator.connection?.saveData);
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    }, { threshold: 0.05 }) : null;
    if (sectionRef.current) observer?.observe(sectionRef.current);
    reduced.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    navigator.connection?.addEventListener?.('change', update);
    update();
    return () => {
      observer?.disconnect();
      reduced.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      navigator.connection?.removeEventListener?.('change', update);
    };
  }, []);

  return (
    <section ref={sectionRef} className="edit-section edit-section--campaign next-chapter" id="hidi-edit" aria-labelledby="edit-title" aria-busy={landingMedia.status === 'loading'} data-landing-config-status={landingMedia.status}>
      <div className="edit-campaign next-chapter__frame">
        <div className="next-chapter__copy">
          <p className="next-chapter__eyebrow">JUST KEEP GOING</p>
          <h2 id="edit-title">For wherever<br />you go <em>next.</em></h2>
          <p className="next-chapter__intro">A new beginning. A familiar day.<br />A moment that’s yours.</p>
          <p className="next-chapter__prompt">Where will today take you?</p>
          <div className="next-chapter__choices" role="group" aria-label="Choose your next chapter">
            {chapters.map(item => <button key={item.id} type="button" aria-pressed={chapter === item.id} onClick={() => setChapter(item.id)}>{item.label}</button>)}
          </div>
          <p className="next-chapter__description" aria-live="polite" aria-atomic="true">{current.description}</p>
          <a className="next-chapter__link" href={current.href}>{current.action} <span aria-hidden="true">↗</span></a>
          {ready && slot?.fitMode !== 'contain' && <button className="next-chapter__motion" type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Resume photo motion' : 'Pause photo motion'}</button>}
        </div>
        {banner.src && failedSource !== banner.src ? <img
          {...banner}
          className="next-chapter__photo"
          alt={banner.alt}
          width="5460"
          height="2048"
          loading="lazy"
          decoding="async"
          data-photo-ready={ready || undefined}
          data-photo-motion={playing ? 'playing' : 'paused'}
          onLoad={event => {
            const image = event.currentTarget;
            const selectedUrl = banner.src;
            image.decode().then(() => { if (image.isConnected) setReadySource(selectedUrl); }).catch(() => { if (image.isConnected) setFailedSource(selectedUrl); });
          }}
          onError={() => setFailedSource(banner.src)}
          style={{ ...banner.style, '--chapter-position-desktop': desktopPosition, '--chapter-position-mobile': mobilePosition, '--chapter-drift-desktop': drift(desktopPosition), '--chapter-drift-mobile': drift(mobilePosition) }}
        /> : <div className="next-chapter__placeholder" role="img" aria-label={landingMedia.status === 'loading' ? 'Loading HIDI photograph' : 'HIDI photograph unavailable'} />}
      </div>
      <div className="next-chapter__signoff"><p>Every chapter begins with a little courage.</p><p>Your path. Your pace. Your HIDI.</p></div>
    </section>
  );
}
