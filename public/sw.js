/* Minimal service worker. Owner: Agent 7.
 * - App shell (same-origin GET, non-data): cache-first, filled on first fetch.
 * - data/exoplanets.json: stale-while-revalidate.
 * Registered from src/main.ts in production builds only.
 * Bump VERSION to drop old caches after a deploy that changes the shell.
 */
const VERSION = 'v1';
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
  // Navigations: network first so a new deploy's index.html (with new hashed assets) is picked up.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => { putCopy(SHELL, req, res); return res; }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
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
