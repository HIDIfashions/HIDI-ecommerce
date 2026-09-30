import React from 'react';
import Icon from './Icon.jsx';
import Reveal from './Reveal.jsx';
import { asset } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';

export default function HidiEdit() {
  const { openAuth } = useHidi();
  return (
    <section className="edit-section" id="hidi-edit" aria-labelledby="edit-title">
    <div className="container edit-panel">
    <Reveal as="div" className="edit-copy">
    <p className="pill-label">THE HIDI OCCASION EDIT</p>
    <h2 id="edit-title">The HIDI<br />
    <em className="metallic-gold">Golden Hour.</em>
    </h2>
    <p className="edit-description">For the celebrations, the togetherness and the photos you’ll keep. Discover Indian wear that feels as special as the moment.</p>
    <div className="edit-words">
    <span>Gather.</span>
    <span>Celebrate.</span>
    <span>Be you.</span>
    </div>
    <button className="button button--burgundy" onClick={() => openAuth("signup", "Occasion")} type="button">Explore the occasion edit <Icon name="arrow" />
    </button>
    <p className="edit-signature">Some moments deserve a little HIDI.</p>
    </Reveal>
    <Reveal as="div" className="edit-art">
    <div className="edit-arch">
    <img src={asset("images/occasion-set.webp")} alt="Orange embroidered occasion outfit paired with a deep teal dupatta" width="355" height="593" loading="lazy" decoding="async" />
    </div>
    <div className="edit-seal">
    <Icon name="sparkle" />
    <span>YOUR MOMENT.<br />YOUR HIDI.</span>
    </div>

    </Reveal>
    </div>
    </section>
  );
}
