import React from 'react';
import Icon from './Icon.jsx';
import { landingImageProps, useLandingMedia } from '../context/LandingMediaContext.jsx';

export default function HidiEdit() {
  const landingMedia = useLandingMedia();
  const banner = landingImageProps(
    landingMedia,
    'hidi-edit-banner',
    'images/hidi-premium-ai-full-banner-lossless.png',
    'Four views of a HIDI ivory kurta with blue embroidery in a sunlit courtyard',
  );

  return (
    <section className="edit-section edit-section--campaign" id="hidi-edit" aria-labelledby="edit-title">
      <div className="edit-campaign">
        <h2 id="edit-title" className="sr-only">Shop HIDI collections</h2>
        <img
          {...banner}
          alt={banner.alt}
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
