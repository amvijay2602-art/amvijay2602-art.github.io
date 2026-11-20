/* Shared "Scanned items" list for Birkhill phone apps. */
(function (w) {
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function digits(raw) {
    return String(raw || "").replace(/\D/g, "");
  }

  function money(n) {
    if (n === null || n === undefined || n === "") return "";
    var v = Number(n);
    if (isNaN(v)) return "";
    return "£" + v.toFixed(2);
  }

  function unique(arr) {
    var out = [];
    arr.forEach(function (u) {
      if (u && out.indexOf(u) < 0) out.push(u);
    });
    return out;
  }

  function pictureCandidates(barcode, hint) {
    var urls = [];
    if (hint) {
      urls.push(String(hint).indexOf("/") >= 0 ? String(hint) : ("img/" + hint));
    }
    var d = digits(barcode);
    var codes = [];
    if (d) {
      codes.push(d);
      if (d.length < 13) codes.push(("0000000000000" + d).slice(-13));
      if (d.length > 13) codes.push(d.slice(0, 13));
      var stripped = d.replace(/^0+/, "");
      if (stripped && stripped !== d) codes.push(stripped);
    }
    var bases = ["img/", "../count/img/", "/count/img/"];
    codes.forEach(function (c) {
      bases.forEach(function (b) {
        urls.push(b + c + ".jpg");
      });
    });
    return unique(urls);
  }

  function thumbHtml(barcode, hint) {
    var urls = pictureCandidates(barcode, hint);
    if (!urls.length) return '<div class="bk-scan-thumb is-empty" aria-hidden="true"></div>';
    return '<div class="bk-scan-thumb"><img alt="" src="' + esc(urls[0]) + '" data-cands="' + esc(urls.join("|")) + '"></div>';
  }

  function bindThumbs(root) {
    if (!root) return;
    var imgs = root.querySelectorAll(".bk-scan-thumb img");
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        var cands = (img.getAttribute("data-cands") || "").split("|").filter(Boolean);
        var ix = Math.max(0, cands.indexOf(img.getAttribute("src")));
        img.addEventListener("error", function () {
          ix += 1;
          if (ix < cands.length) {
            img.src = cands[ix];
          } else {
            img.style.display = "none";
            if (img.parentNode) img.parentNode.classList.add("is-empty");
          }
        });
      })(imgs[i]);
    }
  }

  function totalsText(items, qtyFn) {
    var lines = items.length;
    var units = 0;
    items.forEach(function (it) {
      var q = qtyFn ? qtyFn(it) : Number(it.qty);
      units += isNaN(q) ? 0 : q;
    });
    return lines + (lines === 1 ? " line" : " lines") + "  ·  " +
      units + (units === 1 ? " unit" : " units");
  }

  function render(opts) {
    var root = opts.root;
    if (!root) return;
    var items = (opts.items || []).slice();
    if (opts.newestFirst && !opts.alreadyNewest) items = items.reverse();
    var emptyEl = opts.emptyEl || null;
    var totalsEl = opts.totalsEl || root.querySelector(".bk-scan-totals");
    var listEl = opts.listEl || root.querySelector(".bk-scan-list");
    if (!listEl) {
      listEl = document.createElement("ul");
      listEl.className = "bk-scan-list";
      root.appendChild(listEl);
    }
    listEl.innerHTML = "";
    var qtyOf = opts.qty || function (it) { return Number(it.qty) || 0; };
    if (totalsEl) {
      totalsEl.textContent = items.length ? (opts.totals ? opts.totals(items) : totalsText(items, qtyOf)) : "";
      totalsEl.classList.toggle("hidden", items.length === 0);
    }
    if (emptyEl) emptyEl.classList.toggle("hidden", items.length > 0);
    items.forEach(function (item, visIndex) {
      var srcIndex = opts.newestFirst && !opts.alreadyNewest ? (opts.items.length - 1 - visIndex) : visIndex;
      if (opts.alreadyNewest) srcIndex = visIndex;
      var name = opts.name ? opts.name(item) : (item.name || "Unknown");
      var barcode = opts.barcode ? opts.barcode(item) : (item.barcode || "");
      var price = opts.price ? opts.price(item) : item.price;
      var qty = qtyOf(item);
      var hint = opts.picture ? opts.picture(item) : (item.picture || item.img || "");
      var extra = opts.extra ? opts.extra(item) : (item.extra || "");
      var priceText = money(price);
      var li = document.createElement("li");
      li.innerHTML =
        '<div class="bk-scan-row">' +
          thumbHtml(barcode, hint) +
          '<div class="bk-scan-body">' +
            '<div class="bk-scan-name"></div>' +
            (barcode ? '<div class="bk-scan-meta"></div>' : "") +
            (priceText ? '<div class="bk-scan-price"></div>' : "") +
            (extra ? '<div class="bk-scan-extra"></div>' : "") +
            '<div class="bk-scan-actions">' +
              (opts.hidePlusMinus ? "" :
                '<button class="bk-qty-btn minus" type="button" aria-label="Decrease quantity">-</button>' +
                '<span class="bk-scan-qty"></span>' +
                '<button class="bk-qty-btn plus" type="button" aria-label="Increase quantity">+</button>') +
              (opts.hidePlusMinus ? '<span class="bk-scan-qty"></span>' : "") +
              '<button class="bk-scan-remove" type="button">' + esc(opts.removeLabel || "Remove") + "</button>" +
            "</div>" +
          "</div>" +
        "</div>";
      li.querySelector(".bk-scan-name").textContent = name;
      var meta = li.querySelector(".bk-scan-meta");
      if (meta) meta.textContent = "Barcode " + barcode;
      var priceEl = li.querySelector(".bk-scan-price");
      if (priceEl) priceEl.textContent = "Till price " + priceText;
      var extraEl = li.querySelector(".bk-scan-extra");
      if (extraEl) extraEl.textContent = extra;
      var qtyEl = li.querySelector(".bk-scan-qty");
      if (qtyEl) qtyEl.textContent = String(qty);
      var minus = li.querySelector(".minus");
      var plus = li.querySelector(".plus");
      var remove = li.querySelector(".bk-scan-remove");
      if (minus && opts.onMinus) minus.addEventListener("click", function () { opts.onMinus(item, srcIndex); });
      if (plus && opts.onPlus) plus.addEventListener("click", function () { opts.onPlus(item, srcIndex); });
      if (opts.onOpen) {
        li.querySelector(".bk-scan-name").style.cursor = "pointer";
        li.querySelector(".bk-scan-name").addEventListener("click", function () { opts.onOpen(item, srcIndex); });
      }
      if (remove) {
        remove.addEventListener("click", function () {
          var label = name || "this item";
          var msg = opts.confirmMsg ? opts.confirmMsg(item) : ("Remove " + label + " from the scanned list?");
          if (opts.confirmRemove === false) {
            if (opts.onRemove) opts.onRemove(item, srcIndex);
            return;
          }
          if (!w.confirm(msg)) return;
          if (opts.onRemove) opts.onRemove(item, srcIndex);
        });
      }
      listEl.appendChild(li);
    });
    bindThumbs(listEl);
  }

  w.BirkhillScannedList = {
    money: money,
    digits: digits,
    thumbHtml: thumbHtml,
    bindThumbs: bindThumbs,
    pictureCandidates: pictureCandidates,
    totalsText: totalsText,
    render: render
  };
})(window);
