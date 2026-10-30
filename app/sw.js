// Offline support: app shell cached on install, fonts cached on first use.
// Bump VERSION on every release so phones pick up the new files.
const VERSION = 'hsabati-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/main.js', 'js/db.js', 'js/parse.js', 'js/format.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (url.origin !== location.origin && !isFont) return;

  // Fonts: cache first (they never change). Our files: answer from cache
  // instantly and refresh it in the background, so the app opens at once
  // even on a weak connection; a new deploy shows up on the next launch.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: !isFont });
    const fresh = fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    });
    if (hit) {
      if (!isFont) e.waitUntil(fresh.catch(() => {}));
      return hit;
    }
    return fresh.catch(() => cache.match('index.html'));
  })());
});
