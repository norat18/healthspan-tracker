// Offline support: keep a copy of the app so it opens without a connection.
// Pages and app files: try the network first (so updates show right away), fall back to the saved copy offline.
// Firebase/pdf.js libraries: serve the saved copy and refresh it in the background.
const CACHE = 'healthspan-v25';
const SHELL = ['./', 'index.html', 'styles.css?v=25', 'vault.js?v=25', 'catalog.js?v=25', 'units.js?v=25', 'scans.js?v=25', 'summary.js?v=25', 'results.js?v=25', 'pastdates.js?v=25',
  'myinfo.js?v=25', 'push.js?v=25', 'visit.js?v=25', 'labimport.js?v=25', 'scanreport.js?v=25', 'app.js?v=25', 'cloud.js?v=25', 'firebase-config.js', 'privacy.html', 'manifest.webmanifest',
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

// Reminder notifications: the push has no content; show the reminder text the app saved on this device.
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let s = { title: 'Healthspan Tracker', body: 'You have health reminders — tap to see what’s due.' };
    try { const r = await (await caches.open('healthspan-meta')).match('reminder-summary'); if (r) s = await r.json(); } catch (err) { }
    await self.registration.showNotification(s.title, { body: s.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'healthspan-reminders', data: { url: './#reminders' } });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = all.find(w => new URL(w.url).origin === location.origin);
    if (c) { await c.focus(); c.navigate && c.navigate('./#reminders'); } else await self.clients.openWindow('./#reminders');
  })());
});
