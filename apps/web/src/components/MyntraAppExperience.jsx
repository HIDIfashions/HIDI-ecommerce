import React, { useEffect, useMemo, useState } from 'react';
import { asset } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import { landingImageProps, useLandingMedia } from '../context/LandingMediaContext.jsx';
import { collectionRoute } from '../routes.js';
import { loadSearchProducts } from '../product-search.js';
import Icon from './Icon.jsx';
import '../styles/myntra-app-experience.css';

const fallbackProducts = [
  {
    id: 'preview-wine-set',
    slug: 'wine-everyday-kurta-set',
    name: 'Wine Everyday Kurta Set',
    fabric: 'Soft rayon blend',
    category: { name: 'Workwear' },
    collections: [{ name: 'New Arrivals' }],
    images: [{ url: asset('images/ananya-top-picks/ananya-maroon.webp'), alt: 'Wine HIDI kurta set' }],
    variants: [
      { id: '', size: 'M', pricePaise: 249900, mrpPaise: 349900, available: 8 },
      { id: '', size: 'L', pricePaise: 249900, mrpPaise: 349900, available: 8 },
      { id: '', size: 'XL', pricePaise: 249900, mrpPaise: 349900, available: 8 },
    ],
    minPricePaise: 249900,
    maxPricePaise: 249900,
    inStock: true,
  },
  {
    id: 'preview-orange-set',
    slug: 'orange-festive-kurta-set',
    name: 'Orange Festive Kurta Set',
    fabric: 'Cotton viscose',
    category: { name: 'Occasion' },
    collections: [{ name: 'Festive' }],
    images: [{ url: asset('images/ananya-top-picks/ananya-orange.webp'), alt: 'Orange HIDI kurta set' }],
    variants: [
      { id: '', size: 'M', pricePaise: 199900, mrpPaise: 249900, available: 6 },
      { id: '', size: 'L', pricePaise: 199900, mrpPaise: 249900, available: 6 },
    ],
    minPricePaise: 199900,
    maxPricePaise: 199900,
    inStock: true,
  },
  {
    id: 'preview-pink-set',
    slug: 'pink-embroidered-workwear-set',
    name: 'Pink Embroidered Workwear Set',
    fabric: 'Textured cotton',
    category: { name: 'Office' },
    collections: [{ name: 'Work Edit' }],
    images: [{ url: asset('images/ananya-top-picks/ananya-pink.webp'), alt: 'Pink HIDI kurta set' }],
    variants: [
      { id: '', size: 'M', pricePaise: 229900, mrpPaise: 319900, available: 7 },
      { id: '', size: 'XL', pricePaise: 229900, mrpPaise: 319900, available: 7 },
    ],
    minPricePaise: 229900,
    maxPricePaise: 229900,
    inStock: true,
  },
  {
    id: 'preview-green-set',
    slug: 'olive-green-everyday-set',
    name: 'Olive Green Everyday Set',
    fabric: 'Soft cotton blend',
    category: { name: 'Everyday' },
    collections: [{ name: 'Everyday' }],
    images: [{ url: asset('images/ananya-top-picks/ananya-green.webp'), alt: 'Green HIDI kurta set' }],
    variants: [
      { id: '', size: 'L', pricePaise: 179900, mrpPaise: 229900, available: 10 },
      { id: '', size: 'XXL', pricePaise: 179900, mrpPaise: 229900, available: 10 },
    ],
    minPricePaise: 179900,
    maxPricePaise: 179900,
    inStock: true,
  },
];

const topPicks = [
  { id: 'ananya-orange', title: 'Bright festive set', image: 'images/ananya-top-picks/ananya-orange.webp', slotId: 'ananya-orange' },
  { id: 'ananya-pink', title: 'Pink workwear set', image: 'images/ananya-top-picks/ananya-pink.webp', slotId: 'ananya-pink' },
  { id: 'ananya-maroon', title: 'Wine everyday set', image: 'images/ananya-top-picks/ananya-maroon.webp', slotId: 'ananya-maroon', center: true },
  { id: 'ananya-black', title: 'Black statement set', image: 'images/ananya-top-picks/ananya-black.webp', slotId: 'ananya-black' },
  { id: 'ananya-green', title: 'Olive daily set', image: 'images/ananya-top-picks/ananya-green.webp', slotId: 'ananya-green' },
];

