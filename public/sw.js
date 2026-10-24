/* Minimal service worker. Owner: Agent 7.
 * - App shell (same-origin GET, non-data): cache-first, filled on first fetch.
 * - data/exoplanets.json: stale-while-revalidate.
 * Registered from src/main.ts in production builds only.
 * Bump VERSION to drop old caches after a deploy that changes the shell.
 */
const VERSION = 'v3';
const SHELL = `ehs-shell-${VERSION}`;
const DATA = `ehs-data-${VERSION}`;
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/data/exoplanets.json')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  // Navigations (any ?query = a shared scenario): NETWORK FIRST, revalidating past the HTTP
  // cache, so online users always get the latest shell after a redeploy; the cached
  // index.html is only the offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => { if (res.ok) putCopy(SHELL, './index.html', res); return res; })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }
  event.respondWith(cacheFirst(req));
});

function putCopy(cacheName, req, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(req, copy));
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  putCopy(SHELL, req, res);
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(req);
  const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || network;
}
