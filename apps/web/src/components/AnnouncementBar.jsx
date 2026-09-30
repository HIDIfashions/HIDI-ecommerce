import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { config } from '../config.js';
import { useReducedMotion } from '../hooks/useMediaQuery.js';
import { useDocumentVisible, useInView } from '../hooks/useVisibility.js';
import { useHidi } from '../context/HidiContext.jsx';
import Icon from './Icon.jsx';

const defaults = [
  'Complimentary shipping on ₹1,499 and above',
  'Easy exchange within 7 days',
  '100% secure payments',
];

/** Seamless duplicated track; screen readers hear the three messages only once.
 * Speed is measured in pixels/second, so it stays calm at different widths.
 */
export default function AnnouncementBar() {
  const configured = config.announcement?.messages;
  const messages = Array.isArray(configured) && configured.length > 0
    ? configured.filter((message) => typeof message === 'string' && message.trim())
    : defaults;
  const content = messages.length ? messages : defaults;
  const reduced = useReducedMotion();
  const documentVisible = useDocumentVisible();
  const { dialogOpen } = useHidi();
  const region = useRef(null);
  const group = useRef(null);
  const visible = useInView(region);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [duration, setDuration] = useState(76);
  useEffect(() => { setPaused(reduced); }, [reduced]);
  useLayoutEffect(() => {
    const measure = () => {
      const speed = Math.max(16, Math.min(60, Number(config.announcement?.pixelsPerSecond) || 28));
      if (group.current) setDuration(group.current.getBoundingClientRect().width / speed);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (group.current) observer.observe(group.current);
    return () => observer.disconnect();
  }, []);
  const stopped = paused || hovered || reduced || !visible || !documentVisible || dialogOpen;
  return (
    <aside className={`announcement-bar${reduced ? ' is-reduced' : ''}`} ref={region}
      aria-label="HIDI shopping benefits">
      <p className="sr-only">{content.join('. ')}.</p>
      <div className="announcement-window" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <div className="announcement-track" aria-hidden="true"
          style={{ '--marquee-duration': `${duration}s`, animationPlayState: stopped ? 'paused' : 'running' }}>
          {[0, 1].map((copy) => <div className="announcement-group" key={copy} ref={copy === 0 ? group : null}>
            {[0, 1].map((repeat) => content.map((message, index) =>
              <span className="announcement-item" key={`${repeat}-${index}`}>
                <span className="announcement-star">✦</span>{message}
              </span>))}
          </div>)}
        </div>
      </div>
      {!reduced && <button type="button" className="announcement-toggle"
        aria-label={paused ? 'Play announcement scrolling' : 'Pause announcement scrolling'}
        aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
        <Icon name={paused ? 'play' : 'pause'} />
      </button>}
    </aside>
  );
}
