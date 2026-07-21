(function () {
  'use strict';

  var filename = window.location.pathname.split('/').pop() || 'index.html';
  var versionMatch = filename.match(/^index(?:-v([2-5]))?\.html$/i);
  if (!versionMatch) return;

  var version = 'V' + (versionMatch[1] || '1');
  var sectionNames = {
    hero: 'Hero',
    categories: 'Product categories',
    solutions: 'Solutions',
    proof: 'Exploded engineering',
    stats: 'Key figures',
    about: 'About',
    work: 'The way we work',
    presence: 'Global presence',
    process: 'Development process',
    production: 'Production',
    bms: 'BMS solutions',
    contact: 'Get in touch',
    manifesto: 'Manifesto',
    explorer: 'Application explorer',
    tech: 'Technology',
    trust: 'Trust and quality',
    future: 'Future statement'
  };

  function getSectionName(section) {
    if (section.id && sectionNames[section.id]) return sectionNames[section.id];

    var classes = Array.prototype.slice.call(section.classList);
    for (var i = 0; i < classes.length; i += 1) {
      if (sectionNames[classes[i]]) return sectionNames[classes[i]];
    }

    var heading = section.querySelector('h1, h2');
    if (heading) return heading.textContent.trim().replace(/\s+/g, ' ').slice(0, 34);
    return 'Section';
  }

  var sections = Array.prototype.slice.call(document.querySelectorAll('main > section'));
  document.querySelectorAll('body > section.contact').forEach(function (section) {
    if (sections.indexOf(section) === -1) sections.push(section);
  });

  sections.forEach(function (section, index) {
    var number = String(index + 1).padStart(2, '0');
    var reference = version + '-' + number;
    var label = document.createElement('span');
    label.className = 'section-selection-label';
    label.textContent = version + ' · ' + number + ' · ' + getSectionName(section);
    label.setAttribute('aria-hidden', 'true');
    section.dataset.sectionReference = reference;
    section.insertBefore(label, section.firstChild);
  });
})();
