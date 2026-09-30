import React, { useEffect, useRef } from 'react';
import { asset, config, officialUrl, safeWebUrl } from '../config.js';
import { useHidi } from '../context/HidiContext.jsx';
import Icon from './Icon.jsx';
import { SearchPanel, NavigationPanel, BagPanel } from './HeaderPanels.jsx';

function OfficialLink({ children = 'Visit the current HIDI website' }) {
  return <a className="dialog-secondary" href={officialUrl} target="_blank" rel="noopener noreferrer">{children}</a>;
}
function AppOption({ name, value }) {
  const url = safeWebUrl(value);
  return url
    ? <a className="button button--burgundy" href={url} target="_blank" rel="noopener noreferrer">{name}</a>
    : <div className="app-unavailable">{name}<small>Store link not supplied</small></div>;
}
function Content({ dialog, onClose }) {
  const { openCategories } = useHidi();
  if (!dialog) return null;
  if (dialog.type === 'navigation') return <NavigationPanel onClose={onClose} />;
  if (dialog.type === 'search') return <SearchPanel onClose={onClose} />;
  if (dialog.type === 'bag') return <BagPanel />;
  if (dialog.type === 'auth') return <>
    <p className="eyebrow">STANDALONE DESIGN PREVIEW</p>
    <h2 id="dialog-title">{dialog.mode === 'signin' ? 'Good to see you again.' : 'Your HIDI story starts here.'}</h2>
    <p>{dialog.intent ? `You’re exploring the ${dialog.intent} edit. ` : ''}See how the landing page leads into HIDI’s collections.</p>
    <div className="integration-note">Sign-in and signup are not connected to a backend in this ZIP. No account will be created, and no personal details are required.</div>
    <button type="button" className="button button--burgundy" onClick={() => openCategories(dialog.intent)}>Preview the categories page <Icon name="arrow" /></button>
    <OfficialLink />
  </>;
  if (dialog.type === 'app') return <>
    <p className="eyebrow">TAKE A LITTLE HIDI WITH YOU</p><h2 id="dialog-title">HIDI, wherever<br />life takes you.</h2>
    <p>Your next favourite, a little closer.</p>
    <div className="app-options"><AppOption name="Android" value={config.app?.androidUrl} /><AppOption name="iPhone" value={config.app?.iosUrl} /></div>
    {(!safeWebUrl(config.app?.androidUrl) || !safeWebUrl(config.app?.iosUrl)) && <div className="integration-note">This preview does not include an app download. Verified store links can be added in public/config.js.</div>}
    <OfficialLink>Explore HIDI on the web</OfficialLink>
  </>;
  if (dialog.type === 'policy') {
    const titles = { shipping: 'Shipping information.', returns: 'Returns & exchanges.', privacy: 'Your privacy matters.', terms: 'Terms of use.', contact: 'A helping hand.' };
    return <><p className="eyebrow">HIDI INFORMATION</p><h2 id="dialog-title">{titles[dialog.kind] || 'More about HIDI.'}</h2>
      <p>The verified {dialog.kind} link has not been supplied for this standalone build. Check the current HIDI website for the latest information.</p>
      <div className="integration-note">No policy, return window, support address or telephone number has been invented. Add HIDI’s verified URL in public/config.js to connect this button.</div><OfficialLink /></>;
  }
  if (dialog.type === 'social') return <>
    <p className="eyebrow">STAY CLOSE TO HIDI</p><h2 id="dialog-title">A little HIDI<br />in your day.</h2>
    <p>The official {dialog.kind === 'x' ? 'X' : dialog.kind} profile URL has not been connected in this preview.</p>
    <div className="integration-note">Add the verified profile URL in public/config.js. This button never redirects to an unrelated account.</div><OfficialLink />
  </>;
  if (dialog.type === 'payments') return <>
    <p className="eyebrow">BEFORE MAKING IT YOURS</p><h2 id="dialog-title">A clearer checkout.</h2>
    <p>Payment methods and checkout are part of HIDI’s shopping experience, not this standalone landing-page preview.</p>
    <div className="integration-note">This build does not take payments or include a checkout integration.</div><OfficialLink />
  </>;
  if (dialog.type === 'newsletter-preview') return <>
    <p className="eyebrow">NEWSLETTER PREVIEW</p><h2 id="dialog-title">Stay close to HIDI.</h2>
    <p>This email has not been submitted or subscribed. Newsletter delivery is not connected in this standalone build.</p>
    <div className="integration-note">The design and validation are ready. Add an approved newsletter endpoint in public/config.js to activate delivery.</div><OfficialLink />
  </>;
  if (dialog.type === 'newsletter-success') return <><p className="eyebrow">WELCOME TO THE HIDI COMMUNITY</p><h2 id="dialog-title">A little closer.</h2><p>Your newsletter subscription has been confirmed.</p></>;
  return <><p className="eyebrow">PLEASE TRY AGAIN</p><h2 id="dialog-title">Not quite there yet.</h2><p>Your subscription could not be confirmed. Please try again later or visit HIDI for assistance.</p></>;
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
