import React from 'react';

// The same inline SVG drawings as the supplied HIDI landing page.
const drawings = {
  plus: <><path d="M12 5v14M5 12h14" /></>,
  search: <><circle cx="10.75" cy="10.75" r="7.5" /><path d="m16.2 16.2 4.6 4.6" /></>,
  user: <><circle cx="12" cy="7" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
  arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
  phone: <><rect height="20" rx="2" width="12" x="6" y="2" /><path d="M10 5h4M11 18h2" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  down: <><path d="M12 4v16m-6-6 6 6 6-6" /></>,
  play: <><path d="m9 5 11 7-11 7z" /></>,
  icon7: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></>,
  heart: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /></>,
  sparkle: <><path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7z" /></>,
  chevronLeft: <><path d="m15 5-7 7 7 7" /></>,
  chevronRight: <><path d="m9 5 7 7-7 7" /></>,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  leaf: <><path d="M20 3C6 2 1 8 5 16s17 2 15-13Z" /><path d="M3 21 16 8m-7 7v-5m0 5h5" /></>,
  bag: <><path d="M5 7h14l2 14H3zM8 8V6a4 4 0 0 1 8 0v2" /></>,
  icon15: <><path d="M3 10a9 9 0 0 1 15-6l3 3M21 2v5h-5M21 14a9 9 0 0 1-15 6l-3-3M3 22v-5h5" /></>,
  icon16: <><path d="M4 14v-3a8 8 0 0 1 16 0v3M20 17v2a2 2 0 0 1-2 2h-4" /><rect height="7" rx="2" width="4" x="2" y="11" /><rect height="7" rx="2" width="4" x="18" y="11" /></>,
  instagram: <><rect height="18" rx="5" width="18" x="3" y="3" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>,
  facebook: <><path d="M14 22v-9h3l.5-4H14V7c0-1 .3-2 2-2h2V1h-3c-4 0-5 3-5 6v2H7v4h3v9" /></>,
  x: <><path d="M4 3h4l12 18h-4zM20 3 4 21" /></>,
  youtube: <><rect height="14" rx="4" width="20" x="2" y="5" /><path d="m10 9 5 3-5 3z" /></>,
  close: <><path d="m6 6 12 12M6 18 18 6" /></>,
  back: <><path d="M20 12H5m6-7-7 7 7 7" /></>,
};

export default function Icon({ name, className = '', ...props }) {
  return (
    <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" {...props}>
      {drawings[name] || drawings.arrow}
    </svg>
  );
}
