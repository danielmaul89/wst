/* Scroll-scrubbed pre-rendered pack theatre.
   Drives a pre-rendered Blender frame sequence (still -> explode+rotate to
   a fixed "callout angle" -> HOLD there, frozen -> reassemble+rotate back
   -> still) by scroll position, the same track/stage pattern
   product-3d-showcase.js uses for the live WebGL teardown (scrollProgress()
   off the track's own bounding rect), but swapping a WebGL canvas for a
   single <img> whose src is swapped per scroll step.

   Callout labels/leader lines only make sense while the camera and parts
   are frozen at the hold frame, so they only ever show during that middle
   band of scroll progress - they fade out the moment reassembly starts,
   since their fixed screen-space anchors would otherwise drift off the
   parts as the pack and camera move again. */
(function () {
  'use strict';

  var track = document.getElementById('scTheatre');
  var frameImg = document.getElementById('scFrame');
  var calloutsHost = document.getElementById('scCallouts');
  var hint = document.getElementById('scHint');
  if (!track || !frameImg) return;

  var DIR = frameImg.getAttribute('data-frame-dir');
  var EXT = frameImg.getAttribute('data-frame-ext') || 'jpg';
  var PAD = parseInt(frameImg.getAttribute('data-frame-pad'), 10) || 4;
  var N_TOTAL = parseInt(frameImg.getAttribute('data-frame-count'), 10) || 98;
  var FRAME_HOLD = parseInt(frameImg.getAttribute('data-frame-hold'), 10) || 49;
  var FRAME_LAST = N_TOTAL - 1;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frameUrl(i) {
    var s = String(i);
    while (s.length < PAD) s = '0' + s;
    return DIR + '/frame_' + s + '.' + EXT;
  }

  // Warm the cache; playback does not wait on this.
  for (var i = 0; i < N_TOTAL; i++) {
    var warm = new Image();
    warm.src = frameUrl(i);
  }

  var calloutEls = [];

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
      calloutEls.push({ leader: leader, el: el, data: c });
    });
  }

  fetch(DIR + '/callouts.json')
    .then(function (r) { return r.json(); })
    .then(buildCallouts)
    .catch(function () { /* no callouts.json: theatre still works without labels */ });

  var MIN_LABEL_GAP = 30; // px between adjacent label centres - two anchors
                          // 2-3% of frame height apart otherwise read as
                          // touching text, not two separate callouts.

  function layoutCallouts(revealFrac) {
    var hostW = calloutsHost.clientWidth;
    var hostH = calloutsHost.clientHeight;
    var labelX = hostW * 0.82;

    // Label Y starts at each anchor's own Y, then gets pushed apart just
    // enough to clear its neighbours - one pass down, one back up, same
    // idea as product-3d-showcase.js's column relaxation but simpler,
    // since these anchors are fixed (one frozen frame) rather than
    // recomputed every animation tick.
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
      var threshold = idx / Math.max(1, calloutEls.length);
      var on = revealFrac > threshold;
      c.leader.classList.toggle('is-on', on);
      c.el.classList.toggle('is-on', on);
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
    frameImg.src = frameUrl(FRAME_HOLD);
    if (hint) hint.style.display = 'none';
    fetch(DIR + '/callouts.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        buildCallouts(data);
        requestAnimationFrame(function () { layoutCallouts(1); });
      })
      .catch(function () {});
    return;
  }

  frameImg.src = frameUrl(0);

  var lastIdx = 0;
  function render() {
    requestAnimationFrame(render);
    var rect = track.getBoundingClientRect();
    if (rect.bottom < -400 || rect.top > window.innerHeight + 400) return;

    var p = scrollProgress();
    var idx = currentFrame(p);
    if (idx !== lastIdx) {
      frameImg.src = frameUrl(idx);
      lastIdx = idx;
    }
    if (hint) hint.style.opacity = p > 0.02 ? '0' : '1';

    if (p <= EXPLODE_END || p > HOLD_END) {
      layoutCallouts(0);
    } else {
      layoutCallouts((p - EXPLODE_END) / (HOLD_END - EXPLODE_END));
    }
  }
  requestAnimationFrame(render);
})();
