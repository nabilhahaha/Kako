/* SalesBook service worker — offline app shell + static asset cache.
   Strategy:
   - /_next/static, /fonts, /icons  → cache-first (immutable, hashed or versioned)
   - navigations (HTML)             → network-first, offline fallback to cached shell
   - /api/*                         → network only; JSON 503 marker when offline
*/
const VERSION = 'salesbook-v1';
const SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: network only, explicit offline marker so the app can react
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ offline: true }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    return;
  }

  // static assets: cache-first
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // navigations: network-first with cached shell fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
  }
});
