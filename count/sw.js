const CACHE_NAME = "birkhill-stock-count-v1-gh";
self.addEventListener("install", function (e) { e.waitUntil(caches.open(CACHE_NAME).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("birkhill-stock-count") === 0 && k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) { e.respondWith(fetch(e.request)); });
