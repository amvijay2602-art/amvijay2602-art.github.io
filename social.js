/* Birkhill Master Dashboard: Social Media Advertising, free route (24 Nov 2026). Vijay posts from his own phone.
   Posters come straight from the existing Rewards promotions feed (rewards/promotions.json, built read-only from the till)
   and are drawn with the same poster template as the staff Promotions page (rewards/poster/poster.js). Nothing is uploaded twice.
   When a post is due, a Post now card makes the poster PNG in the browser, copies the caption and opens the phone share sheet.
   Nothing here posts by itself and nothing is sent to any social network.
   Saves: 'SMADD: {json}' rows; 'SMACT: adId | approve/cancel/posted/skip | staff | time | postId' rows in Camera Entries
   (same Apps Script as the other apps). The box job birkhill-master/social_ads.py tick is optional: it keeps a copy and a due list. */
(function () {
  "use strict";
  var SHOP = "6-8 Fir Road, Eckington, Sheffield S21 4BY";
  var BLOCK = /tobacco|cigar|cigarette|\bvape\b|vaping|nicotine|e-?liquid|lost mary|\belf ?bar\b|\bhawcos\b|\bjucce\b|nic ?salts?|e-?cig|\bpod ?salt\b/i;
  var PLAT = [["facebook", "Facebook"], ["instagram", "Instagram"], ["tiktok", "TikTok"]];
  var PNAME = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
  var MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  var OPEN = { facebook: "https://www.facebook.com/", instagram: MOBILE ? "instagram://library" : "https://www.instagram.com/", tiktok: "https://www.tiktok.com/upload" };
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var LKEY = "birkhill-social-local-v1", AKEY = "birkhill-social-local-v1-acts";
  var M = null, esc = null, uk = null; // helpers shared by master.html, set in init()
  var $ = function (id) { return document.getElementById(id); };
  var ALL = [], SEL = {}, BOX = null, LIB = null, FEED_BY = {}, PNG = {};
  function NOW() { return new Date(); }

  function load(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.async = false; s.onload = res; s.onerror = function () { rej(new Error("load " + src)); }; document.body.appendChild(s); }); }
  function lib() {
    if (LIB) return LIB;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "rewards/poster/poster.css"; document.head.appendChild(l);
    LIB = load("rewards/poster/html-to-image.js").then(function () { return load("rewards/poster/poster.js"); }).then(function () {
      window.BirkhillPoster.config({ base: "rewards/", logo: "logo.png" }); return window.BirkhillPoster; });
    return LIB;
  }
  function endOf(p) { return p && p.end_iso ? new Date(p.end_iso) : null; }
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
    return { id: p.id, headline: p.headline || p.title, barcode: p.barcode, deal: p.deal, price: p.price, normal_price: p.normal_price || l0.price,
      normal: p.normal, end: p.end, end_iso: p.end_iso, picture: (p.pictures || [])[0] || p.picture || "", items: (p.lines || []).length || 1 };
  }

  /* ---- UK time helpers ---- */
  var FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  function parts(d) { var g = {}; FMT.formatToParts(d).forEach(function (x) { g[x.type] = x.value; }); if (g.hour === "24") g.hour = "00"; return g; }
  function londonToDate(day, time) {
    var want = new Date(day + "T" + time + ":00Z"), guess = want;
    for (var i = 0; i < 2; i++) { var g = parts(guess); var shown = new Date(g.year + "-" + g.month + "-" + g.day + "T" + g.hour + ":" + g.minute + ":00Z");
      guess = new Date(guess.getTime() - (shown.getTime() - want.getTime())); }
    return guess;
  }
  function stamp(d) { var g = parts(d); return g.year + g.month + g.day + g.hour + g.minute; }
  function addDays(day, n) { var d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dow(day) { return DAYS[(new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7]; }
  /* All post times from the start, by the repeat rule, before `limit` (max 60). Same rule as the box job. */
  function allTimes(s, limit) {
    var out = [], day = s.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return out;
    for (var i = 0; i < 400 && out.length < 60; i++) {
      var t = londonToDate(day, s.time);
      if (limit && t >= limit) break;
      if (s.repeat === "once" || s.repeat === "daily" || (s.repeat === "weekly" && s.days.indexOf(dow(day)) >= 0)) { out.push(t); if (s.repeat === "once") break; }
      day = addDays(day, 1);
    }
    return out;
  }
  function times(s, p) { var n = NOW(); return allTimes(s, endOf(p)).filter(function (t) { return t > n; }).map(function (t) { return t.toISOString(); }); }

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
  function selected() { return Object.keys(SEL).map(function (id) { return FEED_BY[id]; }).filter(Boolean); }
  function platforms() { return PLAT.filter(function (x) { return $("smP_" + x[0]).checked; }).map(function (x) { return x[0]; }); }
  function showSelected() {
    var ps = selected();
    $("smSelN").textContent = ps.length ? ps.length + " poster(s) selected" : "No posters selected yet. Tap Select Existing Posters.";
    $("smSel").innerHTML = ps.map(function (p) {
      var d = detail(p), tk = p.dept_key === "alcohol" && platforms().indexOf("tiktok") >= 0;
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
  function sched() {
    return { date: $("smDate").value, time: $("smTime").value || "10:00", repeat: $("smRepeat").value,
      days: DAYS.filter(function (d) { return $("smD_" + d).checked; }), auto: false, timezone: "Europe/London" };
  }
  function preview() {
    var s = sched();
    Array.prototype.forEach.call(document.querySelectorAll("[data-when]"), function (el) {
      var p = FEED_BY[el.getAttribute("data-when")]; if (!p || !s.date) { el.textContent = ""; return; }
      var t = times(s, p);
      el.innerHTML = t.length ? "Due " + t.length + " time(s): " + esc(t.slice(0, 4).map(uk).join(", ")) + (t.length > 4 ? " and " + (t.length - 4) + " more" : "") + ". Last one before the offer ends " + esc(p.end || "") + "."
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
  function sayTop(t, cls) { var m = $("smDueMsg"); m.textContent = t; m.className = "msg" + (cls ? " " + cls : ""); m.style.display = "block"; }
  function snapOf(p) { var d = detail(p); return { id: p.id, deal: d.deal, price: d.price, end_iso: d.end_iso }; }
  function create(approve) {
    var s = sched(), pl = platforms(), ps = selected(), pr = problems(s, pl, ps);
    if (pr.length) { say(pr.join(" "), "err"); return; }
    var id = "SM" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    var rec = { id: id, created_at: new Date().toISOString(), by: M.clean(M.staff()), platforms: pl, schedule: s, approved: !!approve,
      promos: ps.map(function (p) { var o = snapOf(p); o.caption = SEL[p.id].caption; o.hashtags = SEL[p.id].hashtags; return o; }) };
    M.queue("SMADD: " + JSON.stringify(rec).replace(/\|/g, "/"));
    var l = M.jget(LKEY, []); l.push(rec); M.jset(LKEY, l);
    SEL = {}; showSelected(); showGrid(); refresh();
    say((approve ? "Schedule saved and approved. " : "Schedule saved. Tap Approve in the list when you are happy. ") + "A Post now card shows at the top of this tab at each time. Posts stop when each offer ends.");
  }
  function act(adId, action, postId) {
    var at = new Date().toISOString();
    M.queue("SMACT: " + adId + " | " + action + " | " + M.clean(M.staff()) + " | " + at + (postId ? " | " + postId : ""));
    var a = M.jget(AKEY, []), rec = { id: adId, action: action, at: at, post: postId || "" };
    if (action === "approve") { var ad = adsAll().filter(function (x) { return x.id === adId; })[0];
      rec.snap = ad ? ad.promos.map(function (q) { return FEED_BY[q.id] ? snapOf(FEED_BY[q.id]) : { id: q.id, deal: q.deal, price: q.price, end_iso: q.end_iso }; }) : []; }
    a.push(rec); M.jset(AKEY, a);
    refresh();
  }

  /* ---- adverts: phone copy + box copy, with actions applied ---- */
  function adsAll() {
    var box = ((BOX && BOX.ads) || []).map(function (a) { return JSON.parse(JSON.stringify(a)); }), have = {};
    box.forEach(function (a) { have[a.id] = 1; });
    var all = M.jget(LKEY, []).filter(function (a) { return !have[a.id]; }).map(function (a) { var b = JSON.parse(JSON.stringify(a)); b.cancelled = false; return b; }).concat(box);
    var acts = M.jget(AKEY, []);
    all.forEach(function (a) {
      acts.forEach(function (x) {
        if (x.id !== a.id) return;
        if (x.action === "cancel") a.cancelled = true;
        if (x.action === "approve" && !a.cancelled) { a.approved = true;
          (x.snap || []).forEach(function (sn) { a.promos.forEach(function (q) { if (q.id === sn.id) { q.deal = sn.deal; q.price = sn.price; q.changed = false; } }); }); }
      });
    });
    return all;
  }
  function marks() {
    var m = {}; var r = (BOX && BOX.results) || {};
    Object.keys(r).forEach(function (k) { m[k] = r[k].status; });
    M.jget(AKEY, []).forEach(function (x) { if (x.post && (x.action === "posted" || x.action === "skip")) m[x.post] = x.action === "posted" ? "posted" : "skipped"; });
    return m;
  }
  /* Every post with its status: scheduled, due, posted, stopped, skipped, needs_approval, price_changed. */
  function postsOf(a, mk) {
    var out = [], now = NOW();
    a.promos.forEach(function (q) {
      var p = FEED_BY[q.id], end = endOf(p), snapEnd = q.end_iso ? new Date(q.end_iso) : null;
      var gone = !p || ended(p) || blocked(p);
      var changed = !!p && (String(p.deal) !== String(q.deal) || String(p.price) !== String(q.price));
      var stopAt = end || snapEnd, limit = (end && snapEnd) ? (end > snapEnd ? end : snapEnd) : stopAt;
      var ts = allTimes(a.schedule, limit); if (!limit && gone) ts = ts.slice(0, 7);
      var past = ts.filter(function (t) { return t <= now; }), lastPast = past.length ? past[past.length - 1].getTime() : null;
      ts.forEach(function (t) {
        a.platforms.forEach(function (plat) {
          if (plat === "tiktok" && p && p.dept_key === "alcohol") return;
          var id = a.id + "-" + q.id + "-" + plat + "-" + stamp(t), st, note = "";
          if (mk[id]) st = mk[id];
          else if (a.cancelled) { st = "skipped"; note = "Schedule cancelled."; }
          else if (gone || (stopAt && t >= stopAt)) { st = "stopped"; note = "Offer ended or removed on the till."; }
          else if (changed) { st = "price_changed"; note = "Till offer changed to " + (p.deal || "") + ". Approve again before posting."; }
          else if (!a.approved) st = "needs_approval";
          else if (t > now) st = "scheduled";
          else if (t.getTime() !== lastPast) { st = "skipped"; note = "Missed. A newer post time came."; }
          else st = "due";
          out.push({ id: id, ad: a, promo: q, p: p, platform: plat, at: t.toISOString(), status: st, note: note });
        });
      });
    });
    return out;
  }
  var LABEL = { needs_approval: ["Needs approval", "p-dev"], scheduled: ["Scheduled", "p-live"], due: ["Due now", "p-due"], posted: ["Posted", "p-live"],
    stopped: ["Stopped, offer ended", "p-bad"], skipped: ["Skipped", "p-dev"], price_changed: ["Offer changed, approve again", "p-bad"], cancelled: ["Cancelled", "p-bad"], pending_box: ["Saved on this phone", "p-dev"] };
  function pill(st) { var l = LABEL[st] || [st, "p-dev"]; return '<span class="pill ' + l[1] + '">' + esc(l[0]) + '</span>'; }
  function rep(s) { if (!s) return ""; var t = s.repeat === "once" ? "Once" : s.repeat === "daily" ? "Daily" : "Weekly on " + s.days.join(", "); return t + " from " + s.date + " at " + s.time + " UK"; }

  function refresh() {
    var ads = adsAll(), mk = marks(), posts = [];
    ads.forEach(function (a) { a._posts = postsOf(a, mk); posts = posts.concat(a._posts); });
    dueCards(posts.filter(function (x) { return x.status === "due"; }));
    lists(ads, posts);
  }

  /* ---- Post now cards ---- */
  function pngFor(p) {
    if (!PNG[p.id]) PNG[p.id] = lib().then(function (L) { return L.png(p); }).then(function (blob) { return { blob: blob, url: URL.createObjectURL(blob), name: window.BirkhillPoster.fileName(p) }; });
    PNG[p.id].catch(function () { delete PNG[p.id]; });
    return PNG[p.id];
  }
  function fullCaption(q) { return (q.caption || "") + "\n\n" + (q.hashtags || ""); }
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    return new Promise(function (res, rej) { var ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); ok ? res() : rej(new Error("copy")); });
  }
  function dueCards(due) {
    var groups = {}, order = [];
    due.forEach(function (x) { var k = x.ad.id + "|" + x.promo.id + "|" + x.at; if (!groups[k]) { groups[k] = { ad: x.ad, promo: x.promo, p: x.p, at: x.at, posts: [] }; order.push(k); } groups[k].posts.push(x); });
    var n = due.length;
    $("smDueN").textContent = n ? "Due now: " + n + " post" + (n > 1 ? "s" : "") : "Due now: 0";
    $("smDueN").className = "sm-due-n" + (n ? " on" : "");
    $("tabSocial").textContent = n ? "Social media (" + n + " due)" : "Social media";
    $("smDueHelp").textContent = n ? "Tap Share and pick the app, or download the picture. Paste the caption, post, then tap Mark as posted." : "Nothing to post right now. Cards show here at your scheduled times.";
    $("smDue").innerHTML = order.map(function (k, i) {
      var g = groups[k];
      return '<div class="sm-post" data-gi="' + i + '">' +
        '<div class="t">' + esc(g.p.headline || g.p.title) + ' ' + pill("due") + '</div>' +
        '<div class="muted">' + esc(g.p.deal) + '. Due ' + esc(uk(g.at)) + '. Offer ends ' + esc(g.p.end || "") + '.</div>' +
        '<div class="sm-img"><img alt="Poster" data-img="' + i + '"><div class="muted" data-imgmsg="' + i + '">Making the poster picture...</div></div>' +
        '<textarea readonly rows="4" class="sm-cpt">' + esc(fullCaption(g.promo)) + '</textarea>' +
        '<div class="sm-acts">' +
          '<button type="button" class="btn o" data-share="' + i + '">Share</button>' +
          '<button type="button" class="btn" data-copy="' + i + '">Copy caption + hashtags</button>' +
          '<button type="button" class="btn line" data-dl="' + i + '">Download image</button>' +
        '</div>' +
        '<div class="sm-plats">' + g.posts.map(function (x) {
          return '<div class="sm-prow"><b>' + PNAME[x.platform] + '</b><a class="btn line" href="' + OPEN[x.platform] + '" target="_blank" rel="noopener">Open ' + PNAME[x.platform] + '</a>' +
            '<button type="button" class="btn" data-posted="' + esc(x.id) + '" data-ad="' + esc(x.ad.id) + '">Mark as posted</button></div>';
        }).join("") + '</div>' +
        '<button type="button" class="btn grey sm-skip" data-skip="' + i + '">Skip this time</button>' +
        '<div class="msg" data-gmsg="' + i + '"></div></div>';
    }).join("");
    function gm(i, t, cls) { var m = document.querySelector('[data-gmsg="' + i + '"]'); m.textContent = t; m.className = "msg" + (cls ? " " + cls : ""); m.style.display = "block"; }
    order.forEach(function (k, i) {
      var g = groups[k];
      pngFor(g.p).then(function (r) { var im = document.querySelector('[data-img="' + i + '"]'); if (im) { im.src = r.url; document.querySelector('[data-imgmsg="' + i + '"]').textContent = ""; } })
        .catch(function () { var m = document.querySelector('[data-imgmsg="' + i + '"]'); if (m) m.textContent = "The picture could not be made. Reload and try again."; });
    });
    function each(attr, fn) { Array.prototype.forEach.call(document.querySelectorAll("[" + attr + "]"), function (b) { b.addEventListener("click", function () { fn(b, groups[order[+b.getAttribute(attr)]], +b.getAttribute(attr)); }); }); }
    function download(r) { var a = document.createElement("a"); a.href = r.url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove(); }
    each("data-copy", function (b, g, i) { copyText(fullCaption(g.promo)).then(function () { gm(i, "Caption and hashtags copied. Paste them in the app."); }, function () { gm(i, "Could not copy. Press and hold the caption box to copy it.", "warn"); }); });
    each("data-dl", function (b, g, i) { pngFor(g.p).then(function (r) { download(r); gm(i, "Picture downloaded. It is in your phone Downloads or Photos."); }, function () { gm(i, "The picture could not be made.", "err"); }); });
    each("data-share", function (b, g, i) {
      var txt = fullCaption(g.promo);
      copyText(txt).catch(function () {});
      pngFor(g.p).then(function (r) {
        var file = null; try { file = new File([r.blob], r.name, { type: "image/png" }); } catch (e) {}
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], text: txt, title: g.p.headline || "Birkhill Stores offer" })
            .then(function () { gm(i, "Shared. The caption is also copied, paste it if the app did not add it. Then tap Mark as posted."); },
                  function (e) { if (!e || e.name !== "AbortError") gm(i, "Sharing did not work. Use Download image and Open the app.", "warn"); });
        }
        download(r);
        gm(i, "Sharing is not available here, so the picture was downloaded and the caption copied. Use the Open buttons below.", "warn");
      }, function () { gm(i, "The picture could not be made.", "err"); });
    });
    each("data-skip", function (b, g) { g.posts.forEach(function (x) { act(x.ad.id, "skip", x.id); }); sayTop("Skipped. The next time shows when it is due."); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-posted]"), function (b) { b.addEventListener("click", function () {
      act(b.getAttribute("data-ad"), "posted", b.getAttribute("data-posted")); sayTop("Marked as posted. Well done."); }); });
  }

  /* ---- Scheduled / Posted / Stopped and skipped ---- */
  function lists(ads, posts) {
    var tab = document.querySelector(".sm-lt.active").getAttribute("data-lt"), html = "", box = {};
    ((BOX && BOX.ads) || []).forEach(function (a) { box[a.id] = 1; });
    if (tab === "scheduled") {
      var live = ads.filter(function (a) { return !a.cancelled && a._posts.some(function (x) { return ["scheduled", "due", "needs_approval", "price_changed"].indexOf(x.status) >= 0; }); });
      html = live.length ? live.map(function (a) {
        var left = a._posts.filter(function (x) { return ["scheduled", "due", "needs_approval", "price_changed"].indexOf(x.status) >= 0; });
        var st = !a.approved ? "needs_approval" : left.some(function (x) { return x.status === "price_changed"; }) ? "price_changed" : left.some(function (x) { return x.status === "due"; }) ? "due" : "scheduled";
        var nx = left.filter(function (x) { return x.status !== "due"; })[0];
        return '<div class="rep"><div class="t">' + esc(a.promos.map(function (q) { var p = FEED_BY[q.id]; return (p ? p.headline || p.title : q.id) + " (" + q.deal + ")"; }).join(", ")) + ' ' + pill(st) + '</div>' +
          '<div class="muted">' + esc(a.platforms.map(function (x) { return PNAME[x] || x; }).join(", ")) + '. ' + esc(rep(a.schedule)) + '. Made ' + esc(uk(a.created_at)) + ' by ' + esc(a.by || "") + '.' + (box[a.id] ? "" : " Saved on this phone.") + '</div>' +
          (nx ? '<div>Next: ' + esc(uk(nx.at)) + '. ' + left.length + ' post(s) left before the offers end.</div>' : '') +
          (st === "price_changed" ? '<div class="sm-red">' + esc(left.filter(function (x) { return x.status === "price_changed"; })[0].note) + '</div>' : '') +
          '<div class="b">' + (!a.approved || st === "price_changed" ? '<button type="button" data-ap="' + esc(a.id) + '">Approve</button>' : "") + '<button type="button" data-cx="' + esc(a.id) + '">Cancel</button></div></div>';
      }).join("") : '<div class="muted">No scheduled adverts.</div>';
    } else {
      var want = tab === "posted" ? ["posted"] : ["stopped", "skipped"];
      var rows = posts.filter(function (x) { return want.indexOf(x.status) >= 0; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 100);
      html = rows.length ? '<table><tr><th>When</th><th>Poster</th><th>Where</th><th>Status</th></tr>' + rows.map(function (x) {
        return '<tr><td>' + esc(uk(x.at)) + '</td><td>' + esc(x.p ? x.p.headline || x.p.title : x.promo.id) + '</td><td>' + esc(PNAME[x.platform]) + '</td><td>' + pill(x.status) +
          (x.note ? '<div class="muted">' + esc(x.note) + '</div>' : '') + '</td></tr>';
      }).join("") + '</table>' : '<div class="muted">' + (tab === "posted" ? "Nothing marked as posted yet." : "Nothing stopped or skipped.") + '</div>';
    }
    $("smList").innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll("[data-ap]"), function (b) { b.addEventListener("click", function () { act(b.getAttribute("data-ap"), "approve"); say("Approved with the current till price. Post now cards show at each time."); }); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-cx]"), function (b) { b.addEventListener("click", function () { if (confirm("Cancel this schedule? Posts already made stay online.")) { act(b.getAttribute("data-cx"), "cancel"); say("Cancelled. No more Post now cards for this schedule."); } }); });
  }

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
      Array.prototype.forEach.call(document.querySelectorAll(".sm-lt"), function (x) { x.classList.remove("active"); }); b.classList.add("active"); refresh(); }); });
    fetch("rewards/promotions.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (f) {
      ALL = (f.promotions || []).filter(function (p) { return !blocked(p); });
      FEED_BY = {}; (f.promotions || []).forEach(function (p) { FEED_BY[p.id] = p; });
      var deps = {}; ALL.forEach(function (p) { if (p.department) deps[p.department] = 1; });
      $("smDept").innerHTML = '<option value="">All departments</option>' + Object.keys(deps).sort().map(function (x) { return '<option>' + esc(x) + '</option>'; }).join("");
      $("smFeed").textContent = ALL.length + " live till promotion posters. Feed updated " + (f.updated || "") + ". Same posters as the staff Promotions page.";
      showSelected(); refresh();
      M.getJSON("social.json").then(function (b) { BOX = b; refresh(); }).catch(function () {});
      setInterval(refresh, 60000);
    }).catch(function () { $("smFeed").textContent = "Could not load the promotion posters. Check the signal and reload."; });
  }
  window.BirkhillSocial = { init: init, caption: caption, hashtags: hashtags, times: times, londonToDate: londonToDate, stamp: stamp };
})();
