/* Birkhill Master Dashboard: Social Media Advertising (24 Nov 2026).
   Posters come straight from the existing Rewards promotions feed (rewards/promotions.json, built read-only from the till)
   and are drawn with the same poster template as the staff Promotions page (rewards/poster/poster.js). Nothing is uploaded twice.
   Schedules are saved as 'SMADD: {json}' rows, approvals and cancels as 'SMACT: id | action | staff | time' rows in Camera Entries
   (same Apps Script as the other apps). The box (birkhill-master/social_ads.py tick) keeps the queue, stops posts at the offer end,
   and hands due posts to the authorised BulkPublish connection. Nothing here posts by itself. */
(function () {
  "use strict";
  var SHOP = "6-8 Fir Road, Eckington, Sheffield S21 4BY";
  var BLOCK = /tobacco|cigar|cigarette|\bvape\b|vaping|nicotine|e-?liquid|lost mary|\belf ?bar\b|\bhawcos\b|\bjucce\b|nic ?salts?|e-?cig|\bpod ?salt\b/i;
  var PLAT = [["facebook", "Facebook"], ["instagram", "Instagram"], ["tiktok", "TikTok"]];
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var LKEY = "birkhill-social-local-v1";
  var M = null, esc = null, uk = null; // helpers shared by master.html, set in init()
  var $ = function (id) { return document.getElementById(id); };
  var FEED = null, ALL = [], SEL = {}, BOX = null, LIB = null, NOW = function () { return new Date(); };

  function load(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.async = false; s.onload = res; s.onerror = function () { rej(new Error("load " + src)); }; document.body.appendChild(s); }); }
  function lib() {
    if (LIB) return LIB;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "rewards/poster/poster.css"; document.head.appendChild(l);
    LIB = load("rewards/poster/html-to-image.js").then(function () { return load("rewards/poster/poster.js"); }).then(function () {
      window.BirkhillPoster.config({ base: "rewards/", logo: "rewards/logo.png" }); return window.BirkhillPoster; });
    return LIB;
  }
  function endOf(p) { return p.end_iso ? new Date(p.end_iso) : null; }
  function ended(p) { var e = endOf(p); return !!(e && e <= NOW()); }
  function blocked(p) { return BLOCK.test([p.title, p.headline, p.department, (p.items || []).join(" ")].join(" ")); }
  function money(v) { var n = Number(v); if (!isFinite(n) || !v) return ""; return n > 0 && n < 1 ? Math.round(n * 100) + "p" : "\u00a3" + n.toFixed(2); }
  function tag(s) { return "#" + String(s || "").replace(/&/g, "And").replace(/[^A-Za-z0-9 ]/g, "").replace(/(?:^|\s)(\w)/g, function (m, c) { return c.toUpperCase(); }).replace(/\s/g, ""); }

  /* ---- captions and hashtags from the promotion data (simple English, no long dashes) ---- */
  function caption(p) {
    var head = p.headline || p.title || "Special offer";
    var t = head + ": " + (p.deal || "special offer") + " at Birkhill Stores!";
    if (p.normal) t += " Normal price " + p.normal + ".";
    var names = (p.lines || []).map(function (l) { return l.name; }).filter(Boolean);
    if (names.length > 1) t += " Mix and match from " + names.length + " products, including " + names.slice(0, 3).join(", ") + ".";
    var save = Number(p.save); if (save > 0.004) t += " Save " + money(p.save) + ".";
    if (p.end) t += " Offer ends " + p.end + ".";
    if (p.dept_key === "alcohol") t += " Over 18s only. Challenge 25. Please drink responsibly.";
    t += " Find us at " + SHOP + ". Open 7am to 9pm, 7 days a week.";
    return t.replace(/[\u2013\u2014]/g, "-").replace(/\|/g, "/");
  }
  function hashtags(p) {
    var brand = String(p.headline || p.title || "").split(/\s+/)[0];
    var h = ["#BirkhillStores", "#Eckington", "#Sheffield", "#ShopLocal", "#ConvenienceStore", "#SpecialOffer"];
    if (p.department) h.push(tag(p.department));
    if (brand && /^[A-Za-z][A-Za-z']{2,}$/.test(brand)) h.push(tag(brand));
    if (p.kind === "multi") h.push("#MultiBuy");
    if (p.kind === "meal") h.push("#MealDeal");
    return h.filter(function (x, i) { return h.indexOf(x) === i; }).join(" ");
  }
  function detail(p) {
    var l0 = (p.lines || [])[0] || {};
    return { id: p.id, headline: p.headline || p.title, product: l0.name || p.title, barcode: p.barcode, barcodes: p.barcodes || [],
      deal: p.deal, price: p.price, normal_price: p.normal_price || l0.price, normal: p.normal, end: p.end, end_iso: p.end_iso,
      department: p.department, dept_key: p.dept_key, picture: (p.pictures || [])[0] || p.picture || "", items: (p.lines || []).length || 1 };
  }

  /* ---- UK time helpers ---- */
  function londonToDate(day, time) { // "2026-11-24", "18:00" in Europe/London -> Date
    var guess = new Date(day + "T" + time + ":00Z");
    for (var i = 0; i < 2; i++) {
      var parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(guess);
      var g = {}; parts.forEach(function (x) { g[x.type] = x.value; });
      var shown = new Date(g.year + "-" + g.month + "-" + g.day + "T" + (g.hour === "24" ? "00" : g.hour) + ":" + g.minute + ":00Z");
      guess = new Date(guess.getTime() - (shown.getTime() - new Date(day + "T" + time + ":00Z").getTime()));
    }
    return guess;
  }
  function addDays(day, n) { var d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dow(day) { return DAYS[(new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7]; }
  /* Post times for one poster: from the start, by the repeat rule, always before the offer ends (max 60). */
  function times(s, p) {
    var out = [], end = endOf(p), day = s.date, n = 0;
    for (var i = 0; i < 400 && out.length < 60; i++) {
      var t = londonToDate(day, s.time);
      if (end && t >= end) break;
      if (s.repeat === "once" || s.repeat === "daily" || (s.repeat === "weekly" && s.days.indexOf(dow(day)) >= 0)) {
        if (t > NOW()) out.push(t.toISOString());
        n++;
      }
      if (s.repeat === "once" && n) break;
      day = addDays(day, 1);
    }
    return out;
  }

  /* ---- poster picker ---- */
  function cardHtml(p) {
    var bad = ended(p) ? "Offer ended, cannot be posted" : blocked(p) ? "Tobacco or vape, never advertised" : "";
    return '<label class="sm-card' + (bad ? " sm-off" : "") + '" data-id="' + esc(p.id) + '">' +
      '<input type="checkbox" class="sm-ck" data-pid="' + esc(p.id) + '"' + (bad ? " disabled" : "") + (SEL[p.id] ? " checked" : "") + ' aria-label="Select ' + esc(p.headline || p.title) + '">' +
      '<div class="sm-thumb"><div class="bhp-wrap"></div></div>' +
      '<div class="sm-cap"><b>' + esc(p.deal || "") + '</b> ' + esc(p.headline || p.title || "") + '<br><span class="muted">' + (bad ? '<b class="sm-red">' + esc(bad) + '</b>' : "Ends " + esc(p.end || "not set")) + '</span></div></label>';
  }
  function showGrid() {
    var q = ($("smSearch").value || "").toLowerCase().trim(), dep = $("smDept").value;
    var list = ALL.filter(function (p) {
      if (dep && p.department !== dep) return false;
      if (!q) return true;
      return [p.title, p.headline, p.deal, p.department, p.barcode].concat(p.barcodes || [], (p.lines || []).map(function (l) { return l.name; })).join(" ").toLowerCase().indexOf(q) >= 0;
    });
    $("smCount").textContent = list.length + " of " + ALL.length + " posters. " + Object.keys(SEL).length + " selected.";
    var g = $("smGrid"); g.innerHTML = list.map(cardHtml).join("");
    lib().then(function (L) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          if (!e.isIntersecting) return; io.unobserve(e.target);
          var p = FEED_BY[e.target.getAttribute("data-id")], holder = e.target.querySelector(".bhp-wrap"), el = L.build(p);
          holder.appendChild(el); holder.style.setProperty("--bhp-s", ((holder.clientWidth || 150) / 1080).toFixed(5));
          (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { L.fit(el); });
        });
      }, { rootMargin: "500px 0px" });
      Array.prototype.forEach.call(g.querySelectorAll(".sm-card"), function (c) { io.observe(c); });
    }).catch(function () { $("smCount").textContent += " Poster pictures could not load."; });
  }
  var FEED_BY = {};
  function selected() { return Object.keys(SEL).map(function (id) { return FEED_BY[id]; }).filter(Boolean); }
  function showSelected() {
    var ps = selected();
    $("smSelN").textContent = ps.length ? ps.length + " poster(s) selected" : "No posters selected yet. Tap Select Existing Posters.";
    $("smSel").innerHTML = ps.map(function (p) {
      var d = detail(p), pl = platforms(), tk = p.dept_key === "alcohol" && pl.indexOf("tiktok") >= 0;
      return '<div class="sm-sel" data-sid="' + esc(p.id) + '">' +
        '<div class="sm-sel-top">' + (d.picture ? '<img src="rewards/' + esc(d.picture) + '" alt="">' : '<div class="sm-noimg">No photo</div>') +
        '<table><tr><th>Product</th><td>' + esc(d.headline) + (d.items > 1 ? " (" + d.items + " products)" : "") + '</td></tr>' +
        '<tr><th>Barcode</th><td>' + esc(d.barcode) + '</td></tr><tr><th>Offer</th><td><b>' + esc(d.deal) + '</b></td></tr>' +
        '<tr><th>Normal price</th><td>' + esc(d.normal || money(d.normal_price)) + '</td></tr><tr><th>Offer ends</th><td>' + esc(d.end || "not set") + '</td></tr>' +
        '<tr><th>Till offer</th><td>' + esc(String(d.id).replace(/^till-/, "")) + '</td></tr></table></div>' +
        (tk ? '<div class="sm-red">Alcohol offers are not posted to TikTok (TikTok rules). Facebook and Instagram only.</div>' : '') +
        '<label class="muted">Caption</label><textarea class="sm-capt" data-cap="' + esc(p.id) + '" rows="5">' + esc(SEL[p.id].caption) + '</textarea>' +
        '<label class="muted">Hashtags</label><input type="text" class="sm-tags" data-tag="' + esc(p.id) + '" value="' + esc(SEL[p.id].hashtags) + '">' +
        '<div class="muted sm-when" data-when="' + esc(p.id) + '"></div>' +
        '<button type="button" class="btn line sm-rm" data-rm="' + esc(p.id) + '">Remove</button></div>';
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("[data-cap]"), function (t) { t.addEventListener("input", function () { SEL[t.getAttribute("data-cap")].caption = t.value.replace(/[\u2013\u2014]/g, "-").replace(/\|/g, "/"); }); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-tag]"), function (t) { t.addEventListener("input", function () { SEL[t.getAttribute("data-tag")].hashtags = t.value.replace(/\|/g, "/"); }); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-rm]"), function (b) { b.addEventListener("click", function () { delete SEL[b.getAttribute("data-rm")]; showSelected(); }); });
    preview();
  }
  function platforms() { return PLAT.filter(function (x) { return $("smP_" + x[0]).checked; }).map(function (x) { return x[0]; }); }
  function sched() {
    return { date: $("smDate").value, time: $("smTime").value || "10:00", repeat: $("smRepeat").value,
      days: DAYS.filter(function (d) { return $("smD_" + d).checked; }), auto: $("smAuto").checked, timezone: "Europe/London" };
  }
  function preview() {
    var s = sched();
    Array.prototype.forEach.call(document.querySelectorAll("[data-when]"), function (el) {
      var p = FEED_BY[el.getAttribute("data-when")]; if (!p || !s.date) { el.textContent = ""; return; }
      var t = times(s, p);
      el.innerHTML = t.length ? "Posts " + t.length + " time(s): " + esc(t.slice(0, 4).map(uk).join(", ")) + (t.length > 4 ? " and " + (t.length - 4) + " more" : "") + ". Last post before the offer ends " + esc(p.end || "") + "."
        : '<b class="sm-red">No post time is before this offer ends. Pick an earlier date.</b>';
    });
  }
  function problems(s, pl, ps) {
    var p = [];
    if (!ps.length) p.push("Select at least one poster.");
    if (!pl.length) p.push("Pick Facebook, Instagram, TikTok or all three.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) p.push("Pick a publication date.");
    if (s.repeat === "weekly" && !s.days.length) p.push("Tick at least one day for weekly posts.");
    ps.forEach(function (x) {
      if (ended(x)) p.push((x.headline || x.title) + " has ended and cannot be posted.");
      else if (blocked(x)) p.push((x.headline || x.title) + " is tobacco or vape and is never advertised.");
      else if (s.date && !times(s, x).length) p.push((x.headline || x.title) + ": no post time before the offer ends.");
    });
    return p;
  }
  function say(t, cls) { var m = $("smMsg"); m.textContent = t; m.className = "msg" + (cls ? " " + cls : ""); m.style.display = "block"; }
  function locals() { return M.jget(LKEY, []); }
  function create(approve) {
    var s = sched(), pl = platforms(), ps = selected(), pr = problems(s, pl, ps);
    if (pr.length) { say(pr.join(" "), "err"); return; }
    var id = "SM" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    var rec = { id: id, created_at: new Date().toISOString(), by: M.clean(M.staff()), platforms: pl, schedule: s, approved: !!approve,
      promos: ps.map(function (p) { var d = detail(p); return { id: p.id, deal: d.deal, price: d.price, end_iso: d.end_iso, caption: SEL[p.id].caption, hashtags: SEL[p.id].hashtags }; }) };
    M.queue("SMADD: " + JSON.stringify(rec).replace(/\|/g, "/"));
    var l = locals(); l.push(rec); M.jset(LKEY, l);
    SEL = {}; showSelected(); showGrid(); lists();
    say((approve ? "Schedule saved and approved. " : "Schedule saved. Tap Approve in the list when you are happy. ") + "The box picks it up at its next update (about every 30 minutes). Posts stop when each offer ends.");
  }
  function act(id, action) {
    M.queue("SMACT: " + id + " | " + action + " | " + M.clean(M.staff()) + " | " + new Date().toISOString());
    var a = M.jget(LKEY + "-acts", []); a.push({ id: id, action: action, at: new Date().toISOString() }); M.jset(LKEY + "-acts", a);
    lists(); say(action === "approve" ? "Approved. It posts at its times once a social account is connected." : "Cancelled. No more posts for this schedule.");
  }

  /* ---- Scheduled / Published / Failed ---- */
  var LABEL = { needs_approval: ["Needs approval", "p-dev"], waiting_connection: ["Waiting for connection", "p-dev"], scheduled: ["Scheduled", "p-live"],
    sent_to_bulkpublish: ["Sent to BulkPublish", "p-live"], published: ["Published", "p-live"], failed: ["Failed", "p-bad"], stopped: ["Stopped, offer ended", "p-bad"],
    cancelled: ["Cancelled", "p-bad"], price_changed: ["Offer changed, needs approval", "p-bad"], manual: ["Ready, auto post OFF", "p-dev"], pending_box: ["Waiting for the box", "p-dev"] };
  function pill(st) { var l = LABEL[st] || [st, "p-dev"]; return '<span class="pill ' + l[1] + '">' + esc(l[0]) + '</span>'; }
  function lists() {
    var box = (BOX && BOX.ads) || [], acts = M.jget(LKEY + "-acts", []), have = {};
    box.forEach(function (a) { have[a.id] = 1; });
    var loc = locals().filter(function (a) { return !have[a.id]; }).map(function (a) {
      var ap = a.approved || acts.some(function (x) { return x.id === a.id && x.action === "approve"; });
      var cx = acts.some(function (x) { return x.id === a.id && x.action === "cancel"; });
      return { id: a.id, created_at: a.created_at, by: a.by, platforms: a.platforms, schedule: a.schedule, approved: ap, status: cx ? "cancelled" : "pending_box",
        promos: a.promos.map(function (x) { var p = FEED_BY[x.id] || {}; return { id: x.id, headline: p.headline || p.title || x.id, deal: x.deal, end: p.end || "" }; }), posts: [] };
    });
    var all = loc.concat(box), tab = document.querySelector(".sm-lt.active").getAttribute("data-lt");
    var posts = [];
    all.forEach(function (a) { (a.posts || []).forEach(function (p) { posts.push({ ad: a, p: p }); }); });
    var html = "";
    if (tab === "scheduled") {
      var live = all.filter(function (a) { return ["cancelled", "stopped", "done"].indexOf(a.status) < 0; });
      html = live.length ? live.map(function (a) {
        var next = (a.posts || []).filter(function (p) { return ["published", "failed", "stopped", "cancelled"].indexOf(p.status) < 0; });
        var st = a.status === "pending_box" ? "pending_box" : (!a.approved ? "needs_approval" : (next[0] ? next[0].status : a.status));
        return '<div class="rep"><div class="t">' + esc(a.promos.map(function (x) { return x.headline + " (" + x.deal + ")"; }).join(", ")) + ' ' + pill(st) + '</div>' +
          '<div class="muted">' + esc(a.platforms.map(function (x) { return ({ facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" })[x] || x; }).join(", ")) + '. ' + esc(rep(a.schedule)) + '. Auto post ' + (a.schedule.auto ? "ON" : "OFF") + '. Made ' + esc(uk(a.created_at)) + ' by ' + esc(a.by || "") + '.</div>' +
          (next.length ? '<div>Next: ' + esc(uk(next[0].at)) + '. ' + next.length + ' post(s) left before the offers end.</div>' : a.status === "pending_box" ? '<div class="muted">Saved on this phone. The box adds it at its next update.</div>' : '') +
          '<div class="b">' + (a.approved ? "" : '<button type="button" data-ap="' + esc(a.id) + '">Approve</button>') + '<button type="button" data-cx="' + esc(a.id) + '">Cancel</button></div></div>';
      }).join("") : '<div class="muted">No scheduled adverts.</div>';
    } else {
      var want = tab === "published" ? ["published", "sent_to_bulkpublish"] : ["failed", "stopped", "cancelled", "price_changed"];
      var rows = posts.filter(function (x) { return want.indexOf(x.p.status) >= 0; }).sort(function (a, b) { var fa = a.p.status === "failed" ? 0 : 1, fb = b.p.status === "failed" ? 0 : 1; return fa !== fb ? fa - fb : (a.p.at < b.p.at ? 1 : -1); }).slice(0, 100);
      html = rows.length ? '<table><tr><th>When</th><th>Poster</th><th>Where</th><th>Status</th></tr>' + rows.map(function (x) {
        var pr = (x.ad.promos || []).filter(function (q) { return q.id === x.p.promo; })[0] || {};
        return '<tr><td>' + esc(uk(x.p.at)) + '</td><td>' + esc(pr.headline || x.p.promo) + '</td><td>' + esc(({ facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" })[x.p.platform] || x.p.platform) + '</td><td>' + pill(x.p.status) +
          (x.p.note ? '<div class="muted">' + esc(x.p.note) + '</div>' : '') + (x.p.url ? '<div><a href="' + esc(x.p.url) + '">Open post</a></div>' : '') + '</td></tr>';
      }).join("") + '</table>' : '<div class="muted">' + (tab === "published" ? "Nothing published yet." : "No failed or stopped adverts.") + '</div>';
    }
    $("smList").innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll("[data-ap]"), function (b) { b.addEventListener("click", function () { act(b.getAttribute("data-ap"), "approve"); }); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-cx]"), function (b) { b.addEventListener("click", function () { if (confirm("Cancel this schedule? Posts already made stay online.")) act(b.getAttribute("data-cx"), "cancel"); }); });
    var c = (BOX && BOX.connection) || {};
    $("smConn").innerHTML = PLAT.map(function (x) { var ok = c[x[0]] && c[x[0]].connected; return '<span class="pill ' + (ok ? "p-live" : "p-bad") + '">' + x[1] + ": " + (ok ? "connected" : "not connected") + '</span>'; }).join(" ") +
      '<div class="muted">' + esc(c.note || "Posting uses BulkPublish. Until an account is connected, approved posts wait as Waiting for connection.") + '</div>' +
      (BOX && BOX.updated_at ? '<div class="muted">Box queue updated ' + esc(uk(BOX.updated_at)) + '.</div>' : '');
  }
  function rep(s) { if (!s) return ""; var t = s.repeat === "once" ? "Once" : s.repeat === "daily" ? "Daily" : "Weekly on " + s.days.join(", "); return t + " from " + s.date + " at " + s.time + " UK"; }

  /* ---- start ---- */
  function init() {
    M = window.BirkhillMaster; esc = M.esc; uk = M.uk;
    $("smDays").innerHTML = DAYS.map(function (d) { return '<label>' + d + '<input type="checkbox" id="smD_' + d + '"></label>'; }).join("");
    $("smPlats").innerHTML = PLAT.map(function (x) { return '<label class="ck"><input type="checkbox" id="smP_' + x[0] + '"> ' + x[1] + '</label>'; }).join("") +
      '<button type="button" class="btn line" id="smAll3">All three</button>';
    $("smAll3").addEventListener("click", function () { PLAT.forEach(function (x) { $("smP_" + x[0]).checked = true; }); showSelected(); });
    PLAT.forEach(function (x) { $("smP_" + x[0]).addEventListener("change", showSelected); });
    var d = new Date(NOW().getTime() + 86400000); $("smDate").value = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d); $("smTime").value = "10:00";
    ["smDate", "smTime", "smRepeat"].forEach(function (id) { $(id).addEventListener("change", function () { $("smDays").classList.toggle("hidden", $("smRepeat").value !== "weekly"); preview(); }); });
    DAYS.forEach(function (dd) { $("smD_" + dd).addEventListener("change", preview); });
    $("smDays").classList.add("hidden");
    $("smPick").addEventListener("click", function () { $("smPicker").classList.remove("hidden"); showGrid(); $("smPicker").scrollIntoView({ behavior: "smooth" }); });
    $("smDone").addEventListener("click", function () { $("smPicker").classList.add("hidden"); showSelected(); $("smSelCard").scrollIntoView({ behavior: "smooth" }); });
    $("smSearch").addEventListener("input", showGrid); $("smDept").addEventListener("change", showGrid);
    $("smGrid").addEventListener("change", function (e) {
      var id = e.target && e.target.getAttribute("data-pid"); if (!id) return; var p = FEED_BY[id];
      if (e.target.checked && p && !ended(p) && !blocked(p)) SEL[id] = { caption: caption(p), hashtags: hashtags(p) }; else { delete SEL[id]; e.target.checked = false; }
      $("smCount").textContent = $("smCount").textContent.replace(/\d+ selected\./, Object.keys(SEL).length + " selected.");
    });
    $("smSave").addEventListener("click", function () { create(false); });
    $("smSaveAp").addEventListener("click", function () { create(true); });
    Array.prototype.forEach.call(document.querySelectorAll(".sm-lt"), function (b) { b.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".sm-lt"), function (x) { x.classList.remove("active"); }); b.classList.add("active"); lists(); }); });
    fetch("rewards/promotions.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (f) {
      FEED = f; ALL = (f.promotions || []).filter(function (p) { return !blocked(p); });
      // Ended offers still in an old copy of the feed are shown greyed out and cannot be ticked.
      FEED_BY = {}; (f.promotions || []).forEach(function (p) { FEED_BY[p.id] = p; });
      var deps = {}; ALL.forEach(function (p) { if (p.department) deps[p.department] = 1; });
      $("smDept").innerHTML = '<option value="">All departments</option>' + Object.keys(deps).sort().map(function (x) { return '<option>' + esc(x) + '</option>'; }).join("");
      $("smFeed").textContent = ALL.length + " live till promotion posters. Feed updated " + (f.updated || "") + ". Same posters as the staff Promotions page.";
      showSelected(); lists();
    }).catch(function () { $("smFeed").textContent = "Could not load the promotion posters. Check the signal and reload."; });
    M.getJSON("social.json").then(function (b) { BOX = b; lists(); }).catch(function () { lists(); });
  }
  window.BirkhillSocial = { init: init, caption: caption, hashtags: hashtags, times: times, londonToDate: londonToDate };
})();
