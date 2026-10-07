import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { asset } from '../config.js';

const topPicks = [
  {
    name: 'Orange embroidered kurta set',
    image: 'images/ananya-top-picks/ananya-orange.webp',
    accent: '#f05a25',
  },
  {
    name: 'Pink embroidered dupatta set',
    image: 'images/ananya-top-picks/ananya-pink.webp',
    accent: '#ef8fb3',
  },
  {
    name: 'Maroon festive kurta set',
    image: 'images/ananya-top-picks/ananya-maroon.webp',
    accent: '#8e1d3d',
  },
  {
    name: 'Black embellished kurta set',
    image: 'images/ananya-top-picks/ananya-black.webp',
    accent: '#262c31',
  },
  {
    name: 'Olive green embroidered set',
    image: 'images/ananya-top-picks/ananya-green.webp',
    accent: '#58662f',
  },
];

export default function MeetHidi() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(null);

  const showNextPick = () => {
    setPreviousIndex(activeIndex);
    setActiveIndex((activeIndex + 1) % topPicks.length);
  };

  return (
    <section className="meet-section meet-section--cinematic" id="meet-hidi" aria-labelledby="meet-title">
    <div className="container">
    <div className="meet-cinematic">
    <div className="meet-cinematic__content">
    <p className="eyebrow">Curated edit</p>
    <h2 id="meet-title">Ananya's Top Picks</h2>
    <a className="button button--gold meet-cinematic__button" href="/collections/all">Shop now <Icon name="arrow" />
    </a>
    </div>
    <div className="meet-cinematic__stage" aria-live="polite">
    {topPicks.map((pick, index) => {
      const isActive = index === activeIndex;
      const isLeaving = index === previousIndex && index !== activeIndex;
      const slideState = isActive ? 'active' : isLeaving ? 'leaving' : 'waiting';

      return (
        <div className={`meet-cinematic__slide is-${slideState}`} key={pick.name} style={{ '--pick-accent': pick.accent }} aria-hidden={!isActive}>
        <img className="meet-cinematic__glow" src={asset(pick.image)} alt="" loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
        <img className="meet-cinematic__model" src={asset(pick.image)} alt={pick.name} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
        </div>
      );
    })}
    </div>
    <div className="meet-cinematic__controls">
    <span className="meet-cinematic__count">{String(activeIndex + 1).padStart(2, '0')} / {String(topPicks.length).padStart(2, '0')}</span>
    <button className="meet-cinematic__next" type="button" onClick={showNextPick} aria-label="Show next Ananya pick">
    <Icon name="down" />
    </button>
    </div>
    </div>
    </div>
    </section>
  );
}
