/* Birkhill Stores promotion posters, built from the till promotions feed (promotions.json).
   One template for every offer, so posters stay accurate and update with the feed.
   Product photos are only real pictures already in the feed; otherwise a department icon.
   PNG export uses html-to-image (load html-to-image.js first). */
(function (root) {
  "use strict";
  var CFG = {
    base: "",
    logo: "logo.png",
    address: "Birkhill Stores, 6-8 Fir Road, Eckington, Sheffield S21 4BY",
    hours: "Open 7:00 AM - 9:00 PM, 7 days a week"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function url(path) {
    if (!path) return "";
    if (/^(https?:|data:|blob:|\/)/i.test(path)) return path;
    return (CFG.base || "") + path;
  }
  function money(v) {
    var n = Number(v);
    if (!isFinite(n)) return String(v || "");
    if (n > 0 && n < 1) return Math.round(n * 100) + "p";
    return "\u00a3" + n.toFixed(2);
  }
  function num(v) { var n = Number(String(v == null ? "" : v).replace(/[^\d.]/g, "")); return isFinite(n) ? n : 0; }

  var ICON = {
    soft_drinks: '<path d="M27 6h10v8c0 3 6 6 6 13v29a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4V27c0-7 6-10 6-13z" fill="#17643f"/><rect x="26" y="3" width="12" height="5" rx="1.5" fill="#f07f12"/><rect x="21" y="32" width="22" height="13" fill="#ffd21f"/>',
    snacks: '<path d="M16 8h32l-3 6 3 6-3 6 3 6-3 6 3 6-3 6 3 6H16l3-6-3-6 3-6-3-6 3-6-3-6 3-6z" fill="#17643f"/><circle cx="32" cy="34" r="9" fill="#ffd21f"/><path d="M27 34h10" stroke="#f07f12" stroke-width="3"/>',
    alcohol: '<path d="M20 6h24c0 14-3 24-12 26C23 30 20 20 20 6z" fill="#17643f"/><path d="M21 14h22" stroke="#ffd21f" stroke-width="3"/><path d="M32 32v20" stroke="#17643f" stroke-width="4"/><path d="M22 58h20" stroke="#f07f12" stroke-width="5" stroke-linecap="round"/>',
    grocery: '<path d="M8 24h48l-6 30H14z" fill="#17643f"/><path d="M20 24l8-14M44 24l-8-14" stroke="#f07f12" stroke-width="4" stroke-linecap="round"/><path d="M22 32v16M32 32v16M42 32v16" stroke="#ffd21f" stroke-width="3"/>',
    household: '<path d="M24 22h16v34a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill="#17643f"/><path d="M26 10h12v12H26z" fill="#f07f12"/><path d="M38 12h10l-4 6h-6" fill="#f07f12"/><rect x="27" y="32" width="10" height="14" rx="2" fill="#ffd21f"/>',
    chilled: '<g stroke="#17643f" stroke-width="5" stroke-linecap="round"><path d="M32 6v52M9.5 19l45 26M9.5 45l45-26"/></g><g stroke="#f07f12" stroke-width="3" stroke-linecap="round" fill="none"><path d="M26 10l6 6 6-6M26 54l6-6 6 6"/></g>',
    bakery: '<path d="M8 30c0-10 10-16 24-16s24 6 24 16c0 3-2 5-4 5v17a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V35c-2 0-4-2-4-5z" fill="#d9902f"/><path d="M22 24l-3 8M32 22v9M42 24l3 8" stroke="#fff3d6" stroke-width="3" stroke-linecap="round"/>'
  };
  var CAL = '<svg viewBox="0 0 48 48"><rect x="6" y="9" width="36" height="33" rx="5" fill="#fff"/><rect x="6" y="9" width="36" height="10" rx="4" fill="#ffd21f"/><path d="M15 5v9M33 5v9" stroke="#fff" stroke-width="4" stroke-linecap="round"/><g fill="#f07f12"><rect x="12" y="24" width="6" height="5"/><rect x="21" y="24" width="6" height="5"/><rect x="30" y="24" width="6" height="5"/><rect x="12" y="32" width="6" height="5"/><rect x="21" y="32" width="6" height="5"/></g></svg>';
  var CLOCK = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#0f4a2e"/><circle cx="24" cy="24" r="16" fill="#fff"/><path d="M24 13v12l8 5" stroke="#0f4a2e" stroke-width="4" stroke-linecap="round" fill="none"/></svg>';
  function burst(flip) {
    return '<svg viewBox="0 0 54 54"' + (flip ? ' style="transform:scaleX(-1)"' : '') + '><g stroke="#f07f12" stroke-width="5" stroke-linecap="round"><path d="M50 27H30"/><path d="M46 10L31 20"/><path d="M46 44L31 34"/></g></svg>';
  }
  function deptIcon(key, white) {
    var k = ICON[key] ? key : "grocery";
    var body = ICON[k];
    if (white) body = body.replace(/#17643f/g, "#ffffff");
    return '<svg viewBox="0 0 64 64">' + body + '</svg>';
  }
  var SW_TOP = '<svg class="bhp-sw bhp-sw-top" viewBox="0 0 560 300" preserveAspectRatio="none"><path d="M120 0H560V300C470 170 300 90 120 0Z" fill="#8fd19e"/><path d="M210 0H560V230C480 120 360 60 210 0Z" fill="#17643f"/><path d="M380 0H560V120C500 70 450 35 380 0Z" fill="#f07f12"/></svg>';
  var SW_BOT = '<svg class="bhp-sw bhp-sw-bot" viewBox="0 0 600 260" preserveAspectRatio="none"><path d="M0 40C140 150 330 220 600 260H0Z" fill="#8fd19e"/><path d="M0 110C150 190 300 235 470 260H0Z" fill="#17643f"/><path d="M0 190C80 228 160 248 250 260H0Z" fill="#f07f12"/></svg>';
  var BRUSH = '<svg viewBox="0 0 400 80" preserveAspectRatio="none"><path d="M6 14C60 4 140 9 210 6 280 3 340 8 394 5 386 22 398 40 390 56 396 66 392 72 396 77 320 72 250 79 180 75 110 72 50 79 4 74 12 60 2 46 8 32 3 25 9 19 6 14Z" fill="#0f4a2e"/><path d="M20 70C120 66 230 71 380 66" stroke="#17643f" stroke-width="3" fill="none" opacity=".6"/></svg>';

  /* Turn one feed record into the words on the poster. */
  function words(p) {
    var lines = Array.isArray(p.lines) && p.lines.length ? p.lines : null;
    if (!lines) {
      var it = Array.isArray(p.items) ? p.items : [];
      var ib = Array.isArray(p.item_barcodes) ? p.item_barcodes : [];
      if (it.length) {
        lines = it.map(function (x, i) {
          return typeof x === "string" ? { name: x, barcode: ib[i] || "" } : { name: x.name || "", barcode: x.barcode || ib[i] || "" };
        });
      } else {
        lines = [{ name: p.title || "", barcode: p.barcode || "" }];
      }
    }
    var n = lines.length;
    var kind = p.kind, qty = Number(p.qty || 0), price = p.price;
    var m;
    if (!kind) {
      if ((m = /^(\d+)\s*for\s*\u00a3?([\d.]+)/i.exec(p.deal || ""))) { kind = "multi"; qty = +m[1]; price = m[2]; }
      else if ((m = /^now\s*\u00a3?([\d.]+)/i.exec(p.deal || ""))) { kind = "price"; price = m[1]; }
      else if (/free/i.test(p.deal || "")) kind = "free";
      else kind = "other";
    }
    var w = { kind: kind, n: n, lines: lines, top: "", big: "", bigCls: "", each: "" };
    if (kind === "multi") {
      w.top = (n > 1 ? "Any " : "") + qty + " for";
      w.big = money(price);
    } else if (kind === "price") {
      w.top = "Now only";
      w.big = money(price);
      if (n > 1) w.each = "each";
    } else if (kind === "free") {
      w.top = "Buy " + (qty || 1);
      w.big = "Get " + (p.free_qty || 1) + " free";
      w.bigCls = "small";
    } else if (kind === "meal") {
      w.top = "Deal price";
      w.big = money(price);
    } else {
      w.top = "";
      w.big = p.deal || "";
      w.bigCls = "small";
    }
    var save = num(p.save);
    w.save = save > 0.004 ? money(save) : "";
    if (kind === "multi" || kind === "free") w.ribbon = n > 1 ? "Mix & Match - " + n + " Products" : (p.pack ? p.pack + " pack" : "");
    else if (kind === "meal") w.ribbon = "Meal Deal - " + n + " Products";
    else w.ribbon = n > 1 ? "Choose from " + n + " Products" : (p.pack && p.pack !== "1" ? p.pack + " pack" : "");
    w.normal = p.normal ? "Normal " + p.normal : "";
    w.head = p.headline || p.title || "Promotion";
    w.ends = p.end ? "Offer ends " + p.end : "Ongoing offer";
    var notes = String(p.note || "").split(/;\s*/).filter(function (s) { return s && !/^mix and match/i.test(s); });
    if (p.dept_key === "alcohol") notes.push("Over 18s only. Challenge 25.");
    w.note = notes.join(". ").replace(/\.\./g, ".");
    var pics = Array.isArray(p.pictures) && p.pictures.length ? p.pictures.slice(0, 3) : (p.picture ? [p.picture] : []);
    w.pics = pics;
    return w;
  }

  function build(p) {
    var w = words(p);
    var el = document.createElement("div");
    el.className = "bhp" + (w.n > 24 ? " bhp-many" : "");
    el.setAttribute("data-id", p.id || "");
    var pics = w.pics.length
      ? '<div class="bhp-pics bhp-n' + w.pics.length + '">' + w.pics.map(function (src) {
          return '<img crossorigin="anonymous" decoding="async" src="' + esc(url(src)) + '" alt="">';
        }).join("") + "</div>"
      : '<div class="bhp-icon">' + deptIcon(p.dept_key) + "</div>";
    var tbl = w.lines.map(function (l) {
      return '<div class="bhp-ln"><span class="bhp-nm">' + esc(l.name) + '</span><span class="bhp-sep">|</span><span class="bhp-bc">' + esc(l.barcode || "no barcode") + "</span></div>";
    }).join("");
    el.innerHTML =
      SW_TOP + SW_BOT +
      '<div class="bhp-inner">' +
        '<img class="bhp-logo" crossorigin="anonymous" src="' + esc(url(CFG.logo)) + '" alt="Birkhill Stores">' +
        '<div class="bhp-club">' + burst(true) + '<div class="bhp-pill">Rewards Club Promotion</div>' + burst(false) + "</div>" +
        '<div class="bhp-head">' + esc(w.head) + "</div>" +
        (w.ribbon ? '<div class="bhp-ribbon">' + esc(w.ribbon) + "</div>" : "") +
        '<div class="bhp-mid"><div class="bhp-left">' +
          '<div class="bhp-dealbox">' + (w.top ? '<div class="bhp-top">' + esc(w.top) + "</div>" : "") +
            '<div class="bhp-big ' + (w.bigCls ? 'bhp-' + w.bigCls : '') + '">' + esc(w.big) + "</div>" +
            (w.each ? '<div class="bhp-top">' + esc(w.each) + "</div>" : "") +
                      "</div>" +
          (w.normal ? '<div class="bhp-brush">' + BRUSH + "<span>" + esc(w.normal) + "</span></div>" : "") +
        '</div><div class="bhp-right">' + pics + (w.save ? '<div class="bhp-save">Save<b>' + esc(w.save) + "</b></div>" : "") + "</div></div>" +
        '<div class="bhp-tbl">' + tbl + "</div>" +
        (w.note ? '<div class="bhp-note">' + esc(w.note) + "</div>" : "") +
        '<div class="bhp-row"><div class="bhp-chip bhp-dept">' + deptIcon(p.dept_key, true) + "<span>" + esc(p.department || "Offer") + '</span></div>' +
          '<div class="bhp-chip bhp-ends">' + CAL + "<span>" + esc(w.ends) + "</span></div></div>" +
      "</div>" +
      '<div class="bhp-ref">Till offer ' + esc(String(p.id || "").replace(/^till-/, "")) + "</div>" +
      '<div class="bhp-foot"><div class="bhp-addr">' + esc(CFG.address) + '</div><div class="bhp-open">' + CLOCK + "<span>" + esc(CFG.hours) + "</span></div></div>";
    el.__words = w;
    return el;
  }

  /* Shrink text that does not fit. Needs the poster in the page (it may be scaled or off screen). */
  function shrink(node, start, min, fits) {
    var s = start;
    node.style.fontSize = s + "px";
    var guard = 0;
    while (!fits(node) && s > min && guard++ < 80) {
      s -= s > 60 ? 4 : s > 30 ? 2 : 1;
      node.style.fontSize = s + "px";
    }
    return s;
  }
  function fit(el) {
    var w = el.__words || {};
    var head = el.querySelector(".bhp-head");
    if (head) shrink(head, w.n > 24 ? 84 : 112, 46, function (n) { return n.scrollHeight <= 232 && n.scrollWidth <= n.clientWidth + 1; });
    var rib = el.querySelector(".bhp-ribbon");
    if (rib) shrink(rib, 42, 24, function (n) { return n.scrollWidth <= n.clientWidth + 1; });
    var big = el.querySelector(".bhp-dealbox .bhp-big");
    if (big) {
      var startBig = big.classList.contains("bhp-small") ? 84 : (w.n > 24 ? 112 : 150);
      shrink(big, startBig, 40, function (n) { return n.scrollWidth <= n.clientWidth + 1; });
    }
    el.querySelectorAll(".bhp-dealbox .bhp-top").forEach(function (t) {
      t.style.whiteSpace = "nowrap";
      shrink(t, w.n > 24 ? 46 : 58, 26, function (n) { return n.scrollWidth <= n.clientWidth + 1; });
    });
    var brush = el.querySelector(".bhp-brush");
    if (brush) shrink(brush, 38, 20, function (n) { return n.scrollWidth <= n.clientWidth + 1; });
    var note = el.querySelector(".bhp-note");
    if (note) shrink(note, 28, 16, function (n) { return n.scrollHeight <= 80; });
    var tbl = el.querySelector(".bhp-tbl");
    if (tbl) {
      var n = w.n || tbl.children.length;
      tbl.classList.remove("bhp-c2", "bhp-c3");
      if (n > 16) tbl.classList.add("bhp-c3");
      else if (n > 5) tbl.classList.add("bhp-c2");
      var start = n <= 3 ? 34 : n <= 5 ? 30 : n <= 10 ? 26 : n <= 16 ? 22 : 18;
      var fitsTbl = function (t) {
        if (t.scrollHeight > t.clientHeight + 1) return false;
        var names = t.querySelectorAll(".bhp-nm");
        for (var i = 0; i < names.length; i++) if (names[i].scrollWidth > names[i].clientWidth + 1) return false;
        return true;
      };
      var s = shrink(tbl, start, 11, fitsTbl);
      if (!fitsTbl(tbl) && n > 5 && !tbl.classList.contains("bhp-c3")) {
        tbl.classList.remove("bhp-c2"); tbl.classList.add("bhp-c3");
        shrink(tbl, s, 11, fitsTbl);
      }
    }
    el.__fitted = true;
    return el;
  }

  function fontsReady() {
    return (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(function () {}) : Promise.resolve();
  }
  function imagesReady(el) {
    var imgs = Array.prototype.slice.call(el.querySelectorAll("img"));
    return Promise.all(imgs.map(function (img) {
      if (img.complete) return null;
      return new Promise(function (res) { img.onload = img.onerror = res; setTimeout(res, 8000); });
    }));
  }

  var ro = (typeof ResizeObserver !== "undefined") ? new ResizeObserver(function (entries) {
    entries.forEach(function (e) { e.target.style.setProperty("--bhp-s", (e.target.clientWidth / 1080).toFixed(5)); });
  }) : null;
  function wrap(p) {
    var box = document.createElement("div");
    box.className = "bhp-wrap";
    var el = build(p);
    box.appendChild(el);
    if (ro) ro.observe(box);
    return { box: box, el: el };
  }
  function scaleNow(box) { box.style.setProperty("--bhp-s", ((box.clientWidth || 300) / 1080).toFixed(5)); }

  /* Grid of poster thumbnails. Posters are built when they come near the screen. */
  function grid(container, promos, opts) {
    opts = opts || {};
    container.innerHTML = "";
    container.classList.add("bhp-grid");
    var io = (typeof IntersectionObserver !== "undefined") ? new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } });
    }, { rootMargin: "600px 0px" }) : null;
    function fill(card) {
      var p = card.__promo;
      if (card.__done) return;
      card.__done = true;
      var holder = card.querySelector(".bhp-wrap");
      var el = build(p);
      holder.appendChild(el);
      scaleNow(holder);
      if (ro) ro.observe(holder);
      fontsReady().then(function () { fit(el); });
    }
    (promos || []).forEach(function (p) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "bhp-card";
      card.setAttribute("aria-label", "Open poster: " + (p.headline || p.title || "") + ", " + (p.deal || ""));
      card.__promo = p;
      card.innerHTML = '<div class="bhp-wrap"></div>' + (opts.caption === false ? "" :
        '<div class="bhp-cap"><b>' + esc(p.deal || "") + "</b>" + esc(p.headline || p.title || "") + "</div>");
      card.addEventListener("click", function () { open(p); });
      container.appendChild(card);
      if (io) io.observe(card); else fill(card);
    });
  }

  function slug(s) { return String(s || "offer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "offer"; }

  /* PNG of a poster at full size (1080 x 1528). */
  function png(p) {
    if (!root.htmlToImage) return Promise.reject(new Error("PNG maker not loaded"));
    var stage = document.createElement("div");
    stage.className = "bhp-stage";
    var el = build(p);
    stage.appendChild(el);
    document.body.appendChild(stage);
    var opts = { width: 1080, height: 1528, pixelRatio: 1, backgroundColor: "#ffffff", cacheBust: false };
    return fontsReady().then(function () { return imagesReady(el); }).then(function () {
      fit(el);
      // First pass warms up fonts and pictures (needed on iPhone Safari), second pass is the real one.
      return root.htmlToImage.toBlob(el, opts).catch(function () { return null; });
    }).then(function () {
      return root.htmlToImage.toBlob(el, opts);
    }).then(function (blob) {
      stage.remove();
      if (!blob) throw new Error("No picture made");
      return blob;
    }, function (err) { stage.remove(); throw err; });
  }
  function fileName(p) { return "birkhill-offer-" + slug(p.headline || p.title) + ".png"; }
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  var viewer = null;
  function close() {
    if (!viewer) return;
    viewer.remove();
    viewer = null;
    document.documentElement.style.overflow = "";
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  function open(p) {
    close();
    viewer = document.createElement("div");
    viewer.className = "bhp-view";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-label", "Promotion poster");
    viewer.innerHTML = '<div class="bhp-bar"><button type="button" data-a="close">Close</button><div class="bhp-grp">' +
      '<button type="button" data-a="dl">Download PNG</button><button type="button" class="bhp-go" data-a="share">Share</button></div></div>' +
      '<div class="bhp-msg" aria-live="polite"></div>';
    var w = wrap(p);
    viewer.insertBefore(w.box, viewer.querySelector(".bhp-msg"));
    document.body.appendChild(viewer);
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    scaleNow(w.box);
    fontsReady().then(function () { fit(w.el); });
    var msg = viewer.querySelector(".bhp-msg");
    viewer.addEventListener("click", function (e) {
      if (e.target === viewer) { close(); return; }
      var a = e.target && e.target.getAttribute && e.target.getAttribute("data-a");
      if (!a) return;
      if (a === "close") { close(); return; }
      msg.textContent = "Making the picture...";
      png(p).then(function (blob) {
        var name = fileName(p);
        var file = null;
        try { file = new File([blob], name, { type: "image/png" }); } catch (err) { file = null; }
        if (a === "share" && file && navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: p.headline || p.title || "Birkhill Stores offer", text: (p.deal || "") + " at Birkhill Stores" })
            .then(function () { msg.textContent = ""; }, function (err) { msg.textContent = err && err.name === "AbortError" ? "" : "Could not share. Use Download PNG instead."; });
        }
        download(blob, name);
        msg.textContent = a === "share" ? "Sharing is not available here, so the picture was downloaded." : "Picture downloaded.";
      }).catch(function () { msg.textContent = "Sorry, the picture could not be made. Try again."; });
    });
  }

  root.BirkhillPoster = {
    config: function (c) { for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) CFG[k] = c[k]; return CFG; },
    build: build, fit: fit, words: words, grid: grid, open: open, close: close, png: png, fileName: fileName
  };
})(typeof window !== "undefined" ? window : this);
