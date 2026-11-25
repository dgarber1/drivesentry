// Pages and scripts: network first, so a fresh upload shows up as soon as you are online.
// The model file and the AI library never change for a given version, so they are cached
// after the first download and used from then on. Keep CACHE in step with config.js.
const CACHE = 'drive-sentry-0.2.2-b3';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'app.js', 'config.js', 'storage.js', 'device.js', 'camera.js', 'ui.js', 'calibration.js', 'settings.js',
  'detection.js', 'detector.js', 'tracker.js', 'detect-worker.js', 'postprocess.js', 'overlay.js', 'perf.js', 'dettest.js',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
];
const ORT_PREFIX = '/npm/onnxruntime-web@1.20.1/';

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

function cacheFirst(req) {
  return caches.open(CACHE).then((cache) =>
    cache.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }))
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The AI library from the CDN (exact version only).
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith(ORT_PREFIX)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // The model file (about 20 MB): download once, then reuse.
  if (url.pathname.endsWith('.onnx')) {
    event.respondWith(cacheFirst(req));
    return;
  }

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
