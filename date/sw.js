const CACHE_NAME = "birkhill-camera-v3-gh";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) {
          return caches.delete(k);
        })
      ).then(function () {
        return self.clients.claim();
      });
    })
  );
});

self.addEventListener("fetch", function (event) {
  event.respondWith(fetch(event.request));
});
