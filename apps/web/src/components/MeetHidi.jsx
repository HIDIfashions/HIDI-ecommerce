import React from 'react';
import Icon from './Icon.jsx';
import { asset } from '../config.js';

const topPicks = [
  {
    name: 'Orange embroidered kurta set',
    image: 'images/ananya-top-picks/ananya-orange.webp',
    tone: 'Festive orange',
    price: 'From ₹3,490',
    detail: 'A bright occasion-ready set with full-body styling.',
  },
  {
    name: 'Pink embroidered dupatta set',
    image: 'images/ananya-top-picks/ananya-pink.webp',
    tone: 'Soft occasion',
    price: 'From ₹3,290',
    detail: 'Soft pink embroidery with a polished dupatta finish.',
  },
  {
    name: 'Maroon festive kurta set',
    image: 'images/ananya-top-picks/ananya-maroon.webp',
    tone: 'Evening rich',
    price: 'From ₹3,690',
    detail: 'Deep festive colour for dinners, family plans and celebrations.',
  },
  {
    name: 'Black embellished kurta set',
    image: 'images/ananya-top-picks/ananya-black.webp',
    tone: 'Quiet statement',
    price: 'From ₹3,790',
    detail: 'A sharper evening look with easy repeat-wear appeal.',
  },
  {
    name: 'Olive green embroidered set',
    image: 'images/ananya-top-picks/ananya-green.webp',
    tone: 'Everyday luxe',
    price: 'From ₹3,390',
    detail: 'Calm colour, clean shape and enough detail for everyday plans.',
  },
];

const sizes = ['XS', 'S', 'M', 'L', 'XL'];

export default function MeetHidi() {
  return (
    <section className="meet-section ananya-shop-section" id="meet-hidi" aria-labelledby="meet-title">
      <div className="container">
        <div className="ananya-shop-header">
          <div>
            <p className="eyebrow">Ananya's pick</p>
            <h2 id="meet-title">Shop her edit.</h2>
          </div>
          <p>Full outfit photos, quick fit context and a clear path to the collection. Premium, but ready to buy.</p>
          <a className="text-link" href="/collections/all">View all looks <Icon name="arrow" /></a>
        </div>
        <div className="ananya-product-grid" aria-label="Ananya's HIDI picks">
          {topPicks.map((pick, index) => (
            <article className={`ananya-product-card${index === 0 ? ' ananya-product-card--feature' : ''}`} key={pick.name}>
              <a className="ananya-product-card__photo" href="/collections/all" aria-label={`Shop ${pick.name}`}>
                <img
                  src={asset(pick.image)}
                  alt={pick.name}
                  width="900"
                  height="1350"
                  loading={index < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                />
                <span>{pick.tone}</span>
              </a>
              <div className="ananya-product-card__body">
                <div>
                  <h3>{pick.name}</h3>
                  <p>{pick.detail}</p>
                </div>
                <strong>{pick.price}</strong>
                <div className="ananya-size-row" aria-label={`Available sizes for ${pick.name}`}>
                  {sizes.map((size) => <span key={size}>{size}</span>)}
                </div>
                <a className="ananya-product-card__cta" href="/collections/all">
                  Shop this look <Icon name="arrow" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