const categories = [
  { id: 'new-arrivals', label: 'New arrivals', note: 'Fresh launch styles', image: 'images/peach-set.webp', slotId: 'range-new-arrivals' },
  { id: 'work-edit', label: 'Workwear', note: 'Desk to dinner', image: 'images/cream-set.webp', slotId: 'range-work-edit' },
  { id: 'occasion', label: 'Occasion wear', note: 'Family functions', image: 'images/occasion-set.webp', slotId: 'range-occasion' },
  { id: 'everyday', label: 'Daily elegance', note: 'Repeat friendly', image: 'images/burgundy-set.webp', slotId: 'range-everyday' },
  { id: 'all', label: 'Shop all', note: 'Full HIDI edit', image: 'images/hero-portrait.webp', slotId: 'range-shop-all' },
];

const offers = [
  { title: '15 percent off', detail: 'A simple first-order discount route.', code: 'HIDI15' },
  { title: 'Rs. 3,999 bundle', detail: 'Get one selected free dress from the approved pool.', code: 'TOPPICK' },
];

function money(paise = 0) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.max(0, paise) / 100).replace('₹', 'Rs. ');
}

function productImage(product, fallbackIndex = 0) {
  const fallback = fallbackProducts[fallbackIndex % fallbackProducts.length]?.images?.[0]?.url || asset('images/hero-portrait.webp');
  return product?.images?.[0]?.url
    || product?.variants?.flatMap((variant) => variant.images || [])?.[0]?.url
    || fallback;
}

function availableSizes(product) {
  const sizes = new Set((product?.variants || [])
    .filter((variant) => variant.available > 0 || !variant.id)
    .map((variant) => String(variant.size || '').trim())
    .filter(Boolean));
  return [...sizes].slice(0, 5);
}

function bestVariant(product, selectedSize) {
  const variants = product?.variants || [];
  return variants.find((variant) => variant.size === selectedSize && variant.available > 0 && variant.id)
    || variants.find((variant) => variant.available > 0 && variant.id)
    || variants.find((variant) => variant.id)
    || null;
}

function bestMrp(product) {
  const prices = (product?.variants || [])
    .map((variant) => variant.mrpPaise)
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  return prices.length ? Math.max(...prices) : product.minPricePaise;
}

function cartSessionId() {
  const key = 'hidi-cart-session';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && existing.length >= 8) return existing;
    const next = window.crypto?.randomUUID?.() || `hidi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return `hidi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function track(name, product) {
  window.dispatchEvent(new CustomEvent('hidi-commerce-event', {
    detail: {
      name,
      item_id: product?.slug,
      item_name: product?.name,
      value: product?.minPricePaise ? product.minPricePaise / 100 : undefined,
      currency: 'INR',
    },
  }));
}

