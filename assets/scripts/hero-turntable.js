/* Home hero: the pack, drawn in Blender, exploded and turning slowly. Drag it
   (or use the arrow keys) to turn it by hand; it carries on by itself a moment
   after you let go.

   The pack is a ring of pre-rendered frames, one every few degrees. Frames are
   fetched as compressed blobs and decoded straight to the size they are drawn
   at (so a frame on screen is a plain copy, with no scaling per paint), and
   only the frames around the current angle, weighted towards the way it is
   turning, are kept. Between two frames the next is faded in over the last, so
   a slow turn looks continuous instead of stepping.

   Markup: an element with data-turn-dir, data-turn-count and optional
   data-turn-ext / -pad / -ver / -zoom holding a poster <img> (frame 0) that
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
  var ZOOM = parseFloat(host.getAttribute('data-turn-zoom')) || 1;
  var AUTO = 1.5;            // frames per second while turning by itself
  var IDLE_MS = 1800;        // pause after a drag before it carries on
  var AHEAD = 14, BEHIND = 5; // decoded frames kept, in the direction of travel / behind it
  var MAX_DECODE = 3;

  var poster = host.querySelector('img');
  var canvas = document.createElement('canvas');
  canvas.className = 'hero-turn-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', poster ? poster.alt : 'Battery pack, exploded and turning');
  canvas.tabIndex = 0;
  host.appendChild(canvas);
  var ctx = canvas.getContext('2d', { alpha: true });

  function url(i) {
    var s = String(i);
    while (s.length < PAD) s = '0' + s;
    return DIR + '/frame_' + s + '.' + EXT + (VER ? '?v=' + VER : '');
  }
  function wrap(i) { return ((i % N) + N) % N; }

  var blobs = new Array(N), bitmaps = new Array(N), decoding = {}, decodeCount = 0;
  // the frames' own size, from the poster's width and height attributes
  var srcW = poster ? parseInt(poster.getAttribute('width'), 10) || 0 : 0;
  var srcH = poster ? parseInt(poster.getAttribute('height'), 10) || 0 : 0;
  if (!srcW || !srcH) return;
  var tw = 0, th = 0;         // the size each frame is decoded and drawn at
  var dx = 0, dy = 0;         // where it sits on the canvas
  var cssW = 0, cssH = 0, gen = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  function layout() {
    if (!srcW) return;
    var scale = Math.min(canvas.width / srcW, canvas.height / srcH) * ZOOM;
    var w = Math.round(srcW * scale), h = Math.round(srcH * scale);
    if (w === tw && h === th) return;
    tw = w; th = h;
    dx = Math.round((canvas.width - tw) / 2);
    dy = Math.round((canvas.height - th) / 2);
    // new size: everything decoded so far is the wrong size
    gen++;
    for (var i = 0; i < N; i++) { if (bitmaps[i] && bitmaps[i].close) bitmaps[i].close(); bitmaps[i] = null; }
    dirty = true;
  }

  function resize() {
    var r = host.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === cssW && h === cssH) return;
    cssW = w; cssH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    layout();
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
          .then(function () { inflight--; pump(); });
      })(order[next++]);
    }
  }

  // ---- state
  var angle = 0;             // in frames, wraps at N
  var velocity = 0;          // frames per second added by a flick
  var dir = 1;               // which way it is turning
  var dragging = false, lastX = 0, lastT = 0, idleUntil = 0;
  var visible = true, dirty = true, lastNow = 0, shown = false;

  // circular offset of frame i from c, in -N/2..N/2
  function off(i, c) { return wrap(i - c + N / 2) - N / 2; }
  function inWindow(i, c) {
    var d = off(i, c) * dir;
    return d >= -BEHIND && d <= AHEAD;
  }

  function schedule(c) {
    var i, j, idx;
    for (i = 0; i < N; i++) {
      if (bitmaps[i] && !inWindow(i, c)) { if (bitmaps[i].close) bitmaps[i].close(); bitmaps[i] = null; }
    }
    // nearest first, ahead of the turn before behind it
    for (j = 0; j <= AHEAD && decodeCount < MAX_DECODE; j++) {
      idx = wrap(c + j * dir);
      if (blobs[idx] && !bitmaps[idx] && !decoding[idx]) start(idx);
    }
    for (j = 1; j <= BEHIND && decodeCount < MAX_DECODE; j++) {
      idx = wrap(c - j * dir);
      if (blobs[idx] && !bitmaps[idx] && !decoding[idx]) start(idx);
    }
  }
  function start(idx) {
    decoding[idx] = true; decodeCount++;
    var g = gen;
    var opts = tw ? { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' } : undefined;
    createImageBitmap(blobs[idx], opts).then(function (bm) {
      decoding[idx] = false; decodeCount--;
      if (g !== gen || !inWindow(idx, Math.round(angle))) { bm.close && bm.close(); return; }
      bitmaps[idx] = bm;
      dirty = true;
    }, function () { decoding[idx] = false; decodeCount--; });
  }

  function nearest(i) {
    for (var d = 0; d <= N / 2; d++) {
      var a = wrap(i + d), b = wrap(i - d);
      if (bitmaps[a]) return bitmaps[a];
      if (bitmaps[b]) return bitmaps[b];
    }
    return null;
  }

  function paint() {
    if (!tw) return;
    var base = Math.floor(angle), f = angle - base;
    var a = bitmaps[wrap(base)] || nearest(base);
    if (!a) return;
    var b = f > 0.02 ? bitmaps[wrap(base + 1)] : null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.drawImage(a, dx, dy, tw, th);
    if (b) { ctx.globalAlpha = f; ctx.drawImage(b, dx, dy, tw, th); ctx.globalAlpha = 1; }
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
      var v = auto + velocity;
      if (v) { angle = wrap(angle + v * dt); dir = v > 0 ? 1 : -1; dirty = true; }
    }
    schedule(Math.round(angle));
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
    var mx = e.clientX - lastX, dt = Math.max(1, e.timeStamp - lastT) / 1000;
    if (mx) {
      angle = wrap(angle - mx / ppf());
      dir = mx < 0 ? 1 : -1;
      velocity = Math.max(-40, Math.min(40, -(mx / ppf()) / dt));
    }
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
    var s = e.key === 'ArrowRight' ? -1 : 1;
    angle = wrap(angle + s * 2); dir = s;
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
