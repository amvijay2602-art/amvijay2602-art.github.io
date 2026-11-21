/* Birkhill invoice reader: turns invoice text (PDF text layer or OCR) into lines.
   Shared by the phone (Invoice Scanner) and the box (node invoice_cli.js), so both read invoices the same way.
   Rule: never invent a cost, barcode or VAT rate. Anything not read clearly is left blank and flagged. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(); else root.BHInvoice = factory();
})(this, function () {
  "use strict";
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.015 : tol); }

  // ---------- text from a PDF text layer (pdf.js items) laid out like pdftotext -layout
  function layoutPage(items, charW) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || 8;
      var r = null;
      for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) <= h * 0.45) { r = rows[i]; break; }
      if (!r) { r = { y: y, items: [] }; rows.push(r); }
      r.items.push({ x: x, w: it.width || it.str.length * h * 0.5, s: it.str, h: h });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.items.sort(function (a, b) { return a.x - b.x; });
      var out = "", end = 0;
      r.items.forEach(function (it) {
        var cw = charW || it.h * 0.5, col = Math.round(it.x / cw);
        var gap = col - end;
        if (out) out += gap >= 2 ? new Array(gap + 1).join(" ") : " ";
        else out += new Array(Math.max(0, col) + 1).join(" ");
        out += it.s; end = Math.max(col, end) + it.s.length;
        if (it.w) end = Math.max(end, Math.round((it.x + it.w) / cw));
      });
      return out.replace(/\s+$/, "");
    }).join("\n");
  }

  // ---------- OCR clean up helpers
  function fixNum(tok) {   // repair common OCR slips inside a number token
    if (tok == null) return "";
    var t = String(tok).trim().replace(/^[£$E]/, "").replace(/(\d)[PpdD]+$/, "$1").replace(/,/g, ".").replace(/:/g, ".");
    t = t.replace(/[Oo]/g, "0").replace(/[Il|!i]/g, "1").replace(/[Ss]/g, "5").replace(/B/g, "8");
    return t;
  }
  function money(tok) {    // a price printed with 2 decimals; OCR may drop the point ("499" for 4.99)
    var t = fixNum(tok);
    if (/^\d+\.\d{2}$/.test(t)) return parseFloat(t);
    if (/^\d+\.\d{2}00$/.test(t)) return parseFloat(t.slice(0, -2));   // Dhamecha sometimes prints 4 decimals ("11.9900")
    if (/^\d+\.\d$/.test(t)) return null;
    if (/^\d{3,}$/.test(t)) return { nodot: parseInt(t, 10) / 100 };
    return null;
  }
  function intTok(tok) { var t = fixNum(tok); return /^\d{1,4}$/.test(t) ? parseInt(t, 10) : null; }
  function isoDate(d, m, y) { y = parseInt(y, 10); if (y < 100) y += 2000; d = parseInt(d, 10); m = parseInt(m, 10); if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && y > 2000)) return ""; return y + "-" + pad(m) + "-" + pad(d); }
  function vatLetter(tok) {   // returns {c: letter, sure: bool}
    var t = String(tok || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), hits = [];
    if (/^(A|B|Z|ZZ|AA)$/.test(t)) return { c: t[0], sure: true };
    ["A", "B", "Z"].forEach(function (c) { if (t.indexOf(c) >= 0) hits.push(c); });
    return hits.length === 1 ? { c: hits[0], sure: false, raw: tok } : { c: "", sure: false };
  }

  // ---------- supplier detection
  function detectSupplier(text) {
    var t = text.toLowerCase();
    if (/dhamecha|dmart\)|bull close road/.test(t)) return "SUP-002";
    if (/eden[\s-]*farm|eden-farm|drop shipment|bir90[23]/.test(t)) return "SUP-005";
    if (/unique\s+dairies/.test(t)) return "SUP-003";
    if (/country\s+choice/.test(t)) return "SUP-004";
    if (/parfett/.test(t)) return "SUP-001";
    return "";
  }

  // ---------- Dhamecha (cash and carry till invoice)
  function parseDhamecha(text) {
    var res = { supplier: "Dhamecha", inv_no: "", date: "", lines: [], warnings: [], totals: {}, pages: {} };
    var m = /INVOICE[:;\s]*([0-9OoIl]{5,7})/i.exec(text); if (m) res.inv_no = fixNum(m[1]);
    m = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i.exec(text);
    if (m) res.date = isoDate(m[1], MONTHS[m[2].slice(0, 3).toLowerCase()], m[3]);
    m = /Sub\s*Total[:;]?\s*£?\s*([\d.,]+)/i.exec(text) || /Total\s*Goods[:;]?\s*£?\s*([\d.,]+)/i.exec(text); if (m) res.totals.goods = parseFloat(fixNum(m[1]));
    m = /Total\s*incl\s*VAT[:;]?\s*£?\s*([\d.,]+)/i.exec(text); if (m) res.totals.total = parseFloat(fixNum(m[1]));
    m = /Page\s+(\d+)\s+of\s+(\d+)/gi; var pg; while ((pg = m.exec(text))) { res.pages[pg[1]] = 1; res.pages.of = parseInt(pg[2], 10); }
    var raw = text.split(/\r?\n/);
    raw.forEach(function (ln, i) {
      var toks = ln.trim().split(/\s+/);
      if (toks.length < 6) return;
      var code = fixNum(toks[0]);
      if (!/^\d{5,6}$/.test(code)) return;
      if (/^(Item|Code)$/i.test(toks[1] || "")) return;
      var flags = [], vl = vatLetter(toks[toks.length - 1]), vat = vl.c, end = toks.length - 1;
      if (!vat) flags.push("VAT code not read"); else if (!vl.sure) flags.push("VAT code unclear (read '" + vl.raw + "'), check");
      var porIdx = -1; for (var k = end - 1; k > 0; k--) if (/%/.test(toks[k])) { porIdx = k; break; }
      var dash = -1; for (k = 1; k < toks.length; k++) if (toks[k] === "-" || toks[k] === "\u2014" || toks[k] === "\u2013") { dash = k; break; }
      var tail, descToks;
      if (dash > 0) { tail = toks.slice(dash + 1, porIdx > dash ? porIdx : end); descToks = toks.slice(1, dash); }
      else { var stop = porIdx > 0 ? porIdx : end; tail = toks.slice(Math.max(1, stop - 5), stop); descToks = toks.slice(1, Math.max(1, stop - 5)); }
      // tail = UOS, Qty, Price, Ext, RRP
      var uos = intTok(tail[0]), qty = intTok(tail[1]), price = money(tail[2]), ext = money(tail[3]);
      if (price && price.nodot != null) price = (ext != null && typeof ext === "number" && qty && near(price.nodot * qty, ext)) ? price.nodot : price.nodot;
      if (ext && ext.nodot != null) ext = ext.nodot;
      if (qty == null && typeof price === "number" && typeof ext === "number" && price > 0) {
        var qq = ext / price; if (Math.abs(qq - Math.round(qq)) < 0.01 && Math.round(qq) > 0) { qty = Math.round(qq); flags.push("Quantity worked out from the line value (OCR)"); }
      }
      if (qty == null) flags.push("Quantity not read");
      if (uos == null) flags.push("Case size (UOS) not read");
      if (typeof price !== "number") { price = null; flags.push("Cost not read"); }
      if (typeof ext === "number" && price != null && qty != null && !near(price * qty, ext, 0.02)) flags.push("Qty x price does not equal the line value, check");
      var size = "";
      var lastT = descToks[descToks.length - 1] || "";
      if ((descToks.length > 1 && /(\d|ml|g|kg|ltr|cl|pk)\)?$/i.test(lastT)) || /^\d+(\.\d+)?(ml|g|kg|ltr|l|cl)$/i.test(lastT)) size = descToks.pop();
      var desc = descToks.join(" ");
      if (!desc) {   // wrapped description printed above and below
        var up = (raw[i - 1] || "").trim(), dn = (raw[i + 1] || "").trim();
        desc = ((/^\d{5,6}\s|T&S/.test(up) ? "" : up) + " " + (/^\d{5,6}\s|T&S|Trolley/.test(dn) ? "" : dn)).trim();
      }
      res.lines.push({ row: i, code: code, desc: desc, size: size, upc: uos, qty: qty, case_cost: price, value: typeof ext === "number" ? ext : null,
        vat: vat ? { A: "20", B: "5", Z: "0" }[vat] : "", vat_code: vat, flags: flags });
    });
    // OCR slip in an item code: same description, case size and cost, code one digit apart -> same item
    function oneOff(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d === 1; }
    res.lines.forEach(function (l, i) { res.lines.slice(0, i).forEach(function (o) { if (o.code !== l.code && oneOff(o.code, l.code) && o.case_cost === l.case_cost && l.case_cost != null && (o.upc === l.upc || o.upc == null || l.upc == null)) { l.flags.push("Item code read as " + l.code + " on one row, treated as " + o.code); l.code = o.code; } }); });
    // a misread price on one row: if line value / qty gives the price another row of the same item shows, use it
    res.lines.forEach(function (l) {
      if (l.qty && l.value != null && l.case_cost != null && !near(l.qty * l.case_cost, l.value, 0.02)) {
        var alt = r2(l.value / l.qty);
        if (res.lines.some(function (o) { return o !== l && o.code === l.code && o.case_cost === alt; })) { l.case_cost = alt; l.flags = l.flags.filter(function (f) { return !/does not equal/.test(f); }); l.flags.push("Price misread on one row, corrected from its line value (same as the other rows)"); }
      }
    });
    // Dhamecha prints one row per scan: add up repeated item codes; fill a field another row of the same item shows clearly
    var by = {}, out = [];
    res.lines.forEach(function (l) {
      var k = l.code + "|" + l.case_cost, o = by[k];
      if (!o) { l.rows = 1; by[k] = l; out.push(l); return; }
      o.rows += 1;
      if (o.upc == null && l.upc != null) o.upc = l.upc;
      if (l.vat_code && o.vat_code && l.vat_code !== o.vat_code) o.flags.push("Rows for this item show different VAT codes (" + o.vat_code + " and " + l.vat_code + "), check");
      if (!o.vat_code && l.vat_code) { o.vat_code = l.vat_code; o.vat = l.vat; }
      if (o.qty != null && l.qty != null) o.qty += l.qty; else { o.qty = null; }
      o.value = r2((o.value || 0) + (l.value || 0));
      l.flags.forEach(function (f) { if (o.flags.indexOf(f) < 0) o.flags.push(f); });
    });
    out.forEach(function (o) {
      if (o.qty == null && o.case_cost && o.value) { var qq = o.value / o.case_cost; if (Math.abs(qq - Math.round(qq)) < 0.01) { o.qty = Math.round(qq); o.flags = o.flags.filter(function (f) { return f !== "Quantity not read"; }); if (o.flags.indexOf("Quantity worked out from the line value (OCR)") < 0) o.flags.push("Quantity worked out from the line value (OCR)"); } }
      if (o.upc != null) o.flags = o.flags.filter(function (f) { return f !== "Case size (UOS) not read"; });
      if (o.vat_code && o.flags.some(function (f) { return f === "VAT code not read"; })) o.flags = o.flags.filter(function (f) { return f !== "VAT code not read"; });
    });
    // Promotions ("T&S:HL... BUY 1 GET 2nd FREE  -7.69") printed among the items; the same lines are repeated in a summary after
    // the "Trolley:" line, which is ignored. Each one comes off the item it names (word match), else the item printed just above it.
    var trolley = raw.length; raw.some(function (ln, i) { if (/Trolley\s*:/i.test(ln)) { trolley = i; return true; } return false; });
    res.promos = [];
    raw.slice(0, trolley).forEach(function (ln, i) {
      var pm = /T\s*&\s*S\s*:?\s*(\S+)\s+(.*?)\s+-\s*£?(\d+[.,]\d{2})\s*$/.exec(ln); if (!pm) return;
      var amt = parseFloat(fixNum(pm[3])), txt = pm[2], pw = txt.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (w) { return w.length >= 4 && !/^(free|with|buy|from|only)$/.test(w); });
      var best = null, bs = 0;
      out.forEach(function (o) { var dw = o.desc.toLowerCase(), sc = pw.filter(function (w) { return dw.indexOf(w.slice(0, 4)) >= 0; }).length; if (sc > bs) { bs = sc; best = o; } });
      var how = "named in the promotion";
      if (!best) { var above = null; res.lines.forEach(function (l) { if (l.row < i) above = l; }); if (above) best = out.filter(function (o) { return o.code === above.code; })[0]; how = "printed above it"; }
      res.promos.push({ code: pm[1], text: txt, amount: amt, item: best ? best.code : "" });
      if (!best || !best.qty || best.case_cost == null) { res.warnings.push("Promotion " + pm[1] + " (-£" + amt.toFixed(2) + ") could not be put on an item, check"); return; }
      best.discount = r2((best.discount || 0) + amt);
      if (best.list_case_cost == null) best.list_case_cost = best.case_cost;
      best.value = r2((best.value || 0) - amt);
      best.case_cost = r2(best.value / best.qty);
      best.flags = best.flags.filter(function (f) { return !/^Promotion/.test(f); });
      best.flags.push("Promotion -£" + best.discount.toFixed(2) + " taken off (" + how + "): net £" + best.case_cost.toFixed(2) + " a case, list £" + best.list_case_cost.toFixed(2));
    });
    out.forEach(function (o) { delete o.row; });
    // VAT analysis box: goods per VAT code must match the lines
    var va = {}, vm, vr = /^\s*(\S{1,3})\s+(\d{1,2})\s+£?\s*([\d.,]+)\s+£?\s*\S+\s*/gm;
    while ((vm = vr.exec(text))) { var vl2 = vatLetter(vm[1]); if (vl2.c && /^(0|5|20)$/.test(vm[2])) va[vl2.c] = parseFloat(fixNum(vm[3])); }
    if (Object.keys(va).length) {
      function sumsOf() { var t = {}; out.forEach(function (o) { if (o.vat_code) t[o.vat_code] = r2((t[o.vat_code] || 0) + (o.value || 0)); }); return t; }
      function agrees(t) { return ["A", "B", "Z"].every(function (c) { return va[c] == null || near(t[c] || 0, va[c], 0.05); }); }
      if (!agrees(sumsOf())) {
        // try moving one unclear line to another code: if exactly one move makes the VAT box agree, use it (and say so)
        var unsure = out.filter(function (o) { return o.flags.some(function (f) { return /VAT code (unclear|not read)|different VAT codes/.test(f); }); }), fixes = [];
        unsure.forEach(function (o) { ["A", "B", "Z"].forEach(function (c) { if (c === o.vat_code) return; var keep = o.vat_code; o.vat_code = c; if (agrees(sumsOf())) fixes.push([o, c]); o.vat_code = keep; }); });
        if (fixes.length === 1) { var f0 = fixes[0][0]; f0.vat_code = fixes[0][1]; f0.vat = { A: "20", B: "5", Z: "0" }[fixes[0][1]]; f0.flags.push("VAT code set to " + fixes[0][1] + " because only then the invoice VAT box adds up, check"); }
        else {
          var bad = sumsOf();
          ["A", "B", "Z"].forEach(function (c) { if (va[c] != null && !near(bad[c] || 0, va[c], 0.05)) res.warnings.push("VAT check: lines on code " + c + " add up to £" + (bad[c] || 0).toFixed(2) + ", invoice VAT box says £" + va[c].toFixed(2)); });
          (unsure.length ? unsure : out).forEach(function (o) { o.vat = ""; o.flags.push("VAT box does not agree, VAT left blank: type it from the invoice"); });
        }
      }
      res.vat_box = va;
    }
    res.lines = out;
    return res;
  }

  // ---------- Eden Farm (invoiced through A G Parfett drop shipment)
  function parseEden(text) {
    var res = { supplier: "Eden Farm", inv_no: "", date: "", account: "", lines: [], warnings: [], totals: {}, pages: {} };
    var m = /\b([0-9OoIl]{6})\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/.exec(text);
    if (m) { res.inv_no = fixNum(m[1]); res.date = isoDate(m[2], m[3], m[4]); }
    m = /\b(BIR9\d\d)\b/.exec(text); if (m) res.account = m[1];
    var pg, re = /\b(\d{1,2})\s+of\s+(\d{1,2})\s*$/gm; while ((pg = re.exec(text))) { res.pages[pg[1]] = 1; res.pages.of = parseInt(pg[2], 10); }
    m = /([\d.,]+)\s+Total\s+Ex\s+VAT/i.exec(text); if (m) res.totals.goods = parseFloat(fixNum(m[1]));
    m = /([\d.,]+)\s+VAT\s+Amount/i.exec(text); if (m) res.totals.vat = parseFloat(fixNum(m[1]));
    m = /([\d.,]+)\s+Total\s+Amount/i.exec(text); if (m) res.totals.total = parseFloat(fixNum(m[1]));
    var rates = [], rr = /(\d{1,2}[.,]\d{2})\s*%\s+£?([\d.,]+)\s+£?([\d.,]+)/g;
    while ((m = rr.exec(text))) rates.push({ rate: parseFloat(fixNum(m[1])), value: parseFloat(fixNum(m[2])) });
    text.split(/\r?\n/).forEach(function (ln) {
      var toks = ln.trim().split(/\s+/);
      if (toks.length < 7) return;
      var code = fixNum(toks[0]);
      if (!/^\d{4,6}$/.test(code)) return;
      var flags = [], vc = fixNum(toks[toks.length - 1]);
      if (!/^\d$/.test(vc)) { vc = ""; flags.push("VAT code not read"); }
      var rrp = money(toks[toks.length - 2]), value = money(toks[toks.length - 3]), price = money(toks[toks.length - 4]);
      if (value && value.nodot != null) value = value.nodot;
      if (price && price.nodot != null) price = price.nodot;
      var mid = toks.slice(1, toks.length - 4).join(" ");
      var mm = /^(.*?)\s+(\S+)\s+(\S+?)\s*[xX×]\s*(\S*)$/.exec(mid) || /^(.*?)\s+(\S+)\s+(\S+?)[xX×](\S*)$/.exec(mid);
      var desc = mid, qty = null, upc = null, unit = "";
      if (mm) { desc = mm[1]; qty = intTok(mm[2]); upc = intTok(mm[3]); unit = mm[4]; }
      if (qty == null && typeof price === "number" && typeof value === "number" && price > 0) {
        var qq = value / price; if (Math.abs(qq - Math.round(qq)) < 0.01 && Math.round(qq) > 0) { qty = Math.round(qq); flags.push("Quantity worked out from the line value (OCR)"); }
      }
      if (qty == null) flags.push("Quantity not read");
      if (upc == null) flags.push("Case size not read");
      if (typeof price !== "number") { price = null; flags.push("Cost not read"); }
      if (typeof value === "number" && price != null && qty != null && !near(price * qty, value, 0.02)) flags.push("Qty x price does not equal the line value, check");
      if (typeof value !== "number" && price != null && qty != null) { value = r2(price * qty); flags.push("Line value not read, worked out as qty x price"); }
      res.lines.push({ code: code, desc: desc, size: (upc != null ? upc + " x " : "") + unit, upc: upc, qty: qty, case_cost: price, value: typeof value === "number" ? value : null, vat: "", vat_code: vc, flags: flags });
    });
    // VAT code -> rate from the VAT Analysis box (never assumed)
    var sums = {}; res.lines.forEach(function (l) { if (l.vat_code) sums[l.vat_code] = r2((sums[l.vat_code] || 0) + (l.value || 0)); });
    var map = {}, codes = Object.keys(sums);
    codes.forEach(function (c) { rates.forEach(function (r) { if (near(sums[c], r.value, 0.05)) map[c] = String(Math.round(r.rate)); }); });
    var freeC = codes.filter(function (c) { return map[c] == null; }), usedR = {}; Object.keys(map).forEach(function (c) { usedR[map[c]] = 1; });
    var freeR = rates.filter(function (r) { return !usedR[String(Math.round(r.rate))]; });
    if (freeC.length === 1 && freeR.length === 1 && codes.length > 1) { map[freeC[0]] = String(Math.round(freeR[0].rate)); res.warnings.push("VAT code " + freeC[0] + " matched to " + map[freeC[0]] + "% by elimination (its lines do not add up exactly to the VAT box), check the lines marked"); }
    if (codes.length === 1 && rates.length === 1 && !map[codes[0]]) { map[codes[0]] = String(Math.round(rates[0].rate)); res.warnings.push("VAT code " + codes[0] + " taken from the only VAT rate on the invoice; line values do not add up exactly, check"); }
    res.lines.forEach(function (l) { if (l.vat_code && map[l.vat_code] != null) l.vat = map[l.vat_code]; else if (l.vat_code) l.flags.push("VAT rate for code " + l.vat_code + " not found in the VAT analysis"); });
    res.vat_map = map;
    return res;
  }

  // ---------- anything else (Unique Dairies, Country Choice, delivery notes): best effort, everything flagged
  function parseGeneric(text) {
    var res = { supplier: "", inv_no: "", date: "", lines: [], warnings: ["Unknown invoice layout: every line needs checking"], totals: {}, pages: {} };
    var m = /(?:invoice|delivery\s*note|inv)\s*(?:no\.?|number|#)?\s*[:.]?\s*([A-Z]{0,3}[0-9]{4,9})/i.exec(text); if (m) res.inv_no = m[1];
    m = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/.exec(text); if (m) res.date = isoDate(m[1], m[2], m[3]);
    text.split(/\r?\n/).forEach(function (ln) {
      var toks = ln.trim().split(/\s+/); if (toks.length < 3) return;
      var bc = "", nums = [], words = [];
      toks.forEach(function (t) {
        var f = fixNum(t);
        if (/^\d{8}$|^\d{12,14}$/.test(f) && !bc) bc = f;
        else if (/^\d+(\.\d{1,2})?$/.test(f) && /\d/.test(t)) nums.push(f);
        else words.push(t);
      });
      if (!words.length || nums.length < 2) return;
      var withDot = nums.filter(function (n) { return /\.\d{2}$/.test(n); });
      var ints = nums.filter(function (n) { return /^\d{1,3}$/.test(n); });
      var qty = ints.length ? parseInt(ints[0], 10) : null, price = withDot.length ? parseFloat(withDot[0]) : null, value = withDot.length > 1 ? parseFloat(withDot[withDot.length - 1]) : null;
      var flags = ["Read from an unknown layout, check every field"];
      if (price != null && qty != null && value != null && !near(price * qty, value, 0.02)) { flags.push("Cost not clear"); price = null; }
      if (price == null) flags.push("Cost not read");
      res.lines.push({ code: "", bc: bc, desc: words.join(" "), size: "", upc: null, qty: qty, case_cost: price, value: value, vat: "", vat_code: "", flags: flags.concat(["VAT not on this layout"]) });
    });
    return res;
  }

  function splitInvoices(text) {   // [{inv_no, text}] in file order; one entry when the file holds one invoice
    var pages = String(text).split("\f"), groups = [], cur = null;
    pages.forEach(function (pg) {
      var m = /INVOICE[:;\s]*([0-9OoIl]{5,7})/i.exec(pg), no = m ? fixNum(m[1]) : "";
      if (!pg.trim()) return;
      if (no && (!cur || cur.inv_no !== no)) { cur = { inv_no: no, text: "" }; groups.push(cur); }
      if (!cur) { cur = { inv_no: "", text: "" }; groups.push(cur); }
      cur.text += (cur.text ? "\f" : "") + pg;
    });
    return groups.length ? groups : [{ inv_no: "", text: text }];
  }
  function parse(text, sidHint) {
    var sid = sidHint || detectSupplier(text), r;
    if (sid === "SUP-002") r = parseDhamecha(text);
    else if (sid === "SUP-005") r = parseEden(text);
    else r = parseGeneric(text);
    r.sid = sid; r.detected = detectSupplier(text);
    // totals and page checks
    var sum = 0, missing = 0; r.lines.forEach(function (l) { if (l.value != null) sum += l.value; else missing++; });
    r.sum = r2(sum);
    if (r.totals.goods != null) {
      r.totals_match = near(r.sum, r.totals.goods, 0.05) && !missing;
      if (!r.totals_match) r.warnings.push("Lines add up to £" + r.sum.toFixed(2) + " but the invoice goods total is £" + r.totals.goods.toFixed(2) + (missing ? " (" + missing + " line values not read)" : "") + ". A line may be missing or misread.");
    } else r.warnings.push("Goods total not found on the invoice, so lines could not be cross-checked");
    if (r.pages.of) { var miss = []; for (var p = 1; p <= r.pages.of; p++) if (!r.pages[p]) miss.push(p); if (miss.length) r.warnings.push("Page " + miss.join(", ") + " of " + r.pages.of + " not scanned"); }
    if (!r.inv_no) r.warnings.push("Invoice number not read, type it in");
    if (!r.date) r.warnings.push("Invoice date not read, type it in");
    return r;
  }

  // ---------- product matching against the till product list (read only)
  var STOP = { the: 1, and: 1, with: 1, of: 1, pm: 1, pmp: 1, x: 1, pk: 1, pack: 1, ambient: 1, grb: 1, can: 1, pet: 1, bag: 1, tin: 1, drink: 1 };
  function words(s) {
    return String(s || "").toLowerCase().replace(/£\s?\d+(\.\d+)?|\b\d+(\.\d+)?p\b|\bpm\s?\d+(\.\d+)?/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter(function (w) { return w.length > 1 && !STOP[w] && !/^\d+(ml|g|kg|l|ltr|cl|pk)?$/.test(w); });
  }
  function priceMark(s) {   // "£1.69" / "89p" / "PM169" / "PM1.75" / "?2.49" -> pence
    s = String(s || ""); var m = /£\s?(\d+)\.(\d{2})|\?(\d+)\.(\d{2})|\b(\d{2,3})p\b|pm\s?£?(\d+)\.(\d{2})|pm\s?(\d{2,3})\b|\b(\d)\.(\d{2})\b/i.exec(s);
    if (!m) return null;
    if (m[1]) return +m[1] * 100 + +m[2]; if (m[3]) return +m[3] * 100 + +m[4]; if (m[5]) return +m[5]; if (m[6]) return +m[6] * 100 + +m[7]; if (m[8]) return +m[8]; if (m[9]) return +m[9] * 100 + +m[10];
    return null;
  }
  function sizeOf(s) {
    s = String(s || "").toLowerCase(); if (/\bpint\b/.test(s)) return "568ml";
    var m = /(\d+(?:\.\d+)?)\s?(ml|ltr|l|cl|kg|g)\b/.exec(s); if (!m) return null;
    var v = parseFloat(m[1]), u = m[2]; if (u === "l" || u === "ltr") { v *= 1000; u = "ml"; } if (u === "cl") { v *= 10; u = "ml"; } if (u === "kg") { v *= 1000; u = "g"; }
    return Math.round(v) + u;
  }
  function tokMatch(w, v) {   // invoice word w, till word v (till names are often abbreviated)
    if (w === v) return true;
    if (v.length >= 3 && w.indexOf(v) === 0) return true;
    if (w.length >= 3 && v.indexOf(w) === 0) return true;
    if (v.length >= 3 && v.length < w.length && v[0] === w[0]) { var j = 0; for (var i = 0; i < w.length && j < v.length; i++) if (w[i] === v[j]) j++; if (j === v.length) return true; }
    return false;
  }
  function sim(invName, tillName, invSize) {
    var a = words(invName), b = words(tillName); if (!a.length || !b.length) return 0;
    var hit = 0; a.forEach(function (w) { if (b.some(function (v) { return tokMatch(w, v); })) hit++; });
    var s = hit / Math.max(Math.min(a.length, 5), Math.min(b.length, 4));
    if (hit === 0 || s < 0.34) return 0;
    var pi = priceMark(invName), pt = priceMark(tillName);
    if (pi != null && pt != null) s += (pi === pt ? 0.3 : -0.4);
    var si = sizeOf(invSize || invName), st = sizeOf(tillName);
    if (si && st) s += (si === st ? 0.1 : -0.3);
    return s;
  }
  /* ctx: { codes: {invCode: pid}, byId: {pid: product}, hist: [[pid, upc, caseCost]], products: [...], lookup(bc) }
     product fields: id, n (name), b (barcodes), upc, lupc, lcc (last case cost), i (picture) */
  function matchLine(l, ctx) {
    if (l.code && ctx.codes && ctx.codes[l.code] && ctx.byId[ctx.codes[l.code]]) return { pid: ctx.codes[l.code], match: "code", score: 1, alts: [] };
    if (l.bc && ctx.lookup) { var p = ctx.lookup(l.bc); if (p) return { pid: p.id, match: "barcode", score: 1, alts: [] }; }
    var cands = [], seen = {};
    (ctx.hist || []).forEach(function (h) {
      var p = ctx.byId[h[0]]; if (!p) return; seen[p.id] = 1;
      var s = sim(l.desc, p.n, l.size); if (s < 0.3) return;
      if (l.upc != null && h[1] && Math.abs(h[1] - l.upc) < 1e-6) s += 0.15;
      if (l.case_cost != null && h[2] && Math.abs(h[2] - l.case_cost) / h[2] <= 0.12) s += 0.25;
      cands.push({ pid: p.id, score: s });
    });
    (ctx.products || []).forEach(function (p) { if (seen[p.id]) return; var s = sim(l.desc, p.n, l.size); if (s >= 0.7) cands.push({ pid: p.id, score: s * 0.85 }); });
    cands.sort(function (x, y) { return y.score - x.score; });
    var best = cands[0];
    if (best && best.score >= 0.6) return { pid: best.pid, match: "suggested", score: r2(best.score), alts: cands.slice(1, 4).map(function (c) { return c.pid; }) };
    return { pid: null, match: "none", score: 0, alts: cands.slice(0, 3).map(function (c) { return c.pid; }) };
  }

  return { layoutPage: layoutPage, parse: parse, splitInvoices: splitInvoices, detectSupplier: detectSupplier, parseDhamecha: parseDhamecha, parseEden: parseEden, parseGeneric: parseGeneric, matchLine: matchLine, sim: sim, fixNum: fixNum };
});
