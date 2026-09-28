/* Service worker template. The serviceWorker() plugin in vite.config.ts fills in
 * the precache list (every built file) and the version (a hash of them) below and
 * emits it as dist/sw.js. Plain JS: it is not bundled or type-checked. */
const CACHE = 'floor-plan-studio-__VERSION__'
const PRECACHE = __PRECACHE__

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

// A new build has a new cache name; drop the old ones once it takes over.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('floor-plan-studio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  // Leave cross-origin (Google, Dropbox, fonts), the sign-in API and non-GETs to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    // Network first so a new deploy shows up at once; offline, any route gets the app shell.
    event.respondWith(fetch(req).catch(() => caches.match('/', { cacheName: CACHE }).then((r) => r ?? Response.error())))
    return
  }
  event.respondWith(caches.match(req, { cacheName: CACHE }).then((r) => r ?? fetch(req)))
})
