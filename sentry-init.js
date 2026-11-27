/* Birkhill staff apps: Sentry crash and error reporting (27 Nov 2026).
   The DSN is a public client key. This file does not change app features.
   It strips #k= data keys, emails and similar secrets before an event is sent. */
(function () {
  if (window.__bkSentryInit) return;
  window.__bkSentryInit = true;

  function scrub(s) {
    if (s == null) return s;
    s = String(s);
    s = s.replace(/#k=[A-Za-z0-9_-]+/gi, "#k=<key>");
    s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>");
    return s;
  }
  function scrubObj(o) {
    if (!o || typeof o !== "object") return;
    if (typeof o.url === "string") o.url = scrub(o.url);
    if (typeof o.current_url === "string") o.current_url = scrub(o.current_url);
    if (typeof o.message === "string") o.message = scrub(o.message);
    if (typeof o.filename === "string") o.filename = scrub(String(o.filename).replace(/[?#].*$/, ""));
    if (o.request) scrubObj(o.request);
    if (o.headers && typeof o.headers === "object") {
      Object.keys(o.headers).forEach(function (h) { o.headers[h] = scrub(o.headers[h]); });
    }
    if (Array.isArray(o.breadcrumbs)) {
      o.breadcrumbs.forEach(function (b) {
        if (!b) return;
        if (typeof b.message === "string") b.message = scrub(b.message);
        if (b.data) scrubObj(b.data);
      });
    }
    if (o.exception && Array.isArray(o.exception.values)) {
      o.exception.values.forEach(function (v) {
        if (v && typeof v.value === "string") v.value = scrub(v.value);
      });
    }
    if (typeof o.transaction === "string") o.transaction = scrub(o.transaction);
    if (typeof o.culprit === "string") o.culprit = scrub(o.culprit);
  }

  var s = document.createElement("script");
  s.src = "https://browser.sentry-cdn.com/11.19.0/bundle.min.js";
  s.crossOrigin = "anonymous";
  s.onload = function () {
    if (!window.Sentry) return;
    window.Sentry.init({
      dsn: "https://30803b2ee11533e9246e453929a44a92@o4512503462821888.ingest.de.sentry.io/4512503476912208",
      environment: "production",
      sendDefaultPii: false,
      beforeSend: function (event) {
        try { scrubObj(event); } catch (e) {}
        return event;
      }
    });
    try {
      if (/(?:^|[?&])sentry_test=1(?:&|$)/.test(location.search || "")) {
        window.Sentry.captureException(new Error("Sentry test error from Birkhill staff apps"));
      }
    } catch (e) {}
  };
  (document.head || document.documentElement).appendChild(s);
})();
