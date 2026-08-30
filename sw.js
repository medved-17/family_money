// Service worker: офлайн-оболочка приложения (offline-first)

const VERSION = 'v1';
const CACHE = `family-money-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js', './js/ui.js', './js/store.js', './js/db.js', './js/util.js',
  './js/rates.js', './js/sync.js', './js/agg.js', './js/charts.js',
  './js/settings.js', './js/export.js', './js/xlsx.js', './js/pdf.js',
  './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // курсы и Firebase — только сеть (у них своя офлайн-логика)
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      const fetched = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
