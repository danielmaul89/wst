(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setupButtonLighting() {
    var buttons = document.querySelectorAll('.btn, .nav-contact, .card-cta, .glass-cta, .cat-explore');
    buttons.forEach(function (button) {
      var currentX;
      var currentY;
      var targetX;
      var targetY;
      var animationFrame;

      function setDefaultPosition() {
        var rect = button.getBoundingClientRect();
        targetX = rect.width * .18;
        targetY = rect.height * .18;
        if (currentX === undefined) {
          currentX = targetX;
          currentY = targetY;
          button.style.setProperty('--button-light-x', currentX + 'px');
          button.style.setProperty('--button-light-y', currentY + 'px');
        }
      }

      function animateLight() {
        currentX += (targetX - currentX) * .16;
        currentY += (targetY - currentY) * .16;
        button.style.setProperty('--button-light-x', currentX + 'px');
        button.style.setProperty('--button-light-y', currentY + 'px');

        if (Math.abs(targetX - currentX) > .15 || Math.abs(targetY - currentY) > .15) {
          animationFrame = window.requestAnimationFrame(animateLight);
        } else {
          animationFrame = null;
        }
      }

      function moveLight() {
        if (!animationFrame) animationFrame = window.requestAnimationFrame(animateLight);
      }

      setDefaultPosition();

      button.addEventListener('pointermove', function (event) {
        var rect = button.getBoundingClientRect();
        targetX = event.clientX - rect.left;
        targetY = event.clientY - rect.top;
        moveLight();
      });

      button.addEventListener('pointerleave', function () {
        setDefaultPosition();
        moveLight();
      });
    });
  }

  if (!reduceMotion) setupButtonLighting();

  function setupCustomSelects() {
    var selects = document.querySelectorAll('.contact-form select');

    selects.forEach(function (select, selectIndex) {
      if (select.dataset.customized === 'true') return;
      select.dataset.customized = 'true';
      select.classList.add('select-native');

      var label = document.querySelector('label[for="' + select.id + '"]');
      var labelId = (select.id || 'custom-select-' + selectIndex) + '-label';
      var menuId = (select.id || 'custom-select-' + selectIndex) + '-menu';
      var valueId = (select.id || 'custom-select-' + selectIndex) + '-value';
      if (label) label.id = label.id || labelId;

      var shell = document.createElement('div');
      shell.className = 'select-shell';

      var trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'select-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', menuId);
      if (label) trigger.setAttribute('aria-labelledby', label.id + ' ' + valueId);

      var value = document.createElement('span');
      value.id = valueId;
      value.textContent = select.options[select.selectedIndex].text;
      trigger.appendChild(value);
      trigger.insertAdjacentHTML('beforeend', '<svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="m2 2 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');

      var menu = document.createElement('div');
      menu.className = 'select-menu';
      menu.id = menuId;
      menu.setAttribute('role', 'listbox');
      if (label) menu.setAttribute('aria-labelledby', label.id);

      Array.from(select.options).forEach(function (nativeOption, optionIndex) {
        if (nativeOption.value === '') return;
        var option = document.createElement('button');
        option.type = 'button';
        option.className = 'select-option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', nativeOption.selected ? 'true' : 'false');
        option.dataset.value = nativeOption.value;
        option.dataset.index = optionIndex;
        option.textContent = nativeOption.text;
        menu.appendChild(option);
      });

      select.parentNode.insertBefore(shell, select);
      shell.appendChild(select);
      shell.appendChild(trigger);
      shell.appendChild(menu);

      if (label) {
        label.addEventListener('click', function (event) {
          event.preventDefault();
          trigger.focus();
        });
      }

      function options() { return Array.from(menu.querySelectorAll('.select-option')); }
      function closeMenu(returnFocus) {
        shell.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (returnFocus) trigger.focus();
      }
      function openMenu() {
        document.querySelectorAll('.select-shell.is-open').forEach(function (openShell) {
          if (openShell !== shell) {
            openShell.classList.remove('is-open');
            openShell.querySelector('.select-trigger').setAttribute('aria-expanded', 'false');
          }
        });
        shell.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
      function choose(option) {
        select.value = option.dataset.value;
        value.textContent = option.textContent;
        options().forEach(function (item) {
          item.setAttribute('aria-selected', item === option ? 'true' : 'false');
        });
        select.dispatchEvent(new Event('change', { bubbles: true }));
        closeMenu(true);
      }

      trigger.addEventListener('click', function () {
        if (shell.classList.contains('is-open')) closeMenu(false);
        else openMenu();
      });
      trigger.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openMenu();
          var selected = menu.querySelector('[aria-selected="true"]') || options()[0];
          if (selected) selected.focus();
        }
      });
      menu.addEventListener('click', function (event) {
        var option = event.target.closest('.select-option');
        if (option) choose(option);
      });
      menu.addEventListener('keydown', function (event) {
        var items = options();
        var current = items.indexOf(document.activeElement);
        var next = current;
        if (event.key === 'ArrowDown') next = Math.min(current + 1, items.length - 1);
        else if (event.key === 'ArrowUp') next = Math.max(current - 1, 0);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        else if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); return; }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (current > -1) choose(items[current]); return; }
        else return;
        event.preventDefault();
        if (items[next]) items[next].focus();
      });

      document.addEventListener('click', function (event) {
        if (!shell.contains(event.target)) closeMenu(false);
      });
    });
  }

  setupCustomSelects();

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
