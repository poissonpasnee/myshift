/* MyShift AI — Service Worker v20260419a */
const CACHE = 'myshift-v20260419a';
const ASSETS = [
  '/myshift/',
  '/myshift/index.html',
  '/myshift/css/styles.css',
  '/myshift/js/app.js',
  '/myshift/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  /* Supabase & CDN — toujours en réseau */
  if (e.request.url.includes('supabase.co') ||
      e.request.url.includes('cdn.jsdelivr') ||
      e.request.url.includes('fonts.')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  /* Assets locaux — cache d'abord, réseau en fallback */
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      if (resp && resp.status === 200 && resp.type === 'basic') {
        var rc = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, rc));
      }
      return resp;
    }))
  );
});
