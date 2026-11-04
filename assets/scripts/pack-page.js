/* Battery pack pages: the three facts load in as the dark section is
   scrolled, each one when the pack has opened a little further than the one
   before. */
(function () {
  var track = document.getElementById('scTheatre');
  var facts = document.querySelectorAll('.pk-fact');
  if (!track || !facts.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('js-facts');
  var at = [0.06, 0.2, 0.34];
  function update() {
    var r = track.getBoundingClientRect(), travel = r.height - window.innerHeight;
    var p = travel > 0 ? Math.min(1, Math.max(0, -r.top / travel)) : 1;
    for (var i = 0; i < facts.length; i++) facts[i].classList.toggle('is-in', p >= at[i]);
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
