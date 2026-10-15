/* Battery packs, floating: the backdrop behind the pack theatres.
   The packs themselves are pre-rendered Blender frame sets stepped by
   hero-scroll-theatre.js; this only paints the one continuous colour that
   follows the page from blue, through white, to golden sand, with the drawing
   grid always on. How far down the page you are (itself eased, so a flick of
   the wheel cannot jump it) sets how much of each wash shows, and both fade
   through zero rather than switching. Every write is a transform or an
   opacity, which the browser composites without repainting anything. */
(function () {
  'use strict';
  var stage = document.getElementById('floatStage');
  if (!stage) return;

  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function layer(cls) { var d = document.createElement('div'); d.className = cls; return d; }

  var bg = layer('float-bg');
  var blue = layer('float-wash');
  blue.style.background = 'radial-gradient(75vmax 65vmax at 12% 6%, rgba(15,42,92,.5), rgba(15,42,92,0) 100%)';
  var sand = layer('float-wash');
  sand.style.background = 'radial-gradient(80vmax 70vmax at 88% 94%, rgba(203,176,138,.75), rgba(203,176,138,0) 100%), radial-gradient(60vmax 40vmax at 28% 104%, rgba(203,176,138,.45), rgba(203,176,138,0) 100%)';
  [layer('float-backdrop'), blue, sand, layer('float-grid')].forEach(function (el) { bg.appendChild(el); });
  stage.appendChild(bg);
  /* Fades in over what the page already shows, so nothing snaps when it starts. */
  setTimeout(function () { bg.classList.add('is-on'); }, 50);

  var flowEl = document.querySelector('.float-flow');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bgP = -1, last = 0;

  function paint(now) {
    requestAnimationFrame(paint);
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    var sy = window.scrollY || 0, H = window.innerHeight, W = window.innerWidth;
    var end = flowEl ? flowEl.getBoundingClientRect().bottom + sy : document.documentElement.scrollHeight;
    var target = clamp01(sy / Math.max(1, end - H));
    bgP = bgP < 0 || reduce ? target : bgP + (target - bgP) * (1 - Math.exp(-dt * 3));
    blue.style.opacity = (1 - smooth((bgP - 0.04) / 0.46)).toFixed(3);
    sand.style.opacity = smooth((bgP - 0.42) / 0.52).toFixed(3);
    var drift = reduce ? 'none' :
      'translate3d(' + (W * 0.03 * Math.sin(bgP * 6)).toFixed(1) + 'px,' + (H * 0.03 * Math.cos(bgP * 5)).toFixed(1) + 'px,0)';
    blue.style.transform = drift;
    sand.style.transform = drift;
  }
  requestAnimationFrame(paint);
})();
