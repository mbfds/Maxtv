/**
 * MAXTV Service Worker - Offline & Resilient Caching Engine
 * 
 * Strategies:
 * 1. 'Cache First': Static assets (JS, CSS, HTML shell, web fonts, icons, images)
 *    -> Serves from local cache instantly; fetches from network and updates cache on miss.
 * 2. 'Network First': Catalog metadata (/api/channels, /api/vod, /api/highlights, /api/epg, /data/*.json)
 *    -> Tries network first for up-to-date data; falls back to cached metadata when offline or on unstable networks.
 * 3. Pass-through (No-Cache): Live stream segments (.m3u8, .ts, .m4s, .mpd, /stream, video proxy)
 *    -> Never stored in Cache Storage to prevent high latency and storage exhaustion.
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE_NAME = `maxtv-static-${CACHE_VERSION}`;
const CATALOG_CACHE_NAME = `maxtv-catalog-${CACHE_VERSION}`;
const IMAGES_CACHE_NAME = `maxtv-images-${CACHE_VERSION}`;

// Core application shell assets precached on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-maskable.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/sample-epg.xml'
];

// Maximum timeout (ms) for Network-First catalog requests before falling back to cache
const NETWORK_TIMEOUT_MS = 3500;

// 1. INSTALL: Precache critical app shell and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache partial error (ignored for non-blocking install):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. ACTIVATE: Clean up stale caches from older versions and claim clients
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE_NAME, CATALOG_CACHE_NAME, IMAGES_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('maxtv-') && !currentCaches.includes(name))
          .map((name) => {
            console.log('[SW] Purging outdated cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: Determine if request is for live media stream chunks
function isStreamRequest(url) {
  const path = url.pathname.toLowerCase();
  return (
    path.endsWith('.m3u8') ||
    path.includes('.m3u8?') ||
    path.endsWith('.ts') ||
    path.includes('.ts?') ||
    path.endsWith('.m4s') ||
    path.includes('.m4s?') ||
    path.endsWith('.mpd') ||
    path.includes('.mpd?') ||
    path.includes('/stream/') ||
    path.includes('/hls/') ||
    path.includes('/dash/')
  );
}

// Helper: Determine if request is for catalog metadata
function isCatalogMetadata(url, request) {
  const path = url.pathname.toLowerCase();
  return (
    path.startsWith('/api/channels') ||
    path.startsWith('/api/vod') ||
    path.startsWith('/api/highlights') ||
    path.startsWith('/api/categories') ||
    path.startsWith('/api/epg') ||
    path.startsWith('/api/db/status') ||
    path.includes('/data/channels-config.json') ||
    path.includes('/data/channel-updates-history.json') ||
    path.includes('/data/enriched/') ||
    (path.startsWith('/data/') && path.endsWith('.json')) ||
    (request.headers.get('accept') || '').includes('application/json') && path.startsWith('/api/') && !path.startsWith('/api/auth') && !path.startsWith('/api/pix') && !path.startsWith('/api/session')
  );
}

// Helper: Determine if request is an image / visual asset
function isImageAsset(url, request) {
  const path = url.pathname.toLowerCase();
  return (
    request.destination === 'image' ||
    path.match(/\.(png|jpg|jpeg|webp|avif|svg|gif|ico)(\?.*)?$/i) !== null ||
    (path.includes('/api/proxy') && url.search.match(/\.(png|jpg|jpeg|webp|svg)/i) !== null)
  );
}

// Helper: Determine if request is a static asset (scripts, styles, fonts, app shell)
function isStaticAsset(url, request) {
  const path = url.pathname.toLowerCase();
  return (
    request.mode === 'navigate' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    path.match(/\.(js|mjs|css|woff2?|ttf|eot|html)(\?.*)?$/i) !== null ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    path === '/' ||
    path === '/index.html' ||
    path === '/manifest.json'
  );
}

// Helper: Fetch with timeout
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    fetch(request, { signal: controller.signal })
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

// 3. FETCH: Routing & caching strategies
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Bypass chrome-extension and unsupported schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 1. Live stream video segments -> Direct pass-through, no SW cache
  if (isStreamRequest(url)) {
    return;
  }

  // 2. Catalog Metadata -> Network First with Offline Cache Fallback
  if (isCatalogMetadata(url, event.request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CATALOG_CACHE_NAME);

        try {
          // Attempt network fetch with timeout for swift responsiveness
          const networkResponse = await fetchWithTimeout(event.request.clone(), NETWORK_TIMEOUT_MS);

          // If network succeeded, update catalog cache
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch (networkError) {
          // Network failed or timed out -> retrieve from cache
          const cachedResponse = await cache.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }

          // In case nothing is cached for this specific metadata endpoint, return safe fallback JSON
          return new Response(
            JSON.stringify({
              success: true,
              offline: true,
              channels: [],
              vod: [],
              count: 0,
              message: 'Conexão offline. Exibindo dados em cache disponíveis.'
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'X-Offline-Fallback': 'true'
              }
            }
          );
        }
      })()
    );
    return;
  }

  // 3. Static Assets & Images -> Cache First strategy
  if (isStaticAsset(url, event.request) || isImageAsset(url, event.request)) {
    const targetCacheName = isImageAsset(url, event.request) ? IMAGES_CACHE_NAME : STATIC_CACHE_NAME;

    event.respondWith(
      (async () => {
        const cache = await caches.open(targetCacheName);

        // 1. Check local cache first
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // 2. Cache miss -> Fetch from network
        try {
          const networkResponse = await fetch(event.request);

          // Cache successful or opaque (cross-origin like Google Fonts/CDN) responses
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            cache.put(event.request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch (error) {
          // Fallback for HTML navigation when offline
          if (event.request.mode === 'navigate') {
            const fallbackShell = await caches.match('/index.html') || await caches.match('/');
            if (fallbackShell) {
              return fallbackShell;
            }
          }

          // Fallback for images when offline
          if (isImageAsset(url, event.request)) {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f172a"/><path d="M30 65 L45 50 L55 60 L70 45 L80 65 Z" fill="#334155"/><circle cx="40" cy="38" r="6" fill="#475569"/></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }

          throw error;
        }
      })()
    );
    return;
  }

  // 4. Default: Network with Cache Fallback for other GET requests
  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});

// Client message interface (for triggering updates or cache cleanup)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CATALOG_CACHE') {
    caches.delete(CATALOG_CACHE_NAME).then(() => {
      console.log('[SW] Catalog cache manually flushed upon client request');
    });
  }
});
