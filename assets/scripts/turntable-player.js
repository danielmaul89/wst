/* Frame-sequence turntable player.
   Preloads a numbered PNG sequence and plays it on a <canvas> in a loop.
   Honours prefers-reduced-motion by drawing frame 0 only and stopping there,
   the same convention the rest of the site's motion follows. */
(function () {
  'use strict';

  function initTurntable(host) {
    var dir = host.getAttribute('data-turntable-dir');
    var count = parseInt(host.getAttribute('data-turntable-count'), 10);
    var fps = parseFloat(host.getAttribute('data-turntable-fps')) || 24;
    var pad = parseInt(host.getAttribute('data-turntable-pad'), 10) || 4;
    var ext = host.getAttribute('data-turntable-ext') || 'png';
    if (!dir || !count) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'turntable-canvas';
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var frames = [];
    var loaded = 0;
    var ready = false;

    function frameUrl(i) {
      var s = String(i);
      while (s.length < pad) s = '0' + s;
      return dir + '/frame_' + s + '.' + ext;
    }

    function draw(img) {
      if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    }

    for (var i = 0; i < count; i++) {
      (function (idx) {
        var img = new Image();
        img.onload = function () {
          loaded++;
          if (idx === 0) draw(img);
          if (loaded === count) {
            ready = true;
            host.classList.add('is-ready');
            if (!reduceMotion) start();
          }
        };
        img.src = frameUrl(idx);
        frames[idx] = img;
      })(i);
    }

    var current = 0;
    var lastTick = 0;
    var rafId = null;

    function step(now) {
      rafId = requestAnimationFrame(step);
      if (!lastTick) lastTick = now;
      var interval = 1000 / fps;
      if (now - lastTick < interval) return;
      lastTick = now;
      current = (current + 1) % count;
      draw(frames[current]);
    }

    function start() {
      if (rafId) return;
      rafId = requestAnimationFrame(step);
    }

    // Pause while off-screen; resume when back in view.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!ready || reduceMotion) return;
          if (entry.isIntersecting) start();
          else if (rafId) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
        });
      }, { threshold: 0.1 });
      io.observe(host);
    }
  }

  function init() {
    var hosts = document.querySelectorAll('[data-turntable-dir]');
    hosts.forEach(function (host) { initTurntable(host); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
