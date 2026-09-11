/**
 * MAXTV Service Worker - Persistent Web Cache API Layer
 * 
 * Provides transparent Cache-First image and static asset caching
 * for high-performance rendering on Smart TVs, TV Boxes, and Mobile browsers.
 */

const CACHE_NAME = 'maxtv-media-cache-v1';
const STATIC_ASSETS_CACHE = 'maxtv-static-v1';

// Install event: skip waiting to activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event: claim clients and clean up any legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('maxtv-') && name !== CACHE_NAME && name !== STATIC_ASSETS_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Cache-First for images, Stale-While-Revalidate for cached metadata
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Image and Icon requests: Cache-First strategy
  const isImage = 
    event.request.destination === 'image' ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|avif|svg|gif|ico)($|\?)/i) ||
    url.searchParams.has('url') && url.pathname.includes('/api/proxy') && url.search.match(/\.(png|jpg|jpeg|webp|svg)($|\?)/i);

  if (isImage) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        // Try cache first
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache: fetch from network
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            // Save to cache
            cache.put(event.request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch (error) {
          // If offline and request failed, return empty transparent svg
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f172a"/></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      })
    );
    return;
  }

  // Pass through all stream requests (.m3u8, .ts, .m4s, live audio/video) directly to network
  if (
    url.pathname.includes('.m3u8') ||
    url.pathname.includes('.ts') ||
    url.pathname.includes('.m4s') ||
    url.pathname.includes('/stream')
  ) {
    return;
  }
});
