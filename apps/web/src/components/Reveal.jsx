import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks/useMediaQuery.js';

/** Adds no wrapper: rendered tags and CSS layout match the original ZIP. */
export default function Reveal({ as: Tag = 'div', className = '', children, ...props }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const supported = 'IntersectionObserver' in window;
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || reduced || !supported) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true);
        observer.disconnect();
      }
    }, { threshold: 0.09, rootMargin: '0px 0px -15px 0px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [seen, reduced, supported]);
  const motionClass = reduced || !supported ? '' : `will-reveal${seen ? ' is-visible' : ''}`;
  return <Tag ref={ref} className={`${className} ${motionClass}`.trim()} data-reveal="" {...props}>{children}</Tag>;
}
