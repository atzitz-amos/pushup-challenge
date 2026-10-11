// Network-first service worker: always fresh when online, still opens offline.
const CACHE = 'pushups-v5';
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/config.js',
  'js/store.js',
  'js/stats.js',
  'js/wheel.js',
  'js/ring.js',
  'js/effects.js',
  'js/demo.js',
  'js/nav.js',
  'js/calendar.js',
  'js/gestures.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Own files: always revalidate with the server, so an update shows up on the next open
  // instead of whenever the HTTP cache expires.
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  const request = sameOrigin && e.request.mode !== 'navigate'
    ? new Request(e.request, { cache: 'no-cache' })
    : e.request;
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
