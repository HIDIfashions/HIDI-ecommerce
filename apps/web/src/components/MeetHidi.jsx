import React from 'react';
import Icon from './Icon.jsx';
import Reveal from './Reveal.jsx';
import { asset } from '../config.js';

export default function MeetHidi() {
  // This photograph stays still: no entrance reveal, hover zoom, tilt or scroll drift.
  return (
    <section className="meet-section section-space" id="meet-hidi" aria-labelledby="meet-title">
    <div className="container meet-grid">
    <div className="meet-art meet-art--static">
    <div className="meet-photo">
    <img src={asset("images/burgundy-set.webp")} alt="HIDI burgundy Indian-wear set with delicate embroidery" width="342" height="593" loading="lazy" decoding="async" />
    </div>

    <span className="photo-caption">A LITTLE TRADITION. A LOT OF YOU.</span>
    </div>
    <Reveal as="div" className="meet-copy">
    <p className="eyebrow">THE FEELING BEHIND THE CLOTHES</p>
    <h2 id="meet-title">Meet <em>HIDI.</em>
    </h2>
    <p className="section-lede">Indian wear, with a calm point of view.</p>
    <p>HIDI is for the many versions of you. The woman heading to work, finding a moment for herself, or getting ready to celebrate.</p>
    <p>Discover kurtas and coordinated sets for everyday life and the moments in between. Familiar in feeling. Fresh in the way you wear them.</p>
    <div className="meet-values">
    <div>
    <Icon name="icon7" />
    <span>Your workdays</span>
    </div>
    <div>
    <Icon name="heart" />
    <span>Your everyday</span>
    </div>
    <div>
    <Icon name="sparkle" />
    <span>Your moments</span>
    </div>
    </div>
    <a className="text-link" href="#our-range">Find your HIDI <Icon name="arrow" />
    </a>
    </Reveal>
    </div>
    </section>
  );
}
