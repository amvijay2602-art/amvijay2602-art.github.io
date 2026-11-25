/* Date Check app: Manual Date Check + Date Reports (23 Nov 2026, VJ t1383u).
   Deep links: /date/?mode=manual  /date/?mode=reports  (or ?open=mdcModeManual / mdcModeReports).
   Recorded stock = latest till snapshot (read-only, about every 30 minutes). Staff confirm or correct it.
   Corrections are separate audit records and become DRAFT stock adjustments for Vijay. Never sent to the till. */
(function () {
  var D = window.BirkhillDates; if (!D) return;
  var esc = D.esc, $ = function (id) { return document.getElementById(id); };
  var AK = "birkhill-mdc-active-v1", HK = "birkhill-mdc-sessions-v1";
  var DATA = null, BYBC = {}, BYID = {}, SUBN = {}, DEPN = {};
  var cur = { mode: "quick", prod: null };
  function bkey(b) { return String(b || "").replace(/\D/g, "").replace(/^0+/, ""); }
  function css() {
    var s = document.createElement("style");
    s.textContent = ".mdc-bar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:0 0 12px}.mdc-bar button{min-height:56px;border-radius:14px;border:2px solid #17643F;background:#fff;color:#17643F;font-weight:800;font-size:1rem;padding:4px}" +
      ".mdc-bar button.on{background:#17643F;color:#fff}.mdc{font-size:18px;line-height:1.35}.mdc h2{font-size:1.3rem;margin:0 0 8px}.mdc label{display:block;font-weight:800;margin:12px 0 4px}" +
      ".mdc select,.mdc input{width:100%;box-sizing:border-box;font-size:18px !important;padding:10px;border-radius:12px;border:1px solid #b9cbbf;min-height:52px}" +
      ".mdc .btn{display:block;width:100%;min-height:56px;border:0;border-radius:14px;background:#17643F;color:#fff;font-weight:800;font-size:1.1rem;margin-top:10px}" +
      ".mdc .btn.sec{background:#fff;color:#17643F;border:2px solid #17643F}.mdc .btn.o{background:#E86B2A}.mdc .btn.red{background:#b71c1c}" +
      ".mdc .row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mdc .card2{background:#fff;border-radius:16px;padding:14px;margin:0 0 12px;box-shadow:0 1px 4px rgba(24,52,42,.1)}" +
      ".mdc .res{display:flex;gap:10px;align-items:center;padding:10px;border-bottom:1px solid #e3ece6;cursor:pointer}.mdc .res img,.mdc .pimg{width:56px;height:56px;object-fit:contain;border-radius:8px;background:#f0f4f1}" +
      ".mdc .pimg.big{width:120px;height:120px}.mdc .muted{color:#5b6f64;font-size:.95rem}.mdc .big{font-size:1.6rem;font-weight:900}.mdc .opt{display:flex;gap:10px;align-items:center;padding:12px;border:2px solid #d5e3da;border-radius:12px;margin:6px 0;font-weight:700}" +
      ".mdc .opt input{width:28px;min-height:28px;height:28px}.mdc .opt.on{border-color:#17643F;background:#e8f6ec}.mdc .msg{padding:10px;border-radius:12px;margin-top:10px;font-weight:700}.mdc .msg.ok{background:#e8f6ec;color:#17643F}.mdc .msg.err{background:#fdecea;color:#b71c1c}.mdc .msg.warn{background:#fff4e5;color:#8a4b00}" +
      ".mdc table{width:100%;border-collapse:collapse;font-size:16px}.mdc td,.mdc th{border-bottom:1px solid #e3ece6;padding:6px 4px;text-align:left;vertical-align:top}.mdc .tag{display:inline-block;padding:2px 8px;border-radius:8px;font-weight:800;font-size:.85rem}.mdc .tag.u{background:#b71c1c;color:#fff}.mdc .tag.w{background:#fff4e5;color:#8a4b00}" +
      ".mdc .batch{display:grid;grid-template-columns:1.4fr 1fr 44px;gap:6px;margin-top:6px}.mdc .batch button{min-height:52px;border-radius:12px;border:1px solid #b71c1c;background:#fff;color:#b71c1c;font-weight:900}.mdc-due{background:#fff;border-radius:16px;padding:14px;margin:0 0 12px;box-shadow:0 1px 4px rgba(24,52,42,.1)}.mdc-due h2{font-size:1.3rem;margin:0 0 6px}.mdc-due .due{color:#17643F;font-weight:800}.mdc-due .off{color:#8a4b00}";
    document.head.appendChild(s);
  }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    return fetch("datecheck.json").then(function (r) { if (!r.ok) throw new Error("locked"); return r.json(); }).then(function (j) {
      DATA = j; j.departments.forEach(function (d) { DEPN[d.id] = d.n; d.subs.forEach(function (s) { SUBN[d.id + ":" + s.id] = s.n; }); });
      j.products.forEach(function (a) { var p = { id: a[0], n: a[1], s: a[2], b: a[3], q: a[4], i: a[5], did: a[6], sid: a[7] }; BYID[p.id] = p; p.b.forEach(function (b) { var k = bkey(b); if (k && !BYBC[k]) BYBC[k] = p; }); });
      return j;
    });
  }
  function img(p, big) { return p && p.i ? "<img class='pimg" + (big ? " big" : "") + "' alt='' src='" + esc(DATA.img_base + p.i) + "' onerror=\"this.replaceWith(Object.assign(document.createElement('div'),{className:'pimg" + (big ? " big" : "") + "',textContent:'No picture'}))\">" : "<div class='pimg" + (big ? " big" : "") + "' style='display:flex;align-items:center;justify-content:center;font-size:12px;color:#5b6f64'>No picture</div>"; }
  function active() { return D.jget(AK, null); }
  function setActive(a) { D.jset(AK, a); }
  // ---------- layout
  var box, quick;
  function setup() {
    css();
    var h1 = document.querySelector("h1"); quick = document.querySelector("body > .card");
    var bar = document.createElement("div"); bar.className = "mdc-bar";
    bar.innerHTML = "<button type='button' id='mdcModeQuick'>Quick date check</button><button type='button' id='mdcModeManual'>Manual Date Check</button><button type='button' id='mdcModeReports'>Date Reports</button>";
    h1.parentNode.insertBefore(bar, h1.nextSibling);
    var dueEl = document.createElement("div"); dueEl.className = "mdc-due hidden"; dueEl.id = "mdcDue"; bar.parentNode.insertBefore(dueEl, bar.nextSibling);
    box = document.createElement("div"); box.className = "mdc hidden"; box.id = "mdcBox"; dueEl.parentNode.insertBefore(box, dueEl.nextSibling);
    $("mdcModeQuick").onclick = function () { mode("quick"); }; $("mdcModeManual").onclick = function () { mode("manual"); }; $("mdcModeReports").onclick = function () { mode("reports"); };
    load().then(function () { renderDue(); }).catch(function () {});
    var m = new URLSearchParams(location.search).get("mode"); mode(m === "manual" || m === "reports" ? m : "quick");
  }
  function mode(m) {
    cur.mode = m;
    ["Quick", "Manual", "Reports"].forEach(function (x) { $("mdcMode" + x).classList.toggle("on", x.toLowerCase() === m); });
    if (quick) quick.classList.toggle("hidden", m !== "quick");
    box.classList.toggle("hidden", m === "quick");
    try { history.replaceState(null, "", location.pathname + (m === "quick" ? "" : "?mode=" + m)); } catch (e) {}
    if (m === "quick") return;
    box.innerHTML = "<div class='card2'>Loading products...</div>";
    load().then(function () { m === "manual" ? manual() : reports(); }).catch(function () { box.innerHTML = "<div class='msg err'>Product list locked. Open this app once from the full link Vijay sent (it ends in #k=...).</div>"; });
  }
  function stockNote() { return "Recorded stock is the latest till figure, last updated " + esc(DATA.stock_taken_display || D.ukWhen(DATA.stock_taken_at)) + ". Please check it by hand."; }
  function breadGroup() {
    var s = DATA && DATA.due_today, g = s && s.groups && s.groups[0];
    return g || null;
  }
  function liveBread(g) {
    if (!g) return g;
    var today = D.today(), recs = D.records(DATA.records || []), seen = {};
    (g.checked_pids || []).forEach(function (id) { seen[id] = 1; });
    recs.forEach(function (r) {
      if (String(r.at || "").slice(0, 10) !== today) return;
      var pid = +r.pid;
      if (pid && (g.pids || []).indexOf(pid) >= 0) seen[pid] = 1;
    });
    var checked = 0, notChecked = [];
    (g.pids || []).forEach(function (id) { if (seen[id]) checked++; });
    (g.not_checked || []).forEach(function (p) { if (!seen[p.id]) notChecked.push(p); });
    var out = {};
    Object.keys(g).forEach(function (k) { out[k] = g[k]; });
    out.checked = checked;
    out.left = g.due ? Math.max(0, (g.total || 0) - checked) : 0;
    out.not_checked = g.due ? notChecked : [];
    return out;
  }
  function deptLabel(d) {
    if (d && d.sched === "bread" && d.due) return d.n + " - due today";
    return d ? d.n : "";
  }
  function renderDue() {
    var el = $("mdcDue"); if (!el) return;
    var g = liveBread(breadGroup());
    if (!g) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    el.classList.remove("hidden");
    var days = (g.days || []).join(", ");
    var depts = (g.departments || []).map(function (d) { return d.n; }).join(" and ");
    if (g.due) {
      el.innerHTML = "<h2>Due today</h2><div class='due'>" + esc(g.name) + " date check is due today (" + esc(days) + ").</div>" +
        "<div class='muted' style='margin-top:6px'>" + esc(depts) + ": " + g.checked + " of " + g.total + " in stock checked. " + g.left + " not checked yet.</div>" +
        "<div class='muted'>Open Manual Date Check and choose Breads or Bread & Cakes, or scan them on Quick date check.</div>";
    } else {
      el.innerHTML = "<h2>Breads date check</h2><div class='off'>Not due today. Next due: " + esc(g.next) + ".</div>" +
        "<div class='muted' style='margin-top:6px'>Breads are checked on " + esc(days) + ". You can still check a bread product today if you need to: choose the department below or scan it.</div>";
    }
  }
  function breadReportHtml() {
    var g = liveBread(breadGroup());
    if (!g) return "";
    if (!g.due) {
      return "<div class='card2'><h2>Breads date check</h2><div class='muted'>Not due today. Next due: " + esc(g.next) + " (" + esc((g.days || []).join(", ")) + "). Not counted as missing.</div></div>";
    }
    var rows = g.not_checked || [];
    var list = rows.length ? "<table><tr><th>Product</th><th>Barcode</th></tr>" + rows.map(function (r) {
      return "<tr><td>" + esc(r.n) + "<div class='muted'>" + esc(r.dept || "") + "</div></td><td>" + esc(r.bc || "none") + "</td></tr>";
    }).join("") + "</table>" : "<div class='msg ok'>All in-stock breads have a check today.</div>";
    return "<div class='card2' id='mdcBreadDue'><h2>Breads due today (" + g.left + " not checked)</h2>" +
      "<div class='muted'>" + esc((g.days || []).join(", ")) + ". " + g.checked + " of " + g.total + " in stock checked. These are not counted as missing on other days.</div>" + list + "</div>";
  }
  // ---------- Manual Date Check
  function manual() {
    var a = active(), st = D.staff();
    var h = "<div class='card2'><h2>Manual Date Check</h2><div class='muted'>" + stockNote() + "</div>" +
      "<label for='mdcStaff'>Your name</label><input id='mdcStaff' value='" + esc(st) + "' placeholder='Your name'>" +
      "<label for='mdcDept'>1. Department</label><select id='mdcDept'><option value=''>Choose department</option>" + DATA.departments.map(function (d) { return "<option value='" + d.id + "'>" + esc(deptLabel(d)) + "</option>"; }).join("") + "</select>" +
      "<label for='mdcSub'>2. Sub-department</label><select id='mdcSub'><option value=''>All sub-departments</option></select>" +
      "<label for='mdcQ'>3. Search by name or barcode</label><div class='row2'><input id='mdcQ' placeholder='Name or barcode' autocomplete='off'><button type='button' class='btn sec' id='mdcScan' style='margin-top:0'>Scan barcode</button></div>" +
      "<div id='mdcScanWrap' class='hidden' style='margin-top:8px'><video id='mdcVideo' playsinline muted autoplay style='width:100%;border-radius:12px'></video></div>" +
      "<div id='mdcRes'></div></div><div id='mdcCard'></div>" +
      "<div class='card2'><h2>This check</h2><div id='mdcActive'></div><div class='row2'><button type='button' class='btn o' id='mdcFinish'>Finish check</button><button type='button' class='btn sec' id='mdcHist'>History</button></div><div id='mdcMsg'></div></div><div id='mdcReport'></div>";
    box.innerHTML = h;
    if (a && a.dept) { $("mdcDept").value = a.dept; fillSubs(); if (a.sub) $("mdcSub").value = a.sub; }
    $("mdcStaff").onchange = function () { try { localStorage.setItem("birkhill-staff-name", this.value.trim()); } catch (e) {} };
    $("mdcDept").onchange = function () { fillSubs(); search(); };
    $("mdcSub").onchange = search; $("mdcQ").oninput = search;
    $("mdcQ").onkeydown = function (e) { if (e.key === "Enter") { var p = BYBC[bkey(this.value)]; if (p) openProd(p, "typed"); } };
    $("mdcScan").onclick = scan; $("mdcFinish").onclick = finish; $("mdcHist").onclick = historyView;
    drawActive(); search(); renderDue();
  }
  function fillSubs() {
    var d = DATA.departments.filter(function (x) { return String(x.id) === $("mdcDept").value; })[0];
    $("mdcSub").innerHTML = "<option value=''>All sub-departments</option>" + (d ? d.subs.map(function (s) { return "<option value='" + s.id + "'>" + esc(s.n) + "</option>"; }).join("") : "");
  }
  function search() {
    var dep = $("mdcDept").value, sub = $("mdcSub").value, q = $("mdcQ").value.trim().toUpperCase(), qd = bkey(q);
    if (!dep && q.length < 3) { $("mdcRes").innerHTML = "<div class='muted' style='margin-top:8px'>Choose a department, or type 3 or more letters, or scan.</div>"; return; }
    var words = q.split(/\s+/).filter(Boolean), out = [];
    for (var id in BYID) {
      var p = BYID[id];
      if (dep && String(p.did) !== dep) continue; if (sub && String(p.sid) !== sub) continue;
      if (q) { var hit = qd && qd.length >= 4 && p.b.some(function (b) { return bkey(b).indexOf(qd) >= 0; }); if (!hit && !words.every(function (w) { return p.n.toUpperCase().indexOf(w) >= 0; })) continue; }
      out.push(p); if (out.length >= 60) break;
    }
    out.sort(function (a, b) { return a.n < b.n ? -1 : 1; });
    $("mdcRes").innerHTML = out.length ? "<div class='muted' style='margin-top:8px'>" + out.length + (out.length >= 60 ? "+" : "") + " products. Tap one.</div>" + out.map(function (p) { return "<div class='res' data-pid='" + p.id + "'>" + img(p) + "<div><b>" + esc(p.n) + "</b><div class='muted'>" + esc(p.b[0] || "no barcode") + " &middot; stock " + (p.q == null ? "?" : p.q) + "</div></div></div>"; }).join("") : "<div class='msg warn'>No products found.</div>";
    Array.prototype.forEach.call($("mdcRes").querySelectorAll("[data-pid]"), function (el) { el.onclick = function () { openProd(BYID[el.getAttribute("data-pid")], "search"); }; });
  }
  var scanS = null;
  function scan() {
    if (scanS) { try { scanS.stop(); } catch (e) {} scanS = null; $("mdcScanWrap").classList.add("hidden"); $("mdcScan").textContent = "Scan barcode"; return; }
    if (!window.BirkhillBarcode) return say("Scanner not available. Type the barcode.", "err");
    $("mdcScanWrap").classList.remove("hidden");
    BirkhillBarcode.startLive({ video: $("mdcVideo"), wrap: $("mdcScanWrap"), zxingSrc: "zxing.min.js", onCode: function (raw) { scan(); applyCode(raw); } })
      .then(function (s) { scanS = s; $("mdcScan").textContent = "Stop scan"; }).catch(function () { $("mdcScanWrap").classList.add("hidden"); say("Could not open the camera. Type the barcode.", "err"); });
  }
  function applyCode(raw) { var p = BYBC[bkey(raw)]; $("mdcQ").value = String(raw).replace(/\D/g, ""); if (p) openProd(p, "scan"); else { search(); say("Barcode " + raw + " not found on the till list.", "err"); } }
  function say(t, k) { var el = $("mdcMsg"); if (el) el.innerHTML = "<div class='msg " + (k || "ok") + "'>" + esc(t) + "</div>"; }
  function openProd(p, how) {
    cur.prod = p; cur.how = how;
    var lc = D.lastCorrection(p.id, p.b[0]), pr = D.product(p.id, p.b[0]);
    var h = "<div class='card2' id='mdcProd'><div style='display:flex;gap:12px'>" + img(p, true) + "<div><div style='font-weight:900;font-size:1.2rem'>" + esc(p.n) + "</div><div class='muted'>" + esc(p.s || "") + "</div>" +
      "<div>Barcode <b>" + esc(p.b[0] || "none") + "</b></div><div class='muted'>" + esc(DEPN[p.did] || "") + " / " + esc(SUBN[p.did + ":" + p.sid] || "No sub-department") + "</div></div></div>" +
      "<div style='margin-top:10px'>Recorded stock: <span class='big' id='mdcRec'>" + (p.q == null ? "?" : p.q) + "</span></div><div class='muted'>Till figure, last updated " + esc(DATA.stock_taken_display) + ".</div>" +
      (lc ? "<div class='msg warn'>Last correction on this phone: " + lc.prev + " to " + lc.new + " by " + esc(lc.staff) + ", " + esc(D.ukWhen(lc.at)) + " (draft for Vijay).</div>" : "") +
      (pr && pr.last_check ? "<div class='muted'>Last checked " + esc(D.ukWhen(pr.last_check.at)) + " (" + (pr.last_check.src === "edn" ? "Eden delivery" : "date check") + ").</div>" : "") +
      "<label>4. Stock on the shelf now</label>" + (p.q == null || p.q < 0 ? "<div class='msg warn'>The till figure is " + (p.q == null ? "missing" : "below zero") + ". Count the shelf and type the number.</div>" : "") + "<div class='row2'><button type='button' class='btn' id='mdcConfirm' style='margin-top:0'" + (p.q == null || p.q < 0 ? " disabled" : "") + ">Confirm " + (p.q == null || p.q < 0 ? "" : p.q) + "</button><input id='mdcQty' type='number' inputmode='numeric' min='0' placeholder='Or type the right count'></div>" +
      "<div id='mdcDates'></div><div class='row2'><button type='button' class='btn' id='mdcSave'>Save and next product</button><button type='button' class='btn sec' id='mdcCancel'>Cancel</button></div><div id='mdcPMsg'></div></div>";
    $("mdcCard").innerHTML = h;
    $("mdcConfirm").onclick = function () { $("mdcQty").value = p.q == null ? "" : Math.max(0, p.q); drawDates(); };
    $("mdcQty").oninput = drawDates; $("mdcSave").onclick = saveItem; $("mdcCancel").onclick = function () { $("mdcCard").innerHTML = ""; cur.prod = null; };
    drawDates();
    try { $("mdcProd").scrollIntoView({ behavior: "smooth" }); } catch (e) {}
  }
  var dtype = "useby";
  function drawDates() {
    var q = $("mdcQty").value.trim();
    if (q !== "" && Number(q) === 0) { $("mdcDates").innerHTML = "<div class='msg ok'>Stock is 0: no date needed.</div>"; return; }
    var opts = [["useby", "Use-by / expiry date"], ["bb", "Best-before date"], ["multi", "Multiple dates (qty per batch)"], ["none", "No date printed / not applicable"]];
    var h = "<label>5. Date</label>" + opts.map(function (o) { return "<label class='opt" + (dtype === o[0] ? " on" : "") + "'><input type='radio' name='mdcDt' value='" + o[0] + "'" + (dtype === o[0] ? " checked" : "") + ">" + o[1] + "</label>"; }).join("");
    if (dtype === "useby" || dtype === "bb") h += "<input id='mdcDate' type='date' aria-label='Date'>";
    if (dtype === "multi") h += "<div class='muted'>One line per date. Pick the date type and the quantity.</div><div id='mdcBatches'></div><button type='button' class='btn sec' id='mdcAddB'>+ Add another date</button>";
    var keep = $("mdcDate") ? $("mdcDate").value : "";
    $("mdcDates").innerHTML = h;
    if (keep && $("mdcDate")) $("mdcDate").value = keep;
    Array.prototype.forEach.call(document.getElementsByName("mdcDt"), function (r) { r.onchange = function () { dtype = r.value; drawDates(); }; });
    if (dtype === "multi") { addBatch(); addBatch(); $("mdcAddB").onclick = addBatch; }
  }
  function addBatch() {
    var d = document.createElement("div"); d.className = "batch";
    d.innerHTML = "<input type='date' class='bd' aria-label='Batch date'><input type='number' class='bq' inputmode='numeric' min='0' placeholder='Qty' aria-label='Batch qty'><button type='button' aria-label='Remove'>&times;</button>" +
      "<select class='bk' style='grid-column:1/4'><option value='useby'>Use-by / expiry</option><option value='bb'>Best-before</option></select>";
    d.querySelector("button").onclick = function () { d.remove(); };
    $("mdcBatches").appendChild(d);
  }
  function saveItem() {
    var p = cur.prod, msg = function (t, k) { $("mdcPMsg").innerHTML = "<div class='msg " + (k || "err") + "'>" + esc(t) + "</div>"; };
    var staff = ($("mdcStaff").value || "").trim(); if (!staff) return msg("Type your name at the top first.");
    try { localStorage.setItem("birkhill-staff-name", staff); } catch (e) {}
    var qs = $("mdcQty").value.trim(); if (qs === "" || isNaN(+qs) || +qs < 0) return msg("Tap Confirm or type the right count (0 if none).");
    var q = +qs, batches = [], dt = q === 0 ? "zero" : dtype;
    if (q > 0) {
      if (dt === "useby" || dt === "bb") { var d = $("mdcDate").value; if (!d) return msg("Pick the date on the calendar, or choose No date printed."); batches = [{ d: d, q: q, k: dt }]; }
      else if (dt === "multi") {
        Array.prototype.forEach.call(document.querySelectorAll("#mdcBatches .batch"), function (b) { var d2 = b.querySelector(".bd").value, q2 = b.querySelector(".bq").value; if (d2 && +q2 > 0) batches.push({ d: d2, q: +q2, k: b.querySelector(".bk").value }); });
        if (batches.length < 1) return msg("Add at least one date with its quantity.");
        var sum = batches.reduce(function (a, b) { return a + b.q; }, 0);
        if (sum !== q && !cur.sumOk) { cur.sumOk = true; return msg("The batch quantities add up to " + sum + " but the count is " + q + ". Fix it, or tap Save again to keep it as it is.", "warn"); }
      }
    }
    cur.sumOk = false;
    var rec = p.q == null ? null : p.q, a = active() || { id: D.uid("MD"), started: D.nowAt(), staff: staff, items: [] };
    a.dept = $("mdcDept").value; a.sub = $("mdcSub").value; a.staff = staff;
    var disc = rec == null ? "" : (q === rec ? "" : "Recorded " + rec + ", counted " + q + " (" + (q - rec > 0 ? "+" : "") + (q - rec) + ")");
    var r = D.addCheck({ src: "manual", session: a.id, staff: staff, pid: p.id, bc: p.b[0] || "", name: p.n, dept: DEPN[p.did] || "", sub: SUBN[p.did + ":" + p.sid] || "",
      recorded: rec, recorded_at: DATA.stock_taken_at, qty: q, dtype: dt, batches: batches, disc: disc, how: cur.how });
    var c = rec == null ? null : D.correction({ pid: p.id, bc: p.b[0] || "", name: p.n, recorded: rec, snapshotAt: DATA.stock_taken_at, qty: q, src: "manual", staff: staff, ref: a.id });
    a.items.push({ id: r.id, name: p.n, bc: p.b[0] || "", rec: rec, qty: q, dtype: dt, batches: batches, disc: disc, corr: c ? c.id : "", prev: c ? c.prev : null, at: r.at });
    setActive(a);
    $("mdcCard").innerHTML = ""; cur.prod = null; dtype = "useby"; $("mdcQ").value = ""; search();
    drawActive(); renderDue(); say("Saved " + p.n + ". " + (c ? "Stock correction saved as a draft for Vijay (was " + c.prev + ", now " + q + "). " : "") + "Next product.", "ok");
  }
  function dateTxt(it) { return it.dtype === "zero" ? "Stock 0, no date" : it.dtype === "none" ? "No date printed" : it.batches.map(function (b) { return D.kindTxt(b.k) + " " + D.ukDate(b.d) + " x" + b.q; }).join("; "); }
  function drawActive() {
    var a = active(), el = $("mdcActive"); if (!el) return;
    el.innerHTML = a && a.items.length ? "<div class='muted'>Started " + esc(D.ukWhen(a.started)) + " by " + esc(a.staff) + ". " + a.items.length + " checked.</div><table><tr><th>Product</th><th>Qty</th><th>Date</th></tr>" + a.items.map(function (it) { return "<tr><td>" + esc(it.name) + "<div class='muted'>" + esc(it.bc) + "</div></td><td>" + it.qty + (it.disc ? "<div class='tag w'>was " + it.prev + "</div>" : "") + "</td><td>" + esc(dateTxt(it)) + "</td></tr>"; }).join("") + "</table>" : "<div class='muted'>No products checked yet.</div>";
  }
  function finish() {
    var a = active(); if (!a || !a.items.length) return say("Nothing checked yet. Check at least one product.", "err");
    a.finished = D.nowAt(); a.report = reportOf(a);
    var H = D.jget(HK, []); H.unshift(a); D.jset(HK, H);            // saved to history first
    D.send("MDC1", { t: "session_done", id: a.id, at: a.finished, staff: a.staff, items: a.items.length, corrections: a.items.filter(function (i) { return i.corr; }).length });
    setActive(null);                                                 // then clear only the active list
    drawActive(); renderDue(); showReport(a);
  }
  function reportOf(a) {
    var L = ["Birkhill manual date check " + D.ukWhen(a.finished), "Checked by " + a.staff + ". " + a.items.length + " products. Stock differences: " + a.items.filter(function (i) { return i.disc; }).length + "."];
    a.items.forEach(function (it) { L.push(it.name + ", barcode " + (it.bc || "none") + ", qty " + it.qty + (it.disc ? " (" + it.disc + ")" : "") + ", " + dateTxt(it)); });
    L.push("Stock differences are drafts for Vijay. Nothing was changed on the till.");
    return L.join("\n");
  }
  function showReport(a) {
    $("mdcReport").innerHTML = "<div class='card2' id='mdcRep'><h2>Completed items report</h2><div class='msg ok'>Saved in history. The active list is cleared and ready for the next check.</div>" +
      "<table><tr><th>Product</th><th>Qty</th><th>Date</th></tr>" + a.items.map(function (it) { return "<tr><td>" + esc(it.name) + "<div class='muted'>" + esc(it.bc) + "</div></td><td>" + it.qty + (it.disc ? "<div class='tag w'>" + esc(it.disc) + "</div>" : "") + "</td><td>" + esc(dateTxt(it)) + "</td></tr>"; }).join("") + "</table>" +
      "<button type='button' class='btn o' id='mdcShare'>Share to Vijay office WhatsApp</button><button type='button' class='btn sec' id='mdcNew'>Start new check</button></div>";
    $("mdcShare").onclick = function () { D.share(a.report, "Manual date check"); };
    $("mdcNew").onclick = function () { $("mdcReport").innerHTML = ""; window.scrollTo(0, 0); };
    try { $("mdcRep").scrollIntoView(); } catch (e) {}
  }
  function historyView() {
    var H = D.jget(HK, []);
    $("mdcReport").innerHTML = "<div class='card2'><h2>Finished checks on this phone</h2>" + (H.length ? H.slice(0, 30).map(function (a, i) { return "<div class='res' data-h='" + i + "'><div><b>" + esc(D.ukWhen(a.finished)) + "</b> " + esc(a.staff) + "<div class='muted'>" + a.items.length + " products</div></div></div>"; }).join("") : "<div class='muted'>None yet.</div>") + "</div>";
    Array.prototype.forEach.call(document.querySelectorAll("[data-h]"), function (el) { el.onclick = function () { showReport(H[+el.getAttribute("data-h")]); }; });
  }
  // ---------- Date Reports
  function reports() {
    var w = D.warn(DATA.settings), all = D.records(DATA.records), c = D.classify(all, w);
    function sec(id, title, rows, note) {
      return "<div class='card2' id='" + id + "'><h2>" + title + " (" + rows.length + ")</h2><div class='muted'>" + note + "</div>" + (rows.length ? "<table><tr><th>Product</th><th>Date</th><th>Qty</th></tr>" + rows.map(function (r) {
        return "<tr><td>" + (r.urgent ? "<span class='tag u'>URGENT</span> " : "") + esc(r.name) + "<div class='muted'>" + esc(r.bc || "no barcode") + " &middot; " + (r.src === "edn" ? "Eden delivery" : "date check") + " " + esc(D.ukDate(r.at)) + "</div></td><td>" + esc(D.kindTxt(r.kind)) + " " + esc(D.ukDate(r.date)) + "<div class='muted'>" + (r.left < 0 ? (-r.left) + " days ago" : r.left === 0 ? "today" : r.left + " days left") + "</div></td><td>" + r.qty + "</td></tr>";
      }).join("") + "</table>" : "<div class='msg ok'>None.</div>") + "</div>";
    }
    var h = "<div class='card2'><h2>Date Reports</h2><div class='muted'>From the latest check of each product (manual date checks and Eden deliveries, all phones after the box update, about every 30 minutes, plus this phone now). " + c.checked + " products with a check.</div>" +
      breadReportHtml() +
      "<div style='margin-top:8px'>Short-dated warning: <b id='mdcWShort'>" + w.short + " days</b>. Urgent: <b id='mdcWUrg'>" + w.urgent + " days</b> or less." + (w.by ? " <span class='muted'>Set by " + esc(w.by) + " " + esc(D.ukWhen(w.at)) + ".</span>" : "") + "</div>" +
      "<button type='button' class='btn o' id='mdcRShare'>Share to Vijay office WhatsApp</button><button type='button' class='btn sec' id='mdcWEdit'>Change warning periods (manager)</button><div id='mdcWBox'></div></div>" +
      sec("mdcExpired", "Expired (use-by passed)", c.expired, "Remove from sale now.") +
      sec("mdcOverdue", "Overdue (best-before passed)", c.overdue, "Past best-before. Reduce or remove.") +
      sec("mdcShort", "Short-dated (within " + w.short + " days)", c.short, "Urgent = " + w.urgent + " days or less. Reduce to clear.");
    box.innerHTML = h;
    $("mdcRShare").onclick = function () { D.share(D.reportText(c, w), "Birkhill date report"); };
    $("mdcWEdit").onclick = function () { warnEdit(w); };
  }
  function warnEdit(w) {
    D.managers().then(function (M) {
      var names = Object.keys(M);
      if (!names.length) { $("mdcWBox").innerHTML = "<div class='msg warn'>No manager code is set up yet. Set one up in Deliveries (Stock In) > Manager, then ask Grok Bot to switch it on.</div>"; return; }
      var opt = function (v, sel) { return [1, 2, 3, 5, 7, 10, 14, 21, 30].map(function (n) { return "<option" + (n === v ? " selected" : "") + ">" + n + "</option>"; }).join(""); };
      $("mdcWBox").innerHTML = "<label>Manager</label><select id='mdcMName'>" + names.map(function (n) { return "<option>" + esc(n) + "</option>"; }).join("") + "</select><label>Manager code</label><input id='mdcMCode' type='password' autocomplete='current-password'>" +
        "<label>Short-dated warning (days)</label><select id='mdcWS'>" + opt(w.short) + "</select><div class='muted'>For example 3, 7, 14 or 30.</div><label>Urgent (days or less)</label><select id='mdcWU'>" + opt(w.urgent) + "</select>" +
        "<button type='button' class='btn' id='mdcWSave'>Save warning periods</button><div id='mdcWMsg'></div>";
      $("mdcWSave").onclick = function () {
        var n = $("mdcMName").value, s = +$("mdcWS").value, u = +$("mdcWU").value;
        if (u > s) { $("mdcWMsg").innerHTML = "<div class='msg err'>Urgent must be the same or fewer days than short-dated.</div>"; return; }
        $("mdcWMsg").innerHTML = "<div class='msg warn'>Checking...</div>";
        D.checkManager(n, $("mdcMCode").value).then(function () { D.setWarn(s, u, n); reports(); }).catch(function (e) { $("mdcWMsg").innerHTML = "<div class='msg err'>" + esc(e.message || "Code not right.") + "</div>"; });
      };
    }).catch(function () { $("mdcWBox").innerHTML = "<div class='msg err'>Could not load the manager list. Open the app from the full link first.</div>"; });
  }
  if (document.readyState !== "loading") setup(); else document.addEventListener("DOMContentLoaded", setup);
  window.__mdc = { mode: mode, applyCode: applyCode };
})();
