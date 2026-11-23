/* Birkhill shared date + stock record store (23 Nov 2026, VJ t1383u).
   Used by the Date Check app (Manual Date Check, Date Reports) and Stock In (Eden EDN delivery check).
   Same website, so records on a phone are shared by both apps. Nothing here writes to the till:
   stock corrections are saved as their own audit records and go to the box as DRAFT stock adjustments for Vijay. */
(function () {
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbz7eKFQN2UbbSA8-4nLzB9crDkQUE5b7_CJ3wnVfqmxODFIfz8G3XNpQ1_igg9SCNJbKg/exec";
  var K = { rec: "birkhill-date-records-v1", corr: "birkhill-stock-corrections-v1", prod: "birkhill-product-records-v1",
            warn: "birkhill-date-warn-v1", queue: "birkhill-date-queue-v1" };
  function jget(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function parts() { var o = {}; new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; }); return o; }
  function today() { var o = parts(); return o.year + "-" + o.month + "-" + o.day; }
  function nowAt() { var o = parts(); return o.year + "-" + o.month + "-" + o.day + "T" + (o.hour === "24" ? "00" : o.hour) + ":" + o.minute + ":" + o.second; }
  function ukDate(iso) { iso = String(iso || ""); return iso.length >= 10 ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : iso; }
  function ukWhen(at) { at = String(at || ""); if (at.length < 16) return ukDate(at); var h = +at.slice(11, 13), m = at.slice(14, 16); return ukDate(at) + " " + ((h % 12) || 12) + ":" + m + (h < 12 ? "am" : "pm"); }
  function days(a, b) { return Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000); }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function staff() { try { return (localStorage.getItem("birkhill-staff-name") || "").trim(); } catch (e) { return ""; } }
  function isTest() { try { return localStorage.getItem("birkhill-test-mode") === "1"; } catch (e) { return false; } }
  // sending (same Camera Entries sheet as the other apps; offline-safe queue)
  var sending = false;
  function send(prefix, ev) {
    if (isTest()) ev.test = true;
    var q = jget(K.queue, []); q.push({ name: prefix + ": " + JSON.stringify(ev), photo: "", lines: [{ date: today(), qty: "0" }] }); jset(K.queue, q); flush();
  }
  function flush() {
    var q = jget(K.queue, []); if (sending || !q.length) return; sending = true;
    fetch(ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(q[0]) })
      .then(function () { var q2 = jget(K.queue, []); q2.shift(); jset(K.queue, q2); sending = false; flush(); })
      .catch(function () { sending = false; setTimeout(flush, 15000); });
  }
  function waiting() { return jget(K.queue, []).length; }
  // product records: one per till product (pid) when the barcode is verified, else per barcode
  function pkey(pid, bc) { return pid ? "P" + pid : (bc ? "B" + bc : ""); }
  function product(pid, bc) { return (jget(K.prod, {}))[pkey(pid, bc)] || null; }
  function touchProduct(pid, bc, name, patch) {
    var all = jget(K.prod, {}), k = pkey(pid, bc); if (!k) return null;
    var p = all[k] || { pid: pid || null, bc: bc || "", name: name || "", checks: [], corrections: [] };
    if (name) p.name = name; if (bc && !p.bc) p.bc = bc;
    for (var x in (patch || {})) p[x] = patch[x];
    all[k] = p; jset(K.prod, all); return p;
  }
  // stock correction: never overwrites; each is its own audit record with the previous value
  function lastCorrection(pid, bc) { var k = pkey(pid, bc); return jget(K.corr, []).filter(function (c) { return pkey(c.pid, c.bc) === k; }).slice(-1)[0] || null; }
  function correction(o) {
    var lc = lastCorrection(o.pid, o.bc);
    var prev = (lc && o.snapshotAt && lc.at > o.snapshotAt) ? lc.new : o.recorded;
    if (Number(prev) === Number(o.qty)) return null;
    var c = { t: "correction", id: uid("SC"), at: nowAt(), staff: o.staff || staff(), pid: o.pid || null, bc: o.bc || "", name: o.name || "",
              prev: prev, new: Number(o.qty), chg: Number(o.qty) - Number(prev || 0), src: o.src, ref: o.ref || "",
              recorded: o.recorded, recorded_at: o.snapshotAt || "", prev_correction: lc ? lc.id : "", status: "draft" };
    var all = jget(K.corr, []); all.push(c); jset(K.corr, all);
    var p = touchProduct(o.pid, o.bc, o.name, {}); if (p) { p.corrections = (p.corrections || []).concat([c.id]); var A = jget(K.prod, {}); A[pkey(o.pid, o.bc)] = p; jset(K.prod, A); }
    send(o.src === "edn" ? "EDN1" : "MDC1", c);
    return c;
  }
  // date check record (manual or EDN)
  function addCheck(r) {
    r.id = r.id || uid(r.src === "edn" ? "EI" : "MC"); r.at = r.at || nowAt(); r.staff = r.staff || staff();
    r.t = r.src === "edn" ? "edn_item" : "check";
    var all = jget(K.rec, []); all.push(r); jset(K.rec, all);
    var p = touchProduct(r.pid, r.bc, r.name, { last_check: { id: r.id, at: r.at, src: r.src, qty: r.qty, batches: r.batches, dtype: r.dtype } });
    if (p) { p.checks = (p.checks || []).concat([r.id]).slice(-50); var A = jget(K.prod, {}); A[pkey(r.pid, r.bc)] = p; jset(K.prod, A); }
    send(r.src === "edn" ? "EDN1" : "MDC1", r);
    return r;
  }
  function records(extra) {
    var mine = jget(K.rec, []), ids = {}; mine.forEach(function (r) { ids[r.id] = 1; });
    return mine.concat((extra || []).filter(function (r) { return !ids[r.id]; }));
  }
  // warning periods (manager setting)
  var DEF = { short: 7, urgent: 3 };
  function warn(boxSettings) {
    var w = jget(K.warn, null), b = (boxSettings || [])[0];
    if (b && (!w || String(b.at) > String(w.at))) w = b;
    return { short: (w && +w.short) || DEF.short, urgent: (w && w.urgent != null) ? +w.urgent : DEF.urgent, by: w && w.by || "", at: w && w.at || "" };
  }
  function setWarn(short, urgent, by) {
    var w = { t: "settings", short: +short, urgent: +urgent, by: by, at: nowAt() }; jset(K.warn, w); send("MDC1", w); return w;
  }
  // classify the latest record per product: expired (use-by passed), overdue (best-before passed), short-dated
  function classify(all, w) {
    var latest = {};
    all.forEach(function (r) { var k = pkey(r.pid, r.bc) || ("N" + r.name); if (!latest[k] || String(r.at) >= String(latest[k].at)) latest[k] = r; });
    var t = today(), out = { expired: [], overdue: [], short: [], checked: 0 };
    Object.keys(latest).forEach(function (k) {
      var r = latest[k]; out.checked++;
      if (!r.qty || r.dtype === "none" || r.dtype === "zero") return;
      (r.batches || []).forEach(function (b) {
        if (!b.d || !(Number(b.q) > 0)) return;
        var left = days(b.d, t), kind = b.k || r.dtype;
        var row = { name: r.name, bc: r.bc, pid: r.pid, date: b.d, qty: Number(b.q), left: left, kind: kind, at: r.at, staff: r.staff, src: r.src, dept: r.dept || "", sub: r.sub || "" };
        if (left < 0 && kind !== "bb") { row.urgent = true; out.expired.push(row); }
        else if (left < 0) { row.urgent = true; out.overdue.push(row); }
        else if (left <= w.short) { row.urgent = left <= w.urgent; out.short.push(row); }
      });
    });
    ["expired", "overdue", "short"].forEach(function (s) { out[s].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); });
    return out;
  }
  function kindTxt(k) { return k === "useby" ? "Use-by" : k === "bb" ? "Best-before" : k === "multi" ? "Date" : "Date"; }
  function reportText(c, w) {
    var L = ["Birkhill date report " + ukDate(today()), "Expired: " + c.expired.length + ". Past best-before: " + c.overdue.length + ". Short-dated (" + w.short + " days): " + c.short.length + "."];
    function sec(t, a) { if (!a.length) return; L.push(""); L.push(t); a.forEach(function (r) { L.push((r.urgent ? "URGENT " : "") + r.name + ", barcode " + (r.bc || "none") + ", " + kindTxt(r.kind) + " " + ukDate(r.date) + ", qty " + r.qty + (r.left < 0 ? ", " + (-r.left) + " days ago" : ", " + r.left + " days left")); }); }
    sec("EXPIRED (remove now)", c.expired); sec("PAST BEST-BEFORE", c.overdue); sec("SHORT-DATED", c.short);
    return L.join("\n");
  }
  function share(text, title) {
    if (navigator.share) return navigator.share({ title: title || "Birkhill report", text: text }).catch(function () {});
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  }
  // manager code check (same codes as Stock In > Manager)
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function unhex(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function managers() { return fetch("../stockin/stockin.json").then(function (r) { if (!r.ok) throw new Error("locked"); return r.json(); }).then(function (j) { return j.managers || {}; }); }
  function checkManager(name, code) {
    var enc = new TextEncoder();
    return managers().then(function (M) {
      if (!M[name]) throw new Error("No manager code set up for " + name);
      return crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]).then(function (k) {
        return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("BH-MGR-" + name.trim().toUpperCase()), iterations: 100000 }, k, 256);
      }).then(function (bits) {
        return crypto.subtle.importKey("raw", unhex(hex(bits)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]).then(function (hk) { return crypto.subtle.sign("HMAC", hk, enc.encode("BH-MGR-LOGIN")); });
      }).then(function (sig) { if (hex(sig) !== M[name]) throw new Error("Code not right."); return true; });
    });
  }
  setTimeout(flush, 1500);
  window.BirkhillDates = { K: K, jget: jget, jset: jset, esc: esc, today: today, nowAt: nowAt, ukDate: ukDate, ukWhen: ukWhen, days: days, uid: uid, staff: staff,
    send: send, flush: flush, waiting: waiting, pkey: pkey, product: product, touchProduct: touchProduct, correction: correction, lastCorrection: lastCorrection,
    addCheck: addCheck, records: records, warn: warn, setWarn: setWarn, classify: classify, reportText: reportText, share: share,
    managers: managers, checkManager: checkManager, kindTxt: kindTxt };
})();
