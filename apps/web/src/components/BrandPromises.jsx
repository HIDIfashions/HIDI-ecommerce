import React from 'react';
import Icon from './Icon.jsx';
import Reveal from './Reveal.jsx';
import { useHidi } from '../context/HidiContext.jsx';

const trustHighlights = [
  { icon: 'bag', title: 'Secure checkout', detail: 'UPI, cards and wallet-friendly payment options.' },
  { icon: 'icon15', title: '7-day exchanges', detail: 'Clear return and exchange guidance before you buy.' },
  { icon: 'leaf', title: 'Fit-first edits', detail: 'Indian wear selected for work, everyday and occasions.' },
  { icon: 'icon16', title: 'WhatsApp help', detail: 'Support for fit questions, order help and updates.' },
];

export default function BrandPromises() {
  const { openPolicy, openPayments } = useHidi();
  return (
    <section className="promises-section section-space" id="our-promises" aria-labelledby="promises-title">
    <div className="container">
    <Reveal as="div" className="section-heading">
    <p className="eyebrow">WHY SHOP HIDI</p>
    <h2 id="promises-title">A sharper reason to <em>trust.</em>
    </h2>
    <p>Clear checkout, practical support and edit-led Indian wear.</p>
    </Reveal>
    <div className="trust-strip" aria-label="HIDI shopping assurances">
    {trustHighlights.map((item) => (
      <Reveal as="div" className="trust-strip__item" key={item.title}>
      <Icon name={item.icon} />
      <div>
      <strong>{item.title}</strong>
      <span>{item.detail}</span>
      </div>
      </Reveal>
    ))}
    </div>
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
