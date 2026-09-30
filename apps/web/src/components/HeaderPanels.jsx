import React, { useState } from 'react';
import { useHidi } from '../context/HidiContext.jsx';
import { collectionRoute } from '../routes.js';
import Icon from './Icon.jsx';

export function SearchPanel({ onClose }) {
  const { openSearch } = useHidi();
  const [query, setQuery] = useState('');
  return <>
    <h2 id="dialog-title" className="sr-only">Search HIDI</h2>
    <label htmlFor="header-search" className="sr-only">Search products</label>
    <form className="campaign-search-field" action="/search" method="get"
      onSubmit={(event) => { event.preventDefault(); openSearch(query); }}>
      <button type="submit" aria-label="Search HIDI products"><Icon name="search" /></button>
      <input id="header-search" name="q" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Search products" autoComplete="off" maxLength={100}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }} />
    </form>
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
