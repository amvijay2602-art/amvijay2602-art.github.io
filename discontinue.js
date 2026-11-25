/* Birkhill Discontinued Items (25 Nov 2026, VJ t1556u). Shared by the Stock Count app (/count/) and the
   Discontinued Items page (/count/discontinued.html). Statuses: Active, Pending Discontinuation, Discontinued.
   Saves "PSTAT1: {json}" rows to the same Camera Entries sheet as every other app (offline-safe queue).
   The box (product_status.py) is the single source of truth: it moves Pending to Discontinued when till stock
   reaches 0, and checks the manager signature on every Reactivate. Nothing here writes to the till. */
(function () {
  "use strict";
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbz7eKFQN2UbbSA8-4nLzB9crDkQUE5b7_CJ3wnVfqmxODFIfz8G3XNpQ1_igg9SCNJbKg/exec";
  var K = { queue: "birkhill-pstat-queue-v1", local: "birkhill-product-status-local-v1", staff: "birkhill-staff-name", mgr: "birkhill-pstat-mgr" };
  var LABEL = { active: "Active", pending: "Pending Discontinuation", discontinued: "Discontinued" };
  var REASONS = ["Supplier stopped making it", "Slow seller", "Replaced by a new line", "Out of date or poor quality", "Price too high", "Seasonal line finished", "Other"];
  function jget(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function parts() { var o = {}; new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; }); return o; }
  function nowAt() { var o = parts(); return o.year + "-" + o.month + "-" + o.day + "T" + (o.hour === "24" ? "00" : o.hour) + ":" + o.minute + ":" + o.second; }
  function ukDate(iso) { iso = String(iso || ""); return iso.length >= 10 ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : (iso || "Not known"); }
  function staff() { try { return (localStorage.getItem(K.staff) || "").trim(); } catch (e) { return ""; } }
  function isTest() { try { return localStorage.getItem("birkhill-test-mode") === "1"; } catch (e) { return false; } }
  function uid() { return "PS" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ---- send queue (same Apps Script endpoint and row shape as the other apps)
  var sending = false;
  function send(ev) {
    if (isTest()) ev.test = true;
    var q = jget(K.queue, []); q.push({ name: "PSTAT1: " + JSON.stringify(ev), photo: "", lines: [{ date: nowAt().slice(0, 10), qty: "0" }] }); jset(K.queue, q); flush();
  }
  function flush() {
    var q = jget(K.queue, []); if (sending || !q.length) return; sending = true;
    fetch(ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(q[0]) })
      .then(function () { var q2 = jget(K.queue, []); q2.shift(); jset(K.queue, q2); sending = false; flush(); })
      .catch(function () { sending = false; setTimeout(flush, 20000); });
  }
  function waiting() { return jget(K.queue, []).length; }
  setTimeout(flush, 1500); window.addEventListener("online", flush);

  // ---- status: box data (it.st "P"/"D" or a record) plus this phone's newer changes
  var SERVER = {};   // pid -> record from discontinued.json
  function setServer(recs) { SERVER = {}; (recs || []).forEach(function (r) { SERVER[String(r.pid)] = r; }); }
  function serverAt(r) { return [r.reactivated_at, r.discontinued_at, r.requested_at].filter(Boolean).sort().pop() || ""; }
  function statusOf(it) {
    var pid = String(it && (it.id != null ? it.id : it.pid)), loc = jget(K.local, {})[pid], sr = SERVER[pid];
    var base = sr ? sr.status : (it && it.st === "D" ? "discontinued" : it && it.st === "P" ? "pending" : "active");
    if (loc && (!sr || loc.at > serverAt(sr))) {
      if (loc.st === "pending" && base === "discontinued") return base;   // box already moved it on
      return loc.st;
    }
    return base;
  }
  function label(st) { return LABEL[st] || "Active"; }
  function setLocal(pid, o) { var l = jget(K.local, {}); l[String(pid)] = o; jset(K.local, l); }

  // ---- popup (own overlay, works in any app)
  var css = "#psOv{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center}" +
    "#psPop{background:#fff;width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:16px 16px 0 0;padding:16px;font-size:16px;line-height:1.4;box-sizing:border-box}" +
    "#psPop h2{margin:0 0 8px;font-size:20px}#psPop .pic{width:96px;height:96px;border-radius:10px;background:#f2f4f2;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 96px}" +
    "#psPop .pic img{max-width:100%;max-height:100%}#psPop .row{display:flex;gap:12px;align-items:flex-start}#psPop .kv{margin:2px 0}#psPop .kv b{font-weight:700}" +
    "#psPop label{display:block;font-weight:700;margin:10px 0 4px}#psPop select,#psPop input,#psPop textarea{width:100%;font-size:16px;padding:10px;border:1px solid #bbb;border-radius:10px;box-sizing:border-box}" +
    "#psPop .b{display:block;width:100%;margin-top:10px;padding:14px;font-size:17px;font-weight:700;border-radius:12px;border:0;cursor:pointer}" +
    "#psPop .red{background:#c62828;color:#fff}#psPop .grn{background:#1b7f3b;color:#fff}#psPop .sec{background:#eef1ee;color:#222}" +
    "#psPop .msg{padding:10px;border-radius:10px;margin-top:8px;font-size:15px}#psPop .warn{background:#fff4e0;color:#7a4a00}#psPop .err{background:#fde8e8;color:#9b1c1c}#psPop .ok{background:#e7f6ec;color:#14532d}";
  function ensureCss() { if (document.getElementById("psCss")) return; var s = document.createElement("style"); s.id = "psCss"; s.textContent = css; document.head.appendChild(s); }
  function open(html) { ensureCss(); close(); var ov = document.createElement("div"); ov.id = "psOv"; ov.innerHTML = "<div id='psPop' role='dialog' aria-modal='true'>" + html + "</div>"; ov.addEventListener("click", function (e) { if (e.target === ov) close(); }); document.body.appendChild(ov); return ov; }
  function close() { var o = document.getElementById("psOv"); if (o) o.remove(); }
  function g(id) { return document.getElementById(id); }
  function picHtml(it, base) { var i = it.i; return "<div class='pic'>" + (i ? "<img alt='' src='" + esc((base || "img/") + i) + "' onerror=\"this.parentNode.innerHTML='&#128247;'\">" : "<span style='font-size:34px'>&#128247;</span>") + "</div>"; }
  function facts(it, extra) {
    var b = (it.b || [])[0] || "No barcode";
    return "<div class='row'>" + picHtml(it, extra && extra.imgBase) + "<div><div style='font-weight:700;font-size:18px'>" + esc(it.n) + "</div>" +
      "<div class='kv'>Barcode <b>" + esc(b) + "</b></div>" +
      "<div class='kv'>Description <b>" + esc([it.n, it.s, extra && extra.dept].filter(Boolean).join(", ")) + "</b></div>" +
      "<div class='kv'>Current till stock <b>" + esc(it.q == null ? "Not known" : it.q) + "</b></div>" +
      "<div class='kv'>Last sales date <b>" + esc(it.ls ? ukDate(it.ls) : (it.last_sold ? ukDate(it.last_sold) : "No sales on record")) + "</b></div></div></div>";
  }

  // ---- Discontinue Item
  function discontinue(it, opts) {
    opts = opts || {};
    var st = statusOf(it);
    if (st !== "active") {
      open("<h2>" + esc(label(st)) + "</h2>" + facts(it, opts) + "<div class='msg warn'>This product is already " + esc(label(st).toLowerCase()) + ". A manager can reactivate it on the Discontinued Items page.</div><button class='b sec' id='psX'>Close</button>");
      g("psX").onclick = close; return;
    }
    var q = +it.q || 0, willPend = q > 0;
    open("<h2>Discontinue Item</h2>" + facts(it, opts) +
      "<div class='msg " + (willPend ? "warn" : "ok") + "'>" + (willPend
        ? "Till stock is " + esc(it.q) + ". It will be <b>Pending Discontinuation</b> until the till stock reaches 0. It stays on the shelf and is still counted, but it is never reordered."
        : "Till stock is " + esc(it.q) + ". It will be <b>Discontinued</b> now and leave counts, date checks, order baskets and promotions.") +
      " History and sales records are kept. The till is not changed.</div>" +
      "<label for='psReason'>Reason</label><select id='psReason'><option value=''>Choose a reason</option>" + REASONS.map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("") + "</select>" +
      "<label for='psNote'>Note (optional)</label><input id='psNote' type='text' maxlength='200' placeholder='e.g. Parfetts code deleted'>" +
      "<label for='psStaff'>Staff member</label><input id='psStaff' type='text' maxlength='40' value='" + esc(staff()) + "' placeholder='Your name'>" +
      "<div id='psMsg'></div><button class='b red' id='psGo'>Discontinue Item</button><button class='b sec' id='psNo'>Cancel</button>");
    g("psNo").onclick = close;
    g("psGo").onclick = function () {
      var reason = g("psReason").value, who = g("psStaff").value.trim(), note = g("psNote").value.trim();
      if (!reason) { g("psMsg").innerHTML = "<div class='msg err'>Choose a reason.</div>"; return; }
      if (reason === "Other" && !note) { g("psMsg").innerHTML = "<div class='msg err'>Write the reason in the note.</div>"; return; }
      if (!who) { g("psMsg").innerHTML = "<div class='msg err'>Enter your name.</div>"; return; }
      var at = nowAt(), ev = { t: "discontinue", eid: uid(), pid: it.id != null ? it.id : it.pid, bc: (it.b || [])[0] || "", n: it.n, did: it.did || null, q: it.q, ls: it.ls || "",
        reason: reason, note: note, staff: who, at: at, app: opts.app || "count" };
      send(ev);
      var nst = willPend ? "pending" : "discontinued";
      setLocal(ev.pid, { st: nst, at: at, reason: reason, note: note, staff: who, n: it.n, bc: ev.bc, q: it.q, i: it.i || "", ls: it.ls || "", dept: opts.dept || "", requested_at: at, discontinued_at: willPend ? null : at });
      open("<h2>" + esc(label(nst)) + "</h2>" + facts(it, opts) + "<div class='msg ok'>Saved" + (waiting() ? " on this phone, sending now" : "") + ". " +
        (willPend ? "Pending Discontinuation until till stock reaches 0. No more reorders." : "Removed from counts, date checks, order baskets and promotions.") +
        "</div><button class='b grn' id='psOk'>OK</button>");
      g("psOk").onclick = function () { close(); if (opts.onDone) opts.onDone(nst, ev); };
    };
  }

  // ---- Reactivate (managers only; same codes as Stock In > Manager; the box checks the signature)
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function unhex(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function deriveKey(name, code) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]).then(function (k) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("BH-MGR-" + name.trim().toUpperCase()), iterations: 100000 }, k, 256);
    }).then(hex);
  }
  function hmacHex(keyHex, msg) { return crypto.subtle.importKey("raw", unhex(keyHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]).then(function (k) { return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)); }).then(hex); }
  var MGR = null;
  function managers() {
    if (MGR) return Promise.resolve(MGR);
    var src = window.BIRKHILL_MANAGERS_URL || "../stockin/stockin.json";
    return fetch(src).then(function (r) { if (!r.ok) throw new Error("locked"); return r.json(); }).then(function (j) { MGR = j.managers || {}; return MGR; });
  }
  function reactivate(rec, opts) {
    opts = opts || {};
    var it = { id: rec.pid, n: rec.n, b: rec.b, s: rec.s, q: rec.q, i: rec.i, last_sold: rec.last_sold };
    managers().catch(function () { return {}; }).then(function (M) {
      var names = Object.keys(M || {});
      if (!names.length) {
        open("<h2>Reactivate product</h2>" + facts(it, opts) + "<div class='msg warn'>Only a manager can reactivate a product. No manager code is set up yet. A manager can set one up in Deliveries and Suppliers, Manager tab, or ask Vijay to reactivate it through Grok Bot.</div><button class='b sec' id='psX'>Close</button>");
        g("psX").onclick = close; return;
      }
      open("<h2>Reactivate product</h2>" + facts(it, opts) + "<div class='msg warn'>Status now: <b>" + esc(label(rec.status)) + "</b>. Reactivating makes it Active again: counts, date checks, order baskets and promotions include it.</div>" +
        "<label for='psMgr'>Manager</label><select id='psMgr'>" + names.map(function (n) { return "<option>" + esc(n) + "</option>"; }).join("") + "</select>" +
        "<label for='psCode'>Manager code</label><input id='psCode' type='password' autocomplete='off' inputmode='numeric'>" +
        "<label for='psRNote'>Note (optional)</label><input id='psRNote' type='text' maxlength='200' placeholder='e.g. Supplier has it again'>" +
        "<div id='psMsg'></div><button class='b grn' id='psGo'>Reactivate</button><button class='b sec' id='psNo'>Cancel</button>");
      g("psNo").onclick = close;
      g("psGo").onclick = function () {
        var n = g("psMgr").value, c = g("psCode").value; if (!c) { g("psMsg").innerHTML = "<div class='msg err'>Enter the manager code.</div>"; return; }
        g("psGo").disabled = true; g("psMsg").innerHTML = "<div class='msg'>Checking the code...</div>";
        deriveKey(n, c).then(function (k) {
          return hmacHex(k, "BH-MGR-LOGIN").then(function (v) {
            if (v !== M[n]) throw new Error("bad");
            var at = nowAt();
            return hmacHex(k, "BH-PSTAT|reactivate|" + rec.pid + "|" + at).then(function (sig) {
              var ev = { t: "reactivate", eid: uid(), pid: rec.pid, n: rec.n, by: n, staff: staff() || n, at: at, sig: sig, note: g("psRNote").value.trim(), app: opts.app || "discontinued" };
              send(ev); setLocal(rec.pid, { st: "active", at: at, by: n });
              open("<h2>Reactivated</h2>" + facts(it, opts) + "<div class='msg ok'>" + esc(rec.n) + " is Active again (by " + esc(n) + "). The box checks the manager signature at the next update.</div><button class='b grn' id='psOk'>OK</button>");
              g("psOk").onclick = function () { close(); if (opts.onDone) opts.onDone("active", ev); };
            });
          });
        }).catch(function () { g("psGo").disabled = false; g("psMsg").innerHTML = "<div class='msg err'>Code not right. Nothing was changed.</div>"; });
      };
    });
  }

  window.BirkhillDiscontinue = { statusOf: statusOf, label: label, setServer: setServer, discontinue: discontinue, reactivate: reactivate, local: function () { return jget(K.local, {}); },
    waiting: waiting, flush: flush, ukDate: ukDate, esc: esc, K: K, REASONS: REASONS };
})();
