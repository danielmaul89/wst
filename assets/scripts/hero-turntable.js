/* Home hero: the pack, drawn in Blender, exploded and turning slowly. Drag it
   (or use the arrow keys) to turn it by hand; it carries on by itself a moment
   after you let go.

   The pack is a ring of pre-rendered frames, one every few degrees. Frames are
   fetched as compressed blobs, and only the few around the current angle are
   kept decoded (the whole ring decoded would be hundreds of MB). Between two
   frames the next is faded in over the last, so a slow turn looks continuous
   rather than stepping.

   Markup: an element with data-turn-dir, data-turn-count and optional
   data-turn-ext / -pad / -ver / -aspect holding a poster <img> (frame 0) that
   shows until the first frame is on the canvas and stays for reduced motion. */
(function () {
  'use strict';
  var host = document.querySelector('[data-turn-dir]');
  if (!host) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.connection && navigator.connection.saveData) return;

  var DIR = host.getAttribute('data-turn-dir');
  var N = parseInt(host.getAttribute('data-turn-count'), 10) || 72;
  var EXT = host.getAttribute('data-turn-ext') || 'webp';
  var PAD = parseInt(host.getAttribute('data-turn-pad'), 10) || 4;
  var VER = host.getAttribute('data-turn-ver') || '';
  var ASPECT = parseFloat(host.getAttribute('data-turn-aspect')) || 4 / 3;
  var ZOOM = parseFloat(host.getAttribute("data-turn-zoom")) || 1;
  var AUTO = 1.5;            // frames per second while turning by itself
  var IDLE_MS = 1800;        // pause after a drag before it carries on
  var WINDOW = 5;            // decoded frames kept either side of the current one

  var poster = host.querySelector('img');
  var canvas = document.createElement('canvas');
  canvas.className = 'hero-turn-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', poster ? poster.alt : 'Battery pack, exploded and turning');
  canvas.tabIndex = 0;
  host.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  function url(i) {
    var s = String(i);
    while (s.length < PAD) s = '0' + s;
    return DIR + '/frame_' + s + '.' + EXT + (VER ? '?v=' + VER : '');
  }
  function wrap(i) { return ((i % N) + N) % N; }

  var blobs = new Array(N), bitmaps = new Array(N), decoding = {};
  var cssW = 0, cssH = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    var r = host.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === cssW && h === cssH) return;
    cssW = w; cssH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    dirty = true;
  }

  // ---- loading: outward from frame 0, a few requests at a time
  var order = [0];
  for (var k = 1; k <= N / 2; k++) { order.push(wrap(k)); if (k !== N - k) order.push(wrap(-k)); }
  var next = 0, inflight = 0;
  function pump() {
    while (inflight < 5 && next < order.length) {
      (function (i) {
        inflight++;
        fetch(url(i)).then(function (r) { if (!r.ok) throw 0; return r.blob(); })
          .then(function (b) { blobs[i] = b; })
          .catch(function () {})
          .then(function () { inflight--; pump(); dirty = true; });
      })(order[next++]);
    }
  }

  function wanted(i, c) {
    var d = Math.abs(wrap(i - c + N / 2) - N / 2);
    return d <= WINDOW;
  }
  function decodeAround(c) {
    var i, j;
    for (i = 0; i < N; i++) {
      if (bitmaps[i] && !wanted(i, c)) { if (bitmaps[i].close) bitmaps[i].close(); bitmaps[i] = null; }
    }
    for (j = -WINDOW; j <= WINDOW; j++) {
      i = wrap(c + j);
      if (blobs[i] && !bitmaps[i] && !decoding[i]) {
        decoding[i] = true;
        (function (idx) {
          createImageBitmap(blobs[idx]).then(function (bm) {
            decoding[idx] = false;
            if (wanted(idx, Math.round(angle))) bitmaps[idx] = bm; else if (bm.close) bm.close();
            dirty = true;
          }, function () { decoding[idx] = false; });
        })(i);
      }
    }
  }

  // ---- state
  var angle = 0;             // in frames, wraps at N
  var velocity = 0;          // frames per second added by a flick
  var dragging = false, lastX = 0, lastT = 0, idleUntil = 0;
  var visible = true, dirty = true, lastNow = 0, shown = false;

  function nearest(i) {
    for (var d = 0; d <= N / 2; d++) {
      var a = wrap(i + d), b = wrap(i - d);
      if (bitmaps[a]) return bitmaps[a];
      if (bitmaps[b]) return bitmaps[b];
    }
    return null;
  }

  function paint() {
    var base = Math.floor(angle), f = angle - base;
    var a = bitmaps[wrap(base)] || nearest(base);
    if (!a) return;
    var b = f > 0.001 ? bitmaps[wrap(base + 1)] : null;
    var cw = canvas.width, ch = canvas.height;
    var scale = Math.min(cw / a.width, ch / a.height) * ZOOM;
    var dw = a.width * scale, dh = a.height * scale;
    var dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.globalAlpha = 1;
    ctx.drawImage(a, dx, dy, dw, dh);
    if (b) { ctx.globalAlpha = f; ctx.drawImage(b, dx, dy, dw, dh); ctx.globalAlpha = 1; }
    if (!shown) { shown = true; host.classList.add('is-live'); }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    if (!visible || document.hidden) { lastNow = 0; return; }
    var dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 0.016;
    lastNow = now;
    if (!dragging) {
      var auto = now >= idleUntil ? AUTO : 0;
      // a flick's speed fades out; the slow turn takes over from there
      velocity *= Math.exp(-dt * 3.2);
      if (Math.abs(velocity) < 0.02) velocity = 0;
      angle = wrap(angle + (auto + velocity) * dt);
      if (auto || velocity) dirty = true;
    }
    decodeAround(Math.round(angle));
    if (dirty) { dirty = false; paint(); }
  }

  // ---- drag to turn
  function ppf() { return Math.max(8, cssW / (N * 0.5)); }   // a full width of travel is half a turn
  canvas.addEventListener('pointerdown', function (e) {
    dragging = true; lastX = e.clientX; lastT = e.timeStamp; velocity = 0;
    canvas.setPointerCapture(e.pointerId);
    host.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dt = Math.max(1, e.timeStamp - lastT) / 1000;
    angle = wrap(angle - dx / ppf());
    velocity = Math.max(-40, Math.min(40, -(dx / ppf()) / dt));
    lastX = e.clientX; lastT = e.timeStamp; dirty = true;
  });
  function release() {
    if (!dragging) return;
    dragging = false;
    host.classList.remove('is-dragging');
    idleUntil = performance.now() + IDLE_MS;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    angle = wrap(angle + (e.key === 'ArrowRight' ? -1 : 1) * 2);
    idleUntil = performance.now() + IDLE_MS;
    dirty = true;
    e.preventDefault();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; dirty = true; }).observe(host);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host); else window.addEventListener('resize', resize);
  resize();
  pump();
  requestAnimationFrame(tick);
})();
