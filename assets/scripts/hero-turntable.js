/* Home hero: the pack, drawn in Blender. It starts exploded, comes together
   while it turns, and then goes on turning slowly as the finished pack. Drag
   it (or use the arrow keys) to turn it by hand; it carries on by itself a
   moment after you let go.

   Two runs of pre-rendered frames: the closing-up (frames played once, in
   order) and a ring of the finished pack (one frame every few degrees, the
   last running round into the first). Frames are fetched as compressed blobs
   and decoded straight to the size they are drawn at, so a frame on screen is
   a plain copy; only the frames around the current one are kept. In the ring,
   the slow turn fades each frame into the next so it reads as continuous; a
   drag snaps to whole frames, which keeps the picture sharp while it moves.

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
  var TR_FPS = 18;           // the closing-up
  var RING_AUTO = 2.0;       // ring frames per second while turning by itself
  var HOLD_MS = 1400;        // the exploded pack is held this long before it closes
  var IDLE_MS = 1800;        // pause after a drag before it carries on
  var MAX_DECODE = 3;

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

  // ---- a run of frames: fetched in the order given, decoded near where it is playing
  function Run(dir, n, circular) {
    var self = this;
    this.dir = dir; this.n = n; this.circular = circular;
    this.blobs = new Array(n); this.bitmaps = new Array(n); this.decoding = {};
    this.settled = 0; this.ready = false; this.next = 0; this.inflight = 0;
    this.order = [];
    var k;
    if (circular) { this.order.push(0); for (k = 1; k <= n / 2; k++) { this.order.push(wrap(k, n)); if (k !== n - k) this.order.push(wrap(-k, n)); } }
    else for (k = 0; k < n; k++) this.order.push(k);
    this.url = function (i) {
      var s = String(i);
      while (s.length < PAD) s = '0' + s;
      return self.dir + '/frame_' + s + '.' + EXT + (VER ? '?v=' + VER : '');
    };
  }
  var trans = new Run(host.getAttribute('data-trans-dir'), parseInt(host.getAttribute('data-trans-count'), 10) || 45, false);
  var ring = new Run(host.getAttribute('data-ring-dir'), parseInt(host.getAttribute('data-ring-count'), 10) || 120, true);

  var queue = [trans, ring], qi = 0;
  var inflightAll = 0;
  function pump() {
    while (inflightAll < 5 && qi < queue.length) {
      var r = queue[qi];
      if (r.next >= r.order.length) { qi++; continue; }
      (function (run, i) {
        inflightAll++;
        fetch(run.url(i)).then(function (res) { if (!res.ok) throw 0; return res.blob(); })
          .then(function (b) { run.blobs[i] = b; })
          .catch(function () {})
          .then(function () {
            inflightAll--; run.settled++;
            if (run.settled === run.n) { run.ready = true; dirty = true; }
            pump();
          });
      })(r, r.order[r.next++]);
    }
  }

  // ---- layout
  var cssW = 0, cssH = 0, gen = 0, tw = 0, th = 0, dx = 0, dy = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  function drop(run) {
    for (var i = 0; i < run.n; i++) { if (run.bitmaps[i] && run.bitmaps[i].close) run.bitmaps[i].close(); run.bitmaps[i] = null; }
  }
  function layout() {
    var scale = Math.min(canvas.width / srcW, canvas.height / srcH);
    var w = Math.round(srcW * scale), h = Math.round(srcH * scale);
    if (w === tw && h === th) return;
    tw = w; th = h;
    dx = Math.round((canvas.width - tw) / 2);
    dy = Math.round((canvas.height - th) / 2);
    gen++; drop(trans); drop(ring);   // decoded at the old size
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

  // ---- state
  var phase = 'wait';        // wait (exploded, held) -> trans (closing up) -> ring (turning)
  var tpos = 0;              // position in the closing-up, in frames
  var rpos = 0;              // position in the ring, in frames
  var velocity = 0, dir = 1; // ring: a flick's speed, and which way it is turning
  var dragging = false, lastX = 0, lastT = 0, idleUntil = 0;
  var visible = true, dirty = true, lastNow = 0, shown = false, visibleSince = 0;

  function close(bm) { if (bm && bm.close) bm.close(); }
  function begin(run, idx) {
    run.decoding[idx] = true; inflightDecode++;
    var g = gen;
    var opts = tw ? { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' } : undefined;
    createImageBitmap(run.blobs[idx], opts).then(function (bm) {
      run.decoding[idx] = false; inflightDecode--;
      if (g !== gen) { close(bm); return; }
      run.bitmaps[idx] = bm; dirty = true;
    }, function () { run.decoding[idx] = false; inflightDecode--; });
  }
  var inflightDecode = 0;
  // keep decoded: `ahead` frames in the direction of travel, `behind` the other way
  function keep(run, centre, step, ahead, behind) {
    var n = run.n, i, j, idx, wanted = {};
    for (j = -behind; j <= ahead; j++) {
      idx = run.circular ? wrap(centre + j * step, n) : centre + j * step;
      if (idx >= 0 && idx < n) wanted[idx] = true;
    }
    for (i = 0; i < n; i++) { if (run.bitmaps[i] && !wanted[i]) { close(run.bitmaps[i]); run.bitmaps[i] = null; } }
    for (j = 0; j <= ahead && inflightDecode < MAX_DECODE; j++) {
      idx = run.circular ? wrap(centre + j * step, n) : centre + j * step;
      if (idx >= 0 && idx < n && run.blobs[idx] && !run.bitmaps[idx] && !run.decoding[idx]) begin(run, idx);
    }
    for (j = 1; j <= behind && inflightDecode < MAX_DECODE; j++) {
      idx = run.circular ? wrap(centre - j * step, n) : centre - j * step;
      if (idx >= 0 && idx < n && run.blobs[idx] && !run.bitmaps[idx] && !run.decoding[idx]) begin(run, idx);
    }
  }
  function nearest(run, i) {
    for (var d = 0; d < run.n; d++) {
      var a = run.circular ? wrap(i + d, run.n) : Math.min(run.n - 1, i + d);
      var b = run.circular ? wrap(i - d, run.n) : Math.max(0, i - d);
      if (run.bitmaps[a]) return run.bitmaps[a];
      if (run.bitmaps[b]) return run.bitmaps[b];
    }
    return null;
  }

  function paint() {
    if (!tw) return;
    var run = phase === 'ring' ? ring : trans;
    var pos = phase === 'ring' ? rpos : tpos;
    var base = Math.floor(pos), f = pos - base, a, b = null;
    if (phase === 'ring') {
      // while dragging, whole frames only: a blend would soften the picture
      if (dragging || Math.abs(velocity) > 3) { base = Math.round(pos); f = 0; }
      a = run.bitmaps[wrap(base, run.n)] || nearest(run, base);
      if (f > 0.02) b = run.bitmaps[wrap(base + 1, run.n)];
    } else {
      base = Math.round(pos); f = 0;
      a = run.bitmaps[Math.min(run.n - 1, base)] || nearest(run, base);
    }
    if (!a) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.drawImage(a, dx, dy, tw, th);
    if (b) { ctx.globalAlpha = f; ctx.drawImage(b, dx, dy, tw, th); ctx.globalAlpha = 1; }
    if (!shown) { shown = true; host.classList.add('is-live'); }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    if (!visible || document.hidden) { lastNow = 0; visibleSince = 0; return; }
    var dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 0.016;
    lastNow = now;
    if (!visibleSince) visibleSince = now;

    if (phase === 'wait') {
      keep(trans, 0, 1, 14, 0);
      // closes once its frames are here and it has been looked at for a moment
      if (trans.ready && now - visibleSince > HOLD_MS) { phase = 'trans'; dirty = true; }
    } else if (phase === 'trans') {
      var np = tpos + TR_FPS * dt;
      keep(trans, Math.floor(np), 1, 14, 2);
      if (np >= trans.n - 1) {
        tpos = trans.n - 1; dirty = true;
        // the last closing-up frame is the ring's first: carry on once the ring is here
        if (ring.ready) { phase = 'ring'; rpos = 0; host.classList.add('is-ready'); }
      } else tpos = np;
      dirty = true;
    } else {
      if (!dragging) {
        var auto = now >= idleUntil ? RING_AUTO : 0;
        velocity *= Math.exp(-dt * 3.2);
        if (Math.abs(velocity) < 0.02) velocity = 0;
        var v = auto + velocity;
        if (v) { rpos = wrap(rpos + v * dt, ring.n); dir = v > 0 ? 1 : -1; dirty = true; }
      }
      keep(ring, Math.round(rpos), dir, 14, 5);
    }
    // a run waiting on its last frames keeps its place on screen
    if (phase === 'trans' && tpos >= trans.n - 1 && !ring.ready) keep(trans, trans.n - 1, 1, 0, 2);
    if (dirty) { dirty = false; paint(); }
  }

  // ---- drag to turn (the ring only)
  function ppf() { return Math.max(6, cssW / (ring.n * 0.5)); }   // a full width of travel is half a turn
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
      velocity = Math.max(-60, Math.min(60, -(mx / ppf()) / dt));
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
    if (phase !== 'ring') return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var s = e.key === 'ArrowRight' ? -1 : 1;
    rpos = wrap(Math.round(rpos) + s * 2, ring.n); dir = s;
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
