import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { config, safeWebUrl } from './config.js';
import { collectionRoute, searchRoute } from './routes.js';
import { HidiProvider } from './context/HidiContext.jsx';
import { usePage } from './hooks/usePage.js';
import Navbar from './components/Navbar.jsx';
import { useSmoothPageScroll } from './hooks/useSmoothPageScroll.js';
import VideoHero from './components/VideoHero.jsx';
import AnanyaTopPicks from './components/AnanyaTopPicks.jsx';
import MeetHidi from './components/MeetHidi.jsx';
import RangeCarousel from './components/RangeCarousel.jsx';
import HidiEdit from './components/HidiEdit.jsx';
import BrandPromises from './components/BrandPromises.jsx';
import Footer from './components/Footer.jsx';
import HidiDialog from './components/HidiDialog.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';

export default function App() {
  const [page, navigate] = usePage();
  const [dialog, setDialog] = useState(null);
  useSmoothPageScroll(page.name === 'landing' && !dialog);
  const closeDialog = useCallback(() => setDialog(null), []);

  useEffect(() => {
    const categories = page.name === 'categories';
    document.body.classList.toggle('category-page', categories);
    document.title = categories ? 'Explore HIDI — Collections' : 'HIDI — Wear the feeling.';
    return () => document.body.classList.remove('category-page');
  }, [page.name]);

  const actions = useMemo(() => ({
    dialogOpen: Boolean(dialog),
    dialogType: dialog?.type || null,
    homeHref: '/',
    onHome: (event) => {
      if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0)) return;
      event?.preventDefault();
      setDialog(null);
      navigate('landing');
    },
    openAuth: (mode, intent = '') => {
      const target = safeWebUrl(mode === 'signin' ? config.auth?.signInUrl : config.auth?.signUpUrl)
        || safeWebUrl('/account');
      window.location.assign(target);
    },
    openCollection: (edit = '') => window.location.assign(safeWebUrl(collectionRoute(edit))),
    openSearch: (query = '') => window.location.assign(safeWebUrl(searchRoute(query))),
    openBag: () => window.location.assign(safeWebUrl('/cart')),
    openApp: () => setDialog({ type: 'app' }),
    openPolicy: (kind) => {
      const target = safeWebUrl(config.policies?.[kind]);
      if (target) { window.open(target, '_blank', 'noopener,noreferrer'); return; }
      setDialog({ type: 'policy', kind });
    },
    openSocial: (kind) => {
      const target = safeWebUrl(config.socials?.[kind]);
      if (target) { window.open(target, '_blank', 'noopener,noreferrer'); return; }
      setDialog({ type: 'social', kind });
    },
    openPayments: () => window.location.assign(safeWebUrl('/contact#payments')),
    openNotice: (type, message = '') => setDialog({ type, message }),
    openCategories: (intent = '') => {
      setDialog(null);
      navigate('categories', intent);
    },
  }), [dialog, navigate]);

  return (
    <HidiProvider value={actions}>
      <a className="skip-link" href="#main">Skip to content</a>
      {page.name === 'categories' ? <CategoriesPage selectedEdit={page.edit} /> : <div className="hidi-page">
        <Navbar />
        <main id="main" tabIndex={-1}>
          <VideoHero />
          <AnanyaTopPicks />
          <MeetHidi />
          <RangeCarousel />
          <HidiEdit />
          <BrandPromises />
        </main>
        <Footer />
      </div>}
      <HidiDialog dialog={dialog} onClose={closeDialog} />
    </HidiProvider>
  );
}
