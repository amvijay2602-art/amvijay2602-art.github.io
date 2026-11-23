const CACHE_NAME = "birkhill-stock-count-v7-gh";
const IMG_CACHE = "birkhill-stock-count-img";
self.addEventListener("install", function (e) { e.waitUntil(caches.open(CACHE_NAME).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("birkhill-stock-count") === 0 && k !== CACHE_NAME && k !== IMG_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method === "GET" && u.origin === location.origin && u.pathname.indexOf("/img/") >= 0) {
    // product pictures: cache first, so they still show with a poor signal in the stock room
    e.respondWith(caches.open(IMG_CACHE).then(function (c) {
      return c.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (res) { if (res && res.ok) c.put(e.request, res.clone()); return res; });
      });
    }));
    return;
  }
  e.respondWith(fetch(e.request));
});
