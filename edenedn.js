/* Stock In > Eden Farm > EDN delivery check (23 Nov 2026, VJ t1383u). Deep link: /stockin/?tab=edenedn
   Expected vs received per line, missing/damaged/incorrect flags, expiry dates with batches, Confirm Item,
   Confirm Full Delivery, delivery report. App stock records change only after Confirm Full Delivery.
   Nothing is posted to GloPOSNet: the till Stock In stays a DRAFT until Vijay authorises it. */
(function () {
  var D = window.BirkhillDates, V = window.__siViews, API = window.__siApi; if (!D || !V || !API) return;
  var esc = D.esc, $ = function (id) { return document.getElementById(id); };
  var AK = "birkhill-edn-active-v1", HK = "birkhill-edn-history-v1", E = null, docId = null;
  var FLAGS = [["ok", "OK"], ["missing", "Missing"], ["damaged", "Damaged"], ["incorrect", "Wrong product"]];
  function css() {
    if ($("ednCss")) return; var s = document.createElement("style"); s.id = "ednCss";
    s.textContent = ".edn{font-size:18px;line-height:1.35}.edn .ln{background:#fff;border-radius:16px;padding:12px;margin:0 0 12px;box-shadow:0 1px 4px rgba(24,52,42,.1);border-left:6px solid #d5e3da}" +
      ".edn .ln.done{border-left-color:#17643F;background:#f3faf5}.edn .ln.bad{border-left-color:#b71c1c}.edn .pimg{width:84px;height:84px;object-fit:contain;border-radius:10px;background:#f0f4f1;flex:0 0 84px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#5b6f64}" +
      ".edn .g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center;margin-top:8px}.edn .g3 div{background:#f4f7f4;border-radius:10px;padding:6px}.edn .g3 b{display:block;font-size:1.4rem}" +
      ".edn input,.edn select{width:100%;box-sizing:border-box;font-size:18px !important;min-height:52px;border-radius:12px;border:1px solid #b9cbbf;padding:8px}.edn label{display:block;font-weight:800;margin:10px 0 4px}" +
      ".edn .fl{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.edn .fl button{min-height:48px;border-radius:10px;border:2px solid #b9cbbf;background:#fff;font-weight:800;font-size:.9rem}.edn .fl button.on{border-color:#17643F;background:#17643F;color:#fff}.edn .fl button.on.b{border-color:#b71c1c;background:#b71c1c}" +
      ".edn .qty{display:grid;grid-template-columns:56px 1fr 56px;gap:6px}.edn .qty button{min-height:52px;border-radius:12px;border:2px solid #17643F;background:#fff;font-size:1.5rem;font-weight:900;color:#17643F}" +
      ".edn .bt{display:grid;grid-template-columns:1.5fr 1fr 44px;gap:6px;margin-top:6px}.edn .bt button{border:1px solid #b71c1c;color:#b71c1c;background:#fff;border-radius:10px;font-weight:900}" +
      ".edn .bigbtn{display:block;width:100%;min-height:56px;border:0;border-radius:14px;background:#17643F;color:#fff;font-weight:800;font-size:1.1rem;margin-top:10px}.edn .bigbtn.o{background:#E86B2A}.edn .bigbtn.sec{background:#fff;color:#17643F;border:2px solid #17643F}" +
      ".edn .sticky{position:sticky;bottom:calc(64px + env(safe-area-inset-bottom));background:#fff;padding:10px;border-radius:14px;box-shadow:0 -2px 10px rgba(0,0,0,.12);z-index:50}.edn .muted{color:#5b6f64;font-size:.95rem}" +
      ".edn table{width:100%;border-collapse:collapse;font-size:16px}.edn td,.edn th{border-bottom:1px solid #e3ece6;padding:6px 4px;text-align:left;vertical-align:top}.edn .msg{padding:10px;border-radius:12px;margin-top:8px;font-weight:700}.edn .msg.ok{background:#e8f6ec;color:#17643F}.edn .msg.err{background:#fdecea;color:#b71c1c}.edn .msg.warn{background:#fff4e5;color:#8a4b00}";
    document.head.appendChild(s);
  }
  function A() { var a = D.jget(AK, {}); a[docId] = a[docId] || { started: D.nowAt(), lines: {} }; return a; }
  function st(k) { return A()[docId].lines[k] || null; }
  function save(k, v) { var a = A(); a[docId].lines[k] = v; D.jset(AK, a); }
  function delivery() { return E.deliveries.filter(function (d) { return d.id === docId; })[0]; }
  function pic(l) { return l.img ? "<img class='pimg' alt='' src='../count/img/" + esc(l.img) + "' onerror=\"this.outerHTML='<div class=pimg>No picture</div>'\">" : "<div class='pimg'>No picture</div>"; }
  function defState(l) { return { rcv: l.exp, flag: "ok", dmg: 0, note: "", dtype: "useby", batches: [{ d: "", q: l.exp, k: "useby" }], confirmed: false }; }
  V.edenedn = function (arg) {
    css(); $("view").innerHTML = "<div class='card'>Loading the Eden delivery...</div>";
    fetch("eden_edn.json").then(function (r) { if (!r.ok) throw new Error("locked"); return r.json(); }).then(function (j) {
      E = j; if (!E.deliveries.length) { $("view").innerHTML = "<div class='card'><div class='empty'>No Eden Farm delivery on the box yet.</div></div>"; return; }
      docId = arg || docId || E.deliveries[0].id; draw();
    }).catch(function () { $("view").innerHTML = "<div class='msg err'>Data locked or not loaded. Open this app once from the full link Vijay sent (it ends in #k=...).</div>"; });
  };
  function draw() {
    var d = delivery(), done = d.lines.filter(function (l) { return (st(l.k) || {}).confirmed; }).length;
    var h = "<div class='edn'><div class='card'><div class='row' style='align-items:center'><h2 style='margin:0'>Eden Farm delivery check</h2><div style='flex:0 0 auto'><button class='btn small sec' id='ednBack'>Eden Farm</button></div></div>" +
      (E.deliveries.length > 1 ? "<label>Delivery</label><select id='ednPick'>" + E.deliveries.map(function (x) { return "<option value='" + esc(x.id) + "'" + (x.id === docId ? " selected" : "") + ">" + esc(x.ref + " (" + D.ukDate(x.date) + ")") + "</option>"; }).join("") + "</select>" : "") +
      "<div style='margin-top:6px'><b>" + esc(d.ref) + "</b>, delivered " + esc(D.ukDate(d.date)) + (d.order_no ? ", order " + esc(d.order_no) : "") + ". " + d.lines.length + " lines.</div>" +
      "<div class='muted'>Imported from: " + esc(d.source || "") + ". Eden does not send an EDN file, so the lines come from the delivery note." + (d.till_draft ? " Till Stock In draft " + esc(d.till_draft) + " stays a draft." : "") + "</div>" +
      "<div class='muted'>Recorded stock = till figure, last updated " + esc(E.stock_taken_display) + ". Check it by hand.</div>" +
      (d.confirmed.length ? "<div class='msg ok'>Confirmed by " + esc(d.confirmed[0].staff) + " " + esc(D.ukWhen(d.confirmed[0].at)) + " (from the box).</div>" : "") + "</div>";
    d.lines.forEach(function (l, i) { h += lineHtml(l, i); });
    h += "<div class='sticky'><div id='ednProg'><b>" + done + " of " + d.lines.length + "</b> items confirmed.</div><button class='bigbtn o' id='ednFull'>Confirm Full Delivery</button><div id='ednMsg'></div></div>";
    h += histHtml() + "</div>";
    $("view").innerHTML = h;
    $("ednBack").onclick = function () { API.go("sup", "eden"); };
    if ($("ednPick")) $("ednPick").onchange = function () { docId = this.value; draw(); };
    d.lines.forEach(function (l) { bindLine(l); });
    $("ednFull").onclick = confirmFull;
    Array.prototype.forEach.call(document.querySelectorAll("[data-eh]"), function (el) { el.onclick = function () { showReport(D.jget(HK, [])[+el.getAttribute("data-eh")]); }; });
  }
  function lineHtml(l, i) {
    var s = st(l.k) || defState(l), id = "e" + i;
    var h = "<div class='ln" + (s.confirmed ? " done" : "") + (s.flag !== "ok" ? " bad" : "") + "' id='" + id + "' data-k='" + esc(l.k) + "'><div style='display:flex;gap:10px'>" + pic(l) + "<div><b>" + esc(l.desc) + "</b> <span class='muted'>" + esc(l.pack) + "</span>" +
      (l.till_name ? "<div class='muted'>Till: " + esc(l.till_name) + "</div>" : "") + "<div>Barcode <b>" + esc(l.bc || "none") + "</b></div><div class='muted'>" + esc(l.dept || "No department") + " / " + esc(l.sub || "No sub-department") + "</div>" +
      (l.note ? "<div class='muted' style='color:#8a4b00'>" + esc(l.note) + "</div>" : "") + "</div></div>" +
      "<div class='g3'><div>Recorded stock<b>" + (l.stock == null ? "?" : l.stock) + "</b></div><div>Expected<b>" + l.exp + "</b></div><div>Received<b id='" + id + "r'>" + s.rcv + "</b></div></div>";
    if (s.confirmed) return h + "<div class='msg ok'>Confirmed: received " + s.rcv + (s.flag !== "ok" ? ", " + flagTxt(s) : "") + ", " + datesTxt(s) + ".</div><button class='bigbtn sec' data-edit='1'>Change</button></div>";
    h += "<label>Received (good) qty</label><div class='qty'><button type='button' data-m='1' aria-label='One less'>&minus;</button><input type='number' inputmode='numeric' min='0' class='rq' value='" + s.rcv + "' aria-label='Received qty'><button type='button' data-p='1' aria-label='One more'>+</button></div>" +
      "<label>Problem</label><div class='fl'>" + FLAGS.map(function (f) { return "<button type='button' data-f='" + f[0] + "' class='" + (s.flag === f[0] ? "on" + (f[0] !== "ok" ? " b" : "") : "") + "'>" + f[1] + "</button>"; }).join("") + "</div>" +
      (s.flag === "damaged" ? "<label>How many damaged</label><input type='number' inputmode='numeric' min='0' class='dq' value='" + (s.dmg || "") + "'>" : "") +
      (s.flag !== "ok" ? "<label>Note</label><input class='nt' value='" + esc(s.note || "") + "' placeholder='What is wrong'>" : "") +
      "<label>Expiry check</label><select class='dt'><option value='useby'" + (s.dtype === "useby" ? " selected" : "") + ">Use-by / expiry date</option><option value='bb'" + (s.dtype === "bb" ? " selected" : "") + ">Best-before date</option><option value='none'" + (s.dtype === "none" ? " selected" : "") + ">No date printed / not applicable</option></select>";
    if (s.dtype !== "none" && +s.rcv > 0) h += "<div class='muted'>One line per date. Add a line for each batch.</div>" + s.batches.map(function (b, j) { return "<div class='bt' data-b='" + j + "'><input type='date' class='bd' value='" + esc(b.d) + "' aria-label='Batch date'><input type='number' inputmode='numeric' min='0' class='bq' value='" + (b.q === "" ? "" : b.q) + "' aria-label='Batch qty'><button type='button' class='bx' aria-label='Remove batch'>&times;</button></div>"; }).join("") + "<button type='button' class='bigbtn sec ab'>+ Add another batch date</button>";
    return h + "<button type='button' class='bigbtn ci'>Confirm Item</button><div class='lm'></div></div>";
  }
  function flagTxt(s) { return s.flag === "missing" ? "missing" : s.flag === "damaged" ? (s.dmg || 0) + " damaged" : s.flag === "incorrect" ? "wrong product" : "OK"; }
  function datesTxt(s) { return +s.rcv === 0 ? "nothing received, no date" : s.dtype === "none" ? "no date printed" : s.batches.filter(function (b) { return b.d; }).map(function (b) { return D.kindTxt(s.dtype) + " " + D.ukDate(b.d) + " x" + b.q; }).join("; "); }
  function readLine(el, s) {
    var rq = el.querySelector(".rq"); if (rq) s.rcv = Math.max(0, +rq.value || 0);
    var dq = el.querySelector(".dq"); if (dq) s.dmg = Math.max(0, +dq.value || 0);
    var nt = el.querySelector(".nt"); if (nt) s.note = nt.value;
    var dt = el.querySelector(".dt"); if (dt) s.dtype = dt.value;
    var bs = el.querySelectorAll(".bt"); if (bs.length) s.batches = Array.prototype.map.call(bs, function (b) { return { d: b.querySelector(".bd").value, q: b.querySelector(".bq").value === "" ? "" : +b.querySelector(".bq").value, k: s.dtype }; });
    return s;
  }
  function redraw(l) { var el = document.querySelector("[data-k='" + l.k + "']"), i = el.id.slice(1); var t = document.createElement("div"); t.innerHTML = lineHtml(l, i); el.replaceWith(t.firstChild); bindLine(l); prog(); }
  function bindLine(l) {
    var el = document.querySelector("[data-k='" + l.k + "']"); if (!el) return;
    var get = function () { return readLine(el, st(l.k) || defState(l)); };
    var q = function (sel, fn) { Array.prototype.forEach.call(el.querySelectorAll(sel), fn); };
    q("[data-edit]", function (b) { b.onclick = function () { var s = st(l.k); s.confirmed = false; save(l.k, s); redraw(l); }; });
    q("[data-m]", function (b) { b.onclick = function () { var s = get(); s.rcv = Math.max(0, s.rcv - 1); if (s.batches.length === 1) s.batches[0].q = s.rcv; save(l.k, s); redraw(l); }; });
    q("[data-p]", function (b) { b.onclick = function () { var s = get(); s.rcv = s.rcv + 1; if (s.batches.length === 1) s.batches[0].q = s.rcv; save(l.k, s); redraw(l); }; });
    q(".rq", function (b) { b.onchange = function () { var s = get(); if (s.batches.length === 1) s.batches[0].q = s.rcv; save(l.k, s); redraw(l); }; });
    q("[data-f]", function (b) { b.onclick = function () { var s = get(); s.flag = b.getAttribute("data-f"); if (s.flag === "missing") { s.rcv = 0; } save(l.k, s); redraw(l); }; });
    q(".dt", function (b) { b.onchange = function () { var s = get(); s.batches.forEach(function (x) { x.k = s.dtype; }); save(l.k, s); redraw(l); }; });
    q(".bd,.bq,.dq,.nt", function (b) { b.onchange = function () { save(l.k, get()); }; });
    q(".bx", function (b) { b.onclick = function () { var s = get(), j = +b.parentNode.getAttribute("data-b"); s.batches.splice(j, 1); if (!s.batches.length) s.batches.push({ d: "", q: s.rcv, k: s.dtype }); save(l.k, s); redraw(l); }; });
    q(".ab", function (b) { b.onclick = function () { var s = get(); s.batches.push({ d: "", q: "", k: s.dtype }); save(l.k, s); redraw(l); }; });
    q(".ci", function (b) { b.onclick = function () {
      var s = get(), m = el.querySelector(".lm"), err = function (t) { m.innerHTML = "<div class='msg err'>" + esc(t) + "</div>"; };
      if (s.flag === "damaged" && !(s.dmg > 0)) return err("Type how many are damaged.");
      if (s.flag !== "ok" && !String(s.note || "").trim() && s.flag !== "missing") return err("Add a short note about the problem.");
      if (+s.rcv > 0 && s.dtype !== "none") {
        var good = s.batches.filter(function (x) { return x.d; });
        if (!good.length) return err("Pick the date on the calendar for each batch, or choose No date printed.");
        if (s.batches.some(function (x) { return !x.d || !(+x.q > 0); })) return err("Every batch needs a date and a quantity. Remove empty batches.");
        var sum = good.reduce(function (a, x) { return a + (+x.q || 0); }, 0);
        if (sum !== +s.rcv) return err("Batch quantities add up to " + sum + " but received is " + s.rcv + ".");
      }
      s.confirmed = true; s.at = D.nowAt(); s.staff = API.staff() || D.staff(); save(l.k, s); redraw(l);
    }; });
  }
  function prog() { var d = delivery(), n = d.lines.filter(function (l) { return (st(l.k) || {}).confirmed; }).length; $("ednProg").innerHTML = "<b>" + n + " of " + d.lines.length + "</b> items confirmed."; }
  function confirmFull() {
    var d = delivery(), staff = API.staff() || D.staff(), left = d.lines.filter(function (l) { return !(st(l.k) || {}).confirmed; });
    var msg = function (t, k) { $("ednMsg").innerHTML = "<div class='msg " + (k || "err") + "'>" + esc(t) + "</div>"; };
    if (!staff) return msg("Your name is needed. Set it on the Home screen first.");
    if (left.length) { msg(left.length + " items not confirmed yet. Confirm every item first (first one: " + left[0].desc + ")."); try { document.querySelector("[data-k='" + left[0].k + "']").scrollIntoView({ behavior: "smooth" }); } catch (e) {} return; }
    var w = D.warn(), rep = { id: D.uid("ED"), doc: d.id, ref: d.ref, date: d.date, at: D.nowAt(), staff: staff, lines: [] };
    d.lines.forEach(function (l) {
      var s = st(l.k), diff = s.rcv - l.exp, linked = !!(l.pid && l.bc);
      var batches = s.rcv > 0 && s.dtype !== "none" ? s.batches.map(function (b) { return { d: b.d, q: +b.q, k: s.dtype }; }) : [];
      var short = batches.filter(function (b) { return D.days(b.d, D.today()) <= w.short; });
      D.addCheck({ src: "edn", ref: d.id, session: rep.id, staff: staff, pid: linked ? l.pid : null, bc: l.bc || "", name: l.till_name || l.desc, dept: l.dept, sub: l.sub,
        recorded: l.stock, recorded_at: E.stock_taken_at, qty: s.rcv, expected: l.exp, flag: s.flag, dmg: s.dmg || 0, note: s.note || "", dtype: s.rcv > 0 ? s.dtype : "zero", batches: batches, linked: linked });
      if (linked) D.touchProduct(l.pid, l.bc, l.till_name || l.desc, { app_stock: { qty: (l.stock || 0) + s.rcv, at: rep.at, src: d.ref, till_recorded: l.stock, received: s.rcv, note: "App record only. Not on the till until the Stock In draft is posted by Vijay." } });
      rep.lines.push({ desc: l.desc, bc: l.bc, exp: l.exp, rcv: s.rcv, diff: diff, flag: s.flag, dmg: s.dmg || 0, note: s.note || "", dates: datesTxt(s), short: short.map(function (b) { return D.ukDate(b.d); }).join(", "), linked: linked });
    });
    rep.text = repText(rep);
    var H = D.jget(HK, []); H.unshift(rep); D.jset(HK, H);                          // history first
    D.send("EDN1", { t: "edn_done", id: rep.id, doc: d.id, ref: d.ref, at: rep.at, staff: staff, lines: rep.lines.length, diffs: rep.lines.filter(function (x) { return x.diff || x.flag !== "ok"; }).length });
    var a = D.jget(AK, {}); delete a[docId]; D.jset(AK, a);                         // then clear only the active list
    showReport(rep);
  }
  function repText(r) {
    var dif = r.lines.filter(function (x) { return x.diff || x.flag !== "ok"; }), sh = r.lines.filter(function (x) { return x.short; });
    var L = ["Birkhill Eden Farm delivery " + r.ref + " (" + D.ukDate(r.date) + ") checked by " + r.staff + " " + D.ukWhen(r.at), r.lines.length + " lines. Differences or problems: " + dif.length + ". Short-dated: " + sh.length + "."];
    if (dif.length) { L.push(""); L.push("DIFFERENCES"); dif.forEach(function (x) { L.push(x.desc + ", barcode " + (x.bc || "none") + ": expected " + x.exp + ", received " + x.rcv + (x.flag !== "ok" ? ", " + (x.flag === "damaged" ? x.dmg + " damaged" : x.flag === "incorrect" ? "wrong product" : "missing") : "") + (x.note ? " (" + x.note + ")" : "")); }); }
    if (sh.length) { L.push(""); L.push("SHORT-DATED"); sh.forEach(function (x) { L.push(x.desc + ", barcode " + (x.bc || "none") + ": " + x.dates); }); }
    L.push(""); L.push("Till Stock In stays a draft until Vijay authorises it. Nothing was posted to the till.");
    return L.join("\n");
  }
  function showReport(r) {
    css();
    var h = "<div class='edn'><div class='card' id='ednReport'><h2>Delivery report: " + esc(r.ref) + "</h2><div class='msg ok'>Saved in history. App stock records updated. Till not changed (Stock In stays a draft).</div>" +
      "<div class='muted'>Checked by " + esc(r.staff) + ", " + esc(D.ukWhen(r.at)) + ".</div><table><tr><th>Product</th><th>Exp</th><th>Rcv</th><th>Diff</th><th>Dates</th></tr>" +
      r.lines.map(function (x) { return "<tr><td>" + esc(x.desc) + "<div class='muted'>" + esc(x.bc || "no barcode") + "</div>" + (x.flag !== "ok" ? "<div style='color:#b71c1c;font-weight:800'>" + esc(x.flag === "damaged" ? x.dmg + " damaged" : x.flag === "incorrect" ? "Wrong product" : "Missing") + (x.note ? ": " + esc(x.note) : "") + "</div>" : "") + "</td><td>" + x.exp + "</td><td>" + x.rcv + "</td><td style='font-weight:800;color:" + (x.diff ? "#b71c1c" : "#17643F") + "'>" + (x.diff > 0 ? "+" : "") + x.diff + "</td><td>" + esc(x.dates) + (x.short ? "<div style='color:#8a4b00;font-weight:800'>Short-dated</div>" : "") + "</td></tr>"; }).join("") + "</table>" +
      "<button class='bigbtn o' id='ednShare'>Share to Vijay office WhatsApp</button><button class='bigbtn sec' id='ednDone'>Back to Eden Farm</button></div></div>";
    $("view").innerHTML = h; window.scrollTo(0, 0);
    $("ednShare").onclick = function () { D.share(r.text, "Eden delivery " + r.ref); };
    $("ednDone").onclick = function () { API.go("sup", "eden"); };
  }
  function histHtml() {
    var H = D.jget(HK, []);
    return "<div class='card'><h2>Delivery checks on this phone</h2>" + (H.length ? H.slice(0, 20).map(function (r, i) { return "<div style='padding:8px 0;border-bottom:1px solid #e3ece6;cursor:pointer' data-eh='" + i + "'><b>" + esc(r.ref) + "</b> " + esc(D.ukWhen(r.at)) + " by " + esc(r.staff) + "<div class='muted'>" + r.lines.length + " lines, " + r.lines.filter(function (x) { return x.diff || x.flag !== "ok"; }).length + " differences</div></div>"; }).join("") : "<div class='muted'>None yet.</div>") + "</div>";
  }
  window.__edn = { draw: function () { draw(); } };
})();
