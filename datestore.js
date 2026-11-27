/* Birkhill shared date + stock record store (23 Nov 2026, VJ t1383u).
   Used by the Date Check app (Manual Date Check, Date Reports) and Stock In (Eden EDN delivery check).
   Same website, so records on a phone are shared by both apps. Nothing here writes to the till:
   stock corrections are saved as their own audit records and go to the box as DRAFT stock adjustments for Vijay. */
(function () {
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbz7eKFQN2UbbSA8-4nLzB9crDkQUE5b7_CJ3wnVfqmxODFIfz8G3XNpQ1_igg9SCNJbKg/exec";
  var K = { rec: "birkhill-date-records-v1", corr: "birkhill-stock-corrections-v1", prod: "birkhill-product-records-v1",
            warn: "birkhill-date-warn-v1", queue: "birkhill-date-queue-v1", lists: "birkhill-date-lists-v1", wa: "birkhill-staff-whatsapp-v1", dept: "birkhill-dept-changes-v1" };
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
  // Staff confirm or correct the expected quantity after sales (append-only, never overwrites, never writes to the till).
  function addConfirm(o) {
    var counted = Number(o.counted), expected = Number(o.expected);
    var c = { t: "dateconfirm", id: uid("CF"), at: nowAt(), staff: o.staff || staff(),
      pid: o.pid || null, bc: o.bc || "", name: o.name || "",
      expected: expected, counted: counted, variance: expected - counted,
      sold: o.sold != null ? Number(o.sold) : "", dated: o.dated != null ? Number(o.dated) : "",
      batches: o.batches || [], note: o.note || "", src: o.src || "list" };
    var all = jget(K.rec, []); all.push(c); jset(K.rec, all);
    send("MDC1", c);
    return c;
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
      if (!r.qty || r.dtype === "none" || r.dtype === "zero" || r.dtype === "long" || r.dtype === "ok") return;
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
  // manager date-check lists (append-only; latest event per id wins; delete is a new row)
  function saveListEvent(ev) {
    ev.at = ev.at || nowAt(); ev.by = ev.by || staff();
    if (isTest()) ev.test = true;
    var all = jget(K.lists, []); all.push(ev); jset(K.lists, all);
    send("MDC1", ev);
    return ev;
  }
  function saveList(o) {
    var ev = { t: "list", id: o.id || uid("L"), name: String(o.name || "").trim(), days: o.days || [],
      pids: o.pids || [], dids: o.dids || [], sids: o.sids || [], by: o.by || staff(), at: nowAt() };
    if (!ev.name) throw new Error("Type a list name.");
    return saveListEvent(ev);
  }
  function deleteList(id, by) {
    return saveListEvent({ t: "list_delete", id: id, by: by || staff(), at: nowAt() });
  }
  function lists(published) {
    var evs = (published || []).map(function (L) {
      return { t: "list", id: L.id, name: L.name, days: L.days, pids: L.pids, dids: L.dids, sids: L.sids, by: L.by, at: L.at };
    }).concat(jget(K.lists, []));
    evs.sort(function (a, b) { return String(a.at || "") < String(b.at || "") ? -1 : String(a.at || "") > String(b.at || "") ? 1 : 0; });
    var latest = {}, order = [];
    evs.forEach(function (e) {
      if (!e || (e.t !== "list" && e.t !== "list_delete") || e.test) return;
      var id = String(e.id || ""); if (!id) return;
      if (!Object.prototype.hasOwnProperty.call(latest, id)) order.push(id);
      latest[id] = (e.t === "list_delete" || e.deleted) ? null : e;
    });
    return order.map(function (id) { return latest[id]; }).filter(Boolean).map(function (e) {
      return { id: e.id, key: "list:" + e.id, name: e.name, days: e.days || [], pids: e.pids || [], dids: e.dids || [], sids: e.sids || [], by: e.by || "", at: e.at || "" };
    });
  }

  // Staff WhatsApp numbers: this phone only (localStorage). Never send() to Camera Entries
  // and never publish them: the shared store is copied into datecheck.json on the public site.
  function normalizeUkWhatsApp(raw) {
    var s = String(raw || "").trim().replace(/[^\d+]/g, "");
    if (s.charAt(0) === "+") s = s.slice(1);
    s = s.replace(/\D/g, "");
    if (s.indexOf("0044") === 0) s = "44" + s.slice(4);
    else if (s.charAt(0) === "0") s = "44" + s.slice(1);
    else if (s.length === 10 && s.charAt(0) === "7") s = "44" + s;
    return /^44[1-9]\d{8,9}$/.test(s) ? s : "";
  }
  function displayUkWhatsApp(raw) {
    var n = normalizeUkWhatsApp(raw); if (!n) return "";
    var rest = n.slice(2);
    if (rest.charAt(0) === "7" && rest.length === 10) return "+44 " + rest.slice(0, 4) + " " + rest.slice(4, 7) + " " + rest.slice(7);
    return "+44 " + rest;
  }
  function waEvents() { return jget(K.wa, []); }
  function waContacts() {
    var latest = {}, order = [];
    waEvents().forEach(function (e) {
      if (!e || e.test) return;
      var id = String(e.id || ""); if (!id) return;
      if (!Object.prototype.hasOwnProperty.call(latest, id)) order.push(id);
      latest[id] = (e.t === "wa_contact_delete") ? null : e;
    });
    return order.map(function (id) { return latest[id]; }).filter(Boolean).map(function (e) {
      return { id: e.id, name: e.name, number: e.number, display: displayUkWhatsApp(e.number), by: e.by || "", at: e.at || "" };
    }).sort(function (a, b) { return String(a.name).toUpperCase() < String(b.name).toUpperCase() ? -1 : 1; });
  }
  function saveWaContact(o) {
    var number = normalizeUkWhatsApp(o.number);
    var name = String(o.name || "").trim();
    if (!name) throw new Error("Type the staff name.");
    if (!number) throw new Error("Type a UK WhatsApp number, for example 07... or +44 7...");
    var ev = { t: "wa_contact", id: o.id || uid("W"), name: name, number: number, by: o.by || staff(), at: nowAt() };
    var all = waEvents(); all.push(ev); jset(K.wa, all);
    return ev;
  }
  function deleteWaContact(id, by) {
    var ev = { t: "wa_contact_delete", id: id, by: by || staff(), at: nowAt() };
    var all = waEvents(); all.push(ev); jset(K.wa, all);
    return ev;
  }
  function waLink(number, text) {
    var n = normalizeUkWhatsApp(number); if (!n) return "";
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(text || "");
  }
  function listShareMessage(name, checked, total, url) {
    return "Date check due: " + (name || "Date check") + " (" + (checked || 0) + " of " + (total || 0) + " checked). Open: " + (url || "");
  }

  // Department-change requests go to the shared store (no phone numbers). Never written to the till.
  function saveDeptEvent(ev) {
    ev.at = ev.at || nowAt(); ev.staff = ev.staff || staff();
    if (isTest()) ev.test = true;
    var all = jget(K.dept, []); all.push(ev); jset(K.dept, all);
    send("MDC1", ev);
    return ev;
  }
  function requestDeptChange(o) {
    var ev = { t: "dept_change", id: o.id || uid("DC"), pid: o.pid || 0, bc: o.bc || "", name: o.name || "",
      from_did: o.from_did || 0, from_dept: o.from_dept || "", to_did: o.to_did || 0, to_dept: o.to_dept || "",
      staff: o.staff || staff(), at: nowAt(), status: "pending" };
    if (!ev.to_did || Number(ev.to_did) === Number(ev.from_did)) throw new Error("Pick a different department.");
    return saveDeptEvent(ev);
  }
  function reviewDeptChange(reqId, status, by, note) {
    if (status !== "approved" && status !== "rejected") throw new Error("Choose approved or rejected.");
    return saveDeptEvent({ t: "dept_change_review", id: uid("DR"), req: reqId, status: status, staff: by || staff(), note: note || "", at: nowAt() });
  }
  function deptChanges(published) {
    var evs = [];
    var pub = published || {};
    (pub.all || published || []).forEach(function (r) {
      if (!r || !r.id) return;
      evs.push({ t: "dept_change", id: r.id, pid: r.pid, bc: r.bc, name: r.name, from_did: r.from_did, from_dept: r.from_dept,
        to_did: r.to_did, to_dept: r.to_dept, staff: r.staff, at: r.at });
      if (r.status && r.status !== "pending") evs.push({ t: "dept_change_review", req: r.id, status: r.status, staff: r.reviewed_by, at: r.reviewed_at, note: r.note });
    });
    evs = evs.concat(jget(K.dept, []));
    evs.sort(function (a, b) { return String(a.at || "") < String(b.at || "") ? -1 : 1; });
    var reqs = {}, order = [];
    evs.forEach(function (e) {
      if (!e || e.test) return;
      if (e.t === "dept_change") {
        var id = String(e.id || ""); if (!id) return;
        if (!Object.prototype.hasOwnProperty.call(reqs, id)) order.push(id);
        reqs[id] = { id: id, pid: e.pid || 0, bc: e.bc || "", name: e.name || "", from_did: e.from_did || 0, from_dept: e.from_dept || "",
          to_did: e.to_did || 0, to_dept: e.to_dept || "", staff: e.staff || e.by || "", at: e.at || "", status: "pending", reviewed_by: "", reviewed_at: "", note: "", till: "not sent" };
      } else if (e.t === "dept_change_review") {
        var r = reqs[String(e.req || "")];
        if (!r) return;
        if (e.status === "approved" || e.status === "rejected" || e.status === "pending") r.status = e.status;
        r.reviewed_by = e.staff || e.by || ""; r.reviewed_at = e.at || ""; r.note = e.note || "";
      }
    });
    var all = order.map(function (id) { return reqs[id]; }).filter(Boolean);
    var pending = all.filter(function (x) { return x.status === "pending"; });
    var latest = {};
    pending.forEach(function (x) { if (x.pid) latest[String(x.pid)] = x; });
    return { all: all, pending: pending, latest_by_pid: latest };
  }
  function deptChangeExport(pending) {
    var L = ["Birkhill pending department changes " + ukDate(today()), "Nothing below has been changed on the till. Each line is a request only."];
    if (!pending || !pending.length) { L.push("None pending."); return L.join("\n"); }
    pending.forEach(function (r) {
      L.push(""); L.push((r.name || "Unknown product") + ", barcode " + (r.bc || "none"));
      L.push("From " + (r.from_dept || "unknown") + " (" + (r.from_did || "?") + ") to " + (r.to_dept || "unknown") + " (" + (r.to_did || "?") + ")");
      L.push("Requested by " + (r.staff || "Staff") + (r.at ? ", " + ukWhen(r.at) : ""));
      L.push("Not changed on the till.");
    });
    L.push(""); L.push(pending.length + " request" + (pending.length === 1 ? "" : "s") + ". Approve them on the till, then mark each one reviewed in the Date app.");
    return L.join("\n");
  }
  setTimeout(flush, 1500);
  window.BirkhillDates =

 { K: K, jget: jget, jset: jset, esc: esc, today: today, nowAt: nowAt, ukDate: ukDate, ukWhen: ukWhen, days: days, uid: uid, staff: staff,
    send: send, flush: flush, waiting: waiting, pkey: pkey, product: product, touchProduct: touchProduct, correction: correction, lastCorrection: lastCorrection,
    addCheck: addCheck, addConfirm: addConfirm, records: records, warn: warn, setWarn: setWarn, classify: classify, reportText: reportText, share: share,
    managers: managers, checkManager: checkManager, kindTxt: kindTxt, saveList: saveList, deleteList: deleteList, lists: lists, normalizeUkWhatsApp: normalizeUkWhatsApp, displayUkWhatsApp: displayUkWhatsApp, waContacts: waContacts, saveWaContact: saveWaContact, deleteWaContact: deleteWaContact, waLink: waLink, listShareMessage: listShareMessage, requestDeptChange: requestDeptChange, reviewDeptChange: reviewDeptChange, deptChanges: deptChanges, deptChangeExport: deptChangeExport };
})();
