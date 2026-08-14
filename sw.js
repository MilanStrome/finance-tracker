/* Finance Tracker - service worker (offline shell only)
   No libraries, no push, no background sync. Bump CACHE to invalidate old shells.
   Keep this version string in step with APP_VERSION in index.html. */
const CACHE = 'ft-v1';
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // best-effort: one missing path must not abort the whole install
    await Promise.all(SHELL.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Only GETs are ever cacheable; sync pushes are POSTs and must pass straight through.
  if (req.method !== 'GET') return;

  // Anything not same-origin - above all the Apps Script sync URL - bypasses the
  // worker entirely, so sync always hits the real network and fails honestly
  // into the app's own offline queue.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first with cache fallback: a push to GitHub still reaches everyone
  // on their next online load, while an offline load still opens the app.
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const copy = fresh.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      // navigations fall back to the cached shell
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html') || await caches.match('./');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
