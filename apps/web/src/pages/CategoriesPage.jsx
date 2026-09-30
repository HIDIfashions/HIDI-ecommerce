import React from 'react';
import { asset, officialUrl } from '../config.js';
import { collections } from '../data/collections.js';
import { useHidi } from '../context/HidiContext.jsx';
import Icon from '../components/Icon.jsx';

export default function CategoriesPage({ selectedEdit = '' }) {
  const { openApp, homeHref, onHome } = useHidi();
  return <>
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href={homeHref} onClick={onHome} aria-label="HIDI home"><img className="brand-logo" src={asset('images/hidi-logo.png')} width="265" height="139" alt="HIDI — Wear the feeling" /></a>
        <a className="back-link" href={homeHref} onClick={onHome}><Icon name="back" /> Back to HIDI</a>
        <button type="button" className="button button--header button--small" onClick={openApp}><Icon name="phone" /> Get App</button>
      </div>
    </header>
    <main id="main" className="category-main container" tabIndex={-1}>
      <p className="preview-notice">DESIGN PREVIEW · No account has been created. Authentication and the product catalogue are not connected.</p>
      <div className="category-heading">
        <p className="eyebrow">WELCOME TO YOUR HIDI</p><h1>Find your kind<br />of <em>lovely.</em></h1>
        <p>From the everyday to the unforgettable.<br />Choose the edit that feels like you.</p>
        {selectedEdit && <p className="category-selection" role="status">Your selected edit: {selectedEdit}</p>}
      </div>
      <div className="category-grid">
        {collections.slice(0, 4).map((item) => <a key={item.id} className="category-tile" href={officialUrl} target="_blank" rel="noopener noreferrer">
          <div><img src={asset(item.image)} width="355" height="593" alt={item.alt} loading="lazy" /></div>
          <span className="eyebrow">{item.description}</span><h2>{item.name}<Icon name="arrow" /></h2>
          <p>Continue to the current HIDI website</p>
        </a>)}
      </div>
      <p className="category-end">Wear the feeling. <a className="text-link" href={homeHref} onClick={onHome}>Back to the HIDI story <Icon name="arrow" /></a></p>
    </main>
  </>;
}
