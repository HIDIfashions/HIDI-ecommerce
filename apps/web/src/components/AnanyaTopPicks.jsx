import React from 'react';
import { asset } from '../config.js';
import { topPicks } from '../data/topPicks.js';

export default function AnanyaTopPicks() {
  return (
    <section className="ananya-picks" aria-labelledby="ananya-picks-title">
      <div className="ananya-picks__heading container">
        <p className="eyebrow">CURATED BY ANANYA</p>
        <h2 id="ananya-picks-title">Ananya's Top Picks</h2>
      </div>
      <div className="ananya-picks__rail" aria-label="Ananya's selected HIDI looks">
        {topPicks.map((item, index) => (
          <article className="ananya-pick-card" key={item.id} style={{ '--pick-index': index }}>
            <img src={asset(item.image)} alt={item.alt} width="1024" height="1536" loading={index < 2 ? 'eager' : 'lazy'} decoding="async" />
            <div className="ananya-pick-card__caption">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{item.name}</h3>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
