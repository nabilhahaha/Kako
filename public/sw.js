// AMS PWA service worker — app-shell offline strategy.
// Navigation → network-first, fallback to cached /offline page.
// Static assets (script/style/image) → cache-first, network fallback.
// Non-GET and cross-origin/API/auth requests are never cached.

const CACHE = 'ams-v1';

// App-shell resources to precache on install.
const PRECACHE = ['/', '/offline', '/icon.svg'];

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(PRECACHE).catch((err) => {
        // Non-fatal: some precache URLs may redirect or require auth.
        console.warn('[sw] precache partial failure:', err);
      }),
    ),
  );
});

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        );
      } catch (err) {
        console.warn('[sw] cache cleanup failed:', err);
      }
      await self.clients.claim();
    })(),
  );
});

// ─── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept cross-origin requests (Supabase, CDN, auth endpoints).
  if (url.origin !== self.location.origin) return;

  // Never intercept API or auth routes — let them fall through to the network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // ── Navigation requests: network-first, offline fallback ──────────────────
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Opportunistically cache successful navigation responses.
          if (fresh.status === 200 && fresh.type === 'basic') {
            const cache = await caches.open(CACHE);
            cache.put(req, fresh.clone()).catch(() => {});
          }
          return fresh;
        } catch {
          // Network failed — serve the offline page shell.
          const offline = await caches.match('/offline');
          if (offline) return offline;
          // Last resort: a bare-bones offline response.
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
      })(),
    );
    return;
  }

  // ── Static assets (scripts, styles, images): cache-first ─────────────────
  const dest = req.destination;
  if (dest === 'script' || dest === 'style' || dest === 'image' || dest === 'font') {
    event.respondWith(
      (async () => {
        try {
          const cached = await caches.match(req);
          if (cached) return cached;

          const fresh = await fetch(req);
          if (fresh.status === 200 && fresh.type === 'basic') {
            const cache = await caches.open(CACHE);
            cache.put(req, fresh.clone()).catch(() => {});
          }
          return fresh;
        } catch (err) {
          // Non-fatal for assets — browser will show broken resource.
          console.warn('[sw] asset fetch failed:', req.url, err);
          return new Response('', { status: 503 });
        }
      })(),
    );
    return;
  }

  // All other same-origin GET requests: pass through without caching.
});
