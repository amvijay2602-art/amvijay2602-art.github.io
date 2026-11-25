/* Home shell service worker. Only handles the home page files; the sub-apps keep their own. */
const CACHE = "birkhill-home-v3";
const SHELL = ["./", "index.html", "manifest.json", "master.html", "master-manifest.json", "icon-192.png", "icon-512.png", "secure-data.js", "add-to-home.js"];
const SHELL_PATHS = new Set(SHELL.map(function (p) { return new URL(p, self.registration.scope).pathname; }));
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("birkhill-home-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const isShell = SHELL_PATHS.has(url.pathname) || url.pathname.endsWith("/reports.json.enc");
  if (!isShell) return; // sub-apps and their data: untouched
  e.respondWith(fetch(e.request).then(function (res) {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match("index.html"); });
  }));
});
