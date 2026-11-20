/* Birkhill apps: decrypts till data files (*.json -> *.json.enc, AES-GCM, gzip).
   Key comes from the link (#k=...) once, then is remembered on this phone. */
(function () {
  var KEY_STORE = "birkhill-data-key";
  var DATA = /(^|\/)(titles|stock|products|news|reports|stockcount)\.json(\?.*)?$/;
  var m = /[#&]k=([A-Za-z0-9_-]{16,})/.exec(location.hash || "");
  if (m) {
    try { localStorage.setItem(KEY_STORE, m[1]); } catch (e) {}
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  function keyText() { try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } }
  function b64u(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  var keyPromise = null;
  function getKey() {
    if (!keyPromise) {
      var k = keyText();
      if (!k) return Promise.reject(new Error("no key"));
      keyPromise = crypto.subtle.importKey("raw", b64u(k), "AES-GCM", false, ["decrypt"]);
    }
    return keyPromise;
  }
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (!DATA.test(url.split("#")[0].replace(location.origin, ""))) return realFetch(input, init);
    var encUrl = url.replace(/\.json(\?.*)?$/, ".json.enc$1");
    return Promise.all([getKey(), realFetch(encUrl, { cache: "no-cache" })]).then(function (r) {
      var key = r[0], res = r[1];
      if (!res.ok) throw new Error("data " + res.status);
      return res.arrayBuffer().then(function (buf) {
        var all = new Uint8Array(buf);
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, key, all.slice(12));
      });
    }).then(function (plain) {
      var ds = new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Response(ds).text();
    }).then(function (text) {
      return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
    }).catch(function (err) {
      if (!keyText()) showNoKey();
      return new Response("", { status: 403, statusText: String(err && err.message || err) });
    });
  };
  var shown = false;
  function showNoKey() {
    if (shown) return; shown = true;
    var go = function () {
      var d = document.createElement("div");
      d.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:99999;background:#b71c1c;color:#fff;padding:12px;font:16px sans-serif;text-align:center";
      d.textContent = "Product list locked. Open this app once from the full link Vijay sent (it ends in #k=...).";
      document.body.appendChild(d);
    };
    if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
  }
})();
