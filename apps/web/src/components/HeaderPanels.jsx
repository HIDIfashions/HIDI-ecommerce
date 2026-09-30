import React, { useState } from 'react';
import { asset } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import { collections } from '../data/collections.js';
import Icon from './Icon.jsx';

export function SearchPanel({ onClose }) {
  const { openAuth } = useHidi();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase('en-IN');
  const results = collections.filter((item) => `${item.name} ${item.description} ${item.alt}`.toLocaleLowerCase('en-IN').includes(normalized));
  return <>
    <p className="eyebrow">FIND YOUR KIND OF HIDI</p>
    <h2 id="dialog-title">Discover the collections.</h2>
    <label htmlFor="header-search" className="campaign-search-label">Search collections</label>
    <div className="campaign-search-field"><Icon name="search" />
      <input id="header-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Try everyday, work or occasion" autoComplete="off" maxLength={100}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }} />
    </div>
    <p className="campaign-result-count" role="status">{results.length ? `${results.length} collection${results.length === 1 ? '' : 's'} to explore` : 'No matching collections. Try work, everyday or occasion.'}</p>
    <div className="campaign-search-results">
      {results.map((item) => <button type="button" key={item.id} className="campaign-search-result" onClick={() => openAuth('signup', item.name)}>
        <img src={asset(item.image)} alt="" width="52" height="66" />
        <span><strong>{item.name}</strong><small>{item.description}</small></span><Icon name="arrow" />
      </button>)}
    </div>
    <p className="campaign-panel-note">This preview searches HIDI’s collection names. Product search is not connected.</p>
  </>;
}

export function NavigationPanel({ onClose }) {
  const { openAuth, openApp, openPolicy } = useHidi();
  const visitSection = (event, id) => {
    event.preventDefault();
    onClose();
    window.requestAnimationFrame(() => {
      const section = document.getElementById(id);
      if (!section) return;
      const headerHeight = document.getElementById('site-header')?.getBoundingClientRect().height || 0;
      window.history.pushState(null, '', `#${id}`);
      window.scrollTo({ top: Math.max(0, window.scrollY + section.getBoundingClientRect().top - headerHeight - 18),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  };
  return <>
    <p className="eyebrow">WEAR THE FEELING</p><h2 id="dialog-title">The world of HIDI.</h2>
    <nav className="campaign-panel-nav" aria-label="Explore HIDI">
      <a href="#our-range" onClick={(event) => visitSection(event, 'our-range')}>Our collections <Icon name="arrow" /></a>
      <a href="#meet-hidi" onClick={(event) => visitSection(event, 'meet-hidi')}>Meet HIDI <Icon name="arrow" /></a>
      <a href="#hidi-edit" onClick={(event) => visitSection(event, 'hidi-edit')}>The occasion edit <Icon name="arrow" /></a>
    </nav>
    <div className="campaign-panel-links">
      <button type="button" onClick={() => openAuth('signin')}><Icon name="user" /> My account</button>
      <button type="button" onClick={() => openAuth('signup')}><Icon name="plus" /> Create an account</button>
      <button type="button" onClick={openApp}><Icon name="phone" /> Get the HIDI app</button>
      <button type="button" onClick={() => openPolicy('contact')}><Icon name="icon16" /> Contact HIDI</button>
    </div>
  </>;
}

export function BagPanel() {
  const { openAuth } = useHidi();
  return <>
    <p className="eyebrow">YOUR HIDI BAG</p><h2 id="dialog-title">Something to make yours.</h2>
    <p>Explore the collections and find your next HIDI look.</p>
    <div className="integration-note">The shopping bag and checkout are not connected in this standalone preview. No purchases or payments can be made here.</div>
    <button type="button" className="button button--burgundy" onClick={() => openAuth('signup')}>Explore HIDI <Icon name="arrow" /></button>
  </>;
}
