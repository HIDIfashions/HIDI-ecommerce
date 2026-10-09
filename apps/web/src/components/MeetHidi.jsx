import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { landingImageProps, useLandingMedia } from '../context/LandingMediaContext.jsx';

export default function MeetHidi() {
  const landingMedia = useLandingMedia();
  const image = landingImageProps(landingMedia, 'ananya-green', 'images/ananya-top-picks/ananya-green.webp', "Ananya's pick");
  const [landscapeSource, setLandscapeSource] = useState(null);
  const isLandscape = landscapeSource === image.src;

  return (
    <section className="meet-section meet-section--cinematic meet-section--single" id="meet-hidi" aria-labelledby="meet-title">
      <div className="container">
        <div className="meet-cinematic meet-cinematic--photo">
          <p className="meet-cinematic__label">Ananya's pick</p>
          <div className="meet-cinematic__content">
            <h2 id="meet-title" className="sr-only">Ananya's pick</h2>
            <a className="button button--gold meet-cinematic__button" href="/collections/all">Shop now <Icon name="arrow" /></a>
          </div>
          <div className="meet-cinematic__stage">
            <div className="meet-cinematic__slide is-active">
              <img className="meet-cinematic__model" {...image} data-ananya-layout={isLandscape ? 'photo' : 'portrait'} style={{ ...image.style, objectFit: isLandscape ? 'var(--ananya-photo-fit, cover)' : 'contain' }} loading="eager" decoding="async" onLoad={event => {
                const element = event.currentTarget;
                setLandscapeSource(element.naturalWidth >= element.naturalHeight && element.naturalHeight > 0 ? image.src : null);
              }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