function ProductCard({ product, index, selectedSize, onSize, onSelect, onAdd, onWish, wished, adding }) {
  const sizes = availableSizes(product);
  const mrp = bestMrp(product);
  const discount = mrp > product.minPricePaise ? Math.round((1 - product.minPricePaise / mrp) * 100) : 0;
  const href = `/products/${encodeURIComponent(product.slug)}`;

  return (
    <article className="hidi-product-card">
      <button
        type="button"
        className="hidi-product-media"
        onClick={() => { track('select_item', product); onSelect(product); }}
        aria-label={`Preview ${product.name}`}
      >
        <img src={productImage(product, index)} alt={product.images?.[0]?.alt || product.name} loading={index < 4 ? 'eager' : 'lazy'} decoding="async" />
        <span className="hidi-product-badge">{product.collections?.[0]?.name || product.category?.name || 'HIDI'}</span>
      </button>
      <button type="button" className={`hidi-product-save${wished ? ' is-saved' : ''}`} onClick={() => onWish(product)} aria-pressed={wished}>
        <Icon name="heart" /><span>{wished ? 'Saved' : 'Save'}</span>
      </button>
      <div className="hidi-product-copy">
        <p>{product.fabric || product.category?.name || 'HIDI edit'}</p>
        <h3><a href={href}>{product.name}</a></h3>
        <div className="hidi-price-line">
          <strong>{money(product.minPricePaise)}</strong>
          {mrp > product.minPricePaise && <del>{money(mrp)}</del>}
          {discount > 0 && <span>{discount}% off</span>}
        </div>
        <div className="hidi-size-row" aria-label={`Size for ${product.name}`}>
          {sizes.map((size) => (
            <button key={size} type="button" aria-pressed={(selectedSize || sizes[0]) === size} onClick={() => onSize(product.slug, size)}>{size}</button>
          ))}
        </div>
        <div className="hidi-card-actions">
          <button type="button" className="hidi-add-bag" disabled={adding} onClick={() => onAdd(product)}>
            {adding ? 'Adding...' : 'Add to bag'}
          </button>
          <a className="hidi-view-product" href={href}>View</a>
        </div>
      </div>
    </article>
  );
}

function MobileAppNav({ openCollection, openBag, openAuth }) {
  return (
    <nav className="hidi-app-bottom-nav" aria-label="HIDI mobile shopping navigation">
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><Icon name="sparkle" /><span>Home</span></button>
      <button type="button" onClick={() => openCollection('new-arrivals')}><Icon name="icon7" /><span>Trends</span></button>
      <button type="button" onClick={() => openCollection()}><Icon name="menu" /><span>Categories</span></button>
      <button type="button" onClick={openBag}><Icon name="bag" /><span>Bag</span></button>
      <button type="button" onClick={() => openAuth('signin')}><Icon name="user" /><span>Profile</span></button>
    </nav>
  );
}

