import React from 'react';
import Icon from './Icon.jsx';
import { asset } from '../config.js';

export default function MeetHidi() {
  return (
    <section className="meet-section meet-section--cinematic" id="meet-hidi" aria-labelledby="meet-title">
    <div className="container">
    <div className="meet-cinematic">
    <img src={asset("images/hidi-premium-ai-full-banner-lossless.png")} alt="HIDI ivory embroidered kurta shown in four premium courtyard portraits" width="5460" height="2048" loading="lazy" decoding="async" />
    <div className="meet-cinematic__content">
    <h2 id="meet-title" className="sr-only">Shop HIDI collections</h2>
    <a className="button button--gold meet-cinematic__button" href="/collections/all">Shop now <Icon name="arrow" />
    </a>
    </div>
    </div>
    </div>
    </section>
  );
}
