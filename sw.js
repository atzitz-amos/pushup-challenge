// Network-first service worker: always fresh when online, still opens offline.
const CACHE = 'pushups-v35';
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
  'js/team.js',
  'js/settings.js',
  'js/push.js',
  'js/i18n.js',
  'js/tour.js',
  'js/cheers.js',
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
  // Shared data (Supabase) is cached by the app itself; let those requests through untouched.
  if (e.request.url.includes('/rest/v1/')) return;
  // Own files, the page included: always revalidate with the server. Otherwise the
  // HTTP cache (10 minutes on GitHub Pages) can serve an old page with new scripts,
  // and the app fails to start.
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  const request = !sameOrigin ? e.request
    : e.request.mode === 'navigate'
      ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) // a navigate request can't be copied with options
      : new Request(e.request, { cache: 'no-cache' });
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

// Notifications from the notify-team function (a teammate saved push-ups).
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(data.title || 'Pushup Challenge', {
    body: data.body,
    tag: data.tag,
    renotify: !!data.tag,
    icon: 'icons/icon-192.png',
    data: { url: data.url || './' },
  }));
});

// Tapping a notification opens the app on the team page (reusing an open window).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) {
      open.navigate(url).catch(() => {});
      return open.focus();
    }
    return self.clients.openWindow(url);
  }));
});
