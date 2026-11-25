/* Birkhill apps: visible Add to Home Screen button.
   Does not read or change the data key (#k=). The key is already stored
   on this phone after the first open, so a home-screen launch still works. */
(function () {
  if (window.__bkAddToHome) return;
  window.__bkAddToHome = true;

  function isStandalone() {
    try {
      if (window.navigator.standalone === true) return true;
      if (window.matchMedia) {
        if (window.matchMedia("(display-mode: standalone)").matches) return true;
        if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
        if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
      }
    } catch (e) {}
    return false;
  }

  function isIos() {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  function isIosSafari() {
    if (!isIos()) return false;
    var ua = navigator.userAgent || "";
    return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser|Chrome|Android/.test(ua);
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var btn = document.getElementById("bkAddToHomeBtn");
    if (btn) btn.style.display = "";
  });
  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    hide();
  });

  function hide() {
    var bar = document.getElementById("bkAddToHomeBar");
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    var oldBtn = document.getElementById("installBtn");
    var oldHint = document.getElementById("installHint");
    if (oldBtn) oldBtn.style.display = "none";
    if (oldHint) oldHint.style.display = "none";
  }

  function closeModal() {
    var m = document.getElementById("bkAddToHomeModal");
    if (m && m.parentNode) m.parentNode.removeChild(m);
    var btn = document.getElementById("bkAddToHomeBtn");
    if (btn) btn.focus();
  }

  function pageUrl() {
    return location.origin + location.pathname + location.search;
  }

  function showModal(title, lines, showCopy) {
    closeModal();
    var overlay = document.createElement("div");
    overlay.id = "bkAddToHomeModal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "bkAddToHomeTitle");
    var box = document.createElement("div");
    box.className = "bk-ath-box";
    var h = document.createElement("h2");
    h.id = "bkAddToHomeTitle";
    h.textContent = title;
    box.appendChild(h);
    lines.forEach(function (t) {
      var p = document.createElement("p");
      p.textContent = t;
      box.appendChild(p);
    });
    if (showCopy) {
      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "bk-ath-copy";
      copyBtn.textContent = "Copy the address";
      copyBtn.addEventListener("click", function () {
        var url = pageUrl();
        function ok() { copyBtn.textContent = "Address copied"; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(ok).catch(function () {
            window.prompt("Copy this address", url);
          });
        } else {
          window.prompt("Copy this address", url);
        }
      });
      box.appendChild(copyBtn);
    }
    var close = document.createElement("button");
    close.type = "button";
    close.className = "bk-ath-close";
    close.textContent = "Close";
    close.addEventListener("click", closeModal);
    box.appendChild(close);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
    document.body.appendChild(overlay);
    close.focus();
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        closeModal();
      }
    });
  }

  function onClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      var p = deferredPrompt.userChoice;
      deferredPrompt = null;
      if (p && p.then) {
        p.then(function (choice) {
          if (choice && choice.outcome === "accepted") hide();
        }).catch(function () {});
      }
      return;
    }
    if (isIos() && isIosSafari()) {
      showModal("Add to Home Screen", [
        "1. Tap the Share button at the bottom of the screen. It is the square with an arrow pointing up.",
        "2. Scroll down and tap Add to Home Screen.",
        "3. Tap Add at the top right.",
        "The app icon will then appear on your home screen."
      ], false);
      return;
    }
    if (isIos()) {
      showModal("Open this page in Safari", [
        "Safari is the app with the compass icon. Adding to the home screen only works from Safari on iPhone.",
        "Copy the address, open Safari, paste it, then tap Share and Add to Home Screen."
      ], true);
      return;
    }
    showModal("Add to Home Screen", [
      "Tap the browser menu (the three dots), then tap Add to Home screen or Install app."
    ], false);
  }

  ready(function () {
    if (isStandalone()) {
      hide();
      return;
    }
    if (document.getElementById("bkAddToHomeBar")) return;

    if (!document.getElementById("bk-ath-style")) {
      var style = document.createElement("style");
      style.id = "bk-ath-style";
      style.textContent =
        "#bkAddToHomeBar{display:block;margin:10px 14px 0;max-width:640px;}" +
        "header + #bkAddToHomeBar{margin-top:10px;}" +
        "#bkAddToHomeBtn{display:block;width:100%;box-sizing:border-box;min-height:44px;padding:10px 14px;" +
        "border:0;border-radius:12px;background:#17643F;color:#fff;font:700 1rem/1.3 system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;" +
        "cursor:pointer;text-align:center;}" +
        "#bkAddToHomeBtn:focus{outline:2px solid #0f4a2e;outline-offset:2px;}" +
        "#bkAddToHomeModal{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);" +
        "display:flex;align-items:center;justify-content:center;padding:16px;}" +
        "#bkAddToHomeModal .bk-ath-box{background:#fff;color:#18342A;border-radius:16px;padding:18px 16px;max-width:420px;width:100%;" +
        "box-shadow:0 8px 24px rgba(0,0,0,.2);font:16px/1.45 system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;}" +
        "#bkAddToHomeModal h2{margin:0 0 10px;font-size:1.15rem;}" +
        "#bkAddToHomeModal p{margin:0 0 8px;}" +
        "#bkAddToHomeModal .bk-ath-close,#bkAddToHomeModal .bk-ath-copy{display:block;width:100%;box-sizing:border-box;margin-top:10px;" +
        "min-height:44px;border:0;border-radius:12px;font:700 1rem/1.3 system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;cursor:pointer;}" +
        "#bkAddToHomeModal .bk-ath-copy{background:#e8f2ec;color:#17643F;}" +
        "#bkAddToHomeModal .bk-ath-close{background:#17643F;color:#fff;}";
      document.head.appendChild(style);
    }

    var bar = document.createElement("div");
    bar.id = "bkAddToHomeBar";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "bkAddToHomeBtn";
    btn.textContent = "Add to Home Screen";
    btn.addEventListener("click", onClick);
    bar.appendChild(btn);

    var header = document.querySelector("header");
    if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
    else if (document.body.firstChild) document.body.insertBefore(bar, document.body.firstChild);
    else document.body.appendChild(bar);

    var oldBtn = document.getElementById("installBtn");
    var oldHint = document.getElementById("installHint");
    if (oldBtn) oldBtn.style.display = "none";
    if (oldHint) oldHint.style.display = "none";
  });
})();
