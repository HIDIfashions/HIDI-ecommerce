import React, { useState } from 'react';
import { asset } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import { collections } from '../data/collections.js';
import { collectionRoute } from '../routes.js';
import Icon from './Icon.jsx';

export function SearchPanel({ onClose }) {
  const { openCollection, openSearch } = useHidi();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase('en-IN');
  const results = collections.filter((item) => `${item.name} ${item.description} ${item.alt}`.toLocaleLowerCase('en-IN').includes(normalized));
  return <>
    <p className="eyebrow">FIND YOUR KIND OF HIDI</p>
    <h2 id="dialog-title">Discover the collections.</h2>
    <label htmlFor="header-search" className="campaign-search-label">Search products</label>
    <form className="campaign-search-field" action="/search" method="get"
      onSubmit={(event) => { event.preventDefault(); openSearch(query); }}>
      <button type="submit" aria-label="Search HIDI products"><Icon name="search" /></button>
      <input id="header-search" name="q" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Search a product, colour or collection" autoComplete="off" maxLength={100}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }} />
    </form>
    <p className="campaign-result-count" role="status">{results.length ? `${results.length} collection${results.length === 1 ? '' : 's'} to explore` : 'Press Enter to search HIDI products.'}</p>
    <div className="campaign-search-results">
      {results.map((item) => <button type="button" key={item.id} className="campaign-search-result" onClick={() => openCollection(item.id)}>
        <img src={asset(item.image)} alt="" width="52" height="66" />
        <span><strong>{item.name}</strong><small>{item.description}</small></span><Icon name="arrow" />
      </button>)}
    </div>
    <p className="campaign-panel-note">Press Enter to search all products, or choose a collection.</p>
  </>;
}

export function NavigationPanel() {
  const { openAuth, openApp, openPolicy } = useHidi();
  return <>
    <h2 id="dialog-title" className="campaign-menu-title">The world of HIDI.</h2>
    <nav className="campaign-panel-nav" aria-label="Explore HIDI">
      <a href={collectionRoute()}>Our Collections <Icon name="arrow" /></a>
      <a href={collectionRoute('occasion')}>Occasion Collection <Icon name="arrow" /></a>
    </nav>
    <div className="campaign-panel-links">
      <button type="button" onClick={() => openAuth('signin')}><Icon name="user" /> My account</button>
      <button type="button" onClick={() => openAuth('signup')}><Icon name="plus" /> Create an account</button>
      <button type="button" onClick={openApp}><Icon name="phone" /> Get the HIDI app</button>
      <button type="button" onClick={() => openPolicy('contact')}><Icon name="icon16" /> Contact HIDI</button>
    </div>
    <div className="campaign-panel-story">
      <a href="/about">Meet HIDI <Icon name="arrow" /></a>
    </div>
  </>;
}

export function BagPanel() {
  const { openBag, openCollection } = useHidi();
  return <>
    <p className="eyebrow">YOUR HIDI BAG</p><h2 id="dialog-title">Something to make yours.</h2>
    <p>Explore the collections and find your next HIDI look.</p>
    <a className="dialog-secondary" href="/cart" onClick={(event) => { event.preventDefault(); openBag(); }}>View your shopping bag</a>
    <button type="button" className="button button--burgundy" onClick={() => openCollection()}>Explore HIDI <Icon name="arrow" /></button>
  </>;
}