export default function MyntraAppExperience() {
  const landingMedia = useLandingMedia();
  const { openAuth, openBag, openCollection } = useHidi();
  const [products, setProducts] = useState(fallbackProducts);
  const [productStatus, setProductStatus] = useState('fallback');
  const [selectedProduct, setSelectedProduct] = useState(fallbackProducts[0]);
  const [selectedSizes, setSelectedSizes] = useState({});
  const [wished, setWished] = useState({});
  const [addingSlug, setAddingSlug] = useState('');
  const [toast, setToast] = useState('');
  const [pincode, setPincode] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const banner = landingImageProps(
    landingMedia,
    'hidi-edit-banner',
    'images/hidi-premium-ai-full-banner-lossless.png',
    'Four HIDI outfit views arranged as a premium launch banner',
  );

  useEffect(() => {
    const controller = new AbortController();
    loadSearchProducts({ signal: controller.signal })
      .then((items) => {
        const usable = items.filter((item) => item?.slug && item?.name).slice(0, 8);
        if (usable.length) {
          setProducts(usable);
          setSelectedProduct(usable[0]);
          setProductStatus('ready');
        }
      })
      .catch(() => setProductStatus('fallback'));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentSize = selectedSizes[selectedProduct?.slug] || availableSizes(selectedProduct)[0] || '';
  const selectedImage = productImage(selectedProduct, 0);
  const selectedMrp = bestMrp(selectedProduct);

  const updateSize = (slug, size) => setSelectedSizes((value) => ({ ...value, [slug]: size }));
  const wish = (product) => {
    setWished((value) => ({ ...value, [product.slug]: !value[product.slug] }));
    setToast(`${product.name} ${wished[product.slug] ? 'removed from wishlist' : 'saved to wishlist'}`);
    track('add_to_wishlist', product);
  };

  const addToBag = async (product) => {
    const selectedSize = selectedSizes[product.slug] || availableSizes(product)[0] || '';
    const variant = bestVariant(product, selectedSize);
    if (!variant?.id) {
      setToast('Open the product page to finish size selection.');
      window.setTimeout(() => window.location.assign(`/products/${encodeURIComponent(product.slug)}`), 650);
      return;
    }

    setAddingSlug(product.slug);
    try {
      const response = await fetch(`/v1/carts/${encodeURIComponent(cartSessionId())}/items`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ variantId: variant.id, quantity: 1 }),
      });
      const cart = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(cart.message || 'Unable to add this size right now.');
      setToast(`${product.name} added to bag`);
      track('add_to_cart', product);
    } catch (error) {
      setToast(error?.message || 'Unable to add to bag. Please try from the product page.');
    } finally {
      setAddingSlug('');
    }
  };

  const checkPincode = () => {
    const pin = pincode.trim();
    setDeliveryNote(/^\d{6}$/.test(pin)
      ? 'Delivery check ready. Estimated dispatch in 24 to 48 hours.'
      : 'Enter a valid 6 digit pincode.');
  };

  const categoryCards = useMemo(() => categories.map((item) => ({
    ...item,
    imageProps: landingImageProps(landingMedia, item.slotId, item.image, item.label),
  })), [landingMedia]);

  return (
    <>
      <section className="hidi-commerce" id="shop-hidi" aria-labelledby="hidi-commerce-title">
        <div className="hidi-commerce-intro">
          <div>
            <p className="eyebrow">HIDI shopping app</p>
            <h2 id="hidi-commerce-title">Premium fashion discovery, built around the product.</h2>
          </div>
          <form className="hidi-commerce-search" action="/search" method="get" onSubmit={(event) => {
            event.preventDefault();
            const query = new FormData(event.currentTarget).get('q') || '';
            window.location.assign(`/search?${new URLSearchParams({ q: String(query).trim() })}`);
          }}>
            <Icon name="search" />
            <input name="q" type="search" placeholder="Search kurtas, workwear, festive sets" aria-label="Search HIDI products" />
            <button type="submit">Search</button>
          </form>
        </div>

        <div className="hidi-quick-categories" aria-label="Shop by category">
          {categoryCards.map((item) => (
            <a key={item.id} className="hidi-category-card" href={collectionRoute(item.id)}>
              <img {...item.imageProps} alt={item.imageProps.alt || item.label} width="355" height="593" loading="lazy" decoding="async" />
              <span>{item.label}</span>
              <small>{item.note}</small>
            </a>
          ))}
        </div>

        <section className="hidi-picks" aria-labelledby="hidi-picks-title">
          <div className="hidi-section-head">
            <p className="eyebrow">Ananya's top picks</p>
            <h2 id="hidi-picks-title">Hover the look. Keep the focus.</h2>
            <p>Only the centre pick speaks first. Hover any photo and that look pops out with its own label.</p>
          </div>
          <div className="hidi-picks-orbit" aria-label="Ananya top picks circular product preview">
            {topPicks.map((pick) => {
              const image = landingImageProps(landingMedia, pick.slotId, pick.image, pick.title);
              return (
                <a key={pick.id} className={`hidi-pick-card${pick.center ? ' is-center' : ''}`} href={collectionRoute('new-arrivals')}>
                  <img {...image} alt={image.alt || pick.title} width="355" height="593" loading="lazy" decoding="async" />
                  <span className="hidi-pick-label">{pick.title}</span>
                </a>
              );
            })}
          </div>
        </section>

        <section className="hidi-feed" aria-labelledby="hidi-feed-title">
          <div className="hidi-section-head hidi-section-head--row">
            <div>
              <p className="eyebrow">New arrivals</p>
              <h2 id="hidi-feed-title">A Myntra-like feed, with HIDI restraint.</h2>
              <p>{productStatus === 'ready' ? 'Live products loaded from the storefront catalogue.' : 'Preview products shown until the live catalogue responds.'}</p>
            </div>
            <div className="hidi-filter-pills" aria-label="Quick filters">
              <a href={collectionRoute('new-arrivals')}>New</a>
              <a href={collectionRoute('work-edit')}>Office</a>
              <a href={collectionRoute('occasion')}>Festive</a>
              <a href={collectionRoute()}>All</a>
            </div>
          </div>
          <div className="hidi-product-grid">
            {products.slice(0, 8).map((product, index) => (
              <ProductCard
                key={product.slug}
                product={product}
                index={index}
                selectedSize={selectedSizes[product.slug]}
                onSize={updateSize}
                onSelect={setSelectedProduct}
                onAdd={addToBag}
                onWish={wish}
                wished={Boolean(wished[product.slug])}
                adding={addingSlug === product.slug}
              />
            ))}
          </div>
        </section>

        <section className="hidi-detail-preview" aria-labelledby="hidi-detail-title">
          <div className="hidi-detail-gallery">
            <img src={selectedImage} alt={selectedProduct?.images?.[0]?.alt || selectedProduct?.name || 'HIDI product'} loading="lazy" decoding="async" />
          </div>
          <div className="hidi-detail-copy">
            <p className="eyebrow">Product detail flow</p>
            <h2 id="hidi-detail-title">{selectedProduct?.name || 'Selected HIDI look'}</h2>
            <div className="hidi-price-line hidi-price-line--large">
              <strong>{money(selectedProduct?.minPricePaise)}</strong>
              {selectedMrp > selectedProduct?.minPricePaise && <del>{money(selectedMrp)}</del>}
              <span>Inclusive pricing</span>
            </div>
            <div className="hidi-size-row hidi-size-row--detail" aria-label="Selected product size">
              {availableSizes(selectedProduct).map((size) => (
                <button key={size} type="button" aria-pressed={currentSize === size} onClick={() => updateSize(selectedProduct.slug, size)}>{size}</button>
              ))}
            </div>
            <div className={`hidi-pincode${deliveryNote ? ' is-checked' : ''}`}>
              <input inputMode="numeric" maxLength={6} value={pincode} onChange={(event) => setPincode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter delivery pincode" aria-label="Delivery pincode" />
              <button type="button" onClick={checkPincode}>Check</button>
            </div>
            <p className="hidi-delivery-note" role="status">{deliveryNote}</p>
            <div className="hidi-detail-actions">
              <button type="button" className="button button--burgundy" disabled={addingSlug === selectedProduct?.slug} onClick={() => addToBag(selectedProduct)}>
                Add to bag
              </button>
              <a className="button button--gold" href={`/products/${encodeURIComponent(selectedProduct?.slug || '')}`}>Open product</a>
            </div>
            <div className="hidi-detail-info">
              <div><strong>Wash care</strong><span>Gentle hand wash and dry in shade.</span></div>
              <div><strong>Returns</strong><span>Reason-based return and exchange flow stays visible.</span></div>
              <div><strong>Delivery</strong><span>Payment success can hand off to AWB creation.</span></div>
            </div>
          </div>
        </section>

        <section className="hidi-offer-band" aria-label="Launch offers">
          <img {...banner} alt={banner.alt} width="5460" height="2048" loading="lazy" decoding="async" />
          <div>
            <p className="eyebrow">Launch economics</p>
            <h2>One offer at a time. Cleaner margin control.</h2>
            <div className="hidi-offer-list">
              {offers.map((offer) => (
                <article key={offer.code}>
                  <strong>{offer.title}</strong>
                  <span>{offer.detail}</span>
                  <code>{offer.code}</code>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="hidi-admin-control" aria-labelledby="admin-control-title">
          <div>
            <p className="eyebrow">Admin controlled</p>
            <h2 id="admin-control-title">Every landing visual has a preview slot.</h2>
            <p>Hero media, Ananya picks, category cards and the wide offer banner are all routed through the existing landing media admin flow.</p>
          </div>
          <a className="button button--burgundy" href="/admin/landing-media">Open landing media</a>
        </section>
      </section>

      <MobileAppNav
        openCollection={openCollection}
        openBag={openBag}
        openAuth={openAuth}
      />

      {toast && <div className="hidi-commerce-toast" role="status">{toast}</div>}
    </>
  );
}
