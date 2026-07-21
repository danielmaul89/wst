(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setupButtonLighting() {
    var buttons = document.querySelectorAll('.btn, .nav-contact, .card-cta, .glass-cta, .cat-explore');
    buttons.forEach(function (button) {
      button.addEventListener('pointermove', function (event) {
        var rect = button.getBoundingClientRect();
        button.style.setProperty('--button-light-x', (event.clientX - rect.left) + 'px');
        button.style.setProperty('--button-light-y', (event.clientY - rect.top) + 'px');
      });
    });
  }

  if (!reduceMotion) setupButtonLighting();

  if (reduceMotion || !('IntersectionObserver' in window)) return;

  root.classList.add('motion-ready');

  var pageName = window.location.pathname.split('/').pop() || 'index.html';
  var isHomeConcept = /^index(?:-v[2-5])?\.html$/i.test(pageName);
  if (isHomeConcept) root.classList.add('home-motion');

  function buildExplodedSequences() {
    var sourceImages = document.querySelectorAll('.proof-visual > .proof-img');
    var slices = [
      { clip: 'inset(0 0 73% 0)', offset: '-18px' },
      { clip: 'inset(27% 0 64% 0)', offset: '-14px' },
      { clip: 'inset(36% 0 45% 0)', offset: '-10px' },
      { clip: 'inset(55% 0 40% 0)', offset: '-6px' },
      { clip: 'inset(60% 0 20% 0)', offset: '-3px' },
      { clip: 'inset(80% 0 0 0)', offset: '4px' }
    ];

    sourceImages.forEach(function (source) {
      var visual = source.closest('.proof-visual');
      var sequence = document.createElement('div');
      sequence.className = 'exploded-sequence';

      source.parentNode.insertBefore(sequence, source);
      sequence.appendChild(source);
      source.classList.add('exploded-source');
      source.removeAttribute('aria-hidden');

      slices.forEach(function (slice, index) {
        var part = source.cloneNode(false);
        part.className = 'proof-img exploded-part';
        part.alt = '';
        part.setAttribute('aria-hidden', 'true');
        part.style.clipPath = slice.clip;
        part.style.setProperty('--part-offset', slice.offset);
        part.style.setProperty('--part-delay', index * 155 + 'ms');
        sequence.appendChild(part);
      });

      visual.classList.add('has-exploded-sequence');

      var sequenceObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          sequence.classList.add('is-assembled');

          var callouts = visual.querySelectorAll('.callout');
          var calloutDelays = [620, 1080, 1260, 1480];
          callouts.forEach(function (callout, index) {
            window.setTimeout(function () {
              callout.classList.add('part-visible');
            }, calloutDelays[index] || 1480);
          });

          sequenceObserver.disconnect();
        });
      }, { threshold: .28, rootMargin: '0px 0px -8% 0px' });

      sequenceObserver.observe(visual);
    });
  }

  if (isHomeConcept) buildExplodedSequences();

  var selectors = [
    '.hero-copy > *',
    '.hero-inner > h1',
    '.hero-inner > p',
    '.hero-inner > .hero-cta',
    '.hero-top',
    '.page-hero .container > *',
    '.product-hero .container > *',
    '.section-head',
    '.spec-line',
    '.about-copy',
    '.contact-copy',
    '.manifesto-copy',
    '.future-copy',
    '.category-card',
    '.work-card',
    '.process-card',
    '.production-card',
    '.bms-card',
    '.sol-tile',
    '.related-card',
    '.spec-cell',
    '.pinned-item',
    '.mini-stat',
    '.stat-item'
  ];

  if (isHomeConcept) {
    selectors = selectors.concat([
      '.work-row',
      '.trust-item',
      '.process-step',
      '.industry-tab',
      '.tech-copy > *',
      '.manifesto .container > *',
      '.future .container > *',
      '.contact-form',
      '.contact-details',
      '.presence-copy',
      '.presence-stats > *'
    ]);
  }

  var mediaSelectors = [
    '.proof-media',
    '.product-stage',
    '.case-media',
    '.presence-map',
    '.journey-media',
    '.pinned-visual-col'
  ];

  if (isHomeConcept) {
    mediaSelectors = mediaSelectors.concat([
      '.hero-stage',
      '.hero-visual',
      '.hero-diagram',
      '.proof-visual',
      '.tech-visual',
      '.industry-visual'
    ]);
  }

  var elements = Array.prototype.slice.call(
    document.querySelectorAll(selectors.join(','))
  );

  var mediaElements = Array.prototype.slice.call(
    document.querySelectorAll(mediaSelectors.join(','))
  );

  mediaElements.forEach(function (element) {
    if (elements.indexOf(element) === -1) elements.push(element);
    element.setAttribute('data-reveal', 'media');
  });

  elements.forEach(function (element) {
    if (!element.hasAttribute('data-reveal')) element.setAttribute('data-reveal', 'content');

    if (isHomeConcept && element.matches('.proof-copy, .about-copy, .contact-copy, .presence-copy, .tech-copy')) {
      element.setAttribute('data-reveal', 'left');
    }

    if (isHomeConcept && element.matches('.contact-form, .contact-details, .presence-stats > *')) {
      element.setAttribute('data-reveal', 'right');
    }

    if (isHomeConcept && element.matches('.category-card, .work-card, .process-card, .production-card, .bms-card, .sol-tile, .trust-item, .work-row')) {
      element.setAttribute('data-reveal', 'scale');
    }

    var siblings = Array.prototype.filter.call(element.parentElement.children, function (child) {
      return elements.indexOf(child) !== -1;
    });
    var index = siblings.indexOf(element);
    var stagger = isHomeConcept ? 95 : 70;
    element.style.setProperty('--reveal-delay', Math.min(Math.max(index, 0), 6) * stagger + 'ms');
  });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, {
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.08
  });

  elements.forEach(function (element) {
    observer.observe(element);
  });

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      elements.forEach(function (element) {
        if (element.getBoundingClientRect().top < window.innerHeight * 0.92) {
          element.classList.add('is-visible');
          observer.unobserve(element);
        }
      });
    });
  });
})();
