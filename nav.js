/* Added to each sub-app by build.py: Home button, ?open=buttonId,... deep links, shared staff name. */
(function () {
  var STAFF = "birkhill-staff-name";
  function staff() { try { return localStorage.getItem(STAFF) || ""; } catch (e) { return ""; } }
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    var a = document.createElement("a");
    a.href = "../"; a.textContent = "\u2302 Home"; a.setAttribute("aria-label", "Back to Birkhill home");
    a.style.cssText = "position:fixed;left:10px;bottom:14px;z-index:9999;background:#0d47a1;color:#fff;padding:10px 14px;border-radius:22px;font:600 15px system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    document.body.appendChild(a);
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
