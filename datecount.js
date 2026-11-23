/* Birkhill date check + shelf stock count (20 Nov 2026).
   Shared by the Date Check app (/date/) and the Chiller app date check.
   Saves Stock Count style rows to Camera Entries (same endpoint, same format as /count/):
   COUNTSTART, COUNT (count Q or SKIP), COUNTDONE (counted N of M, skipped K, not reached R).
   Never writes to the till.
   Job History (23 Nov 2026): every line marked Done, Skipped or Cancelled is saved on the phone in
   Job History (localStorage birkhill-job-history-v1, finished checks in birkhill-check-history-v1)
   and leaves the active screen. History is append only and never deleted; if localStorage is full
   the oldest records move to IndexedDB "birkhill-job-history" and are still shown. */
(function () {
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbz7eKFQN2UbbSA8-4nLzB9crDkQUE5b7_CJ3wnVfqmxODFIfz8G3XNpQ1_igg9SCNJbKg/exec";
  var QKEY = "birkhill-datecount-queue-v1";
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function londonISO(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d || new Date()); }
  function londonHM(d) { return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(d || new Date()).replace(":", ""); }
  function londonTime() { return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()).replace(" ", ""); }
  function londonTimeAt(d) { return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true }).format(d).replace(" ", "").toLowerCase(); }
  function ukDate(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso || ""); }
  function clean(s) { return String(s == null ? "" : s).replace(/[|\n\r]/g, "/").trim(); }
  function staff() { try { return (localStorage.getItem("birkhill-staff-name") || "").trim() || "Staff"; } catch (e) { return "Staff"; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  var sending = false;
  function queue(payload) { var q = jget(QKEY, []); q.push(payload); jset(QKEY, q); flush(); }
  function flush() {
    if (sending) return; var q = jget(QKEY, []); if (!q.length) return; sending = true;
    var it = q[0];
    fetch(ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(it) })
      .then(function () { var q2 = jget(QKEY, []); q2.shift(); jset(QKEY, q2); sending = false; flush(); })
      .catch(function () { sending = false; setTimeout(flush, 15000); });
  }
  window.addEventListener("online", flush); setInterval(flush, 30000); setTimeout(flush, 1500);
  function row(kind, fields, qty, date) { queue({ name: kind + ": " + fields.map(clean).join(" | "), photo: "", lines: [{ date: date || londonISO(), qty: String(qty == null ? 0 : qty) }] }); }


  /* ---- Job History store (append only, never deleted) ---- */
  var HKEY = "birkhill-job-history-v1", CKEY = "birkhill-check-history-v1";
  var IDB = "birkhill-job-history", IDBS = "archive";
  function hid() { return "H" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function idbOpen(cb) {
    try {
      var r = indexedDB.open(IDB, 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(IDBS)) r.result.createObjectStore(IDBS, { keyPath: "hid" }); };
      r.onsuccess = function () { cb(r.result); }; r.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function idbAdd(recs, done) {
    idbOpen(function (db) {
      if (!db) { if (done) done(false); return; }
      try {
        var tx = db.transaction(IDBS, "readwrite"), st = tx.objectStore(IDBS);
        recs.forEach(function (r) { st.put(r); });
        tx.oncomplete = function () { if (done) done(true); }; tx.onerror = function () { if (done) done(false); };
      } catch (e) { if (done) done(false); }
    });
  }
  function idbAll(cb) {
    idbOpen(function (db) {
      if (!db) return cb([]);
      try {
        var out = [], rq = db.transaction(IDBS, "readonly").objectStore(IDBS).openCursor();
        rq.onsuccess = function () { var c = rq.result; if (c) { out.push(c.value); c.continue(); } else cb(out); };
        rq.onerror = function () { cb(out); };
      } catch (e) { cb([]); }
    });
  }
  function hList(key) { var a = jget(key, []); return Array.isArray(a) ? a : []; }
  function hAppend(key, rec) {
    rec.hid = rec.hid || hid(); rec.store = key;
    var arr = hList(key); arr.push(rec);
    try { localStorage.setItem(key, JSON.stringify(arr)); return rec; } catch (e) {}
    // localStorage full: keep the new record in IndexedDB, then move the oldest half there too.
    // Records leave localStorage only after IndexedDB has confirmed it holds them.
    var n = Math.max(1, Math.floor((arr.length - 1) / 2)), old = arr.slice(0, n);
    idbAdd([rec].concat(old), function (ok) {
      if (!ok) return;
      try { localStorage.setItem(key, JSON.stringify(hList(key).filter(function (r) { return old.indexOf(r) < 0 && !old.some(function (o) { return o.hid === r.hid; }); }))); } catch (e2) {}
    });
    return rec;
  }
  function hAll(key, cb) {
    var ls = hList(key);
    idbAll(function (arch) {
      var seen = {}, out = [];
      ls.concat(arch.filter(function (r) { return (r.store || HKEY) === key; })).forEach(function (r) { if (r && r.hid && !seen[r.hid]) { seen[r.hid] = 1; out.push(r); } });
      out.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      cb(out);
    });
  }
  function hHasJob(session, key) { return hList(HKEY).some(function (r) { return r.session === session && r.key === key; }); }
  function hHasCheck(session) { return hList(CKEY).some(function (r) { return r.session === session; }); }
  var STATUS = { counted: "Done", skip: "Skipped", cancel: "Cancelled" };

  function DC(o) { this.o = o; this.k = "birkhill-datecount-session-" + o.app; this.migrate(); }
  // One-time catch-up (safe to run every load): lines done before Job History existed are added
  // to it, so nothing from the running check or the last finished check is lost.
  DC.prototype.migrate = function () {
    try {
      var self = this, raw = jget(this.k, null);
      if (raw && raw.res && raw.id) Object.keys(raw.res).forEach(function (key) {
        var r = raw.res[key]; if (!r || hHasJob(raw.id, key)) return;
        self._hist(raw, { key: key, id: key, name: r.name, inList: r.inList }, r, STATUS[r.st] || "Done", true);
      });
      if (raw && raw.finished && raw.id && !hHasCheck(raw.id)) {
        hAppend(CKEY, { kind: "check", app: this.o.app, dept: this.o.dept, session: raw.id, day: raw.date, at: Date.now(), staff: raw.staff,
          startedText: raw.startedText || "", finishedText: raw.finishedText || "", migrated: true });
      }
      var last = jget(this.k + "-last", null);
      if (last && last.id && !hHasCheck(last.id)) {
        hAppend(CKEY, { kind: "check", app: this.o.app, dept: this.o.dept, session: last.id, day: last.date, at: last.at || Date.now(),
          checked: last.checked, skipped: last.skipped, notReached: last.notReached, migrated: true });
      }
    } catch (e) {}
  };
  DC.prototype._hist = function (s, item, r, status, migrated) {
    var d = new Date(r.at || Date.now());
    return hAppend(HKEY, { kind: "job", app: this.o.app, dept: this.o.dept, session: s.id, key: item.key, id: item.id || item.key,
      name: item.name || r.name || "", barcode: item.barcode || "", status: status, result: r.result || "", count: r.count == null ? "" : r.count,
      date: r.date || "", batch: r.batch || 0, held: r.held || 0, till: item.till == null ? "" : item.till, lines: item.lines || null,
      inList: !!(item.inList || r.inList), staff: s.staff || staff(), at: d.getTime(), day: londonISO(d), time: londonTimeAt(d),
      migrated: !!migrated });
  };
  DC.prototype.get = function () {
    var s = jget(this.k, null);
    if (s && (s.finished || s.date !== londonISO())) s = null;
    return s;
  };
  DC.prototype.save = function (s) { jset(this.k, s); };
  DC.prototype.total = function () { var t = this.o.total ? this.o.total() : 0; return Number(t) || 0; };
  DC.prototype.ensure = function () {
    var s = this.get(); if (s) return s;
    var d = new Date();
    s = { id: "DC" + londonISO(d).replace(/-/g, "") + londonHM(d) + Math.random().toString(36).slice(2, 5).toUpperCase(),
          date: londonISO(d), startedText: londonTime(), staff: staff(), total: this.total(), res: {}, finished: false };
    this.save(s);
    row("COUNTSTART", [s.id, this.o.key, this.o.dept, "total " + s.total, s.staff, "snap " + (this.o.snap ? this.o.snap() : "") , "datecheck", "v2"], s.total);
    return s;
  };
  DC.prototype.status = function (key) { var s = this.get(); return s && s.res[key] ? s.res[key].st : null; };
  // item: { key, id, barcode, name, size, till, inList, scan }
  DC.prototype._row = function (s, item, r, edit) {
    var bq = r.st === "counted" && r.date ? (r.batch || r.count) : 0;
    var oos = r.st === "counted" && Number(r.count) === 0;   // zero count: Out of Stock, no date needed (22 Nov 2026)
    row("COUNT", [s.id, this.o.key, this.o.dept, item.id || item.key, item.barcode || "", item.name, item.size || "",
      "till " + (Number(item.till) || 0), "count " + (r.st === "skip" ? "SKIP" : r.count), "bb " + (r.date || "none"),
      "scan " + (r.st === "skip" ? "skip" : (item.scan || "ok")), s.staff, "dtype " + (r.st === "skip" ? "-" : (oos ? "oos" : (r.date ? "useby" : "nodate"))),
      "batches " + (r.st === "counted" && r.date ? r.date + ":" + bq : ""), "held " + (r.held || 0),
      "note " + (r.st === "skip" ? "Skipped at date check" : (oos ? "Out of Stock, date skipped" : "Date check " + (r.result || "OK"))), "edit " + (edit ? "yes" : "no"),
      "stock " + (oos ? "Out of Stock" : "-"), "v2"],
      r.st === "skip" ? 0 : r.count, r.date || londonISO());
  };
  DC.prototype.count = function (item, qty, dateIso, result, batchQty) {
    var s = this.ensure(); var prev = s.res[item.key];
    var q = Math.max(0, Math.round(Number(qty) || 0));
    var b = batchQty == null || batchQty === "" ? q : Math.max(0, Number(batchQty) || 0);
    if (q === 0) dateIso = "";   // zero count never carries a date
    var r = { st: "counted", count: q, date: dateIso || "", result: result || "OK", batch: Math.min(b, q), held: result === "REMOVE" ? Math.min(b, q) : 0,
              name: item.name, inList: !!item.inList || !!(prev && prev.inList), at: Date.now() };
    s.res[item.key] = r; this.save(s); this._row(s, item, r, !!prev);
    this._hist(s, item, r, "Done");
    return r;
  };
  DC.prototype.skip = function (item) {
    var s = this.ensure(); var prev = s.res[item.key];
    if (prev && prev.st === "counted") return prev; // already counted: keep the count
    var r = { st: "skip", name: item.name, inList: !!item.inList, at: Date.now() };
    s.res[item.key] = r; this.save(s); this._row(s, item, r, !!prev);
    this._hist(s, item, r, "Skipped");
    return r;
  };
  // Cancel (23 Nov 2026): staff stop a line on purpose. Saved in Job History on the phone and taken off
  // the screen. No COUNT row is sent (the line counts as not checked in COUNTDONE), till not changed.
  DC.prototype.cancel = function (item) {
    var s = this.ensure(); var prev = s.res[item.key];
    if (prev && prev.st === "counted") return prev;
    var r = { st: "cancel", name: item.name, inList: !!item.inList, at: Date.now() };
    s.res[item.key] = r; this.save(s);
    this._hist(s, item, r, "Cancelled");
    return r;
  };
  DC.prototype.summary = function () {
    var s = this.get(); var c = 0, k = 0, x = 0, cl = 0, kl = 0, xl = 0, skippedNames = [], cancelledNames = [];
    if (s) Object.keys(s.res).forEach(function (key) { var r = s.res[key];
      if (r.st === "counted") { c++; if (r.inList) cl++; }
      else if (r.st === "cancel") { x++; if (r.inList) xl++; cancelledNames.push(r.name); }
      else { k++; if (r.inList) kl++; skippedNames.push(r.name); } });
    var total = Math.max(s ? s.total : this.total(), 0);
    var nr = Math.max(0, total - cl - kl - xl);
    return { session: s, checked: c, skipped: k, cancelled: x, notReached: nr, total: Math.max(total, c + k + x), skippedNames: skippedNames,
             cancelledNames: cancelledNames, listChecked: cl, listSkipped: kl, listCancelled: xl, listDone: cl + kl + xl, sessionId: s ? s.id : "" };
  };
  // Active session id, or "" when no check is running (a finished check never comes back).
  DC.prototype.sessionId = function () { var s = this.get(); return s ? s.id : ""; };
  DC.prototype.pending = function () { return jget(QKEY, []).length; };
  // opts.onClose: called after staff tap OK, so the app can clear its screen for the next check.
  DC.prototype.finish = function (opts) {
    opts = opts || {};
    var s = this.get();
    var sm = this.summary();
    if (s) {
      var st = (sm.skipped === 0 && sm.notReached === 0 && sm.cancelled === 0) ? "Complete" : "Incomplete";
      // Same COUNTDONE format as before; cancelled lines were not checked, so they go in "notreached".
      row("COUNTDONE", [s.id, this.o.key, this.o.dept, "counted " + sm.checked + " of " + sm.total, "skipped " + sm.skipped, s.staff,
        "status " + st, "staff " + s.staff, "notreached " + (sm.notReached + sm.cancelled), "datecheck", "v2"], sm.checked);
      s.finished = true; s.finishedText = londonTime(); this.save(s);
      jset(this.k + "-last", { id: s.id, date: s.date, at: Date.now(), checked: sm.checked, skipped: sm.skipped, notReached: sm.notReached });
      if (!hHasCheck(s.id)) hAppend(CKEY, { kind: "check", app: this.o.app, dept: this.o.dept, session: s.id, day: s.date, at: Date.now(), staff: s.staff,
        startedText: s.startedText || "", finishedText: s.finishedText, checked: sm.checked, skipped: sm.skipped, cancelled: sm.cancelled,
        notReached: sm.notReached, total: sm.total, status: st, skippedNames: sm.skippedNames, cancelledNames: sm.cancelledNames });
    }
    flush();
    sm.pending = jget(QKEY, []).length;
    showSummary(sm, !!s, opts);
    return sm;
  };

  function css() {
    if (document.getElementById("dc-css")) return;
    var st = document.createElement("style"); st.id = "dc-css";
    st.textContent =
      ".dc-qty-wrap{margin-top:10px}.dc-qty-label{display:block;font-weight:700;font-size:.92rem;margin:0 0 6px;color:#18342A}" +
      ".dc-qty{display:grid;grid-template-columns:56px 1fr 56px;gap:8px;align-items:stretch}" +
      ".dc-qty button{min-height:48px;border-radius:12px;border:2px solid #17643F;background:#fff;color:#17643F;font-size:1.5rem;font-weight:800;cursor:pointer}" +
      ".dc-qty button:active{background:#e8f6ec}" +
      ".dc-qty input{width:100%;margin:0!important;text-align:center;font-weight:800;font-size:1.15rem!important;min-height:48px;border:1px solid #c3d6ca;border-radius:10px;padding:10px 6px}" +
      ".dc-btn{min-height:48px;border-radius:12px;font-weight:800;font-size:1rem;cursor:pointer;border:2px solid #E86B2A;background:#fff;color:#b8501a}" +
      ".dc-btn.finish{border-color:#17643F;background:#fff;color:#17643F}" +
      ".dc-btn.finish.solid{background:#17643F;color:#fff}" +
      ".dc-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}" +
      ".dc-flag-skip{display:inline-block;margin-top:6px;font-size:.8rem;font-weight:800;color:#b8501a}" +
      ".dc-modal{position:fixed;inset:0;z-index:10050;background:rgba(24,52,42,.45);display:flex;align-items:center;justify-content:center;padding:16px}" +
      ".dc-box{background:#fff;border-radius:18px;max-width:420px;width:100%;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,.2);font-family:inherit;color:#18342A}" +
      ".dc-box h3{margin:0 0 10px;font-size:1.2rem;color:#17643F}.dc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0 12px}" +
      ".dc-stat{background:#eef5f0;border:1px solid #d5e3da;border-radius:12px;padding:10px 4px;text-align:center}.dc-stat b{display:block;font-size:1.5rem}" +
      ".dc-stats.four{grid-template-columns:repeat(4,1fr)}.dc-stats.four .dc-stat{font-size:.8rem}.dc-stat.sk{background:#fff4ec;border-color:#f3c7a8}.dc-stat.nr{background:#fdecec;border-color:#f5b5b5}" +
      ".dc-box p{margin:6px 0;font-size:.92rem}.dc-box button{width:100%;margin-top:10px;min-height:48px;border:0;border-radius:12px;background:#17643F;color:#fff;font-weight:800;font-size:1.05rem}";
    document.head.appendChild(st);
  }
  function showSummary(sm, had, opts) {
    opts = opts || {};
    css();
    var m = document.createElement("div"); m.className = "dc-modal";
    m.innerHTML = '<div class="dc-box" role="dialog" aria-label="Date check finished"><h3>Date check finished</h3>' +
      (had ? "" : "<p>Nothing new since the last Finish. Everything saved before was already sent.</p>") +
      '<div class="dc-stats four"><div class="dc-stat"><b>' + sm.checked + '</b>Checked</div><div class="dc-stat sk"><b>' + sm.skipped + '</b>Skipped</div><div class="dc-stat sk"><b>' + (sm.cancelled || 0) + '</b>Cancelled</div><div class="dc-stat nr"><b>' + sm.notReached + "</b>Not reached</div></div>" +
      (sm.skippedNames.length ? "<p><b>Skipped:</b> " + sm.skippedNames.map(esc).join(", ") + "</p>" : "") +
      (sm.cancelledNames && sm.cancelledNames.length ? "<p><b>Cancelled:</b> " + sm.cancelledNames.map(esc).join(", ") + "</p>" : "") +
      "<p>Every line is saved in Job History on this phone.</p>" +
      "<p>Shelf counts are saved as a stock count for Vijay. The till is not changed.</p>" +
      (sm.pending ? "<p><b>" + sm.pending + " line(s) still sending.</b> They stay on this phone and keep sending by themselves.</p>" : "") +
      (opts.onClose ? "<p>Tap OK to clear the screen for the next check.</p>" : "") +
      '<button type="button">OK</button></div>';
    m.querySelector("button").onclick = function () { m.remove(); if (opts.onClose) { try { opts.onClose(sm); } catch (e) {} } };
    document.body.appendChild(m);
  }
  function qtyHtml(cls, label) {
    return '<div class="dc-qty-wrap"><span class="dc-qty-label">' + esc(label || "On shelf now (count all)") + '</span><div class="dc-qty">' +
      '<button type="button" class="dc-minus" aria-label="One less">&minus;</button>' +
      '<input class="dc-shelf ' + (cls || "") + '" type="number" inputmode="numeric" min="0" step="1" placeholder="How many?" aria-label="Quantity on shelf">' +
      '<button type="button" class="dc-plus" aria-label="One more">+</button></div></div>';
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest(".dc-minus, .dc-plus"); if (!b) return;
    var wrap = b.closest(".dc-qty"); var inp = wrap && wrap.querySelector("input"); if (!inp) return;
    var v = inp.value === "" ? null : Math.max(0, Math.round(Number(inp.value) || 0));
    if (b.classList.contains("dc-plus")) v = v == null ? 1 : v + 1; else v = v == null ? 0 : Math.max(0, v - 1);
    inp.value = String(v); inp.dispatchEvent(new Event("input", { bubbles: true }));
  });

  /* ---- Job History view (23 Nov 2026) ---- */
  var APPNAME = { date: "Date Check", chiller: "Chiller date check" };
  function hcss() {
    if (document.getElementById("jh-css")) return;
    var st = document.createElement("style"); st.id = "jh-css";
    st.textContent =
      ".jh-open{min-height:48px;border-radius:12px;font-weight:800;font-size:1rem;cursor:pointer;border:2px solid #17643F;background:#fff;color:#17643F;padding:0 14px}" +
      ".jh-modal{position:fixed;inset:0;z-index:10060;background:#f4f7f4;overflow:auto;-webkit-overflow-scrolling:touch;font-family:inherit;color:#18342A;font-size:15px}" +
      ".jh-wrap{max-width:520px;margin:0 auto;padding:14px 14px 90px}" +
      ".jh-head{display:flex;align-items:center;gap:10px;position:sticky;top:0;background:#f4f7f4;padding:6px 0 10px;z-index:1}" +
      ".jh-head h3{flex:1 1 auto;margin:0;font-size:1.25rem;color:#17643F}" +
      ".jh-close{min-height:44px;border:0;border-radius:12px;background:#17643F;color:#fff;font-weight:800;font-size:1rem;padding:0 16px}" +
      ".jh-filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}" +
      ".jh-chip{min-height:40px;border-radius:20px;border:2px solid #17643F;background:#fff;color:#17643F;font-weight:800;font-size:.92rem;padding:0 12px}" +
      ".jh-chip.on{background:#17643F;color:#fff}" +
      ".jh-daterow{display:flex;gap:6px;align-items:center;margin:0 0 10px}.jh-daterow input{flex:1 1 auto;min-height:42px;font-size:1rem;border:1px solid #c3d6ca;border-radius:10px;padding:6px 8px;margin:0}" +
      ".jh-daterow button{min-height:42px;border-radius:10px;border:1px solid #c3d6ca;background:#fff;font-weight:700;font-size:.9rem;padding:0 10px}" +
      ".jh-sec{margin:14px 0 6px;font-size:1.05rem;color:#17643F}" +
      ".jh-day{margin:12px 0 4px;font-weight:800;font-size:.95rem;color:#5f6b5f}" +
      ".jh-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}" +
      ".jh-item{background:#fff;border:1px solid #d5e3da;border-radius:12px;padding:10px 12px}" +
      ".jh-item .n{font-weight:800}.jh-item .m{font-size:.88rem;color:#5f6b5f;margin-top:2px}" +
      ".jh-badge{display:inline-block;font-size:.78rem;font-weight:800;border-radius:8px;padding:2px 8px;margin-right:6px;color:#fff;background:#17643F}" +
      ".jh-badge.Skipped{background:#b8501a}.jh-badge.Cancelled{background:#7a3b3b}" +
      ".jh-empty{color:#5f6b5f;font-weight:600;padding:8px 0}" +
      ".jh-item details{margin-top:6px}.jh-item summary{font-weight:800;color:#17643F;cursor:pointer}.jh-item pre{white-space:pre-wrap;font-family:inherit;font-size:.88rem;margin:6px 0 0}" +
      ".jh-link{display:block;text-align:center;margin-top:12px;min-height:46px;line-height:46px;border-radius:12px;border:2px solid #17643F;color:#17643F;font-weight:800;text-decoration:none;background:#fff}";
    document.head.appendChild(st);
  }
  function jobLine(r) {
    var bits = [];
    if (r.status === "Done") {
      if (r.result === "OOS" || (r.count !== "" && Number(r.count) === 0)) bits.push("Out of Stock (0 on shelf)");
      else {
        if (r.count !== "" && r.count != null) bits.push("On shelf " + r.count);
        if (Array.isArray(r.lines) && r.lines.length) bits.push(r.lines.map(function (l) { return ukDate(l.date) + (l.qty !== "" && l.qty != null ? " x " + l.qty : ""); }).join(", "));
        else if (r.date) bits.push("Date " + ukDate(r.date) + (r.batch ? " x " + r.batch : ""));
        if (r.result === "REMOVE") bits.push("Removed " + (r.held || ""));
      }
    }
    if (r.till !== "" && r.till != null) bits.push("Till " + r.till);
    return bits.join("  ·  ");
  }
  function openHistory(opts) {
    opts = opts || {}; hcss();
    var state = { status: "All", day: "", app: opts.app || "" };
    var m = document.createElement("div"); m.className = "jh-modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", "Job History"); m.id = "jobHistoryModal";
    m.innerHTML = '<div class="jh-wrap"><div class="jh-head"><h3>Job History</h3><button type="button" class="jh-close">Close</button></div>' +
      '<div class="jh-filters">' + ["All", "Done", "Skipped", "Cancelled"].map(function (k) { return '<button type="button" class="jh-chip' + (k === "All" ? " on" : "") + '" data-st="' + k + '">' + k + "</button>"; }).join("") + "</div>" +
      '<div class="jh-daterow"><input type="date" class="jh-date" aria-label="Show one day"><button type="button" class="jh-today">Today</button><button type="button" class="jh-alldays">All days</button></div>' +
      '<div class="jh-count" style="font-weight:700;font-size:.92rem"></div><div class="jh-jobs"></div>' +
      '<h4 class="jh-sec">Past checks and reports</h4><div class="jh-checks"></div><div class="jh-server"></div>' +
      '<a class="jh-link" href="../#reports">Open all reports</a></div>';
    document.body.appendChild(m);
    var jobs = [], checks = [];
    function close() { m.remove(); if (opts.onClose) try { opts.onClose(); } catch (e) {} }
    m.querySelector(".jh-close").onclick = close;
    m.querySelectorAll(".jh-chip").forEach(function (b) { b.onclick = function () {
      state.status = b.getAttribute("data-st"); m.querySelectorAll(".jh-chip").forEach(function (x) { x.classList.toggle("on", x === b); }); draw(); }; });
    var di = m.querySelector(".jh-date");
    di.onchange = function () { state.day = di.value; draw(); };
    m.querySelector(".jh-today").onclick = function () { di.value = londonISO(); state.day = di.value; draw(); };
    m.querySelector(".jh-alldays").onclick = function () { di.value = ""; state.day = ""; draw(); };
    function draw() {
      var list = jobs.filter(function (r) { return (state.status === "All" || r.status === state.status) && (!state.day || r.day === state.day) && (!state.app || r.app === state.app); });
      m.querySelector(".jh-count").textContent = list.length + (list.length === 1 ? " job" : " jobs") + (state.day ? " on " + ukDate(state.day) : "") + (state.status !== "All" ? " (" + state.status + ")" : "");
      var html = "", lastDay = "";
      list.forEach(function (r) {
        if (r.day !== lastDay) { if (lastDay) html += "</ul>"; html += '<div class="jh-day">' + esc(ukDate(r.day)) + '</div><ul class="jh-list">'; lastDay = r.day; }
        var info = jobLine(r);
        html += '<li class="jh-item" data-status="' + esc(r.status) + '"><div class="n"><span class="jh-badge ' + esc(r.status) + '">' + esc(r.status) + "</span>" + esc(r.name || "Unknown") + "</div>" +
          '<div class="m">' + esc(r.time || "") + (r.staff ? "  ·  " + esc(r.staff) : "") + "  ·  " + esc(APPNAME[r.app] || r.dept || r.app || "") + (r.barcode ? "  ·  " + esc(r.barcode) : "") + "</div>" +
          (info ? '<div class="m">' + esc(info) + "</div>" : "") + "</li>";
      });
      if (lastDay) html += "</ul>";
      m.querySelector(".jh-jobs").innerHTML = html || '<p class="jh-empty">No jobs saved for this filter yet.</p>';
      var cl = checks.filter(function (c) { return (!state.day || c.day === state.day) && (!state.app || c.app === state.app); });
      m.querySelector(".jh-checks").innerHTML = cl.length ? '<ul class="jh-list">' + cl.map(function (c) {
        var stats = c.checked != null ? (c.checked + " checked, " + (c.skipped || 0) + " skipped, " + (c.cancelled || 0) + " cancelled, " + (c.notReached || 0) + " not reached") : "Finished";
        return '<li class="jh-item"><div class="n">' + esc(APPNAME[c.app] || c.dept || "") + "  ·  " + esc(ukDate(c.day)) + (c.status ? '  <span class="jh-badge' + (c.status === "Complete" ? "" : " Skipped") + '">' + esc(c.status) + "</span>" : "") + "</div>" +
          '<div class="m">' + esc((c.startedText ? c.startedText + " to " : "") + (c.finishedText || "")) + (c.staff ? "  ·  " + esc(c.staff) : "") + "</div><div class=\"m\">" + esc(stats) + '</div><div class="m">Check ' + esc(c.session) + "</div>" +
          '<div class="jh-rep" data-session="' + esc(c.session) + '"></div></li>';
      }).join("") + "</ul>" : '<p class="jh-empty">No finished checks on this phone for this filter.</p>';
      drawServer();
    }
    var server = null;
    function drawServer() {
      var box = m.querySelector(".jh-server"); if (!server) { box.innerHTML = ""; return; }
      var shown = {};
      m.querySelectorAll(".jh-rep").forEach(function (el) {
        var sid = el.getAttribute("data-session"), f = server.filter(function (x) { return x.id === sid; })[0];
        if (f) { shown[sid] = 1; el.innerHTML = "<details><summary>Report" + (f.reported ? " (sent to Vijay)" : "") + "</summary><pre>" + esc(f.message || "") + "</pre></details>"; }
      });
      var rest = server.filter(function (x) { return !shown[x.id] && /^DC/.test(x.id || "") && (!state.day || String(x.id).slice(2, 10) === state.day.replace(/-/g, "")); });
      box.innerHTML = rest.length ? '<div class="jh-day">Reports from the shop system</div><ul class="jh-list">' + rest.map(function (x) {
        return '<li class="jh-item"><div class="n">' + esc(x.dept || "") + "  ·  " + esc(x.finished_display || "") + (x.status ? '  <span class="jh-badge' + (x.status === "Complete" ? "" : " Skipped") + '">' + esc(x.status) + "</span>" : "") + "</div>" +
          '<div class="m">Counted ' + esc(x.counted) + " of " + esc(x.total) + "</div><details><summary>Report</summary><pre>" + esc(x.message || "") + "</pre></details></li>";
      }).join("") + "</ul>" : "";
    }
    hAll(HKEY, function (a) { jobs = a; hAll(CKEY, function (b) { checks = b; draw(); }); });
    try {
      fetch("../count/sessions.json").then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (d) { server = (d && Array.isArray(d.finished)) ? d.finished : []; drawServer(); }).catch(function () {});
    } catch (e) {}
    return m;
  }
  // Add a Job History button into a container (id or element).
  function historyButton(where, opts) {
    var el = typeof where === "string" ? document.getElementById(where) : where; if (!el) return null;
    hcss();
    var b = document.createElement("button"); b.type = "button"; b.className = "jh-open"; b.textContent = "Job History";
    if (opts && opts.id) b.id = opts.id;
    b.onclick = function () { openHistory(opts); };
    el.appendChild(b); return b;
  }
  css();
  window.BirkhillDateCount = { create: function (o) { return new DC(o); }, qtyHtml: qtyHtml, css: css, londonISO: londonISO,
    history: { open: openHistory, button: historyButton, jobs: function (cb) { hAll(HKEY, cb); }, checks: function (cb) { hAll(CKEY, cb); },
      add: function (rec) { rec.kind = rec.kind || "job"; rec.at = rec.at || Date.now(); rec.day = rec.day || londonISO(new Date(rec.at)); rec.time = rec.time || londonTimeAt(new Date(rec.at)); rec.staff = rec.staff || staff(); return hAppend(HKEY, rec); },
      has: hHasJob,
      hasSameDay: function (day, name, barcode) { var n = String(name || "").toUpperCase(); return hList(HKEY).some(function (r) { return r.day === day && ((barcode && r.barcode === barcode) || String(r.name || "").toUpperCase() === n); }); } } };
})();
