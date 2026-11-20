/* Birkhill barcode scan: live camera (BarcodeDetector, ZXing fallback)
   and still-photo decode. Works on Android Chrome and iPhone Safari.
   Never logs or prints data keys. */
(function () {
  var NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];
  var loadPromise = null;

  function loadZXing(src) {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (loadPromise) return loadPromise;
    src = src || "zxing.min.js";
    loadPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () {
        if (window.ZXing) resolve(window.ZXing);
        else { loadPromise = null; reject(new Error("Barcode library failed to load")); }
      };
      s.onerror = function () {
        loadPromise = null;
        reject(new Error("Could not load the barcode library"));
      };
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  function zxingHints(Z) {
    var hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
      Z.BarcodeFormat.EAN_13,
      Z.BarcodeFormat.EAN_8,
      Z.BarcodeFormat.UPC_A,
      Z.BarcodeFormat.UPC_E,
      Z.BarcodeFormat.CODE_128,
      Z.BarcodeFormat.CODE_39,
      Z.BarcodeFormat.ITF
    ]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    try { hints.set(Z.DecodeHintType.ALLOWED_EAN_EXTENSIONS, [2, 5]); } catch (e) {}
    return hints;
  }

  function zxingText(result) {
    if (!result) return "";
    var text = result.getText ? result.getText() : String(result);
    try {
      var meta = result.getResultMetadata && result.getResultMetadata();
      if (meta && window.ZXing && ZXing.ResultMetadataType) {
        var ext = meta.get(ZXing.ResultMetadataType.UPC_EAN_EXTENSION);
        if (ext) text = String(text) + String(ext);
      }
    } catch (e) {}
    return String(text || "").trim();
  }

  function nativeDetector() {
    if (!("BarcodeDetector" in window)) return null;
    try { return new BarcodeDetector({ formats: NATIVE_FORMATS }); } catch (e) { return null; }
  }

  function detectNative(source) {
    var det = nativeDetector();
    if (!det) return Promise.resolve("");
    return det.detect(source).then(function (codes) {
      return (codes && codes[0] && codes[0].rawValue) ? String(codes[0].rawValue) : "";
    }).catch(function () { return ""; });
  }

  function bitmapFrom(source) {
    if (typeof createImageBitmap !== "function") return Promise.reject(new Error("no bitmap"));
    return createImageBitmap(source, { imageOrientation: "from-image" }).catch(function () {
      return createImageBitmap(source);
    });
  }

  function decodeWithZXingImage(imgOrUrl, src) {
    return loadZXing(src).then(function (Z) {
      var reader = new Z.BrowserMultiFormatReader(zxingHints(Z), 400);
      if (typeof imgOrUrl === "string") return reader.decodeFromImageUrl(imgOrUrl);
      return reader.decodeFromImageElement(imgOrUrl);
    }).then(zxingText).catch(function () { return ""; });
  }

  function decodeFromFile(file, zxingSrc) {
    if (!file) return Promise.resolve("");
    return detectNative(file).then(function (code) {
      if (code) return code;
      return bitmapFrom(file).then(function (bmp) {
        return detectNative(bmp).then(function (c) {
          try { bmp.close && bmp.close(); } catch (e) {}
          return c;
        });
      }).catch(function () { return ""; });
    }).then(function (code) {
      if (code) return code;
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          detectNative(img).then(function (code2) {
            if (code2) { URL.revokeObjectURL(url); resolve(code2); return; }
            decodeWithZXingImage(url, zxingSrc).then(function (code3) {
              URL.revokeObjectURL(url);
              resolve(code3 || "");
            });
          });
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve(""); };
        img.src = url;
      });
    });
  }

  function startLive(opts) {
    opts = opts || {};
    var video = opts.video;
    var wrap = opts.wrap;
    var zxingSrc = opts.zxingSrc || "zxing.min.js";
    var onCode = opts.onCode || function () {};
    var session = { on: true, stream: null, timer: null, reader: null, video: video };

    function stop() {
      session.on = false;
      if (session.timer) { clearTimeout(session.timer); session.timer = null; }
      if (session.reader) {
        try { session.reader.reset(); } catch (e) {}
        try { session.reader.stopContinuousDecode(); } catch (e) {}
        session.reader = null;
      }
      if (session.stream) {
        session.stream.getTracks().forEach(function (t) { t.stop(); });
        session.stream = null;
      }
      if (video) video.srcObject = null;
      if (wrap) wrap.classList.add("hidden");
    }
    session.stop = stop;

    var constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    return navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      if (!session.on) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        return session;
      }
      session.stream = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      if (wrap) wrap.classList.remove("hidden");
      return video.play().catch(function () {}).then(function () {
        var det = nativeDetector();
        if (det) {
          var tick = function () {
            if (!session.on) return;
            var ready = video.readyState >= 2;
            var work = ready ? det.detect(video).then(function (codes) {
              if (!session.on) return;
              if (codes && codes[0] && codes[0].rawValue) onCode(String(codes[0].rawValue));
            }).catch(function () {}) : Promise.resolve();
            return work.then(function () {
              if (session.on) session.timer = setTimeout(tick, 200);
            });
          };
          tick();
          return session;
        }
        return loadZXing(zxingSrc).then(function (Z) {
          if (!session.on) return session;
          session.reader = new Z.BrowserMultiFormatReader(zxingHints(Z), 400);
          return session.reader.decodeFromStream(stream, video, function (result) {
            if (session.on && result) onCode(zxingText(result));
          }).then(function () { return session; });
        });
      });
    }).catch(function (err) {
      stop();
      throw err;
    });
  }

  window.BirkhillBarcode = {
    loadZXing: loadZXing,
    decodeFromFile: decodeFromFile,
    startLive: startLive
  };
})();
