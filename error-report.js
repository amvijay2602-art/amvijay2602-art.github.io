/* Birkhill staff apps: tiny JS error reporter (27 Nov 2026).
   Posts window.onerror / unhandledrejection to the Camera Entries sheet as an
   ERROR row (message, page path, app version only). No staff names, no #k= key,
   no stack traces, no other personal data. Skips file:// and localhost. */
(function () {
  if (window.__bkErrorReport) return;
  window.__bkErrorReport = true;
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbz7eKFQN2UbbSA8-4nLzB9crDkQUE5b7_CJ3wnVfqmxODFIfz8G3XNpQ1_igg9SCNJbKg/exec";
  var VER = "2026-11-27.1";
  var QKEY = "birkhill-error-queue-v1";
  var SKEY = "birkhill-error-sent-v1";
  var MAX = 5;
  var sending = false;

  function skipped() {
    try {
      if (location.protocol === "file:") return true;
      var h = location.hostname || "";
      if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
    } catch (e) {}
    return false;
  }
  function jget(k, d) { try { var v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function parts() {
    var o = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function today() { var o = parts(); return o.year + "-" + o.month + "-" + o.day; }
  function nowAt() { var o = parts(); return o.year + "-" + o.month + "-" + o.day + "T" + (o.hour === "24" ? "00" : o.hour) + ":" + o.minute + ":" + o.second; }
  function safeMsg(s) {
    s = String(s == null ? "unknown" : s).slice(0, 300);
    s = s.replace(/#k=[A-Za-z0-9_-]+/g, "#k=<key>");
    s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>");
    return s;
  }
  function pagePath() {
    try { return (location.pathname || "/").replace(/index\.html$/, "") || "/"; } catch (e) { return "/"; }
  }
  function sig(ev) { return ev.type + "|" + ev.page + "|" + ev.msg; }
  function enqueue(ev) {
    if (skipped()) return;
    var sent = jget(SKEY, []);
    if (sent.indexOf(sig(ev)) >= 0) return;
    var q = jget(QKEY, []);
    if (q.length >= MAX) return;
    q.push(ev); jset(QKEY, q);
    flush();
  }
  function flush() {
    if (skipped() || sending) return;
    var q = jget(QKEY, []);
    if (!q.length) return;
    sending = true;
    var ev = q[0];
    var body = JSON.stringify({ name: "ERROR: " + JSON.stringify(ev), photo: "", lines: [{ date: today(), qty: "0" }] });
    fetch(ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: body })
      .then(function () {
        var q2 = jget(QKEY, []);
        if (q2.length && q2[0] && sig(q2[0]) === sig(ev)) q2.shift();
        jset(QKEY, q2);
        var sent = jget(SKEY, []); sent.push(sig(ev)); jset(SKEY, sent.slice(-20));
        sending = false; flush();
      })
      .catch(function () { sending = false; setTimeout(flush, 15000); });
  }
  function report(type, msg, src, line, col) {
    var ev = { t: "error", at: nowAt(), type: type, msg: safeMsg(msg), page: pagePath(), ver: VER };
    if (src) ev.src = safeMsg(String(src).replace(/[?#].*$/, "")).slice(0, 160);
    if (line) ev.line = Number(line) || line;
    if (col) ev.col = Number(col) || col;
    enqueue(ev);
  }
  window.addEventListener("error", function (e) {
    if (!e) return;
    var msg = e.message || (e.error && e.error.message) || "error";
    var src = e.filename || "";
    if (/^chrome-extension:|^moz-extension:/i.test(src)) return;
    report("onerror", msg, src, e.lineno, e.colno);
  });
  window.addEventListener("unhandledrejection", function (e) {
    if (!e) return;
    var r = e.reason, msg = "unhandledrejection";
    if (r && r.message) msg = r.message;
    else if (typeof r === "string") msg = r;
    else { try { msg = String(r); } catch (err) {} }
    report("unhandledrejection", msg, "", 0, 0);
  });
  flush();
})();
