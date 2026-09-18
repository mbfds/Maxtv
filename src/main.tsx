import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { validateEnv } from './utils/envValidation';
import { initStartupPrefetch } from './services/prefetchService';

// Validação imediata de variáveis de ambiente no startup da aplicação
validateEnv();

// Eagerly initiate channels, VOD catalog metadata & image prefetching at script load
initStartupPrefetch();

// Service Worker: Em desenvolvimento unregistra para não interceptar módulos Vite; em produção ativa cache
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    });
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          if (key.startsWith('maxtv-')) {
            caches.delete(key);
          }
        }
      });
    }
  } else if (window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.debug('[SW] Service worker registration bypassed:', err?.message || err);
      });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

