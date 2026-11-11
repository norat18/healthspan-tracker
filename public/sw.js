// Offline support: keep a copy of the app so it opens without a connection.
// Pages and app files: try the network first (so updates show right away), fall back to the saved copy offline.
// Firebase/pdf.js libraries: serve the saved copy and refresh it in the background.
const CACHE = 'healthspan-v5';
const SHELL = ['./', 'index.html', 'styles.css?v=5', 'catalog.js?v=5', 'scans.js?v=5', 'summary.js?v=5', 'results.js?v=5', 'pastdates.js?v=5',
  'myinfo.js?v=5', 'visit.js?v=5', 'labimport.js?v=5', 'app.js?v=5', 'cloud.js?v=5', 'firebase-config.js', 'privacy.html', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/__/')) return;                        // sign-in handler: never cache
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(r => r || caches.match('index.html'))));
    return;
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/') || url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
