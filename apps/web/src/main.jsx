import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles/styles.css';
import './styles/refinements.css';
import './styles/hero-startup.css';
import './styles/immersive-hero.css';

const root = document.getElementById('root');
if (!root) throw new Error('HIDI could not find the root element.');
createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>,
);
