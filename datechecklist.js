/* Date Check List + Manage lists (27 Nov 2026).
   Checklist of in-stock products by department or a manager-made list, like Stock Count.
   Saves to Camera Entries via BirkhillDates (MDC1), drafts only, never writes to the till.
   List definitions are append-only (edit and delete are new rows). */
(function () {
  var D = window.BirkhillDates; if (!D) return;
  var esc = D.esc, $ = function (id) { return document.getElementById(id); };
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var DATA = null, BYID = {}, BYBC = {}, DEPN = {}, SUBN = {};
  var cur = { pick: "", items: [], open: null, scanS: null };
  var mgr = { ok: false, name: "" };

  function bkey(b) { return String(b || "").replace(/\D/g, "").replace(/^0+/, ""); }
  function css() {
    if ($("dclCss")) return;
    var s = document.createElement("style"); s.id = "dclCss";
    s.textContent = ".mdc-bar{grid-template-columns:1fr 1fr !important}" +
      ".dcl .btn{display:block;width:100%;min-height:56px;border:0;border-radius:14px;background:#17643F;color:#fff;font-weight:800;font-size:1.1rem;margin-top:10px}" +
      ".dcl .btn.sec{background:#fff;color:#17643F;border:2px solid #17643F}.dcl .btn.o{background:#E86B2A}.dcl .btn.red{background:#b71c1c}" +
      ".dcl-prog{height:12px;background:#e3ece6;border-radius:8px;overflow:hidden;margin:8px 0 4px}.dcl-prog>span{display:block;height:100%;background:#17643F;width:0}" +
      ".dcl-item{display:flex;gap:10px;align-items:flex-start;padding:12px 10px;border-bottom:1px solid #e3ece6;cursor:pointer;background:#fff}" +
      ".dcl-item.jump{outline:3px solid #17643F;background:#e8f6ec}.dcl-item .nm{font-weight:800}" +
      ".dcl-item .meta{color:#5b6f64;font-size:.95rem}.dcl-done .dcl-item{background:#f4fbf6}" +
      ".dcl-date.expired,.dcl-date.today{border-color:#b71c1c !important;background:#fdecea}" +
      ".dcl-date.urgent{border-color:#E86B2A !important;background:#fff4e5}" +
      ".dcl-tag{display:inline-block;padding:2px 8px;border-radius:8px;font-weight:800;font-size:.8rem;margin-right:6px}" +
      ".dcl-tag.u{background:#b71c1c;color:#fff}.dcl-tag.w{background:#fff4e5;color:#8a4b00}.dcl-tag.ok{background:#e8f6ec;color:#17643F}" +
      ".dcl-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border-radius:12px;background:#e8f6ec;margin:4px 4px 0 0;font-weight:700}" +
      ".dcl-chip button{border:0;background:none;color:#b71c1c;font-weight:900;font-size:1.1rem;cursor:pointer}" +
      ".dcl-days{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.dcl-days label{display:flex;align-items:center;gap:4px;min-height:44px;font-weight:700}" +
      ".dcl-ed{background:#fff;border-radius:16px;padding:14px;margin:8px 0;box-shadow:0 1px 4px rgba(24,52,42,.1)}" +
      ".mdc-due .btn{display:block;width:100%;min-height:48px;border:0;border-radius:14px;background:#17643F;color:#fff;font-weight:800;font-size:1.05rem;margin-top:8px;cursor:pointer}.mdc-due .btn.sec{background:#fff;color:#17643F;border:2px solid #17643F}";
    document.head.appendChild(s);
  }
  function img(p) {
    if (p && p.i && DATA && DATA.img_base) return "<img class='pimg' alt='' src='" + esc(DATA.img_base + p.i) + "' onerror=\"this.style.display='none'\">";
    return "<div class='pimg' style='display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:8px;background:#f0f4f1;font-size:11px;color:#5b6f64;flex:0 0 56px'>No pic</div>";
  }
  function setData(j) {
    DATA = j; BYID = {}; BYBC = {}; DEPN = {}; SUBN = {};
    (j.departments || []).forEach(function (d) { DEPN[d.id] = d.n; (d.subs || []).forEach(function (s) { SUBN[d.id + ":" + s.id] = s.n; }); });
    (j.products || []).forEach(function (a) {
      var p = { id: a[0], n: a[1], s: a[2], b: a[3] || [], q: a[4], i: a[5], did: a[6], sid: a[7] };
      BYID[p.id] = p;
      (p.b || []).forEach(function (b) { var k = bkey(b); if (k && !BYBC[k]) BYBC[k] = p; });
    });
  }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    return fetch("datecheck.json").then(function (r) { if (!r.ok) throw new Error("locked"); return r.json(); }).then(function (j) { setData(j); return j; });
  }
  function weekdayOf(iso) {
    var d = new Date(String(iso || D.today()) + "T12:00:00");
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  }
  function isDue(days, iso) {
    days = days || [];
    if (!days.length) return false;
    return days.indexOf(weekdayOf(iso)) >= 0;
  }
  function nextDue(days, iso) {
    var start = new Date(String(iso || D.today()) + "T12:00:00");
    for (var i = 0; i < 8; i++) {
      var n = new Date(start.getTime() + i * 86400000);
      var name = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n.getDay()];
      if ((days || []).indexOf(name) >= 0) return { name: name, date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(n) };
    }
    return { name: "", date: "" };
  }
  function lastMap() {
    var out = {};
    Object.keys(DATA.last_checks || {}).forEach(function (k) { out[k] = DATA.last_checks[k]; });
    D.records(DATA.records || []).forEach(function (r) {
      if (r.t && r.t !== "check" && r.t !== "edn_item") return;
      var pid = +r.pid; if (!pid) return;
      var at = String(r.at || ""), cur = out[String(pid)];
      if (cur && at < String(cur.at || "")) return;
      var dates = (r.batches || []).map(function (b) { return b.d; }).filter(Boolean).sort();
      out[String(pid)] = { at: at, staff: r.staff || "", dtype: r.dtype || "", qty: r.qty, date: dates[0] || "", id: r.id || "", batches: r.batches || [], prevQty: cur ? cur.qty : null, prevDtype: cur ? cur.dtype : "" };
    });
    return out;
  }
  function checkedToday() {
    var today = D.today(), ids = {};
    ((DATA.due_today && DATA.due_today.groups) || []).forEach(function (g) {
      (g.checked_pids || []).forEach(function (id) { ids[id] = 1; });
    });
    D.records(DATA.records || []).forEach(function (r) {
      if (String(r.at || "").slice(0, 10) !== today) return;
      if (r.t && r.t !== "check" && r.t !== "edn_item") return;
      if (+r.pid) ids[+r.pid] = 1;
    });
    return ids;
  }
  function customLists() { return D.lists(DATA.lists || []); }
  function resolveIds(lst) {
    var dids = {}, sids = {}, have = {}, out = [];
    (lst.dids || []).forEach(function (d) { dids[d] = 1; });
    (lst.sids || []).forEach(function (s) { sids[s] = 1; });
    Object.keys(BYID).forEach(function (k) {
      var p = BYID[k], q = Number(p.q || 0);
      if ((dids[p.did] || sids[p.sid]) && q > 0 && !have[p.id]) { have[p.id] = 1; out.push(p.id); }
    });
    (lst.pids || []).forEach(function (id) { if (!have[id]) { have[id] = 1; out.push(id); } });
    return out;
  }
  function deptIds(dids) {
    var want = {}, out = [];
    (dids || []).forEach(function (d) { want[d] = 1; });
    Object.keys(BYID).forEach(function (k) {
      var p = BYID[k];
      if (want[p.did] && Number(p.q || 0) > 0) out.push(p.id);
    });
    return out;
  }
  function liveGroups() {
    var recs = D.records(DATA.records || []), today = D.today();
    function paint(g) {
      var seen = {};
      (g.checked_pids || []).forEach(function (id) { seen[id] = 1; });
      recs.forEach(function (r) {
        if (String(r.at || "").slice(0, 10) !== today) return;
        if (r.t && r.t !== "check" && r.t !== "edn_item") return;
        var pid = +r.pid;
        if (pid && (g.pids || []).indexOf(pid) >= 0) seen[pid] = 1;
      });
      var checked = 0, notChecked = [];
      (g.pids || []).forEach(function (id) { if (seen[id]) checked++; });
      (g.not_checked || []).forEach(function (p) { if (!seen[p.id]) notChecked.push(p); });
      var out = {}; Object.keys(g).forEach(function (k) { out[k] = g[k]; });
      out.checked = checked;
      out.left = g.due ? Math.max(0, (g.total || 0) - checked) : 0;
      out.not_checked = g.due ? notChecked : [];
      return out;
    }
    var published = ((DATA.due_today && DATA.due_today.groups) || []).slice();
    var out = [];
    published.forEach(function (g) {
      if (String(g.key || "").indexOf("list:") === 0) return;
      out.push(paint(g));
    });
    customLists().forEach(function (L) {
      var ids = resolveIds(L), due = isDue(L.days, today), nxt = nextDue(L.days, today);
      var items = ids.map(function (id) { return BYID[id]; }).filter(Boolean);
      var countZero = (L.pids || []).length && !(L.dids || []).length && !(L.sids || []).length;
      var pids = [];
      items.forEach(function (p) {
        if (countZero || Number(p.q || 0) > 0) pids.push(p.id);
      });
      (L.pids || []).forEach(function (id) { if (pids.indexOf(id) < 0 && countZero) pids.push(id); });
      var g = {
        key: L.key, id: L.id, name: L.name, days: L.days || [], due: due,
        next: nxt.name, next_date: nxt.date, kind: "list",
        pids: pids, checked_pids: [], not_checked: pids.map(function (id) {
          var p = BYID[id] || { id: id, n: "Product " + id, b: [] };
          return { id: id, n: p.n, bc: (p.b && p.b[0]) || "", did: p.did, dept: DEPN[p.did] || "" };
        }),
        total: pids.length, checked: 0, left: due ? pids.length : 0
      };
      out.push(paint(g));
    });
    return out;
  }
  function picks() {
    var groups = liveGroups(), dueKeys = {}, opts = [];
    groups.forEach(function (g) {
      if (!g.due) return;
      dueKeys[g.key] = 1;
      opts.push({ key: g.key, name: g.name + " (due today)", kind: g.kind || (g.key === "bread" ? "bread" : "list"), days: g.days, pids: g.pids, id: g.id, group: g });
    });
    if (!dueKeys.bread) {
      var bread = groups.filter(function (g) { return g.key === "bread"; })[0];
      if (bread) opts.push({ key: "bread", name: bread.name + " (next " + (bread.next || "") + ")", kind: "bread", days: bread.days, pids: bread.pids, group: bread });
    }
    customLists().forEach(function (L) {
      if (dueKeys[L.key]) return;
      var nxt = nextDue(L.days, D.today());
      opts.push({ key: L.key, name: L.name + (L.days && L.days.length ? " (" + L.days.join(", ") + (nxt.name ? ", next " + nxt.name : "") + ")" : ""), kind: "list", days: L.days, id: L.id, list: L });
    });
    (DATA.departments || []).forEach(function (d) {
      var key = "dept:" + d.id;
      if (dueKeys.bread && (d.sched === "bread")) return;
      var n = deptIds([d.id]).length;
      if (!n) return;
      opts.push({ key: key, name: d.n + (d.sched === "bread" && d.due ? " - due today" : ""), kind: "dept", dids: [d.id], label: d.n, count: n });
    });
    return opts;
  }
  function currentItems(opt) {
    var ids = [];
    if (!opt) return [];
    if (opt.group && opt.group.pids && opt.group.pids.length) ids = opt.group.pids.slice();
    else if (opt.kind === "dept") ids = deptIds(opt.dids || []);
    else if (opt.kind === "list" || opt.list) ids = resolveIds(opt.list || customLists().filter(function (L) { return L.key === opt.key; })[0] || {});
    else if (opt.pids) ids = opt.pids.slice();
    var last = lastMap(), done = checkedToday();
    var rows = ids.map(function (id) {
      var p = BYID[id] || { id: id, n: "Product " + id, b: [], q: null, did: 0, sid: 0 };
      return { p: p, last: last[String(id)] || null, done: !!done[id] };
    });
    rows.sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return String(a.p.n).toUpperCase() < String(b.p.n).toUpperCase() ? -1 : 1;
    });
    return rows;
  }
  function lastTxt(lc) {
    if (!lc || !lc.at) return "Not checked yet";
    var bit = "Last checked " + D.ukWhen(lc.at);
    if (lc.staff) bit += " by " + lc.staff;
    if (lc.dtype === "zero") bit += " (no stock)";
    else if (lc.dtype === "long" || lc.dtype === "ok") bit += " (all OK)";
    else if (lc.date) bit += ", " + D.ukDate(lc.date);
    return bit;
  }
  function dateClass(iso) {
    if (!iso) return "";
    var w = D.warn(DATA.settings), left = D.days(iso, D.today());
    if (left < 0) return "expired";
    if (left === 0) return "today";
    if (left <= (w.urgent || 3)) return "urgent";
    return "";
  }
  function dateHint(iso) {
    if (!iso) return "";
    var left = D.days(iso, D.today());
    if (left < 0) return "Expired " + (-left) + " day" + (left === -1 ? "" : "s") + " ago. Remove from sale.";
    if (left === 0) return "Expires today. Reduce or remove.";
    if (left <= 3) return left + " day" + (left === 1 ? "" : "s") + " left. Reduce or remove.";
    return "";
  }
  function renderDue(el) {
    if (!el || !DATA) return;
    var groups = liveGroups();
    var due = groups.filter(function (g) { return g.due; });
    var off = groups.filter(function (g) { return !g.due && (g.key === "bread" || String(g.key || "").indexOf("list:") === 0); });
    el.classList.remove("hidden");
    var h = "";
    if (due.length) {
      h = "<h2>Due today</h2>" + due.map(function (g) {
        var depts = (g.departments || []).map(function (d) { return d.n; }).join(" and ");
        return "<div style='margin-top:10px'><div class='due'>" + esc(g.name) + " date check is due today" + (g.days && g.days.length ? " (" + esc(g.days.join(", ")) + ")" : "") + ".</div>" +
          "<div class='muted' style='margin-top:4px'>" + (depts ? esc(depts) + ": " : "") + g.checked + " of " + g.total + " in stock checked. " + g.left + " not checked yet.</div>" +
          "<button type='button' class='btn' data-open-list='" + esc(g.key) + "'>Open Date Check List</button></div>";
      }).join("");
    } else if (off.length) {
      h = off.map(function (g) {
        return "<h2>" + esc(g.name) + " date check</h2><div class='off'>Not due today. Next due: " + esc(g.next || "") + ".</div>" +
          "<div class='muted' style='margin-top:6px'>Checked on " + esc((g.days || []).join(", ")) + ". You can still open the list and check a product today if you need to.</div>" +
          "<button type='button' class='btn sec' data-open-list='" + esc(g.key) + "'>Open Date Check List</button>";
      }).join("");
    } else { el.classList.add("hidden"); el.innerHTML = ""; return; }
    el.innerHTML = h;
    Array.prototype.forEach.call(el.querySelectorAll("[data-open-list]"), function (b) {
      b.onclick = function () { open({ pick: b.getAttribute("data-open-list") }); };
    });
  }

  function boxEl() { return $("mdcBox"); }
  function staffVal() {
    var el = $("dclStaff");
    var n = (el ? el.value : D.staff() || "").trim();
    if (n) try { localStorage.setItem("birkhill-staff-name", n); } catch (e) {}
    return n;
  }
  function say(t, k) { var el = $("dclMsg"); if (el) el.innerHTML = "<div class='msg " + (k || "ok") + "'>" + esc(t) + "</div>"; }

  function open(opts) {
    opts = opts || {};
    css();
    var box = boxEl();
    if (!box) return;
    if (window.__mdc && window.__mdc.mode && window.__mdc.curMode !== "list") {
      try { window.__mdc.mode("list", { skipDraw: true }); } catch (e) {}
    }
    load().then(function () {
      if (opts.manage) { manage(); return; }
      drawList(opts.pick || opts.list || "");
    }).catch(function () {
      box.innerHTML = "<div class='msg err'>Product list locked. Open this app once from the full link Vijay sent (it ends in #k=...).</div>";
    });
  }

  function drawList(pickKey) {
    var box = boxEl();
    var opts = picks();
    if (!pickKey) {
      var firstDue = opts.filter(function (o) { return /due today/i.test(o.name); })[0];
      pickKey = (firstDue && firstDue.key) || (opts[0] && opts[0].key) || "";
    }
    cur.pick = pickKey;
    var opt = opts.filter(function (o) { return o.key === pickKey; })[0] || opts[0];
    cur.items = currentItems(opt);
    var doneN = cur.items.filter(function (r) { return r.done; }).length, tot = cur.items.length;
    var pct = tot ? Math.round(100 * doneN / tot) : 0;
    var st = D.staff();
    var h = "<div class='dcl'><div class='card2'><h2>Date Check List</h2>" +
      "<div class='muted'>Work down every product on the list, like a stock count. Recorded stock is the latest till figure, last updated " + esc((DATA && DATA.stock_taken_display) || "") + ". Nothing is changed on the till.</div>" +
      "<label for='dclStaff'>Checked by</label><input id='dclStaff' value='" + esc(st) + "' placeholder='Your name'>" +
      "<label for='dclPick'>Choose a list</label><select id='dclPick'>";
    var groups = [["Due and lists", opts.filter(function (o) { return o.kind !== "dept"; })], ["Departments", opts.filter(function (o) { return o.kind === "dept"; })]];
    groups.forEach(function (g) {
      if (!g[1].length) return;
      h += "<optgroup label='" + esc(g[0]) + "'>";
      g[1].forEach(function (o) { h += "<option value='" + esc(o.key) + "'" + (o.key === pickKey ? " selected" : "") + ">" + esc(o.name) + (o.count ? " (" + o.count + ")" : "") + "</option>"; });
      h += "</optgroup>";
    });
    h += "</select><div class='row2' style='margin-top:8px'><button type='button' class='btn' id='dclScan' style='margin-top:0'>Scan barcode</button><button type='button' class='btn sec' id='dclManage' style='margin-top:0'>Manage lists</button></div>" +
      "<div id='dclScanWrap' class='hidden' style='margin-top:8px'><video id='dclVideo' playsinline muted autoplay style='width:100%;border-radius:12px'></video></div>" +
      "<div style='margin-top:12px;font-weight:800'>" + doneN + " of " + tot + " checked</div>" +
      "<div class='dcl-prog' aria-hidden='true'><span style='width:" + pct + "%'></span></div>" +
      "<div id='dclMsg'></div></div>" +
      "<div id='dclEd'></div>" +
      "<div class='card2'><h2>To check (" + (tot - doneN) + ")</h2><div id='dclTodo'></div></div>" +
      "<div class='card2 dcl-done'><h2>Done (" + doneN + ")</h2><div class='muted'>A wrong entry can be corrected. The original is kept.</div><div id='dclDone'></div></div></div>";
    box.innerHTML = h;
    box.classList.remove("hidden");
    var quick = document.querySelector("body > .card"); if (quick) quick.classList.add("hidden");
    $("dclStaff").onchange = function () { staffVal(); };
    $("dclPick").onchange = function () { drawList(this.value); };
    $("dclScan").onclick = toggleScan;
    $("dclManage").onclick = function () { manage(); };
    drawRows();
    if (window.__mdc && window.__mdc.renderDueNow) window.__mdc.renderDueNow();
  }
  function drawRows() {
    var todo = $("dclTodo"), done = $("dclDone");
    if (!todo) return;
    function row(r, inDone) {
      var p = r.p, bc = (p.b && p.b[0]) || "no barcode";
      var warn = "";
      if (r.last && r.last.date) {
        var hint = dateHint(r.last.date);
        if (hint) warn = "<div><span class='dcl-tag " + (dateClass(r.last.date) === "urgent" ? "w" : "u") + "'>" + esc(hint) + "</span></div>";
      }
      var corr = "";
      if (inDone && r.last && r.last.prevQty != null && (r.last.prevQty !== r.last.qty || r.last.prevDtype !== r.last.dtype)) {
        corr = "<div class='muted'>Corrected to " + (r.last.dtype === "zero" ? "no stock" : r.last.dtype === "long" ? "all OK" : r.last.qty) + " (was " + (r.last.prevDtype === "zero" ? "no stock" : r.last.prevQty) + ")</div>";
      }
      return "<div class='dcl-item' data-pid='" + p.id + "' id='dclP" + p.id + "'>" + img(p) + "<div><div class='nm'>" + esc(p.n) + "</div>" +
        "<div class='meta'>" + esc(bc) + " &middot; stock " + (p.q == null ? "?" : p.q) + "</div>" +
        "<div class='meta'>" + esc(lastTxt(r.last)) + "</div>" + warn + corr +
        (inDone ? "<button type='button' class='btn sec' data-edit='" + p.id + "' style='margin-top:8px;min-height:44px'>Edit</button>" : "") +
        "</div></div>";
    }
    var left = cur.items.filter(function (r) { return !r.done; });
    var ready = cur.items.filter(function (r) { return r.done; });
    todo.innerHTML = left.length ? left.map(function (r) { return row(r, false); }).join("") : "<div class='msg ok'>All products on this list are checked.</div>";
    done.innerHTML = ready.length ? ready.map(function (r) { return row(r, true); }).join("") : "<div class='muted'>Nothing checked yet.</div>";
    Array.prototype.forEach.call(boxEl().querySelectorAll(".dcl-item[data-pid]"), function (el) {
      el.onclick = function (e) {
        if (e.target && e.target.getAttribute("data-edit")) return;
        openEditor(+el.getAttribute("data-pid"), false);
      };
    });
    Array.prototype.forEach.call(boxEl().querySelectorAll("[data-edit]"), function (b) {
      b.onclick = function (e) { e.stopPropagation(); openEditor(+b.getAttribute("data-edit"), true); };
    });
  }
  function openEditor(pid, isEdit) {
    var row = cur.items.filter(function (r) { return r.p.id === pid; })[0];
    var p = (row && row.p) || BYID[pid];
    if (!p) return say("That product is not on this list.", "err");
    cur.open = { pid: pid, edit: !!isEdit };
    var lc = row && row.last, w = D.warn(DATA.settings);
    var batches = (lc && isEdit && lc.batches && lc.batches.length) ? lc.batches.slice() : [{ d: "", q: "", k: "bb" }];
    var h = "<div class='dcl-ed' id='dclEditor'><div style='font-weight:900;font-size:1.15rem'>" + esc(p.n) + "</div>" +
      "<div class='muted'>" + esc((p.b && p.b[0]) || "no barcode") + " &middot; till stock " + (p.q == null ? "?" : p.q) + " &middot; " + esc(DEPN[p.did] || "") + "</div>" +
      "<div class='muted'>" + esc(lastTxt(lc)) + "</div>" +
      "<label>Best before or use-by dates</label><div id='dclBatches'></div>" +
      "<button type='button' class='btn sec' id='dclAddD'>+ Add another date</button>" +
      "<div class='row2'><button type='button' class='btn o' id='dclNone'>No stock on shelf</button><button type='button' class='btn sec' id='dclOk'>All OK / long date</button></div>" +
      "<button type='button' class='btn' id='dclSave'>" + (isEdit ? "Save correction" : "Save check") + "</button>" +
      "<button type='button' class='btn sec' id='dclCancel'>Cancel</button><div id='dclEMsg'></div>" +
      "<div class='muted'>Dates that are expired, today, or within " + (w.urgent || 3) + " days are highlighted to reduce or remove.</div></div>";
    $("dclEd").innerHTML = h;
    function addLine(b) {
      b = b || { d: "", q: "", k: "bb" };
      var d = document.createElement("div"); d.className = "batch";
      d.innerHTML = "<input type='date' class='bd dcl-date' aria-label='Date'><input type='number' class='bq' inputmode='numeric' min='0' placeholder='Qty' aria-label='Qty'>" +
        "<button type='button' aria-label='Remove'>&times;</button>" +
        "<select class='bk' style='grid-column:1/4'><option value='bb'>Best-before</option><option value='useby'>Use-by / expiry</option></select>" +
        "<div class='muted dcl-hint' style='grid-column:1/4'></div>";
      d.querySelector(".bd").value = b.d || "";
      d.querySelector(".bq").value = b.q || "";
      d.querySelector(".bk").value = b.k || "bb";
      d.querySelector("button").onclick = function () { d.remove(); };
      d.querySelector(".bd").oninput = d.querySelector(".bd").onchange = function () { mark(d); };
      $("dclBatches").appendChild(d); mark(d);
    }
    function mark(d) {
      var inp = d.querySelector(".bd"), iso = inp.value, cls = dateClass(iso);
      inp.className = "bd dcl-date" + (cls ? " " + cls : "");
      d.querySelector(".dcl-hint").textContent = dateHint(iso);
    }
    batches.forEach(addLine);
    $("dclAddD").onclick = function () { addLine(); };
    $("dclNone").onclick = function () { saveCheck(p, { dtype: "zero", qty: 0, batches: [] }, isEdit, lc); };
    $("dclOk").onclick = function () { var q = p.q == null ? 0 : Math.max(0, Number(p.q) || 0); saveCheck(p, { dtype: "long", qty: q, batches: [] }, isEdit, lc); };
    $("dclSave").onclick = function () { saveDates(p, isEdit, lc); };
    $("dclCancel").onclick = function () { $("dclEd").innerHTML = ""; cur.open = null; };
    try { $("dclEditor").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
  }
  function eMsg(t, k) { var el = $("dclEMsg"); if (el) el.innerHTML = "<div class='msg " + (k || "err") + "'>" + esc(t) + "</div>"; }
  function saveDates(p, isEdit, lc) {
    var batches = [];
    Array.prototype.forEach.call(document.querySelectorAll("#dclBatches .batch"), function (b) {
      var d = b.querySelector(".bd").value, q = b.querySelector(".bq").value;
      if (d && +q > 0) batches.push({ d: d, q: +q, k: b.querySelector(".bk").value || "bb" });
    });
    if (!batches.length) return eMsg("Add at least one date and quantity, or tap No stock on shelf or All OK / long date.");
    var qty = batches.reduce(function (a, b) { return a + b.q; }, 0);
    var dt = batches.length === 1 ? (batches[0].k || "bb") : "multi";
    saveCheck(p, { dtype: dt, qty: qty, batches: batches }, isEdit, lc);
  }
  function saveCheck(p, rec, isEdit, lc) {
    var staff = staffVal();
    if (!staff) return eMsg("Type your name in Checked by first.");
    var prev = lc && (lc.qty != null || (lc.batches && lc.batches.length)) ? lc : null;
    var r = D.addCheck({
      src: "list", list: cur.pick, staff: staff, pid: p.id, bc: (p.b && p.b[0]) || "", name: p.n,
      dept: DEPN[p.did] || "", sub: SUBN[p.did + ":" + p.sid] || "",
      recorded: p.q, recorded_at: DATA.stock_taken_at, qty: rec.qty, dtype: rec.dtype, batches: rec.batches,
      how: isEdit ? "edit" : "list", prev_id: isEdit && lc ? lc.id : ""
    });
    if (p.q != null && rec.dtype !== "long" && rec.dtype !== "ok" && Number(rec.qty) !== Number(p.q)) {
      D.correction({ pid: p.id, bc: (p.b && p.b[0]) || "", name: p.n, recorded: p.q, snapshotAt: DATA.stock_taken_at, qty: rec.qty, src: "list", staff: staff, ref: cur.pick });
    }
    if ($("dclEd")) $("dclEd").innerHTML = "";
    cur.open = null;
    drawList(cur.pick);
    var note = isEdit && prev ? "Corrected to " + (rec.dtype === "zero" ? "no stock" : rec.dtype === "long" ? "all OK" : rec.qty) + " (was " + (prev.dtype === "zero" ? "no stock" : prev.qty) + ")." : "Saved " + p.n + ".";
    say(note + " The check is on this phone now. Other devices pick it up at the next update.", "ok");
    return r;
  }

  function toggleScan() {
    if (cur.scanS) { try { cur.scanS.stop(); } catch (e) {} cur.scanS = null; $("dclScanWrap").classList.add("hidden"); $("dclScan").textContent = "Scan barcode"; return; }
    if (!window.BirkhillBarcode) return say("Scanner not available. Type is not needed: pick the product on the list.", "err");
    $("dclScanWrap").classList.remove("hidden");
    BirkhillBarcode.startLive({ video: $("dclVideo"), wrap: $("dclScanWrap"), zxingSrc: "zxing.min.js", onCode: function (raw) { toggleScan(); jumpToCode(raw); } })
      .then(function (s) { cur.scanS = s; $("dclScan").textContent = "Stop scan"; })
      .catch(function () { $("dclScanWrap").classList.add("hidden"); say("Could not open the camera.", "err"); });
  }
  function jumpToCode(raw) {
    var p = BYBC[bkey(raw)];
    if (!p) return say("Barcode " + raw + " was not found on the till list.", "err");
    var row = cur.items.filter(function (r) { return r.p.id === p.id; })[0];
    if (!row) return say(p.n + " is not on this list. Choose a different list, or use Quick date check.", "warn");
    openEditor(p.id, !!row.done);
    var el = $("dclP" + p.id);
    if (el) { el.classList.add("jump"); try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {} setTimeout(function () { el.classList.remove("jump"); }, 2500); }
  }

  // ---------- Manage lists (manager code, same as Date Reports warning periods)
  function manage() {
    css();
    var box = boxEl();
    if (window.__mdc && window.__mdc.mode) try { window.__mdc.mode("list", { skipDraw: true }); } catch (e) {}
    load().then(function () {
      if (!mgr.ok) { manageGate(); return; }
      manageHome();
    }).catch(function () { box.innerHTML = "<div class='msg err'>Product list locked. Open this app once from the full link Vijay sent (it ends in #k=...).</div>"; });
  }
  function manageGate() {
    var box = boxEl();
    box.innerHTML = "<div class='dcl'><div class='card2'><h2>Manage lists</h2><div class='muted'>Create or change date check lists. This uses the manager name and code already set up in Deliveries (Stock In). No new password is stored on this site.</div><div id='dclGate'>Loading managers...</div><button type='button' class='btn sec' id='dclBack'>Back to Date Check List</button></div></div>";
    $("dclBack").onclick = function () { open({ pick: cur.pick }); };
    D.managers().then(function (M) {
      var names = Object.keys(M);
      if (!names.length) { $("dclGate").innerHTML = "<div class='msg warn'>No manager code is set up yet. Set one up in Deliveries (Stock In) > Manager, then come back here.</div>"; return; }
      $("dclGate").innerHTML = "<label>Manager</label><select id='dclMName'>" + names.map(function (n) { return "<option" + (n === mgr.name ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select>" +
        "<label>Manager code</label><input id='dclMCode' type='password' autocomplete='current-password'>" +
        "<button type='button' class='btn' id='dclMGo'>Continue</button><div id='dclMMsg'></div>";
      $("dclMGo").onclick = function () {
        var n = $("dclMName").value;
        $("dclMMsg").innerHTML = "<div class='msg warn'>Checking...</div>";
        D.checkManager(n, $("dclMCode").value).then(function () { mgr.ok = true; mgr.name = n; manageHome(); }).catch(function (e) { $("dclMMsg").innerHTML = "<div class='msg err'>" + esc(e.message || "Code not right.") + "</div>"; });
      };
    }).catch(function () { $("dclGate").innerHTML = "<div class='msg err'>Could not load the manager list. Open the app from the full link first.</div>"; });
  }
  function manageHome() {
    var L = customLists();
    var box = boxEl();
    var h = "<div class='dcl'><div class='card2'><h2>Manage lists</h2><div class='muted'>Signed in as " + esc(mgr.name) + ". New lists show on this phone now. Other devices pick them up after the next update, about 30 minutes.</div>" +
      "<button type='button' class='btn' id='dclNew'>Create a list</button>" +
      (L.length ? L.map(function (x) {
        return "<div class='dcl-item' style='cursor:default'><div><div class='nm'>" + esc(x.name) + "</div><div class='meta'>Due " + esc((x.days || []).join(", ") || "no days set") +
          " &middot; " + ((x.pids || []).length + " products") + ((x.dids || []).length ? ", " + x.dids.length + " department(s)" : "") +
          (x.by ? " &middot; last saved by " + esc(x.by) : "") + (x.at ? " " + esc(D.ukWhen(x.at)) : "") + "</div>" +
          "<div class='row2'><button type='button' class='btn sec' data-ledit='" + esc(x.id) + "' style='margin-top:8px'>Edit</button><button type='button' class='btn red' data-ldel='" + esc(x.id) + "' style='margin-top:8px'>Delete</button></div></div></div>";
      }).join("") : "<div class='muted' style='margin-top:10px'>No custom lists yet.</div>") +
      "<button type='button' class='btn sec' id='dclBack'>Back to Date Check List</button></div></div>";
    box.innerHTML = h;
    $("dclNew").onclick = function () { manageForm(null); };
    $("dclBack").onclick = function () { open({ pick: cur.pick }); };
    Array.prototype.forEach.call(box.querySelectorAll("[data-ledit]"), function (b) { b.onclick = function () { manageForm(customLists().filter(function (x) { return x.id === b.getAttribute("data-ledit"); })[0]); }; });
    Array.prototype.forEach.call(box.querySelectorAll("[data-ldel]"), function (b) {
      b.onclick = function () {
        var x = customLists().filter(function (L2) { return L2.id === b.getAttribute("data-ldel"); })[0];
        if (!x) return;
        if (!window.confirm("Delete the list " + x.name + "? The old definition stays in the history. Phones drop it after the next update.")) return;
        D.deleteList(x.id, mgr.name);
        manageHome();
      };
    });
  }
  function manageForm(existing) {
    var form = existing ? { id: existing.id, name: existing.name, days: (existing.days || []).slice(), pids: (existing.pids || []).slice(), dids: (existing.dids || []).slice(), sids: (existing.sids || []).slice() }
      : { id: "", name: "", days: ["Mon", "Wed", "Fri"], pids: [], dids: [], sids: [] };
    var box = boxEl();
    function body() {
      var dayBits = DAYS.map(function (d) { return "<label><input type='checkbox' data-day='" + d + "'" + (form.days.indexOf(d) >= 0 ? " checked" : "") + "> " + d + "</label>"; }).join("");
      var deptOpts = "<option value=''>Add a whole department</option>" + (DATA.departments || []).map(function (d) { return "<option value='" + d.id + "'>" + esc(d.n) + "</option>"; }).join("");
      var chips = "";
      form.dids.forEach(function (id) { chips += "<span class='dcl-chip'>Dept: " + esc(DEPN[id] || id) + " <button type='button' data-rmd='" + id + "'>&times;</button></span>"; });
      form.sids.forEach(function (id) { chips += "<span class='dcl-chip'>Sub-dept " + id + " <button type='button' data-rms='" + id + "'>&times;</button></span>"; });
      form.pids.forEach(function (id) {
        var p = BYID[id];
        chips += "<span class='dcl-chip'>" + esc(p ? p.n : ("Product " + id)) + " <button type='button' data-rmp='" + id + "'>&times;</button></span>";
      });
      box.innerHTML = "<div class='dcl'><div class='card2'><h2>" + (form.id ? "Edit list" : "Create a list") + "</h2>" +
        "<label for='dclLName'>List name</label><input id='dclLName' value='" + esc(form.name) + "' placeholder='e.g. Dairy daily'>" +
        "<label>Due days</label><div class='dcl-days' id='dclDays'>" + dayBits + "</div>" +
        "<label>Add products</label><div class='row2'><button type='button' class='btn' id='dclLScan' style='margin-top:0'>Scan barcode</button><input id='dclLQ' placeholder='Search name or barcode' autocomplete='off'></div>" +
        "<div id='dclLScanWrap' class='hidden' style='margin-top:8px'><video id='dclLVideo' playsinline muted autoplay style='width:100%;border-radius:12px'></video></div>" +
        "<div id='dclLRes'></div>" +
        "<label for='dclLDept'>Or add a whole category / department</label><select id='dclLDept'>" + deptOpts + "</select>" +
        "<div style='margin-top:8px'>" + (chips || "<span class='muted'>No products added yet.</span>") + "</div>" +
        "<button type='button' class='btn' id='dclLSave'>Save list</button>" +
        "<button type='button' class='btn sec' id='dclLCancel'>Cancel</button><div id='dclLMsg'></div></div></div>";
      $("dclLName").oninput = function () { form.name = this.value; };
      Array.prototype.forEach.call(box.querySelectorAll("[data-day]"), function (c) {
        c.onchange = function () {
          var d = c.getAttribute("data-day");
          if (c.checked && form.days.indexOf(d) < 0) form.days.push(d);
          if (!c.checked) form.days = form.days.filter(function (x) { return x !== d; });
          form.days = DAYS.filter(function (x) { return form.days.indexOf(x) >= 0; });
        };
      });
      $("dclLScan").onclick = function () { listScan(form, body); };
      $("dclLQ").oninput = function () { listSearch(form, this.value, body); };
      $("dclLDept").onchange = function () {
        var id = +this.value; if (!id) return;
        if (form.dids.indexOf(id) < 0) form.dids.push(id);
        this.value = ""; body();
      };
      Array.prototype.forEach.call(box.querySelectorAll("[data-rmd]"), function (b) { b.onclick = function () { form.dids = form.dids.filter(function (x) { return x !== +b.getAttribute("data-rmd"); }); body(); }; });
      Array.prototype.forEach.call(box.querySelectorAll("[data-rms]"), function (b) { b.onclick = function () { form.sids = form.sids.filter(function (x) { return x !== +b.getAttribute("data-rms"); }); body(); }; });
      Array.prototype.forEach.call(box.querySelectorAll("[data-rmp]"), function (b) { b.onclick = function () { form.pids = form.pids.filter(function (x) { return x !== +b.getAttribute("data-rmp"); }); body(); }; });
      $("dclLSave").onclick = function () { saveForm(form); };
      $("dclLCancel").onclick = function () { if (cur.scanS) try { cur.scanS.stop(); } catch (e) {} manageHome(); };
    }
    body();
  }
  function listSearch(form, q, redraw) {
    q = String(q || "").trim(); var qd = bkey(q);
    var el = $("dclLRes"); if (!el) return;
    if (q.length < 3 && qd.length < 6) { el.innerHTML = "<div class='muted'>Type 3 or more letters, or scan.</div>"; return; }
    var words = q.toUpperCase().split(/\s+/).filter(Boolean), out = [];
    Object.keys(BYID).forEach(function (k) {
      if (out.length >= 40) return;
      var p = BYID[k];
      var hit = qd && qd.length >= 4 && (p.b || []).some(function (b) { return bkey(b).indexOf(qd) >= 0; });
      if (!hit && !words.every(function (w) { return String(p.n).toUpperCase().indexOf(w) >= 0; })) return;
      out.push(p);
    });
    out.sort(function (a, b) { return a.n < b.n ? -1 : 1; });
    el.innerHTML = out.length ? out.map(function (p) { return "<div class='res' data-add='" + p.id + "'>" + img(p) + "<div><b>" + esc(p.n) + "</b><div class='muted'>" + esc((p.b && p.b[0]) || "no barcode") + " &middot; stock " + (p.q == null ? "?" : p.q) + "</div></div></div>"; }).join("") : "<div class='msg warn'>No products found.</div>";
    Array.prototype.forEach.call(el.querySelectorAll("[data-add]"), function (n) {
      n.onclick = function () {
        var id = +n.getAttribute("data-add");
        if (form.pids.indexOf(id) < 0) form.pids.push(id);
        redraw();
      };
    });
  }
  function listScan(form, redraw) {
    if (cur.scanS) { try { cur.scanS.stop(); } catch (e) {} cur.scanS = null; $("dclLScanWrap").classList.add("hidden"); $("dclLScan").textContent = "Scan barcode"; return; }
    if (!window.BirkhillBarcode) { $("dclLMsg").innerHTML = "<div class='msg err'>Scanner not available. Search instead.</div>"; return; }
    $("dclLScanWrap").classList.remove("hidden");
    BirkhillBarcode.startLive({ video: $("dclLVideo"), wrap: $("dclLScanWrap"), zxingSrc: "zxing.min.js", onCode: function (raw) {
      listScan(form, redraw);
      var p = BYBC[bkey(raw)];
      if (!p) { $("dclLMsg").innerHTML = "<div class='msg err'>Barcode " + esc(raw) + " was not found on the till list.</div>"; return; }
      if (form.pids.indexOf(p.id) < 0) form.pids.push(p.id);
      redraw();
    } }).then(function (s) { cur.scanS = s; $("dclLScan").textContent = "Stop scan"; }).catch(function () { $("dclLScanWrap").classList.add("hidden"); });
  }
  function saveForm(form) {
    form.name = ($("dclLName") && $("dclLName").value || form.name || "").trim();
    if (!form.name) { $("dclLMsg").innerHTML = "<div class='msg err'>Type a list name.</div>"; return; }
    if (!form.days.length) { $("dclLMsg").innerHTML = "<div class='msg err'>Tick at least one due day.</div>"; return; }
    if (!form.pids.length && !form.dids.length && !form.sids.length) { $("dclLMsg").innerHTML = "<div class='msg err'>Add at least one product, or a whole department.</div>"; return; }
    try {
      D.saveList({ id: form.id || undefined, name: form.name, days: form.days, pids: form.pids, dids: form.dids, sids: form.sids, by: mgr.name });
    } catch (e) { $("dclLMsg").innerHTML = "<div class='msg err'>" + esc(e.message || "Could not save.") + "</div>"; return; }
    manageHome();
  }

  function hookTabs() {
    css();
    var bar = document.querySelector(".mdc-bar");
    if (!bar || $("mdcModeList")) return;
    var b = document.createElement("button");
    b.type = "button"; b.id = "mdcModeList"; b.textContent = "Date Check List";
    var after = $("mdcModeQuick");
    if (after && after.nextSibling) bar.insertBefore(b, after.nextSibling); else bar.appendChild(b);
    b.onclick = function () { if (window.__mdc && window.__mdc.mode) window.__mdc.mode("list"); else open({}); };
  }

  window.BirkhillDateList = { open: open, manage: manage, renderDue: renderDue, load: load, setData: setData, liveGroups: liveGroups, hookTabs: hookTabs, jumpToCode: jumpToCode };
  if (document.readyState !== "loading") hookTabs(); else document.addEventListener("DOMContentLoaded", hookTabs);
})();
