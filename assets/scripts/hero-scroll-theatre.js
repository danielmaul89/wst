/* Scroll-scrubbed pre-rendered pack theatre.
   Drives a pre-rendered Blender frame sequence (still -> explode+rotate to
   a fixed "callout angle" -> HOLD there, frozen -> reassemble+rotate back
   -> still) by scroll position, the same track/stage pattern
   product-3d-showcase.js uses for the live WebGL teardown (scrollProgress()
   off the track's own bounding rect).

   Frames are pre-decoded Image objects drawn to a <canvas> (the same
   approach turntable-player.js uses for the autoplay loop), not an <img>
   whose src gets reassigned - swapping img.src makes the browser decode
   that frame's PNG right there on the scroll thread, which is exactly
   when a stall is least affordable. Decoding ahead of time and only ever
   doing a drawImage() on scroll keeps each step to a cheap canvas blit.

   Callout labels/leader lines only make sense while the camera and parts
   are frozen at the hold frame, so they only ever show during that middle
   band of scroll progress - they fade out the moment reassembly starts,
   since their fixed screen-space anchors would otherwise drift off the
   parts as the pack and camera move again. Their positions are computed
   once (the hold frame's anchors never move); only which ones are
   revealed changes per scroll tick, and that only gets touched when the
   revealed count actually changes rather than on every tick. */
