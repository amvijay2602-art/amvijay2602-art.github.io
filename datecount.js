/* Birkhill date check + shelf stock count (20 Nov 2026).
   Shared by the Date Check app (/date/) and the Chiller app date check.
   Saves Stock Count style rows to Camera Entries (same endpoint, same format as /count/):
   COUNTSTART, COUNT (count Q or SKIP), COUNTDONE (counted N of M, skipped K, not reached R).
   Never writes to the till. */
(function () {
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbz7eKFQN2UbbSA8-4nLzB9crDkQUE5b7_CJ3wnVfqmxODFIfz8G3XNpQ1_igg9SCNJbKg/exec";
  var QKEY = "birkhill-datecount-queue-v1";
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function londonISO(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d || new Date()); }
  function londonHM(d) { return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(d || new Date()).replace(":", ""); }
  function londonTime() { return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()).replace(" ", ""); }
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

  function DC(o) { this.o = o; this.k = "birkhill-datecount-session-" + o.app; }
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
    row("COUNT", [s.id, this.o.key, this.o.dept, item.id || item.key, item.barcode || "", item.name, item.size || "",
      "till " + (Number(item.till) || 0), "count " + (r.st === "skip" ? "SKIP" : r.count), "bb " + (r.date || "none"),
      "scan " + (r.st === "skip" ? "skip" : (item.scan || "ok")), s.staff, "dtype " + (r.st === "skip" ? "-" : (r.date ? "useby" : "nodate")),
      "batches " + (r.st === "counted" && r.date ? r.date + ":" + bq : ""), "held " + (r.held || 0),
      "note " + (r.st === "skip" ? "Skipped at date check" : "Date check " + (r.result || "OK")), "edit " + (edit ? "yes" : "no"), "v2"],
      r.st === "skip" ? 0 : r.count, r.date || londonISO());
  };
  DC.prototype.count = function (item, qty, dateIso, result, batchQty) {
    var s = this.ensure(); var prev = s.res[item.key];
    var q = Math.max(0, Math.round(Number(qty) || 0));
    var b = batchQty == null || batchQty === "" ? q : Math.max(0, Number(batchQty) || 0);
    var r = { st: "counted", count: q, date: dateIso || "", result: result || "OK", batch: Math.min(b, q), held: result === "REMOVE" ? Math.min(b, q) : 0,
              name: item.name, inList: !!item.inList || !!(prev && prev.inList), at: Date.now() };
    s.res[item.key] = r; this.save(s); this._row(s, item, r, !!prev);
    return r;
  };
  DC.prototype.skip = function (item) {
    var s = this.ensure(); var prev = s.res[item.key];
    if (prev && prev.st === "counted") return prev; // already counted: keep the count
    var r = { st: "skip", name: item.name, inList: !!item.inList, at: Date.now() };
    s.res[item.key] = r; this.save(s); this._row(s, item, r, !!prev);
    return r;
  };
  DC.prototype.summary = function () {
    var s = this.get(); var c = 0, k = 0, cl = 0, kl = 0, skippedNames = [];
    if (s) Object.keys(s.res).forEach(function (key) { var r = s.res[key]; if (r.st === "counted") { c++; if (r.inList) cl++; } else { k++; if (r.inList) kl++; skippedNames.push(r.name); } });
    var total = Math.max(s ? s.total : this.total(), 0);
    var nr = Math.max(0, total - cl - kl);
    return { session: s, checked: c, skipped: k, notReached: nr, total: Math.max(total, c + k), skippedNames: skippedNames };
  };
  DC.prototype.finish = function () {
    var s = this.get();
    var sm = this.summary();
    if (s) {
      var st = (sm.skipped === 0 && sm.notReached === 0) ? "Complete" : "Incomplete";
      row("COUNTDONE", [s.id, this.o.key, this.o.dept, "counted " + sm.checked + " of " + sm.total, "skipped " + sm.skipped, s.staff,
        "status " + st, "staff " + s.staff, "notreached " + sm.notReached, "datecheck", "v2"], sm.checked);
      s.finished = true; this.save(s);
    }
    showSummary(sm, !!s);
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
      ".dc-stat.sk{background:#fff4ec;border-color:#f3c7a8}.dc-stat.nr{background:#fdecec;border-color:#f5b5b5}" +
      ".dc-box p{margin:6px 0;font-size:.92rem}.dc-box button{width:100%;margin-top:10px;min-height:48px;border:0;border-radius:12px;background:#17643F;color:#fff;font-weight:800;font-size:1.05rem}";
    document.head.appendChild(st);
  }
  function showSummary(sm, had) {
    css();
    var m = document.createElement("div"); m.className = "dc-modal";
    m.innerHTML = '<div class="dc-box" role="dialog" aria-label="Date check finished"><h3>Date check finished</h3>' +
      (had ? "" : "<p>Nothing was checked or skipped in this run.</p>") +
      '<div class="dc-stats"><div class="dc-stat"><b>' + sm.checked + '</b>Checked</div><div class="dc-stat sk"><b>' + sm.skipped + '</b>Skipped</div><div class="dc-stat nr"><b>' + sm.notReached + "</b>Not reached</div></div>" +
      (sm.skippedNames.length ? "<p><b>Skipped:</b> " + sm.skippedNames.map(esc).join(", ") + "</p>" : "") +
      "<p>Shelf counts are saved as a stock count for Vijay. The till is not changed.</p>" +
      '<button type="button">OK</button></div>';
    m.querySelector("button").onclick = function () { m.remove(); };
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
  css();
  window.BirkhillDateCount = { create: function (o) { return new DC(o); }, qtyHtml: qtyHtml, css: css, londonISO: londonISO };
})();
