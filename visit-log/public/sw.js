/* Roshen Visit Log service worker: app-shell + image + map-tile caching for offline use. */
const VERSION = 'v2'
const SHELL_CACHE = `shell-${VERSION}`
const RUNTIME_CACHE = `runtime-${VERSION}`
const IMAGE_CACHE = `images-${VERSION}`
const TILE_CACHE = `tiles-${VERSION}`
const IMAGE_LIMIT = 400
const TILE_LIMIT = 1500

const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE, TILE_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= limit) return
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)))
}

// Signed storage URLs carry a rotating token — strip the query string so the
// same photo hits the same cache entry across signatures.
function imageCacheKey(url) {
  const u = new URL(url)
  u.search = ''
  return u.toString()
}

function isStorageImage(url) {
  return url.pathname.includes('/storage/v1/object/') && url.pathname.includes('/visit-images/')
}

function isMapTile(url) {
  return /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // Map tiles: cache-first so the customer map renders offline.
  if (isMapTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        try {
          const response = await fetch(request)
          if (response.ok) {
            cache.put(request, response.clone())
            trimCache(TILE_CACHE, TILE_LIMIT)
          }
          return response
        } catch {
          return cached || Response.error()
        }
      }),
    )
    return
  }

  if (isStorageImage(url)) {
    const key = imageCacheKey(request.url)
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(key)
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(key, response.clone())
              trimCache(IMAGE_CACHE, IMAGE_LIMIT)
            }
            return response
          })
          .catch(() => cached)
        return cached || network
      }),
    )
    return
  }

  if (url.origin === self.location.origin) {
    const cacheName = url.pathname.startsWith('/assets/') ? SHELL_CACHE : RUNTIME_CACHE
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(cacheName).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})