(function () {
  'use strict';

  var track = document.getElementById('scTheatre');
  var frameHost = document.getElementById('scFrame');
  var calloutsHost = document.getElementById('scCallouts');
  var hint = document.getElementById('scHint');
  if (!track || !frameHost) return;

  var DIR = frameHost.getAttribute('data-frame-dir');
  var EXT = frameHost.getAttribute('data-frame-ext') || 'jpg';
  var PAD = parseInt(frameHost.getAttribute('data-frame-pad'), 10) || 4;
  var N_TOTAL = parseInt(frameHost.getAttribute('data-frame-count'), 10) || 98;
  var FRAME_HOLD = parseInt(frameHost.getAttribute('data-frame-hold'), 10) || 49;
  var FRAME_LAST = N_TOTAL - 1;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frameUrl(i) {
    var s = String(i);
    while (s.length < PAD) s = '0' + s;
    return DIR + '/frame_' + s + '.' + EXT;
  }

  // <canvas> replaces the old <img id="scFrame"> in the page markup, but
  // keep working if an older cached page still has the <img> - draw into
  // a canvas we insert alongside it either way.
  var canvas = frameHost.tagName === 'CANVAS' ? frameHost : document.createElement('canvas');
  if (canvas !== frameHost) {
    canvas.className = frameHost.className;
    frameHost.parentNode.insertBefore(canvas, frameHost);
    frameHost.parentNode.removeChild(frameHost);
  }
  var ctx = canvas.getContext('2d');

  // Decode every frame ahead of time. img.decode() (where supported) does
  // the expensive work off the scroll thread instead of at draw time;
  // onload is the fallback for browsers without it.
  var frames = new Array(N_TOTAL);
  for (var i = 0; i < N_TOTAL; i++) {
    (function (idx) {
      var im = new Image();
      im.src = frameUrl(idx);
      if (im.decode) im.decode().catch(function () {});
      frames[idx] = im;
    })(i);
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var canvasCssW = 0, canvasCssH = 0;

  function resizeCanvas() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === canvasCssW && h === canvasCssH) return;
    canvasCssW = w; canvasCssH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  resizeCanvas();
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(canvas.parentElement);
  else window.addEventListener('resize', resizeCanvas);

  function drawFrame(img) {
    if (!img || !img.naturalWidth) return;
    resizeCanvas();
    var cw = canvas.width, ch = canvas.height;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var scale = Math.min(cw / iw, ch / ih);
    var dw = iw * scale, dh = ih * scale;
    var dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  var calloutEls = [];
  var MIN_LABEL_GAP = 30; // px between adjacent label centres - two anchors
                          // 2-3% of frame height apart otherwise read as
                          // touching text, not two separate callouts.

  function buildCallouts(data) {
    var items = data.filter(function (c) { return c.inFrame; });
    items.forEach(function (c) {
      var leader = document.createElement('div');
      leader.className = 'sc-leader';
      var el = document.createElement('div');
      el.className = 'sc-callout';
      el.innerHTML = '<span class="sc-callout-title">' + c.label + '</span>';
      calloutsHost.appendChild(leader);
      calloutsHost.appendChild(el);
      calloutEls.push({ leader: leader, el: el, data: c, on: false });
    });
    positionCallouts();
  }

  // Anchors come from one frozen hold frame, so their screen position
  // never changes - only ever needs computing once (plus on resize),
  // not on every scroll tick.
  function positionCallouts() {
    var hostW = calloutsHost.clientWidth;
    var hostH = calloutsHost.clientHeight;
    var labelX = hostW * 0.82;

    var order = calloutEls.map(function (c, idx) { return idx; })
      .sort(function (a, b) { return calloutEls[a].data.y - calloutEls[b].data.y; });
    var labelY = {};
    order.forEach(function (idx) { labelY[idx] = hostH * calloutEls[idx].data.y / 100; });
    for (var i = 1; i < order.length; i++) {
      var prev = order[i - 1], cur = order[i];
      if (labelY[cur] - labelY[prev] < MIN_LABEL_GAP) labelY[cur] = labelY[prev] + MIN_LABEL_GAP;
    }
    for (var j = order.length - 2; j >= 0; j--) {
      var a = order[j], b = order[j + 1];
      if (labelY[b] - labelY[a] < MIN_LABEL_GAP) labelY[a] = labelY[b] - MIN_LABEL_GAP;
    }

    calloutEls.forEach(function (c, idx) {
      var ax = hostW * c.data.x / 100;
      var ay = hostH * c.data.y / 100;
      var ly = labelY[idx];
      var dx = labelX - ax, dy = ly - ay;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var ang = Math.atan2(dy, dx);
      c.leader.style.width = dist.toFixed(1) + 'px';
      c.leader.style.transform = 'translate(' + ax.toFixed(1) + 'px,' + ay.toFixed(1) + 'px) rotate(' + ang.toFixed(4) + 'rad)';
      c.el.style.transform = 'translate(' + (labelX + 12).toFixed(1) + 'px,' + ly.toFixed(1) + 'px) translateY(-50%)';
    });
  }
  if ('ResizeObserver' in window) new ResizeObserver(positionCallouts).observe(calloutsHost);

  fetch(DIR + '/callouts.json')
    .then(function (r) { return r.json(); })
    .then(buildCallouts)
    .catch(function () { /* no callouts.json: theatre still works without labels */ });

  var lastRevealCount = -1;
  function updateReveal(revealFrac) {
    var n = calloutEls.length;
    if (!n) return;
    var count = 0;
    for (var i = 0; i < n; i++) { if (revealFrac > i / n) count++; }
    if (count === lastRevealCount) return;
    lastRevealCount = count;
    calloutEls.forEach(function (c, idx) {
      var on = idx < count;
      if (c.on === on) return;
      c.on = on;
      c.leader.classList.toggle('is-on', on);
      c.el.classList.toggle('is-on', on);
    });
  }

  function scrollProgress() {
    var rect = track.getBoundingClientRect();
    var travel = rect.height - window.innerHeight;
    if (travel <= 0) return 0;
    var p = -rect.top / travel;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  var EXPLODE_END = 0.32;
  var HOLD_END = 0.68;

  function currentFrame(p) {
    if (p <= EXPLODE_END) {
      return Math.round((p / EXPLODE_END) * FRAME_HOLD);
    }
    if (p <= HOLD_END) {
      return FRAME_HOLD;
    }
    var t = (p - HOLD_END) / (1 - HOLD_END);
    return FRAME_HOLD + Math.round(t * (FRAME_LAST - FRAME_HOLD));
  }

  if (reduceMotion) {
    // A single held, fully-labelled frame rather than a scroll-driven scrub.
    var holdImg = frames[FRAME_HOLD];
    (holdImg.decode ? holdImg.decode().catch(function () {}) : Promise.resolve())
      .then(function () { drawFrame(holdImg); });
    if (!holdImg.complete) holdImg.onload = function () { drawFrame(holdImg); };
    if (hint) hint.style.display = 'none';
    fetch(DIR + '/callouts.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        buildCallouts(data);
        updateReveal(1);
      })
      .catch(function () {});
    return;
  }

  var lastIdx = -1;
  function render() {
    requestAnimationFrame(render);
    var rect = track.getBoundingClientRect();
    if (rect.bottom < -400 || rect.top > window.innerHeight + 400) return;

    var p = scrollProgress();
    var idx = currentFrame(p);
    if (idx !== lastIdx) {
      drawFrame(frames[idx]);
      lastIdx = idx;
    }
    if (hint) hint.style.opacity = p > 0.02 ? '0' : '1';

    if (p <= EXPLODE_END || p > HOLD_END) {
      updateReveal(0);
    } else {
      updateReveal((p - EXPLODE_END) / (HOLD_END - EXPLODE_END));
    }
  }
  requestAnimationFrame(render);
})();
