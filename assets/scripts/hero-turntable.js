/* Home hero: the pack, drawn in Blender. It starts exploded, comes together
   while it turns, and then goes on turning slowly as the finished pack. Drag
   it (or use the arrow keys) to turn it by hand; it carries on by itself a
   moment after you let go.

   Two runs of pre-rendered frames: the closing-up (played once, in order) and
   a ring of the finished pack, one frame every 1.5 degrees, the last running
   round into the first.

   It is built to start quickly and stay smooth:
   - the closing-up starts as soon as its first frames are in and plays on as
     the rest arrive, never past the last one that has;
   - the ring arrives coarse first (every 8th frame, then every 4th, ...) so
     it can turn early and fills in as it goes;
   - frames are decoded straight to the size they are drawn at, so a frame on
     screen is a plain copy, and only those near the current angle are kept;
   - between two frames the next is faded over the last; with frames this
     close together that reads as a turn, not a blur. A drag shows whole
     frames only.

   Markup: an element with data-trans-dir / data-trans-count and
   data-ring-dir / data-ring-count (plus optional data-frame-ext / -pad / -ver)
   holding a poster <img> (the first frame, with width and height) that shows
   until the canvas has drawn, and stays where scripts or motion are off. */
(function () {
  'use strict';
  var host = document.querySelector('[data-ring-dir]');
  if (!host) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.connection && navigator.connection.saveData) return;

  var EXT = host.getAttribute('data-frame-ext') || 'webp';
  var PAD = parseInt(host.getAttribute('data-frame-pad'), 10) || 4;
  var VER = host.getAttribute('data-frame-ver') || '';
  var TR_FPS = 20;           // the closing-up
  var TURN_SECONDS = 30;     // one full turn by itself
  var HOLD_MS = 900;         // the exploded pack is held this long before it closes
  var IDLE_MS = 1600;        // pause after a drag before it carries on
  var TR_LEAD = 12;          // closing-up frames in hand before it starts
  var MAX_DECODE = 4, MAX_FETCH = 6;

  var poster = host.querySelector('img');
  var srcW = poster ? parseInt(poster.getAttribute('width'), 10) || 0 : 0;
  var srcH = poster ? parseInt(poster.getAttribute('height'), 10) || 0 : 0;
  if (!srcW || !srcH) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'hero-turn-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', poster.alt || 'Battery pack');
  canvas.tabIndex = 0;
  host.appendChild(canvas);
  var ctx = canvas.getContext('2d', { alpha: true });

  function wrap(i, n) { return ((i % n) + n) % n; }
  function pad(i) { var s = String(i); while (s.length < PAD) s = '0' + s; return s; }

  function Run(dir, n, circular) {
    this.dir = dir; this.n = n; this.circular = circular;
    this.blobs = new Array(n); this.bitmaps = new Array(n); this.decoding = {};
    this.order = []; this.next = 0;
    var k, step, seen = {};
    if (circular) {
      // coarse to fine: every 8th frame, then every 4th, every 2nd, all
      for (step = 8; step >= 1; step /= 2) {
        for (k = 0; k < n; k += step) if (!seen[k]) { seen[k] = true; this.order.push(k); }
      }
    } else for (k = 0; k < n; k++) this.order.push(k);
  }
  Run.prototype.url = function (i) { return this.dir + '/frame_' + pad(i) + '.' + EXT + (VER ? '?v=' + VER : ''); };
  // how many frames from the start are all in (the closing-up plays up to here)
  Run.prototype.frontier = function () { var i = 0; while (i < this.n && this.blobs[i]) i++; return i; };
  // the ring may turn once every 4th frame is in
  Run.prototype.coarseIn = function () { for (var i = 0; i < this.n; i += 4) if (!this.blobs[i]) return false; return true; };

  var trans = new Run(host.getAttribute('data-trans-dir'), parseInt(host.getAttribute('data-trans-count'), 10) || 45, false);
  var ring = new Run(host.getAttribute('data-ring-dir'), parseInt(host.getAttribute('data-ring-count'), 10) || 240, true);
  var RING_AUTO = ring.n / TURN_SECONDS;

  // ---- fetching: the closing-up first, then the ring
  var runs = [trans, ring], fetching = 0;
  function pump() {
    for (var r = 0; r < runs.length && fetching < MAX_FETCH; r++) {
      var run = runs[r];
      while (fetching < MAX_FETCH && run.next < run.order.length) {
        (function (rn, i) {
          fetching++;
          fetch(rn.url(i)).then(function (res) { if (!res.ok) throw 0; return res.blob(); })
            .then(function (b) { rn.blobs[i] = b; dirty = true; })
            .catch(function () {})
            .then(function () { fetching--; pump(); });
        })(run, run.order[run.next++]);
      }
      if (run.next < run.order.length) return;   // finish one run's requests before the next
    }
  }

  // ---- layout: decoded at the drawn size, never larger than the frames themselves
  var cssW = 0, cssH = 0, gen = 0, tw = 0, th = 0, dw = 0, dh = 0, dx = 0, dy = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  function drop(run) {
    for (var i = 0; i < run.n; i++) { if (run.bitmaps[i] && run.bitmaps[i].close) run.bitmaps[i].close(); run.bitmaps[i] = null; }
  }
  function layout() {
    var scale = Math.min(canvas.width / srcW, canvas.height / srcH);
    var w = Math.round(srcW * scale), h = Math.round(srcH * scale);
    if (w === dw && h === dh) return;
    dw = w; dh = h;
    tw = Math.min(dw, srcW); th = Math.min(dh, srcH);
    dx = Math.round((canvas.width - dw) / 2);
    dy = Math.round((canvas.height - dh) / 2);
    gen++; drop(trans); drop(ring);
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
  }

  // ---- decoding near the current frame
  var decodingCount = 0;
  function close(bm) { if (bm && bm.close) bm.close(); }
  function begin(run, idx) {
    run.decoding[idx] = true; decodingCount++;
    var g = gen;
    createImageBitmap(run.blobs[idx], { resizeWidth: tw, resizeHeight: th, resizeQuality: 'medium' }).then(function (bm) {
      run.decoding[idx] = false; decodingCount--;
      if (g !== gen) { close(bm); return; }
      run.bitmaps[idx] = bm; dirty = true;
    }, function () { run.decoding[idx] = false; decodingCount--; });
  }
  function idx(run, i) { return run.circular ? wrap(i, run.n) : i; }
  function keep(run, centre, step, ahead, behind) {
    var n = run.n, i, j, k, wanted = {};
    for (j = -behind; j <= ahead; j++) { k = idx(run, centre + j * step); if (k >= 0 && k < n) wanted[k] = true; }
    for (i = 0; i < n; i++) if (run.bitmaps[i] && !wanted[i]) { close(run.bitmaps[i]); run.bitmaps[i] = null; }
    for (j = 0; j <= ahead && decodingCount < MAX_DECODE; j++) {
      k = idx(run, centre + j * step);
      if (k >= 0 && k < n && run.blobs[k] && !run.bitmaps[k] && !run.decoding[k]) begin(run, k);
    }
    for (j = 1; j <= behind && decodingCount < MAX_DECODE; j++) {
      k = idx(run, centre - j * step);
      if (k >= 0 && k < n && run.blobs[k] && !run.bitmaps[k] && !run.decoding[k]) begin(run, k);
    }
  }

  // ---- state
  var phase = 'wait';        // wait (exploded, held) -> trans (closing up) -> ring (turning)
  var tpos = 0, rpos = 0;
  var velocity = 0, dir = 1;
  var dragging = false, lastX = 0, lastT = 0, idleUntil = 0;
  var visible = true, dirty = true, lastNow = 0, shown = false, visibleSince = 0;

  // the decoded frames either side of pos (searching up to `reach` frames), and how far between
  function pair(run, pos, reach) {
    var base = Math.floor(pos), a = -1, b = -1, d;
    for (d = 0; d <= reach; d++) { var k = idx(run, base - d); if (k >= 0 && run.bitmaps[k]) { a = base - d; break; } }
    for (d = 1; d <= reach; d++) { var m = idx(run, base + d); if (m < run.n && run.bitmaps[m]) { b = base + d; break; } }
    return { a: a, b: b };
  }

  function draw(bm, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(bm, dx, dy, dw, dh);
  }

  function paint() {
    if (!dw) return;
    var run, pos, p, A, B, f = 0;
    if (phase === 'ring') {
      run = ring; pos = rpos;
      p = pair(run, pos, 10);
      if (p.a < 0 && p.b < 0) return;
      A = p.a >= 0 ? run.bitmaps[idx(run, p.a)] : null;
      B = p.b >= 0 ? run.bitmaps[idx(run, p.b)] : null;
      if (A && B) f = (pos - p.a) / (p.b - p.a);
      // a drag shows whole frames: a fade between two would soften it while it moves
      if (dragging) { if (A && B && f > 0.5) { A = B; } B = null; f = 0; }
      if (!A) { A = B; B = null; }
    } else {
      run = trans; pos = Math.round(tpos);
      p = pair(run, pos, run.n);
      A = run.bitmaps[pos] || (p.a >= 0 ? run.bitmaps[p.a] : null) || (p.b >= 0 ? run.bitmaps[p.b] : null);
      if (!A) return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (B && f > 0.01) {
      // a true cross-fade: (1 - f) of one frame plus f of the next, added
      // together. Laying the next frame over a fully drawn last one would
      // leave the last one's outline showing until the step, then drop it.
      draw(A, 1 - f);
      ctx.globalCompositeOperation = 'lighter';
      draw(B, f);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      draw(A, 1);
    }
    ctx.globalAlpha = 1;
    if (!shown) { shown = true; host.classList.add('is-live'); }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    if (!visible || document.hidden) { lastNow = 0; return; }
    var dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 0.016;
    lastNow = now;
    if (!visibleSince) visibleSince = now;

    if (phase === 'wait') {
      keep(trans, 0, 1, 12, 0);
      if (now - visibleSince > HOLD_MS && trans.frontier() >= Math.min(trans.n, TR_LEAD)) { phase = 'trans'; dirty = true; }
    } else if (phase === 'trans') {
      // plays on as the frames arrive, never past the last one that has
      var limit = Math.max(0, trans.frontier() - 1);
      tpos = Math.min(tpos + TR_FPS * dt, limit);
      keep(trans, Math.round(tpos), 1, 10, 1);
      dirty = true;
      // its last frame is the ring's first: carry on once the ring can turn
      if (tpos >= trans.n - 1 && ring.coarseIn()) { phase = 'ring'; rpos = 0; host.classList.add('is-ready'); drop(trans); }
    } else {
      if (!dragging) {
        var auto = now >= idleUntil ? RING_AUTO : 0;
        velocity *= Math.exp(-dt * 3.2);
        if (Math.abs(velocity) < 0.05) velocity = 0;
        var v = auto + velocity;
        if (v) { rpos = wrap(rpos + v * dt, ring.n); dir = v > 0 ? 1 : -1; dirty = true; }
      }
      keep(ring, Math.round(rpos), dir, 20, 6);
    }
    if (dirty) { dirty = false; paint(); }
  }

  // ---- drag to turn (the ring only)
  function ppf() { return Math.max(3, cssW / (ring.n * 0.5)); }   // a full width of travel is half a turn
  canvas.addEventListener('pointerdown', function (e) {
    if (phase !== 'ring') return;
    dragging = true; lastX = e.clientX; lastT = e.timeStamp; velocity = 0;
    canvas.setPointerCapture(e.pointerId);
    host.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var mx = e.clientX - lastX, dt = Math.max(1, e.timeStamp - lastT) / 1000;
    if (mx) {
      rpos = wrap(rpos - mx / ppf(), ring.n);
      dir = mx < 0 ? 1 : -1;
      velocity = Math.max(-120, Math.min(120, -(mx / ppf()) / dt));
    }
    lastX = e.clientX; lastT = e.timeStamp; dirty = true;
  });
  function release() {
    if (!dragging) return;
    dragging = false;
    host.classList.remove('is-dragging');
    idleUntil = performance.now() + IDLE_MS;
    dirty = true;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('keydown', function (e) {
    if (phase !== 'ring') return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var s = e.key === 'ArrowRight' ? -1 : 1;
    rpos = wrap(Math.round(rpos) + s * 4, ring.n); dir = s;
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
