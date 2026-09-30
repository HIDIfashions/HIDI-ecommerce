import React from 'react';
import Icon from './Icon.jsx';
import Newsletter from './Newsletter.jsx';
import StoreIcons from './StoreIcons.jsx';
import { asset } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';

export default function Footer() {
  const { openAuth, openCollection, openApp, openPolicy, openSocial, homeHref, onHome } = useHidi();
  return (
    <footer className="site-footer" id="footer">
    <div className="footer-pattern" aria-hidden="true">
    </div>
    <div className="container footer-grid">
    <div className="footer-brand">
    <a href={homeHref} onClick={onHome} aria-label="HIDI home">
    <img className="brand-logo" src={asset("images/hidi-logo.png")} width="265" height="139" alt="HIDI — Wear the feeling" />
    </a>
    <p>Indian wear with a calm point of view — made for work, everyday life and the moments in between.</p>
    <span className="footer-signature">Wear the feeling.</span>
    <button className="footer-app-download" type="button" onClick={openApp}
      aria-label="Get the HIDI app for Android or iPhone" aria-haspopup="dialog" aria-controls="hidi-dialog">
      <StoreIcons />
      <span className="footer-app-download-label">Get the App</span>
    </button>
    <div className="social-links" aria-label="HIDI social channels">
    <button className="social-link" aria-label="HIDI Instagram" onClick={() => openSocial("instagram")} type="button">
    <Icon name="instagram" />
    </button>
    <button className="social-link" aria-label="HIDI Facebook" onClick={() => openSocial("facebook")} type="button">
    <Icon name="facebook" />
    </button>
    <button className="social-link" aria-label="HIDI X" onClick={() => openSocial("x")} type="button">
    <Icon name="x" />
    </button>
    <button className="social-link" aria-label="HIDI Youtube" onClick={() => openSocial("youtube")} type="button">
    <Icon name="youtube" />
    </button>
    </div>
    </div>
    <div className="footer-column">
    <h3>Collections</h3>
    <button onClick={() => openCollection('new-arrivals')} type="button">New Arrivals</button>
    <button onClick={() => openCollection('work-edit')} type="button">Work Edit</button>
    <button onClick={() => openCollection('everyday')} type="button">Everyday</button>
    <button onClick={() => openCollection('occasion')} type="button">Occasion</button>
    <button onClick={() => openCollection()} type="button">Shop All</button>
    </div>
    <div className="footer-column">
    <h3>Discover</h3>
    <a href="/about">Meet HIDI</a>
    <a href="/collections/all">Our range</a>
    <a href="/lookbook">The HIDI edit</a>
    <button onClick={() => openAuth("signin", "")} type="button">My account</button>
    </div>
    <div className="footer-column">
    <h3>Here to help</h3>
    <button onClick={() => openPolicy("shipping")} type="button">Shipping</button>
    <button onClick={() => openPolicy("returns")} type="button">Returns &amp; exchanges</button>
    <button onClick={() => openPolicy("privacy")} type="button">Privacy policy</button>
    <button onClick={() => openPolicy("terms")} type="button">Terms of use</button>
    <button onClick={() => openPolicy("contact")} type="button">Contact HIDI</button>
    </div>
    <div className="footer-column footer-stay">
    <h3>Stay close</h3>
    <p>New edits, familiar favourites and a little HIDI in your day.</p>
    <Newsletter />
    <span className="footer-motto">GOOD CLOTHES. BRIGHTER DAYS.</span>
    </div>
    </div>
    <div className="container footer-bottom">
    <p>© <span>{new Date().getFullYear()}</span> HIDI. All rights reserved.</p>
    <span>Indian wear. Entirely you.</span>
    <a href="#top">Back to top <Icon name="down" className="up-arrow" />
    </a>
    </div>
    </footer>
  );
}
