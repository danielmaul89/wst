/* Battery packs (stills): each pack's picture and words come in as the row is
   scrolled to. The page only hides them once this script is running, so
   without it everything simply shows. */
(function () {
  'use strict';
  var rows = document.querySelectorAll('.packs-reveal');
  if (!rows.length) return;
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('js-reveal');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.22, rootMargin: '0px 0px -8% 0px' });
  rows.forEach(function (r) { io.observe(r); });
})();
