// Offline support: network first (so updates arrive), cached copy when offline.
const CACHE = 'wordsv-v15';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'src/app.js', 'src/srs.js', 'src/storage.js', 'src/swipe.js', 'src/stats.js', 'src/merge.js', 'src/sync.js', 'src/firebase-config.js', 'src/social.js', 'src/badges.js', 'src/moments-ui.js', 'src/photo.js', 'src/motion.js', 'src/idb.js', 'fonts/bricolage.woff2',
  'data/words.json', 'data/kelly.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'wordsv-sdk').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const SDK = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Firebase SDK files are versioned and never change: serve them from the cache, so signing in
  // and opening Moments don't wait for a ~500 KB download on every launch.
  if (e.request.url.startsWith(SDK)) {
    e.respondWith(
      caches.open('wordsv-sdk').then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res.ok) c.put(e.request, res.clone());
        return res;
      })))
    );
    return;
  }
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
