/* Writes the battery pack pages (pack-*.html) from scripts/pack-pages.json.
   Run from the repository root:  node scripts/build-pack-pages.js
   The layout lives in assets/styles/pack-page.css; the words, the stills and
   the render sets for each pack live in the JSON. */
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scripts/pack-pages.json', 'utf8'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function page(pack) {
  const f = pack.frames;
  const v = pack.view;
  const canvas = '<canvas class="sc-canvas" id="scFrame" data-frame-dir="' + f.dir + '" data-frame-ext="webp" data-frame-widths="1280,1920" data-big-screen data-frame-aspect="1.6" data-frame-pad="4" data-frame-count="80" data-frame-hold="79" data-explode-end="' + (f.explodeEnd || 0.5) + '" data-hold-end="' + (f.holdEnd || 0.84) + '" data-stays-open data-frame-ver="' + f.ver + '"' + (f.mirror ? ' data-mirror' : '') + '></canvas>';
  const facts = pack.facts.map((x) => '        <div class="pk-fact"><dt>' + esc(x.label) + '</dt><dd><span class="big">' + esc(x.big) + '</span><span class="note">' + esc(x.note) + '</span></dd></div>').join('\n');
  const gallery = data.gallery.map((g) => '      <div class="wst-gallery-item"><img src="' + g.src + '" alt="' + esc(g.alt) + '" loading="lazy" decoding="async"></div>').join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>${esc(pack.name)} | WS Technicals</title>
<meta name="description" content="${esc(pack.description)}">
<link rel="icon" type="image/svg+xml" href="assets/logo/icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/styles/wst-design-system.css?v=p2w">
<link rel="stylesheet" href="assets/styles/wst-components.css?v=p3c">
<link rel="stylesheet" href="assets/styles/enterprise-polish.css?v=p1b">
<link rel="stylesheet" href="assets/styles/wst-model-theatre.css?v=5">
<link rel="stylesheet" href="assets/styles/pack-page.css?v=3">
</head>
<body data-wst-page="solutions">

<div data-wst-header></div>

<main class="pk-main">

<div class="wst-ambient wst-ambient--hero" aria-hidden="true">
  <span class="wst-ambient-blob wst-ambient-blob--brass"></span>
  <span class="wst-ambient-blob wst-ambient-blob--grey"></span>
  <span class="wst-ambient-blob wst-ambient-blob--blue"></span>
</div>

<!-- 1. Hero: words on one side, a still of the pack on the other. -->
<section class="wst-page-hero wst-page-hero--cutout pk-hero">
  <div class="container wst-page-hero-grid">
    <div class="wst-page-hero-copy">
      <a class="wst-back-link" data-wst-back="battery-packs.html" href="battery-packs.html" hidden><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M11 7H3M7 3 3 7l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Back to battery packs</a>
      <span class="eyebrow">Battery pack</span>
      <h1 class="t-display">${esc(pack.name)}.</h1>
      <p class="wst-page-hero-intro">${esc(pack.intro)}</p>
      <a href="contact-v2.html" class="btn btn-primary">Discuss this pack</a>
    </div>
    <figure class="wst-page-hero-media">
      <img src="${pack.still.src}" alt="${esc(pack.still.alt)}" width="${pack.still.width}" height="${pack.still.height}" fetchpriority="high" decoding="async">
    </figure>
  </div>
</section>

<!-- 2. Dark section: the pack opens as the page scrolls, with three facts beside it.
     Pre-rendered in Blender from the production CAD (every part is drawn) and
     stepped through by scroll (assets/scripts/hero-scroll-theatre.js). -->
<section class="pk-stage wst-section--dark on-dark" aria-label="The pack in 3D">
  <div class="wst-blueprint-grid wst-blueprint-grid--behind" aria-hidden="true"></div>
  <div class="sc-theatre sc-theatre--open pk-theatre" id="scTheatre" style="--pk-zoom:${v.zoom};--pk-x:${v.x}%;--pk-y:${v.y}%">
    <div class="sc-stage">
      <div class="sc-screen" id="scScreen">
        ${canvas}
        <div class="sc-callouts" id="scCallouts" aria-hidden="true"></div>
        <div class="sc-hint" id="scHint">
          <span>Scroll</span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v11M3 9l5 5 5-5" stroke="#C7CCDE" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
      <dl class="pk-facts">
${facts}
      </dl>
    </div>
  </div>
</section>

<!-- 3. Gallery: the pack, and the work around it. -->
<section class="wst-section">
  <div class="container">
    <div class="wst-section-head">
      <h2>The pack, up close.</h2>
      <p>Cells, assembly and test, from the production floor.</p>
    </div>
    <div class="wst-gallery wst-gallery--mosaic pk-gallery">
${gallery}
    </div>
  </div>
</section>

</main>
<div data-wst-footer></div>
<script src="assets/scripts/wst-shell.js?v=nav14"></script>
<script src="assets/scripts/hero-scroll-theatre.js?v=13" defer></script>
<script src="assets/scripts/enterprise-motion.js?v=publish1" defer></script>
<script src="assets/scripts/pack-page.js?v=1" defer></script>
</body>
</html>
`;
}

for (const pack of data.packs) {
  fs.writeFileSync(pack.file, page(pack));
  console.log('wrote', pack.file);
}
