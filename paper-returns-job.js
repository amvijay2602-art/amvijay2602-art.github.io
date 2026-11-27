/* Newspaper returns job on the staff home screen.
   From 6pm Europe/London, show a job until staff confirm (PAPERRETURNCONFIRM).
   The phone checks the time itself, so it appears at 6pm even if reports were built earlier. */
(function (root) {
  var CONFIRM_KEY = "birkhill-paper-stockin-pack-finished-v1";
  var RETURNS_HREF = "paper/?open=modeReturns";

  function afterSix(hm) {
    return String(hm || "") >= "18:00";
  }

  function confirmOnDay(conf, day) {
    if (!conf || !day) return false;
    if (conf.date && String(conf.date).slice(0, 10) !== day) return false;
    return !!(conf.status || conf.at || conf.by || conf.finished);
  }

  function localConfirmed(day, storage) {
    try {
      var store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
      if (!store || !store.getItem) return false;
      var o = JSON.parse(store.getItem(CONFIRM_KEY) || "null");
      return !!(o && o.date === day && (o.finished || o.status || o.at || o.by));
    } catch (e) {
      return false;
    }
  }

  function countsLabel(items) {
    var bits = [];
    (items || []).forEach(function (it) {
      var n = Number(it.unsold != null ? it.unsold : it.qty);
      var title = String(it.title || it.short || "").trim();
      if (title && n > 0) bits.push(title + " " + n);
    });
    return bits.length ? ("Newspaper returns: " + bits.join(", ")) : "Newspaper returns";
  }

  function decide(opts) {
    opts = opts || {};
    var now = opts.now || {};
    var hm = now.hm || "";
    var day = now.day || "";
    if (!afterSix(hm)) return null;
    if (confirmOnDay(opts.confirmation, day)) return null;
    if (opts.localDone || localConfirmed(day, opts.storage)) return null;
    return { label: countsLabel(opts.tonightNews), href: RETURNS_HREF };
  }

  var api = {
    afterSix: afterSix,
    confirmOnDay: confirmOnDay,
    localConfirmed: localConfirmed,
    countsLabel: countsLabel,
    decide: decide,
    CONFIRM_KEY: CONFIRM_KEY,
    RETURNS_HREF: RETURNS_HREF
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BirkhillPaperReturnsJob = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
