const CACHE_NAME = "birkhill-stockin-v5-gh";
// 28 Nov 2026: Web Share Target. On Android, WhatsApp > Share > "Deliveries" posts the invoice photo(s) here.
// The files stay on the phone (Cache Storage) until the app page picks them up and runs the normal Invoice Scanner
// upload (encrypted to the box). Nothing is sent anywhere by this worker.
const SHARE_CACHE = "birkhill-share-v1";
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
async function takeShare(req) {
  const fd = await req.formData();
  const files = fd.getAll("invoice").filter(function (f) { return f && typeof f === "object" && f.size > 0; });
  const text = [fd.get("title"), fd.get("text"), fd.get("url")].filter(Boolean).join(" ").slice(0, 500);
  const cache = await caches.open(SHARE_CACHE);
  const old = await cache.keys();
  await Promise.all(old.map(function (k) { return cache.delete(k); }));
  const meta = { at: new Date().toISOString(), text: text, files: [] };
  for (let i = 0; i < files.length && i < 20; i++) {
    const f = files[i], key = "./__shared/" + i;
    await cache.put(key, new Response(f, { headers: { "content-type": f.type || "application/octet-stream" } }));
    meta.files.push({ key: key, name: f.name || ("invoice-" + (i + 1)), type: f.type || "" });
  }
  await cache.put("./__shared/meta", new Response(JSON.stringify(meta), { headers: { "content-type": "application/json" } }));
  return Response.redirect("./?shared=1", 303);
}
self.addEventListener("fetch", function (e) {
  const u = new URL(e.request.url);
  if (e.request.method === "POST" && /\/share-target\/?$/.test(u.pathname)) {
    e.respondWith(takeShare(e.request).catch(function () { return Response.redirect("./?shared=0", 303); }));
    return;
  }
  e.respondWith(fetch(e.request));
});
