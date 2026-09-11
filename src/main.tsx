import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initStartupPrefetch } from './services/prefetchService';

// Eagerly initiate channels, VOD catalog metadata & image prefetching at script load
initStartupPrefetch();

// Register persistent Service Worker for Web Cache API acceleration if supported
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Benign if iframe or sandbox disables SW
      console.debug('[SW] Service worker registration bypassed:', err?.message || err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

