// Network first, so a fresh upload shows up as soon as you are online.
// The cache is only a fallback. Keep CACHE in step with config.js when you bump the version.
const CACHE = 'drive-sentry-0.1.0-b1';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'app.js', 'config.js', 'storage.js', 'device.js', 'camera.js', 'ui.js', 'calibration.js', 'settings.js',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
