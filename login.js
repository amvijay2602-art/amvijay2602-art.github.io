/* Birkhill staff sign-in (28 Nov 2026, Vijay t1624u). ONE shared login for every Birkhill staff app.
   Staff pick their name and tap a 4-digit PIN. The phone remembers the sign-in until "Sign out" or 12 hours.
   The staff list and the salted PBKDF2 PIN hashes live in stafflogin.json.enc (encrypted with the same data key as the till data).
   This is a simple convenience lock on a static website, NOT bank-grade security: a 4-digit PIN can be guessed and
   anyone who controls their own phone can change what is stored on it. It stops accidents and stops staff using each other's names.
   Needs secure-data.js loaded first (it decrypts stafflogin.json). */
(function () {
  if (window.BirkhillLogin) return;
  var NAME_KEY = "birkhill-staff-name";
  var SESSION_KEY = "birkhill-login-v1";
  var CACHE_KEY = "birkhill-stafflogin-cache-v1";
  var OVERRIDE_KEY = "birkhill-stafflogin-override-v1";
  var QUEUE_KEY = "birkhill-login-queue-v1";
  var TRIES_KEY = "birkhill-login-tries-v1";
  var CHECKED_KEYS = ["birkhill-paper-stockin-checked-by", "birkhill-pp-waste-checked-by", "birkhill-chiller-stockin-checked-by", "birkhill-chiller-wastage-checked-by"];
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbz7eKFQN2UbbSA8-4nLzB9crDkQUE5b7_CJ3wnVfqmxODFIfz8G3XNpQ1_igg9SCNJbKg/exec";
  var TTL = 12 * 3600 * 1000;
  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem, rawGet = Storage.prototype.getItem;
  var script = document.currentScript, BASE = script && script.src ? script.src.replace(/[^\/]*$/, "") : location.href.replace(/[^\/]*$/, "");
  var nogate = !!window.BIRKHILL_NO_GATE;
  var current = "";   // signed-in name, once signed in

  function get(k) { try { return rawGet.call(localStorage, k); } catch (e) { return null; } }
  function set(k, v) { try { rawSet.call(localStorage, k, v); } catch (e) {} }
  function del(k) { try { rawRemove.call(localStorage, k); } catch (e) {} }
  function jget(k, d) { try { var v = get(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function b64(buf) { var a = new Uint8Array(buf), s = ""; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function norm(n) { return String(n || "").trim().replace(/\s+/g, " "); }
  function same(a, b) { return norm(a).toLowerCase() === norm(b).toLowerCase(); }
  function londonISO() {
    var p = {}; new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day + "T" + (p.hour === "24" ? "00" : p.hour) + ":" + p.minute + ":" + p.second;
  }

  // ---------- PIN hashing: PBKDF2-SHA256, random salt per person ----------
  function pbkdf2(pin, saltB64, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(String(pin)), "PBKDF2", false, ["deriveBits"]).then(function (k) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64), iterations: iter || 150000 }, k, 256);
    }).then(b64);
  }
  function newSalt() { return b64(crypto.getRandomValues(new Uint8Array(16))); }
  function makeCred(pin, iter) { var salt = newSalt(); return pbkdf2(pin, salt, iter).then(function (h) { return { salt: salt, hash: h }; }); }
  function hmac(keyB64, text) {
    return crypto.subtle.importKey("raw", unb64(keyB64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]).then(function (k) {
      return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text));
    }).then(b64);
  }

  // ---------- staff list (server copy + this phone's newer owner edits) ----------
  var staffState = null;
  function loadStaff() {
    return fetch(BASE + "stafflogin.json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("no list");
      return r.json();
    }).then(function (s) {
      if (!s || !Array.isArray(s.staff)) throw new Error("bad list");
      set(CACHE_KEY, JSON.stringify(s)); return s;
    }).catch(function () { return jget(CACHE_KEY, null); }).then(function (s) {
      var o = jget(OVERRIDE_KEY, null);
      if (o && o.state && (!s || Number(o.state.v) > Number(s.v || 0))) s = o.state;   // owner edit not on the server yet
      else if (o && s && Number(s.v || 0) >= Number(o.state && o.state.v || 0)) del(OVERRIDE_KEY);
      staffState = s || null; return staffState;
    });
  }
  function activeNames(s) { return ((s && s.staff) || []).filter(function (p) { return p.active !== false; }).map(function (p) { return p.name; }); }
  function findPerson(s, name) { var l = (s && s.staff) || []; for (var i = 0; i < l.length; i++) if (l[i].active !== false && same(l[i].name, name)) return l[i]; return null; }

  // ---------- events (sign in / out are logged to the same Camera Entries sheet as the other apps) ----------
  var sending = false;
  function send(ev) {
    var q = jget(QUEUE_KEY, []); q.push({ name: "STAFFLOGIN1: " + JSON.stringify(ev), photo: "", lines: [{ date: londonISO().slice(0, 10), qty: "0" }] });
    set(QUEUE_KEY, JSON.stringify(q.slice(-60))); flush();
  }
  function flush() {
    var q = jget(QUEUE_KEY, []); if (sending || !q.length) return; sending = true;
    fetch(ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(q[0]) })
      .then(function () { var q2 = jget(QUEUE_KEY, []); q2.shift(); set(QUEUE_KEY, JSON.stringify(q2)); sending = false; flush(); })
      .catch(function () { sending = false; setTimeout(flush, 20000); });
  }
  var nativeFetch = window.fetch;

  // ---------- session ----------
  function session() { var s = jget(SESSION_KEY, null); return s && s.name && Number(s.exp) > Date.now() ? s : null; }
  function applyName(name) {
    current = name;
    set(NAME_KEY, name);
    CHECKED_KEYS.forEach(function (k) { set(k, name); });
  }
  // while signed in, nobody can switch the shared staff name from inside an app (Home chips, Stock Count "add name", ...)
  Storage.prototype.setItem = function (k, v) {
    if (current && this === window.localStorage && k === NAME_KEY && String(v) !== current) v = current;
    if (current && this === window.localStorage && CHECKED_KEYS.indexOf(k) >= 0 && String(v) !== current) v = current;
    return rawSet.call(this, k, v);
  };
  Storage.prototype.removeItem = function (k) {
    if (current && this === window.localStorage && k === NAME_KEY) return;
    return rawRemove.call(this, k);
  };
  function signOut(why) {
    var who = current || (jget(SESSION_KEY, {}) || {}).name || "";
    if (who) send({ t: "signout", staff: who, at: londonISO(), why: why || "button" });
    current = ""; del(SESSION_KEY); del(NAME_KEY); CHECKED_KEYS.forEach(del);
    location.reload();
  }
  function signIn(name) {
    applyName(name);
    set(SESSION_KEY, JSON.stringify({ name: name, at: Date.now(), exp: Date.now() + TTL }));
    send({ t: "signin", staff: name, at: londonISO() });
  }

  // ---------- fill every "staff name" box with the signed-in name (and lock it, so logs always carry the real name) ----------
  var NAME_FIELD = /(^|[^a-z])(staff|checkedby|who)(name)?($|[^a-z])|checkedby$|staff$/i;
  function isNameField(el) {
    if (!el || el.tagName !== "INPUT") return false;
    var t = (el.getAttribute("type") || "text").toLowerCase(); if (t !== "text") return false;
    if (el.getAttribute("data-bk-free") != null) return false;
    var id = el.id || "", ph = el.getAttribute("placeholder") || "";
    return NAME_FIELD.test(id) || /^(add )?(your|staff) name$/i.test(ph.trim()) || /^checked by$/i.test(ph.trim());
  }
  // These boxes always show the signed-in name. Any other staff-name box (such as an old record being viewed) is only filled when empty.
  var ALWAYS = /^(checkedBy|wasteCheckedBy|stockInCheckedBy|wastageCheckedBy|mdcStaff|dclStaff|psStaff|nStaff|supStaff|uStaff)$/;
  function put(el) { el.value = current; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} }
  function fillFields() {
    if (!current) return;
    var list = document.querySelectorAll("input");
    for (var i = 0; i < list.length; i++) {
      var el = list[i]; if (!isNameField(el) || el.disabled) continue;
      if (ALWAYS.test(el.id || "")) {
        if (el.value !== current) put(el);
        if (!el.readOnly) { el.readOnly = true; el.style.background = "#eef5ee"; el.title = "Filled from your sign-in"; }
      } else if (!el.value.trim()) put(el);
    }
  }
  var fillTimer = null;
  function scheduleFill() { if (fillTimer) return; fillTimer = setTimeout(function () { fillTimer = null; fillFields(); }, 120); }

  // ---------- screens ----------
  var CSS = "#bk-login{position:fixed;inset:0;z-index:2147483000;background:linear-gradient(180deg,#0b3d1e,#145a32);color:#fff;font:16px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;overflow:auto;-webkit-tap-highlight-color:transparent}" +
    "#bk-login .in{width:100%;max-width:420px;padding:20px 18px 28px;box-sizing:border-box;text-align:center}" +
    "#bk-login img{height:64px;max-width:70%;object-fit:contain;background:#fff;border-radius:12px;padding:6px 10px;margin:8px 0 10px}" +
    "#bk-login h1{font-size:26px;margin:6px 0 4px}#bk-login p{margin:4px 0 14px;opacity:.9;font-size:16px}" +
    "#bk-login .names{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0}" +
    "#bk-login .nm{font-size:22px;font-weight:700;padding:22px 8px;border-radius:16px;border:0;background:#fff;color:#0b3d1e;min-height:74px;word-break:break-word}" +
    "#bk-login .nm:active{background:#c8e6c9}" +
    "#bk-login .lnk{background:none;border:0;color:#cfe8d5;font-size:16px;text-decoration:underline;padding:12px;margin-top:6px}" +
    "#bk-login input.typed{width:100%;box-sizing:border-box;font-size:22px;padding:14px;border-radius:12px;border:0;text-align:center;margin:6px 0 10px}" +
    "#bk-login .dots{display:flex;gap:16px;justify-content:center;margin:12px 0 16px}" +
    "#bk-login .dot{width:22px;height:22px;border-radius:50%;border:3px solid #fff;box-sizing:border-box}#bk-login .dot.on{background:#fff}" +
    "#bk-login .pad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:300px;margin:0 auto}" +
    "#bk-login .k{font-size:30px;font-weight:700;padding:0;height:68px;border-radius:34px;border:0;background:rgba(255,255,255,.18);color:#fff}#bk-login .k:active{background:rgba(255,255,255,.42)}" +
    "#bk-login .k.ghost{background:none;font-size:18px}" +
    "#bk-login .msg{min-height:24px;margin:6px 0;color:#ffd7d7;font-weight:600}" +
    "#bk-login .shake{animation:bkshake .35s}@keyframes bkshake{25%{transform:translateX(-10px)}75%{transform:translateX(10px)}}" +
    "#bk-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#0b3d1e;color:#fff;padding:6px 12px;font:600 14px -apple-system,Segoe UI,Roboto,Arial,sans-serif;position:relative;z-index:50}" +
    "#bk-bar button{background:#fff;color:#0b3d1e;border:0;border-radius:8px;padding:6px 12px;font:700 13px inherit;font-family:inherit}";

  function addCss() { if (document.getElementById("bk-login-css")) return; var st = document.createElement("style"); st.id = "bk-login-css"; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); }

  function showLogin(onDone) {
    addCss();
    var root = document.createElement("div"); root.id = "bk-login"; document.documentElement.appendChild(root);
    var inner = document.createElement("div"); inner.className = "in"; root.appendChild(inner);
    var who = "", pin = "", busy = false, list = null, typing = false;
    function head(sub) {
      inner.innerHTML = "";
      var im = document.createElement("img"); im.src = BASE + "logo.png"; im.alt = "Birkhill Stores"; im.onerror = function () { im.style.display = "none"; }; inner.appendChild(im);
      var h = document.createElement("h1"); h.textContent = "Sign in"; inner.appendChild(h);
      var p = document.createElement("p"); p.textContent = sub; inner.appendChild(p);
    }
    function tries() { var t = jget(TRIES_KEY, { n: 0, until: 0 }); return t; }
    function pickScreen(note) {
      who = ""; pin = "";
      head("Tap your name");
      if (!list) { var m = document.createElement("div"); m.className = "msg"; m.textContent = "Loading names..."; inner.appendChild(m); return; }
      var names = activeNames(list);
      if (!names.length) { var m2 = document.createElement("div"); m2.className = "msg"; m2.textContent = "No staff names yet, or this phone is not set up. Open the app once from the full link Vijay sent (it ends in #k=...), or ask Vijay."; inner.appendChild(m2); return; }
      if (typing) {
        var ti = document.createElement("input"); ti.className = "typed"; ti.placeholder = "Type your name"; ti.setAttribute("data-bk-free", "1"); ti.autocapitalize = "words"; ti.autocomplete = "off"; inner.appendChild(ti);
        var go = document.createElement("button"); go.className = "nm"; go.style.width = "100%"; go.textContent = "Next"; inner.appendChild(go);
        var msg = document.createElement("div"); msg.className = "msg"; inner.appendChild(msg);
        var run = function () { var p = findPerson(list, ti.value); if (!p) { msg.textContent = "I can't find that name. Check the spelling or tap your name."; return; } who = p.name; pinScreen(); };
        go.onclick = run; ti.onkeydown = function (e) { if (e.key === "Enter") run(); };
        var back = document.createElement("button"); back.className = "lnk"; back.textContent = "Show the names instead"; back.onclick = function () { typing = false; pickScreen(); }; inner.appendChild(back);
        setTimeout(function () { try { ti.focus(); } catch (e) {} }, 50);
        return;
      }
      var grid = document.createElement("div"); grid.className = "names";
      names.forEach(function (n) { var b = document.createElement("button"); b.className = "nm"; b.type = "button"; b.textContent = n; b.onclick = function () { who = n; pinScreen(); }; grid.appendChild(b); });
      inner.appendChild(grid);
      var t = document.createElement("button"); t.className = "lnk"; t.textContent = "Type my name"; t.onclick = function () { typing = true; pickScreen(); }; inner.appendChild(t);
      if (note) { var nm = document.createElement("div"); nm.className = "msg"; nm.textContent = note; inner.appendChild(nm); }
    }
    function pinScreen(note) {
      pin = ""; head("Hi " + who + ". Tap your 4-digit PIN");
      var dots = document.createElement("div"); dots.className = "dots"; for (var i = 0; i < 4; i++) { var d = document.createElement("span"); d.className = "dot"; dots.appendChild(d); } inner.appendChild(dots);
      var msg = document.createElement("div"); msg.className = "msg"; msg.textContent = note || ""; inner.appendChild(msg);
      var pad = document.createElement("div"); pad.className = "pad";
      function paint() { var ds = dots.children; for (var j = 0; j < 4; j++) ds[j].className = "dot" + (j < pin.length ? " on" : ""); }
      function press(c) {
        if (busy) return;
        var t = tries(); if (t.until > Date.now()) { msg.textContent = "Too many tries. Wait " + Math.ceil((t.until - Date.now()) / 1000) + " seconds."; return; }
        if (c === "<") { pin = pin.slice(0, -1); paint(); return; }
        if (pin.length >= 4) return; pin += c; paint(); msg.textContent = "";
        if (pin.length === 4) check();
      }
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "<"].forEach(function (c) {
        var b = document.createElement("button"); b.type = "button"; b.className = "k";
        if (c === "back") { b.className = "k ghost"; b.textContent = "Names"; b.onclick = function () { pickScreen(); }; }
        else { b.textContent = c === "<" ? "\u232b" : c; b.setAttribute("aria-label", c === "<" ? "Delete" : c); b.onclick = function () { press(c); }; }
        pad.appendChild(b);
      });
      inner.appendChild(pad);
      var hint = document.createElement("p"); hint.style.marginTop = "16px"; hint.style.fontSize = "14px"; hint.textContent = "Forgot your PIN? Ask Vijay."; inner.appendChild(hint);
      window.__bkKey = function (e) { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === "Backspace") press("<"); };
      function check() {
        busy = true; var p = findPerson(list, who);
        if (!p) { busy = false; pickScreen("That name is not on the list any more."); return; }
        pbkdf2(pin, p.salt, list.iter || 150000).then(function (h) {
          busy = false;
          if (h === p.hash) { set(TRIES_KEY, JSON.stringify({ n: 0, until: 0 })); signIn(p.name); root.remove(); window.__bkKey = null; onDone(); return; }
          var t = tries(); t.n = (t.n || 0) + 1; if (t.n >= 5) { t.until = Date.now() + 30000; t.n = 0; } set(TRIES_KEY, JSON.stringify(t));
          pin = ""; paint(); msg.textContent = t.until > Date.now() ? "Too many tries. Wait 30 seconds." : "Wrong PIN. Try again.";
          dots.classList.remove("shake"); void dots.offsetWidth; dots.classList.add("shake");
        }, function () { busy = false; msg.textContent = "This phone can't check PINs here. Use the https link."; });
      }
    }
    document.addEventListener("keydown", function (e) { if (window.__bkKey) window.__bkKey(e); });
    pickScreen();
    loadStaff().then(function (s) { list = s; if (!who) pickScreen(); });
  }

  function showBar() {
    var go = function () {
      if (document.getElementById("bk-bar") || !current) return;
      addCss();
      var bar = document.createElement("div"); bar.id = "bk-bar";
      var sp = document.createElement("span"); sp.textContent = "Signed in: " + current; bar.appendChild(sp);
      var b = document.createElement("button"); b.type = "button"; b.textContent = "Sign out"; b.onclick = function () { signOut("button"); }; bar.appendChild(b);
      document.body.insertBefore(bar, document.body.firstChild);
    };
    if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
  }

  function startSigned() {
    showBar(); fillFields();
    try { new MutationObserver(scheduleFill).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    document.addEventListener("DOMContentLoaded", fillFields);
    window.addEventListener("load", function () { fillFields(); setTimeout(fillFields, 600); });
    setInterval(function () { var s = session(); if (!s) signOut("12 hours"); }, 60000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && !session()) signOut("12 hours"); });
    window.dispatchEvent(new CustomEvent("birkhill-login", { detail: { name: current } }));
    // still on the list? (Vijay may have removed this person since the phone signed in)
    loadStaff().then(function (s) { if (s && Array.isArray(s.staff) && s.staff.length && !findPerson(s, current)) signOut("removed"); });
  }

  window.BirkhillLogin = { name: function () { return current; }, signOut: signOut, pbkdf2: pbkdf2, makeCred: makeCred, hmac: hmac, loadStaff: loadStaff, send: send,
    activeNames: activeNames, findPerson: findPerson, overrideKey: OVERRIDE_KEY, londonISO: londonISO, norm: norm, same: same, base: BASE };

  if (nogate) return;
  var s = session();
  if (s) { applyName(s.name); startSigned(); }
  else {
    // hide the app until someone signs in
    var hide = document.createElement("style"); hide.id = "bk-hide"; hide.textContent = "body{visibility:hidden!important}"; document.documentElement.appendChild(hide);
    var start = function () { showLogin(function () { var h = document.getElementById("bk-hide"); if (h) h.remove(); startSigned(); }); };
    start();
  }
})();
