// Minimal service worker — enables "add to home screen" / installability and a
// basic offline app-shell. Network-first so content never goes stale online.
//
// GDPR guardrail: ONLY same-origin static assets (the app shell) are ever
// cached. API responses — especially the Supabase origin, which carries
// personal data of the contacts — must never persist in CacheStorage on
// shared or lost devices.
const CACHE = 'partner-csm-v2'

// Same-origin paths that make up the installable app shell.
const SHELL_DESTINATIONS = new Set(['document', 'script', 'style', 'font', 'manifest'])
const SHELL_EXTENSIONS = /\.(js|css|woff2?|svg|png|ico|webmanifest)$/

function isCacheableShellRequest(request) {
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return false // never cache cross-origin (Supabase!)
  if (SHELL_DESTINATIONS.has(request.destination)) return true
  return SHELL_EXTENSIONS.test(url.pathname)
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Drop old cache versions (v1 cached personal data indiscriminately).
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
    ]),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  if (!isCacheableShellRequest(request)) return // API/data requests hit the network untouched

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
  )
})
