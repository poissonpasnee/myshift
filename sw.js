/* MyShift AI — Service Worker v20260419b */
var CACHE = 'myshift-v20260419b';
var ASSETS = [
  '/myshift/',
  '/myshift/index.html',
  '/myshift/css/styles.css',
  '/myshift/js/app.js',
  '/myshift/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return c.addAll(ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.url.indexOf('supabase.co') !== -1 ||
      e.request.url.indexOf('cdn.jsdelivr') !== -1 ||
      e.request.url.indexOf('fonts.') !== -1) {
    e.respondWith(
      fetch(e.request).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(r) {
      if (r) return r;
      return fetch(e.request).then(function(resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var rc = resp.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, rc); });
        }
        return resp;
      });
    })
  );
});
