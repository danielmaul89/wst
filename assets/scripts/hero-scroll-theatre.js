/* Scroll-scrubbed pre-rendered pack theatre.
   Drives a pre-rendered Blender frame sequence (still -> explode+rotate to
   a fixed "callout angle" -> HOLD there, frozen -> reassemble+rotate back
   -> still) by scroll position, the same track/stage pattern
   product-3d-showcase.js uses for the live WebGL teardown (scrollProgress()
   off the track's own bounding rect).

   Frames are fetched as compressed Blobs (all kept - they are small) and
   decoded to ImageBitmaps only for a sliding window around the current
   frame, because 98 fully decoded portrait frames would be ~1 GB and the
   browser would evict and re-decode them mid-scroll. Decoding runs off the
   draw path; drawing is always a cheap canvas blit of whatever decoded
   frame is nearest the target, with a redraw when the exact one arrives.
   One resolution set is chosen at startup from the canvas's drawn size.

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
  // Frames get overwritten in place at the same filenames when a set
  // is re-rendered/re-packed, so a plain URL can keep serving whatever a
  // CDN or the browser already cached under it - a version bump forces a
  // fresh fetch the same way the script/stylesheet ?v= tags already do.
  var VER = frameHost.getAttribute('data-frame-ver') || '';

  var WIDTHS = (frameHost.getAttribute('data-frame-widths') || '')
    .split(',').map(function (w) { return parseInt(w, 10); })
    .filter(function (w) { return w > 0; })
    .sort(function (x, y) { return x - y; });
  var FRAME_ASPECT = 3 / 4; // all sets are 3:4 portrait; only used to pick a width
  var WINDOW_AHEAD = 12, WINDOW_BEHIND = 5;
  var MAX_FETCH = 6, MAX_DECODE = 3;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var chosenWidth = 0; // 0 = legacy flat layout
  function frameUrl(i) {
    var s = String(i);
    while (s.length < PAD) s = '0' + s;
    var base = chosenWidth ? DIR + '/' + chosenWidth + '/frame_' : DIR + '/frame_';
    return base + s + '.' + EXT + (VER ? '?v=' + VER : '');
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

  var decoded = new Array(N_TOTAL); // idx -> {src, w, h, url}
  var drawnIdx = -1;                // frame index actually on the canvas

  // Every frame in a set shares the same render dimensions, so the first
  // one to finish decoding tells us the image's own aspect ratio - needed
  // to work out where the canvas actually draws it (see getImageBox()).
  var imgAspect = null;
  function noteAspect(w, h) {
    if (imgAspect || !w || !h) return;
    imgAspect = w / h;
    positionCallouts();
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var canvasCssW = 0, canvasCssH = 0;

  function resizeCanvas() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === canvasCssW && h === canvasCssH) return false;
    canvasCssW = w; canvasCssH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Setting canvas.width/height resets ALL 2D context state, including
    // imageSmoothingQuality - has to be reapplied every time or it quietly
    // reverts to "low" the first time this fires (initial layout counts).
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return true;
  }
  // A resize clears the backing store, so repaint the frame that was showing.
  function onResize() {
    if (resizeCanvas() && drawnIdx >= 0 && decoded[drawnIdx]) drawEntry(decoded[drawnIdx]);
  }
  resizeCanvas();
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(canvas.parentElement);
  else window.addEventListener('resize', onResize);

  // One set for the whole session (no switching on resize): the smallest
  // listed width covering the drawn image height in device pixels, else
  // the largest. An unlaid-out canvas (1px) gets the largest.
  if (WIDTHS.length) {
    var boxH = canvasCssW / canvasCssH > FRAME_ASPECT ? canvasCssH : canvasCssW / FRAME_ASPECT;
    var needed = canvasCssH > 1 ? boxH * dpr * FRAME_ASPECT : Infinity;
    chosenWidth = WIDTHS[WIDTHS.length - 1];
    for (var wi = 0; wi < WIDTHS.length; wi++) {
      if (WIDTHS[wi] >= needed) { chosenWidth = WIDTHS[wi]; break; }
    }
  }

  function drawEntry(e) {
    resizeCanvas();
    var cw = canvas.width, ch = canvas.height;
    var scale = Math.min(cw / e.w, ch / e.h);
    var dw = e.w * scale, dh = e.h * scale;
    var dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(e.src, dx, dy, dw, dh);
  }

  // The canvas draws the (portrait) frame contain-fit inside its box, so
  // it's letterboxed/pillarboxed whenever the stage's aspect ratio isn't
  // the frame's own - callout anchors are percentages of the FRAME, so
  // they need to land inside this same box, not the full stage. Mirrors
  // drawEntry()'s dx/dy/dw/dh math, in CSS-pixel space (calloutsHost isn't
  // scaled by dpr the way the canvas backing store is).
  function getImageBox() {
    var cw = canvasCssW, ch = canvasCssH;
    if (!imgAspect || !cw || !ch) return { x: 0, y: 0, w: cw, h: ch };
    var boxW, boxH;
    if (cw / ch > imgAspect) {
      boxH = ch;
      boxW = ch * imgAspect;
    } else {
      boxW = cw;
      boxH = cw / imgAspect;
    }
    return { x: (cw - boxW) / 2, y: (ch - boxH) / 2, w: boxW, h: boxH };
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
    onResize(); // canvasCssW/H may be stale if this observer fires before the canvas's
    var box = getImageBox();
    var originX = box.x, originY = box.y, hostW = box.w, hostH = box.h;
    var labelX = originX + hostW * 0.82;

    var order = calloutEls.map(function (c, idx) { return idx; })
      .sort(function (a, b) { return calloutEls[a].data.y - calloutEls[b].data.y; });
    var labelY = {};
    order.forEach(function (idx) { labelY[idx] = originY + hostH * calloutEls[idx].data.y / 100; });
    for (var i = 1; i < order.length; i++) {
      var prev = order[i - 1], cur = order[i];
      if (labelY[cur] - labelY[prev] < MIN_LABEL_GAP) labelY[cur] = labelY[prev] + MIN_LABEL_GAP;
    }
    for (var j = order.length - 2; j >= 0; j--) {
      var a = order[j], b = order[j + 1];
      if (labelY[b] - labelY[a] < MIN_LABEL_GAP) labelY[a] = labelY[b] - MIN_LABEL_GAP;
    }

    calloutEls.forEach(function (c, idx) {
      var ax = originX + hostW * c.data.x / 100;
      var ay = originY + hostH * c.data.y / 100;
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

  var target = reduceMotion ? FRAME_HOLD : 0; // frame index the scroll wants
  var dir = 1;                                // last scroll direction, +1/-1

  // Draw the decoded frame nearest idx (ties go ahead in scroll direction).
  // Never swap to a frame further from idx than what's already on the
  // canvas (its pixels stay even after its bitmap is evicted) - otherwise a
  // fast scroll past the decode window would flash a pinned frame like the
  // exploded hold.
  function draw(idx) {
    var limit = drawnIdx >= 0 ? Math.abs(drawnIdx - idx) : N_TOTAL;
    for (var d = 0; d < limit; d++) {
      var pair = dir >= 0 ? [idx + d, idx - d] : [idx - d, idx + d];
      for (var k = 0; k < 2; k++) {
        var j = pair[k];
        if (j >= 0 && j < N_TOTAL && decoded[j]) {
          drawEntry(decoded[j]);
          drawnIdx = j;
          return;
        }
      }
    }
  }

  // Fetch: compressed blobs, frame 0 and hold first, then outward from 0.
  var blobs = new Array(N_TOTAL);
  var fetchOrder = reduceMotion ? [FRAME_HOLD] : [0, FRAME_HOLD];
  if (!reduceMotion) {
    for (var fi = 1; fi < N_TOTAL; fi++) { if (fi !== FRAME_HOLD) fetchOrder.push(fi); }
  }
  var fetchNext = 0, fetchInflight = 0;

  function pumpFetch() {
    while (fetchInflight < MAX_FETCH && fetchNext < fetchOrder.length) {
      (function (idx) {
        fetchInflight++;
        fetch(frameUrl(idx))
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
          .then(function (b) { blobs[idx] = b; })
          .catch(function () { /* frame stays missing; nearest decoded one is drawn instead */ })
          .then(function () { fetchInflight--; pumpFetch(); pumpDecode(); });
      })(fetchOrder[fetchNext++]);
    }
  }

  // Decode window: pinned frames plus target -BEHIND..+AHEAD in scroll direction.
  function isPinned(i) {
    return reduceMotion ? i === FRAME_HOLD : (i === 0 || i === FRAME_HOLD);
  }

  function isWanted(i) {
    if (isPinned(i)) return true;
    if (reduceMotion) return false;
    var lo = dir >= 0 ? target - WINDOW_BEHIND : target - WINDOW_AHEAD;
    var hi = dir >= 0 ? target + WINDOW_AHEAD : target + WINDOW_BEHIND;
    return i >= lo && i <= hi;
  }

  function release(e) {
    if (e.src.close) e.src.close();
    if (e.url) URL.revokeObjectURL(e.url);
  }

  function decodeBlob(blob) {
    if (window.createImageBitmap) {
      return createImageBitmap(blob).then(function (bm) {
        return { src: bm, w: bm.width, h: bm.height, url: null };
      });
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var im = new Image();
      im.onload = function () { resolve({ src: im, w: im.naturalWidth, h: im.naturalHeight, url: url }); };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      im.src = url;
    });
  }

  var decoding = {}, decodeFailed = {}, decodeInflight = 0;
  // Window (18) + pinned (2) + a few recently passed frames as fallbacks.
  var DECODE_BUDGET = 24;
  function decodedCount() {
    var n = 0;
    for (var i = 0; i < N_TOTAL; i++) if (decoded[i]) n++;
    return n;
  }

  function startDecode(idx) {
    decoding[idx] = true;
    decodeInflight++;
    decodeBlob(blobs[idx]).then(function (e) {
      decoding[idx] = false;
      decodeInflight--;
      // The window may have moved on while this decoded; never cache an unwanted frame.
      if (!isWanted(idx) || decoded[idx]) {
        release(e);
      } else {
        decoded[idx] = e;
        noteAspect(e.w, e.h);
        // Repaint if this is the target, or closer to it than what is showing.
        if (drawnIdx !== target &&
            (drawnIdx < 0 || Math.abs(idx - target) < Math.abs(drawnIdx - target))) {
          drawEntry(e);
          drawnIdx = idx;
        }
      }
      pumpDecode();
    }, function () {
      decoding[idx] = false;
      decodeInflight--;
      decodeFailed[idx] = true;
      pumpDecode();
    });
  }

  function pumpDecode() {
    // Evict only past the budget, farthest from target first, so frames
    // just scrolled past stay available as fallbacks while the new window
    // decodes. Drawing is synchronous, so nothing is closed mid-draw.
    var held = [];
    for (var i = 0; i < N_TOTAL; i++) {
      if (decoded[i] && !isWanted(i)) held.push(i);
    }
    var excess = decodedCount() - DECODE_BUDGET;
    if (excess > 0) {
      held.sort(function (x, y) { return Math.abs(y - target) - Math.abs(x - target); });
      for (var h = 0; h < excess && h < held.length; h++) {
        release(decoded[held[h]]);
        decoded[held[h]] = null;
      }
    }
    // Priority: target, pinned, then outward from target (ahead first).
    var want = reduceMotion ? [FRAME_HOLD] : [target, 0, FRAME_HOLD];
    if (!reduceMotion) {
      for (var d = 1; d <= WINDOW_AHEAD; d++) {
        want.push(target + dir * d);
        if (d <= WINDOW_BEHIND) want.push(target - dir * d);
      }
    }
    for (var k = 0; k < want.length && decodeInflight < MAX_DECODE; k++) {
      var j = want[k];
      if (j < 0 || j >= N_TOTAL || !isWanted(j)) continue;
      if (blobs[j] && !decoded[j] && !decoding[j] && !decodeFailed[j]) startDecode(j);
    }
  }

  pumpFetch();

  if (reduceMotion) {
    // A single held, fully-labelled frame rather than a scroll-driven scrub.
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

  function render() {
    requestAnimationFrame(render);
    var rect = track.getBoundingClientRect();
    if (rect.bottom < -400 || rect.top > window.innerHeight + 400) return;

    var p = scrollProgress();
    var idx = currentFrame(p);
    if (idx !== target) {
      dir = idx > target ? 1 : -1;
      target = idx;
      draw(idx);
      pumpDecode();
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
