import React from 'react';
import Icon from './Icon.jsx';
import { asset } from '../config.js';

export default function HidiEdit() {
  return (
    <section className="edit-section edit-section--campaign" id="hidi-edit" aria-labelledby="edit-title">
      <div className="edit-campaign">
        <h2 id="edit-title" className="sr-only">Shop HIDI collections</h2>
        <img
          src={asset('images/hidi-premium-ai-full-banner-lossless.png')}
          alt="Four views of a HIDI ivory kurta with blue embroidery in a sunlit courtyard"
          width="5460"
          height="2048"
          loading="lazy"
          decoding="async"
        />
        <a className="button button--burgundy edit-campaign__button" href="/collections/all">
          Shop now <Icon name="arrow" />
        </a>
      </div>
    </section>
  );
}
