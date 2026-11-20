/* Added to each sub-app by build.py: Home button, ?open=buttonId,... deep links, shared staff name. */
(function () {
  var STAFF = "birkhill-staff-name";
  function staff() { try { return localStorage.getItem(STAFF) || ""; } catch (e) { return ""; } }
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }
  var APPS = [["../", "\u2302", "Home"], ["../paper/", "\ud83d\udcf0", "Papers"], ["../chiller/", "\ud83e\uddca", "Chiller"], ["../date/", "\ud83d\udcf7", "Date"], ["../count/", "\ud83d\udccb", "Count"], ["../shelf/", "\ud83c\udff7\ufe0f", "Shelf"]];
  ready(function () {
    var here = location.pathname.replace(/index\.html$/, "");
    if (/\/count\/$/.test(here)) return;   // Stock Count has its own bottom bar
    var h1 = document.querySelector("h1");
    if (h1 && !document.querySelector(".bk-logo")) {
      var img = document.createElement("img"); img.src = "../logo.png"; img.alt = "Birkhill Stores"; img.className = "bk-logo";
      h1.parentNode.insertBefore(img, h1);
    }
    var nav = document.createElement("nav"); nav.className = "bk-nav"; nav.style.gridTemplateColumns = "repeat(" + APPS.length + ", 1fr)"; nav.setAttribute("aria-label", "Birkhill apps");
    APPS.forEach(function (a) {
      var el = document.createElement("a"); el.href = a[0];
      var seg = a[0].replace("../", "");
      if (seg && here.indexOf("/" + seg) >= 0) el.className = "on";
      el.innerHTML = "<span class='i'>" + a[1] + "</span><span>" + a[2] + "</span>";
      if (a[2] === "Home") el.setAttribute("aria-label", "Back to Birkhill home");
      nav.appendChild(el);
    });
    document.body.appendChild(nav); document.body.classList.add("bk-has-nav");
  });
  window.addEventListener("load", function () {
    setTimeout(function () {
      var open = new URLSearchParams(location.search).get("open");
      if (open) open.split(",").forEach(function (id) { var b = document.getElementById(id.trim()); if (b) b.click(); });
      var name = staff();
      if (name) {
        ["checkedBy", "wasteCheckedBy", "stockInCheckedBy", "wastageCheckedBy"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el && !el.value.trim()) { el.value = name; el.dispatchEvent(new Event("input", { bubbles: true })); }
        });
      }
    }, 350);
  });
})();
