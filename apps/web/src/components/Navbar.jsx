import React, { useEffect, useRef, useState } from 'react';
import { asset } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import Icon from './Icon.jsx';

/** Fixed, overlay header: transparent at the top, HIDI burgundy after scrolling.
 * Its height never changes, so the page and the centre logo cannot jump.
 * Menu/search/bag reuse the accessible dialog system rather than dead links.
 */
export default function Navbar() {
  const { openAuth, openBag, openWishlist, openNotice, dialogOpen, dialogType, homeHref, onHome } = useHidi();
  const [scrolled, setScrolled] = useState(() => window.scrollY > 48);
  const frame = useRef(0);
  useEffect(() => {
    const measure = () => {
      frame.current = 0;
      const y = Math.max(0, window.scrollY);
      setScrolled((previous) => previous ? y > 16 : y > 48);
    };
    const schedule = () => {
      if (!frame.current) frame.current = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('pageshow', schedule);
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame.current);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('pageshow', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  const solid = scrolled || dialogOpen;
  return (
    <header className={`site-header campaign-header${solid ? ' is-solid' : ''}`} id="site-header"
      data-header-state={solid ? 'solid' : 'transparent'}>
      <nav className="campaign-header-inner" aria-label="Main navigation">
        <div className="campaign-header-left">
          <div className="campaign-mobile-tools">
            <button type="button" className="campaign-icon" onClick={openBag} aria-label="Shopping bag"><Icon name="bag" /></button>
            <button type="button" className="campaign-icon" onClick={() => openNotice('search')} aria-label="Search HIDI products"><Icon name="search" /></button>
          </div>
        </div>
        <a className="campaign-brand" href={homeHref} onClick={onHome} aria-label="HIDI home">
          <img src={asset('images/hidi-logo.png')} width="265" height="139" alt="HIDI — Wear the feeling" />
        </a>
        <div className="campaign-header-right">
          <button type="button" className="campaign-icon campaign-desktop-tool" onClick={openWishlist} aria-label="Wishlist"><Icon name="heart" /></button>
          <button type="button" className="campaign-icon campaign-desktop-tool" onClick={openBag} aria-label="Shopping bag"><Icon name="bag" /></button>
          <button type="button" className="campaign-icon" onClick={() => openAuth('signin')} aria-label="My HIDI account"><Icon name="user" /></button>
          <button type="button" className="campaign-icon campaign-desktop-tool" onClick={() => openNotice('search')} aria-label="Search HIDI products"><Icon name="search" /></button>
          <button type="button" className="campaign-menu" aria-label="Open HIDI menu" aria-haspopup="dialog"
            aria-expanded={dialogType === 'navigation'} aria-controls="hidi-dialog" onClick={() => openNotice('navigation')}>
            <Icon name="menu" /><span>Menu</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
