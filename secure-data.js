/* Birkhill apps: decrypts till data files (*.json -> *.json.enc, AES-GCM, gzip).
   Key comes from the link (#k=...) once, then is remembered on this phone. */
(function () {
  var KEY_STORE = "birkhill-data-key";
  var DATA = /(^|\/)(titles|stock|products|news|reports|stockcount|sessions|priority20|weekly_full|returns_today|delivery_today|paper_sync|mag_returns|shelfscan|stockin|stockin_products|stockin_sync|baskets|live_status|pricecheck|supmap|datecheck|eden_edn|discontinued|inv\/[A-Za-z0-9_-]+)\.json(\?.*)?$/;
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
  // 28 Nov 2026 (Sentry BIRKHILL-STAFF-APPS-2 and -3, "Error: locked"):
  // Before, ANY failed data fetch (phone asleep or offline, a GitHub Pages hiccup, a deploy in progress) became a fake
  // 403 "locked" answer, and the apps threw it as an unhandled error. A real "locked" now means only "no key on this phone".
  // Network faults and 5xx are retried with a short wait, identical requests made at the same moment share one download,
  // and what is left is an honest 503 "offline" that the apps can handle without losing anything.
  var RETRY_WAIT = [600, 1800];
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function fail(code, text) { var e = new Error(text); e.birkhillCode = code; return e; }
  function fetchEnc(encUrl, n) {
    return realFetch(encUrl, { cache: "no-cache" }).then(function (res) {
      if (res.ok) return res;
      if ((res.status >= 500 || res.status === 408 || res.status === 429) && n < RETRY_WAIT.length) {
        return wait(RETRY_WAIT[n]).then(function () { return fetchEnc(encUrl, n + 1); });
      }
      throw fail(res.status >= 500 || res.status === 408 || res.status === 429 ? 503 : 403, res.status >= 500 ? "offline" : "data " + res.status);
    }, function () {
      if (n < RETRY_WAIT.length) return wait(RETRY_WAIT[n]).then(function () { return fetchEnc(encUrl, n + 1); });
      throw fail(503, "offline");
    });
  }
  function readPlain(encUrl, key, n) {
    return fetchEnc(encUrl, 0).then(function (res) {
      return res.arrayBuffer().then(function (buf) {
        var all = new Uint8Array(buf);
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, key, all.slice(12));
      }, function () { throw fail(503, "offline"); });
    }).then(function (plain) {
      var ds = new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Response(ds).text();
    }).catch(function (err) {
      if (err && err.birkhillCode) throw err;
      // a half-downloaded or half-published file fails to decrypt: try once more before calling it a bad key
      if (n < 1) return wait(RETRY_WAIT[0]).then(function () { return readPlain(encUrl, key, n + 1); });
      throw fail(403, "bad key or data");
    });
  }
  var inflight = {};
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (!DATA.test(url.split("#")[0].replace(location.origin, ""))) return realFetch(input, init);
    var encUrl = url.replace(/\.json(\?.*)?$/, ".json.enc$1");
    var job = inflight[encUrl];
    if (!job) {
      job = inflight[encUrl] = getKey().then(function (key) { return readPlain(encUrl, key, 0); });
      var done = function () { if (inflight[encUrl] === job) delete inflight[encUrl]; };
      job.then(done, done);
    }
    return job.then(function (text) {
      return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
    }, function (err) {
      if (!keyText()) { showNoKey(); return new Response("", { status: 403, statusText: "no key" }); }
      return new Response("", { status: (err && err.birkhillCode) || 403, statusText: String(err && err.message || err) });
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
