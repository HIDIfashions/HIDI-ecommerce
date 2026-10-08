import React, { useEffect, useRef, useState } from 'react';
import { useHidi } from '../context/HidiContext.jsx';
import { collectionRoute } from '../routes.js';
import { loadSearchProducts, matchesProductSearch } from '../product-search.js';
import Icon from './Icon.jsx';

export function SearchPanel({ onClose }) {
  const { openSearch } = useHidi();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [retry, setRetry] = useState(0);
  const term = query.trim();
  const matches = term ? products.filter((product) => matchesProductSearch(product, term)) : [];
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setStatus('loading');
    loadSearchProducts({ signal: controller.signal })
      .then((items) => { if (active) { setProducts(items); setStatus('ready'); } })
      .catch(() => { if (active) setStatus('failed'); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [retry]);
  return <>
    <h2 id="dialog-title" className="sr-only">Search HIDI</h2>
    <label htmlFor="header-search" className="sr-only">Search products</label>
    <form className="campaign-search-field" action="/search" method="get"
      onSubmit={(event) => { event.preventDefault(); if (term) openSearch(term); else inputRef.current?.focus(); }}>
      <Icon name="search" />
      <input ref={inputRef} id="header-search" name="q" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Search products" autoComplete="off" maxLength={100}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }} />
      <button className="campaign-search-submit" type="submit" aria-label="Search HIDI products">Search</button>
    </form>
    {term && status === 'loading' && <p className="campaign-search-feedback" role="status">Searching HIDI…</p>}
    {term && status === 'failed' && <p className="campaign-search-feedback" role="alert">
      Search is temporarily unavailable. <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
    </p>}
    {term && status === 'ready' && <>
      <p className="campaign-search-feedback" role="status">{matches.length
        ? `${matches.length} product${matches.length === 1 ? '' : 's'} found`
        : `No products match “${term}”.`}</p>
      {matches.length > 0 && <ul className="campaign-product-results" aria-label="Product search results">
        {matches.slice(0, 6).map((product) => <li key={product.slug}>
          <a href={`/products/${encodeURIComponent(product.slug)}`}>
            <span>{product.name}</span>
            {Number.isSafeInteger(product.minPricePaise) && product.minPricePaise >= 0 &&
              <small>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(product.minPricePaise / 100)}</small>}
            <Icon name="arrow" />
          </a>
        </li>)}
      </ul>}
    </>}
  </>;
}

export function NavigationPanel() {
  const { openAuth, openApp, openPolicy } = useHidi();
  return <>
    <h2 id="dialog-title" className="campaign-menu-title">Shop HIDI.</h2>
    <nav className="campaign-panel-nav" aria-label="Explore HIDI">
      <a href={collectionRoute()}>Shop all <Icon name="arrow" /></a>
      <a href={collectionRoute('new-arrivals')}>New arrivals <Icon name="arrow" /></a>
      <a href={collectionRoute('work-edit')}>Work edit <Icon name="arrow" /></a>
      <a href={collectionRoute('occasion')}>Occasion <Icon name="arrow" /></a>
      <a href={collectionRoute('everyday')}>Everyday <Icon name="arrow" /></a>
      <a href="#meet-hidi">Ananya's pick <Icon name="arrow" /></a>
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
