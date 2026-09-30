import React from 'react';
import Icon from './Icon.jsx';
import Reveal from './Reveal.jsx';
import { useHidi } from '../context/HidiContext.jsx';

export default function BrandPromises() {
  const { openPolicy, openPayments } = useHidi();
  return (
    <section className="promises-section section-space" id="our-promises" aria-labelledby="promises-title">
    <div className="container">
    <Reveal as="div" className="section-heading">
    <p className="eyebrow">THE LITTLE THINGS MATTER</p>
    <h2 id="promises-title">A little more <em>care.</em>
    </h2>
    <p>Considered choices. Clear information. A helping hand.</p>
    </Reveal>
    <div className="promises-grid">
    <Reveal as="article" className="promise">
    <Icon name="leaf" />
    <h3>Considered collections</h3>
    <p>Indian wear for work, everyday life and your special moments.</p>
    <a className="small-link" href="/collections/all">Meet your next favourite <Icon name="arrow" />
    </a>
    </Reveal>
    <Reveal as="article" className="promise">
    <Icon name="bag" />
    <h3>Payment clarity</h3>
    <p>Review your order and payment options before making it yours.</p>
    <button className="small-link" onClick={openPayments} type="button">About checkout <Icon name="arrow" />
    </button>
    </Reveal>
    <Reveal as="article" className="promise">
    <Icon name="icon15" />
    <h3>Returns &amp; exchanges</h3>
    <p>Know the policy and available options before you place an order.</p>
    <button className="small-link" onClick={() => openPolicy("returns")} type="button">Read the policy <Icon name="arrow" />
    </button>
    </Reveal>
    <Reveal as="article" className="promise">
    <Icon name="icon16" />
    <h3>A helping hand</h3>
    <p>Find the right place for your questions, orders and support.</p>
    <button className="small-link" onClick={() => openPolicy("contact")} type="button">Contact HIDI <Icon name="arrow" />
    </button>
    </Reveal>
    </div>
    <div className="promise-signoff" aria-hidden="true">
    <span>
    </span>
    <Icon name="sparkle" />
    <span>
    </span>
    </div>
    </div>
    </section>
  );
}
