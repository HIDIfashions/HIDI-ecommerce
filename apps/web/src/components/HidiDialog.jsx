import React, { useEffect, useRef } from 'react';
import { asset, config, safeWebUrl } from '../config.js';
import { collectionRoute } from '../routes.js';
import Icon from './Icon.jsx';
import { SearchPanel, NavigationPanel, BagPanel } from './HeaderPanels.jsx';

function OfficialLink({ children = 'Explore HIDI collections' }) {
  return <a className="dialog-secondary" href={collectionRoute()}>{children}</a>;
}
function AppOption({ name, value }) {
  const url = safeWebUrl(value);
  return url
    ? <a className="button button--burgundy" href={url} target="_blank" rel="noopener noreferrer">{name}</a>
    : <div className="app-unavailable">{name}<small>Store link not supplied</small></div>;
}
function Content({ dialog, onClose }) {
  if (!dialog) return null;
  if (dialog.type === 'navigation') return <NavigationPanel onClose={onClose} />;
  if (dialog.type === 'search') return <SearchPanel onClose={onClose} />;
  if (dialog.type === 'bag') return <BagPanel />;
  if (dialog.type === 'auth') return <>
    <p className="eyebrow">YOUR HIDI ACCOUNT</p>
    <h2 id="dialog-title">{dialog.mode === 'signin' ? 'Good to see you again.' : 'Your HIDI story starts here.'}</h2>
    <p>Sign in with your mobile number to manage your HIDI account and orders.</p>
    <a className="button button--burgundy" href="/account">Continue to your account <Icon name="arrow" /></a>
    <OfficialLink />
  </>;
  if (dialog.type === 'app') return <>
    <p className="eyebrow">TAKE A LITTLE HIDI WITH YOU</p><h2 id="dialog-title">HIDI, wherever<br />life takes you.</h2>
    <p>Your next favourite, a little closer.</p>
    <div className="app-options"><AppOption name="Android" value={config.app?.androidUrl} /><AppOption name="iPhone" value={config.app?.iosUrl} /></div>
    {(!safeWebUrl(config.app?.androidUrl) || !safeWebUrl(config.app?.iosUrl)) && <div className="integration-note">App downloads are not available yet. Explore HIDI on the web while we get ready.</div>}
    <OfficialLink>Explore HIDI on the web</OfficialLink>
  </>;
  if (dialog.type === 'policy') {
    const titles = { shipping: 'Shipping information.', returns: 'Returns & exchanges.', privacy: 'Your privacy matters.', terms: 'Terms of use.', contact: 'A helping hand.' };
    return <><p className="eyebrow">HIDI INFORMATION</p><h2 id="dialog-title">{titles[dialog.kind] || 'More about HIDI.'}</h2>
      <p>A published {dialog.kind} policy is not available here yet. Please contact HIDI to request the latest information.</p>
      <a className="dialog-secondary" href="/contact">Contact HIDI</a></>;
  }
  if (dialog.type === 'social') return <>
    <p className="eyebrow">STAY CLOSE TO HIDI</p><h2 id="dialog-title">A little HIDI<br />in your day.</h2>
    <p>HIDI’s official {dialog.kind === 'x' ? 'X' : dialog.kind} channel is not available here yet.</p>
    <OfficialLink />
  </>;
  if (dialog.type === 'payments') return <>
    <p className="eyebrow">BEFORE MAKING IT YOURS</p><h2 id="dialog-title">A clearer checkout.</h2>
    <p>Review your order and payment options in your shopping bag before placing an order.</p>
    <a className="dialog-secondary" href="/contact#payments">Payment support</a>
  </>;
  if (dialog.type === 'newsletter-success') return <><p className="eyebrow">WELCOME TO THE HIDI COMMUNITY</p><h2 id="dialog-title">A little closer.</h2><p>Your newsletter subscription has been confirmed.</p></>;
  return <><p className="eyebrow">PLEASE TRY AGAIN</p><h2 id="dialog-title">Not quite there yet.</h2><p>{dialog.message || 'Your subscription could not be confirmed. Please try again later or contact HIDI for assistance.'}</p></>;
}

export default function HidiDialog({ dialog, onClose }) {
  const ref = useRef(null);
  const isOpen = Boolean(dialog);
  useEffect(() => {
    const node = ref.current;
    if (!isOpen) { if (node.open) node.close(); return; }
    const opener = document.activeElement;
    if (!node.open) node.showModal();
    document.body.classList.add('dialog-open');
    return () => {
      if (node.open) node.close();
      document.body.classList.remove('dialog-open');
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isOpen]);
  const backdrop = (event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  };
  return (
    <dialog ref={ref} className={`hidi-dialog${['navigation', 'search', 'bag'].includes(dialog?.type) ? ' campaign-panel' : ''}`} id="hidi-dialog" aria-labelledby="dialog-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={backdrop}>
      <button type="button" className="dialog-close icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
      <div className="dialog-brand"><img className="brand-logo" src={asset('images/hidi-logo.png')} width="265" height="139" alt="HIDI — Wear the feeling" /></div>
      <div className="dialog-content" id="dialog-content"><Content dialog={dialog} onClose={onClose} /></div>
    </dialog>
  );
}
