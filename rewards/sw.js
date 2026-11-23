/* Customer Rewards Club. Promotions are fetched fresh (network first) so ended offers drop off. */
const CACHE = "birkhill-rewards-customer-posters-v2";
const SHELL = ["./","index.html","manifest.json","logo.png","icon-192.png","icon-512.png","jsbarcode.min.js","poster/poster.css","poster/poster.js","poster/html-to-image.js","poster/fonts/poppins-medium.woff","poster/fonts/poppins-semibold.woff","poster/fonts/poppins-bold.woff","poster/fonts/poppins-extrabold.woff","poster/fonts/poppins-black.woff"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Network first for the feed, the page itself and the poster template, so changes show straight away.
  const promo = /promotions\.json(?:\?|$)/.test(url.pathname + url.search) || req.mode === "navigate" ||
    /\/rewards\/(?:index\.html)?$/.test(url.pathname) || url.pathname.indexOf("/rewards/poster/") === 0;
  if (promo) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const copy = fresh.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return fresh;
      } catch (e) {
        const hit = await caches.match(req) || (/promotions\.json/.test(url.pathname) ? await caches.match("./promotions.json") : null);
        if (hit) return hit;
        throw e;
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const fresh = await fetch(req);
    if (fresh.ok && url.pathname.startsWith("/rewards/")) {
      const copy = fresh.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return fresh;
  })());
});
