const CACHE = 'surau-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'tree.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

// Satu fail gagal dimuat tidak lagi membatalkan pemasangan service worker.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fail aplikasi: stale-while-revalidate. Navigasi: jatuh balik ke index.html apabila luar talian.
// Permintaan ke Google (Apps Script / Drive) tidak disentuh.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(async () => hit || (req.mode === 'navigate' ? cache.match('index.html') : Response.error()));
      return hit || net;
    })
  );
});
