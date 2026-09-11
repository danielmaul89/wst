/* ===================================================================
   Platform teardown — v2.

   Same engine as product-3d-showcase.js (staged separation, keyframed
   camera, runtime studio environment), tuned for restraint:

   - Neutral graphite palette instead of a blue-tinted studio, so it reads
     as a product photograph rather than a 3D demo.
   - A longer lens (28mm-equivalent FOV) and a much narrower orbit. Less
     perspective distortion and less camera movement both read as more
     considered.
   - Callouts are numbered and carry the part name only.

   Kept as its own file rather than parameterising v1, matching how the
   solutions-v* variants are handled here: the two are comparison pieces
   that will keep diverging, and edits to one must not disturb the other.
   =================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('twCanvas');
  var stage = document.getElementById('twScreen');
  var track = document.getElementById('twTheatre');
  if (!canvas || !stage || !track || !window.THREE || !window.THREE.FBXLoader) return;

  var THREE = window.THREE;
  var loaderEl = document.getElementById('twLoader');
  var loaderPct = document.getElementById('twLoaderPct');
  var loaderBar = document.getElementById('twLoaderBar');
  var calloutLayer = document.getElementById('twCallouts');
  var captionsEl = document.getElementById('twCaptions');
  var captionEls = document.querySelectorAll('.tw-caption');
  var railFill = document.getElementById('twRailFill');
  var railActs = document.getElementById('twRailActs');
  var hintEl = document.getElementById('twHint');
  var partCountEl = document.getElementById('twPartCount');

  var MODEL_URL = 'assets/models/c4e.fbx';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ACT_SEPARATE = 0.14;
  var ACT_INSPECT  = 0.46;
  var ACT_ASSEMBLE = 0.72;
  var STAGGER = 0.55;

  /* A much tighter orbit than v1 — about 65 degrees end to end rather than
     150. The restraint is the point: the product moves, the camera mostly
     observes. */
  var CAM_KEYS = [
    { at: 0.00, az: -0.38, pol: 1.26, zoom: 0.05, fov: 28 },
    { at: 0.13, az: -0.26, pol: 1.23, zoom: 0.12, fov: 28 },
    { at: 0.46, az:  0.10, pol: 1.12, zoom: 1.00, fov: 29 },
    { at: 0.60, az:  0.42, pol: 1.24, zoom: 0.95, fov: 29 },
    { at: 0.72, az:  0.62, pol: 1.16, zoom: 0.97, fov: 29 },
    { at: 1.00, az:  0.78, pol: 1.22, zoom: 0.07, fov: 28 }
  ];

  var INTRO_MS = 2800;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function staggered(a, delay) { return clamp01((a - delay * STAGGER) / (1 - STAGGER)); }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    if (loaderPct) loaderPct.textContent = 'Unavailable';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(28, 1, 0.1, 6000);
  var group = new THREE.Group();
  scene.add(group);

  /* Neutral studio, prefiltered into an environment map at runtime so no
     HDR file has to ship. */
  function buildEnvScene() {
    var env = new THREE.Scene();
    var geo = new THREE.PlaneGeometry(1, 1);
    function panel(hex, intensity, pos, rot, sx, sy) {
      var mat = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide });
      mat.color.multiplyScalar(intensity);
      var m = new THREE.Mesh(geo, mat);
      m.position.set(pos[0], pos[1], pos[2]);
      m.rotation.set(rot[0], rot[1], rot[2]);
      m.scale.set(sx, sy, 1);
      env.add(m);
    }
    panel(0x0e0f12, 1.0, [0, 0, -14], [0, 0, 0], 40, 40);
    panel(0xffffff, 4.0, [0, 9, 0.5], [-Math.PI / 2, 0, 0], 15, 15);
    panel(0xf2f4f7, 1.7, [0, 2.6, -9.5], [0, 0, 0], 15, 9);
    panel(0xe0e5ee, 1.15, [-8.5, 2.2, 2], [0, Math.PI / 2, 0], 13, 9);
    panel(0xffffff, 0.8, [8.5, 2.2, 2], [0, -Math.PI / 2, 0], 13, 9);
    return env;
  }

  var pmrem = new THREE.PMREMGenerator(renderer);
  var envTarget = pmrem.fromScene(buildEnvScene(), 0.04);
  scene.environment = envTarget.texture;
  pmrem.dispose();

  var key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(5.5, 8.5, 6);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0xdde6f5, 1.3);
  rim.position.set(-6, 3.5, -7.5);
  scene.add(rim);
  var fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(-4, 1.5, 6);
  scene.add(fill);

  function std(color, metalness, roughness) {
    return new THREE.MeshStandardMaterial({ color: color, metalness: metalness, roughness: roughness });
  }
  /* Desaturated throughout — the brass on the busbars is the only colour
     allowed to carry, and even that is pulled back from v1. */
  var MATS = {
    casing:  std(0x16171a, 0.55, 0.46),
    lid:     std(0x24262b, 0.62, 0.36),
    polymer: std(0x2a2c31, 0.05, 0.85),
    cell:    std(0xb4b8bd, 0.90, 0.30),
    busbar:  std(0xb08a5c, 0.90, 0.30),
    board:   std(0x1b2b26, 0.30, 0.60),
    cable:   std(0x0d0e10, 0.20, 0.78),
    soft:    std(0x1e1f23, 0.05, 0.92),
    steel:   std(0x8e9298, 0.94, 0.32),
    neutral: std(0x44474d, 0.50, 0.50)
  };

  var MAT_RULES = [
    { test: 'lid', mat: 'lid' },
    { test: 'cover', mat: 'lid' },
    { test: 'harness', mat: 'cable' },
    { test: 'cable', mat: 'cable' },
    { test: 'wire', mat: 'cable' },
    { test: 'solder', mat: 'steel' },
    { test: 'ntc', mat: 'cable' },
    { test: 'busbar', mat: 'busbar' },
    { test: 'terminal', mat: 'busbar' },
    { test: 'board', mat: 'board' },
    { test: 'pcb', mat: 'board' },
    { test: 'fr4', mat: 'board' },
    { test: 'dzlr', mat: 'board' },
    { test: 'bms', mat: 'board' },
    { test: 'cell', mat: 'cell' },
    { test: 'highstar', mat: 'cell' },
    { test: 'inr2', mat: 'cell' },
    { test: 'holder', mat: 'polymer' },
    { test: 'tray', mat: 'polymer' },
    { test: 'divider', mat: 'polymer' },
    { test: 'spacer', mat: 'polymer' },
    { test: 'tape', mat: 'soft' },
    { test: 'eva', mat: 'soft' },
    { test: 'foam', mat: 'soft' },
    { test: 'rubber', mat: 'soft' },
    { test: 'epdm', mat: 'soft' },
    { test: 'seal', mat: 'soft' },
    { test: 'screw', mat: 'steel' },
    { test: 'bolt', mat: 'steel' },
    { test: 'nut', mat: 'steel' },
    { test: 'washer', mat: 'steel' },
    { test: 'bn_', mat: 'steel' },
    { test: 'iso_', mat: 'steel' },
    { test: 'gb_', mat: 'steel' },
    { test: 'casing', mat: 'casing' },
    { test: 'enclosure', mat: 'casing' },
    { test: 'housing', mat: 'casing' },
    { test: 'case', mat: 'casing' }
  ];

  function materialFor(name) {
    var lower = (name || '').toLowerCase();
    for (var i = 0; i < MAT_RULES.length; i++) {
      if (lower.indexOf(MAT_RULES[i].test) !== -1) return MATS[MAT_RULES[i].mat];
    }
    return MATS.neutral;
  }

  var LAYER_TIERS = [
    { test: 'lid', y: 4.05 },
    { test: 'cover', y: 4.05 },
    { test: 'harness', y: 3.15 },
    { test: 'cable', y: 3.15 },
    { test: 'wire', y: 3.15 },
    { test: 'connector', y: 3.15 },
    { test: 'solder', y: 3.15 },
    { test: 'ntc', y: 3.15 },
    { test: 'board', y: 2.62 },
    { test: 'pcb', y: 2.62 },
    { test: 'fr4', y: 2.62 },
    { test: 'cmu', y: 2.62 },
    { test: 'bms', y: 2.62 },
    { test: 'dzlr', y: 2.62 },
    { test: 'tape', y: 2.20 },
    { test: 'eva', y: 2.20 },
    { test: 'foam', y: 2.20 },
    { test: 'rubber', y: 2.20 },
    { test: 'epdm', y: 2.20 },
    { test: 'seal', y: 2.20 },
    { test: 'busbar', y: 2.05 },
    { test: 'terminal', y: 2.05 },
    { test: 'top', y: 1.78 },
    { test: 'cell', y: 1.16 },
    { test: 'highstar', y: 1.16 },
    { test: 'inr2', y: 1.16 },
    { test: 'bottom', y: 0.60 },
    { test: 'holder', y: 0.60 },
    { test: 'tray', y: 0.60 },
    { test: 'divider', y: 0.60 },
    { test: 'spacer', y: 0.60 },
    { test: 'casing', anchor: true },
    { test: 'enclosure', anchor: true },
    { test: 'housing', anchor: true },
    { test: 'case', anchor: true }
  ];
  var TIER_MAX = 4.05;

  function tierFor(name) {
    var lower = (name || '').toLowerCase();
    for (var i = 0; i < LAYER_TIERS.length; i++) {
      if (lower.indexOf(LAYER_TIERS[i].test) !== -1) return LAYER_TIERS[i];
    }
    return null;
  }

  /* Declared top of stack downward, so the numbering runs 01..07 down the
     exploded column. */
  var CALLOUT_SPECS = [
    { test: 'casinglid', name: 'Casing lid' },
    { test: 'harness', name: 'Cable harness' },
    { test: 'dzlr', name: 'BMS board' },
    { test: 'busbar', name: 'Busbars' },
    { test: 'cellholder', name: 'Cell holders' },
    { test: 'highstar', name: '21700 cells' },
    { test: 'maincasing', name: 'Main casing' }
  ];

  var lastW = 0, lastH = 0;
  function resize() {
    var rect = stage.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);

  /* CAD exports nest sub-assemblies under their own unit-conversion scale
     nodes, so a world-space distance written straight into a local
     position gets rescaled by whatever that sub-tree does. */
  function worldToLocalDelta(mesh, worldPos, worldOffset) {
    var parent = mesh.parent;
    if (!parent) return worldOffset.clone();
    var a = parent.worldToLocal(worldPos.clone());
    var b = parent.worldToLocal(worldPos.clone().add(worldOffset));
    return b.sub(a);
  }

  var parts = [];
  var callouts = [];
  var modelReady = false;
  var center = new THREE.Vector3();
  var distTight = 10, distWide = 20, stackRise = 1, composeBase = 0;
  var shadowMesh = null, shadowBaseScale = 1;

  var progress = 0;
  var introMix = 1;
  var introStart = 0;
  var introDone = false;

  var _v = new THREE.Vector3();
  var _q = new THREE.Quaternion();
  var _target = new THREE.Vector3();

  /* Fits to the box rather than the bounding sphere, which circumscribes
     it and would leave about a third of the frame empty. */
  function fitDistance(halfW, halfH, margin) {
    var tan = Math.tan(camera.fov * (Math.PI / 180) / 2);
    return Math.max(halfH / tan, halfW / (tan * Math.max(camera.aspect, 0.2))) * margin;
  }

  function makeContactShadow(radius, floorY) {
    var size = 256;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.82)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var mat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.78
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, floorY - radius * 0.015, center.z);
    shadowBaseScale = radius * 3.1;
    mesh.scale.set(shadowBaseScale, shadowBaseScale, 1);
    mesh.renderOrder = -1;
    group.add(mesh);
    return mesh;
  }

  new THREE.FBXLoader().load(
    MODEL_URL,
    function (object) {
      try {
        var box = new THREE.Box3().setFromObject(object);
        var size = new THREE.Vector3();
        box.getSize(size);
        object.scale.setScalar(2.6 / (Math.max(size.x, size.y, size.z) || 1));
        object.updateMatrixWorld(true);

        var sBox = new THREE.Box3().setFromObject(object);
        var sCenter = new THREE.Vector3();
        sBox.getCenter(sCenter);
        object.position.sub(sCenter);
        group.add(object);
        object.updateMatrixWorld(true);

        var box2 = new THREE.Box3().setFromObject(object);
        var sphere = box2.getBoundingSphere(new THREE.Sphere());
        center.copy(sphere.center);
        var radius = sphere.radius;
        var minY = box2.min.y;
        var height = Math.max(box2.max.y - minY, 1e-4);
        var UP = new THREE.Vector3(0, 1, 0);

        var candidates = {};
        var index = 0;

        object.traverse(function (child) {
          if (!child.isMesh) return;
          child.material = materialFor(child.name);

          var worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);
          var yFrac = clamp01((worldPos.y - minY) / height);

          var tier = tierFor(child.name);
          var dist, tierY;
          if (tier && tier.anchor) {
            tierY = 0.1;
            dist = radius * 0.14;
          } else if (tier) {
            tierY = tier.y;
            dist = radius * tier.y;
          } else {
            tierY = 0.25 + yFrac * 3.4;
            dist = radius * tierY;
          }

          var seq = clamp01(1 - tierY / TIER_MAX);

          var lateral = new THREE.Vector3(worldPos.x - center.x, 0, worldPos.z - center.z);
          if (lateral.lengthSq() < 1e-8) lateral.set(Math.cos(index * 2.4), 0, Math.sin(index * 2.4));
          /* A shallower bow than v1 — just enough to avoid parts sliding on
             rails, not enough to read as flourish. */
          lateral.normalize().multiplyScalar(radius * 0.045);

          parts.push({
            mesh: child,
            seq: seq,
            basePos: child.position.clone(),
            baseQuat: child.quaternion.clone(),
            deltaUp: worldToLocalDelta(child, worldPos, UP.clone().multiplyScalar(dist)),
            deltaArc: worldToLocalDelta(child, worldPos, lateral),
            spinAxis: new THREE.Vector3(
              Math.sin(index * 1.7), Math.cos(index * 0.9) * 0.4, Math.cos(index * 2.3)
            ).normalize(),
            spinAmp: 0.028 + (index % 7) * 0.003,
            each: 1,
            dist: dist
          });

          var lname = (child.name || '').toLowerCase();
          for (var ci = 0; ci < CALLOUT_SPECS.length; ci++) {
            if (lname.indexOf(CALLOUT_SPECS[ci].test) === -1) continue;
            var b = new THREE.Box3().setFromObject(child);
            var s = new THREE.Vector3(); b.getSize(s);
            var vol = Math.max(s.x * s.y * s.z, 1e-9);
            if (!candidates[ci] || vol > candidates[ci].vol) candidates[ci] = { mesh: child, vol: vol };
          }
          index++;
        });

        var maxReach = radius;
        for (var i = 0; i < parts.length; i++) maxReach = Math.max(maxReach, radius + parts[i].dist);
        stackRise = maxReach - radius;

        shadowMesh = makeContactShadow(radius, minY);

        resize();
        var bSize = new THREE.Vector3();
        box2.getSize(bSize);
        var halfW = Math.sqrt(bSize.x * bSize.x + bSize.z * bSize.z) / 2;
        var halfH = bSize.y / 2;
        distTight = fitDistance(halfW, halfH, 1.62);
        distWide = fitDistance(halfW * 1.1, halfH + stackRise * 0.62, 1.04);
        composeBase = halfH * 0.20;
        camera.near = Math.max(0.01, distTight / 140);
        camera.far = distWide * 24;
        camera.updateProjectionMatrix();

        for (var k = 0; k < CALLOUT_SPECS.length; k++) {
          if (!candidates[k]) continue;
          var num = ('0' + (callouts.length + 1)).slice(-2);
          var leader = document.createElement('div');
          leader.className = 'tw-leader';
          var el = document.createElement('div');
          el.className = 'tw-callout';
          el.innerHTML =
            '<span class="tw-callout-num">' + num + '</span>' +
            '<span class="tw-callout-name">' + CALLOUT_SPECS[k].name + '</span>';
          if (calloutLayer) { calloutLayer.appendChild(leader); calloutLayer.appendChild(el); }
          callouts.push({ el: el, leader: leader, mesh: candidates[k].mesh, on: false, ly: 0 });
        }

        if (partCountEl) partCountEl.textContent = String(parts.length);

        applyLayout();
        modelReady = true;
        introStart = (window.performance || Date).now();
        if (loaderEl) {
          loaderEl.classList.add('is-done');
          setTimeout(function () { loaderEl.hidden = true; }, 950);
        }
      } catch (err) {
        if (loaderPct) loaderPct.textContent = 'Error';
        var lbl = loaderEl ? loaderEl.querySelector('.tw-loader-label') : null;
        if (lbl) lbl.textContent = 'Could not display the model (' + err.message + ')';
      }
    },
    function (xhr) {
      if (!xhr.lengthComputable) return;
      var pct = Math.round((xhr.loaded / xhr.total) * 100);
      if (loaderPct) loaderPct.textContent = pct + '%';
      if (loaderBar) loaderBar.style.width = pct + '%';
    },
    function () {
      if (loaderPct) loaderPct.textContent = 'Error';
      var lbl = loaderEl ? loaderEl.querySelector('.tw-loader-label') : null;
      if (lbl) lbl.textContent = 'The model could not be loaded';
    }
  );

  function applyLayout() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var t = p.each;
      var arc = Math.sin(t * Math.PI);
      p.mesh.position.copy(p.basePos)
        .addScaledVector(p.deltaUp, t)
        .addScaledVector(p.deltaArc, arc);
      if (reduceMotion) continue;
      _q.setFromAxisAngle(p.spinAxis, arc * p.spinAmp);
      p.mesh.quaternion.copy(p.baseQuat).multiply(_q);
    }
  }

  function partSeparation(p, seq) {
    if (p <= ACT_SEPARATE) return 0;
    if (p < ACT_INSPECT) {
      return easeOutCubic(staggered((p - ACT_SEPARATE) / (ACT_INSPECT - ACT_SEPARATE), seq));
    }
    if (p < ACT_ASSEMBLE) return 1;
    return 1 - easeInOutCubic(staggered((p - ACT_ASSEMBLE) / (1 - ACT_ASSEMBLE), 1 - seq));
  }

  function introSeparation(mix, seq) {
    return 1 - easeInOutCubic(staggered(1 - mix, 1 - seq));
  }

  function sampleCamera(p) {
    var a = CAM_KEYS[0], b = CAM_KEYS[CAM_KEYS.length - 1];
    for (var i = 0; i < CAM_KEYS.length - 1; i++) {
      if (p >= CAM_KEYS[i].at && p <= CAM_KEYS[i + 1].at) { a = CAM_KEYS[i]; b = CAM_KEYS[i + 1]; break; }
    }
    var span = b.at - a.at;
    var k = span <= 0 ? 0 : smoothstep(clamp01((p - a.at) / span));
    return {
      az: a.az + (b.az - a.az) * k,
      pol: a.pol + (b.pol - a.pol) * k,
      zoom: a.zoom + (b.zoom - a.zoom) * k,
      fov: a.fov + (b.fov - a.fov) * k
    };
  }

  var lastAct = -1;
  function setAct(act) {
    if (act === lastAct) return;
    lastAct = act;
    for (var i = 0; i < captionEls.length; i++) {
      captionEls[i].classList.toggle('is-active', Number(captionEls[i].getAttribute('data-act')) === act);
    }
    if (railActs) {
      var items = railActs.children;
      for (var j = 0; j < items.length; j++) items[j].classList.toggle('is-on', j === act);
    }
  }

  function actFor(p) {
    if (p < ACT_SEPARATE) return 0;
    if (p < ACT_INSPECT) return 1;
    if (p < ACT_ASSEMBLE) return 2;
    return 3;
  }

  var lastCaptionDim = -1;

  function updateCallouts(p, w, h) {
    var reveal = clamp01((p - (ACT_INSPECT - 0.06)) / 0.16);
    var fade = 1 - clamp01((p - (ACT_ASSEMBLE - 0.04)) / 0.07);

    if (captionsEl) {
      var dim = Math.round((1 - reveal * fade * 0.74) * 100) / 100;
      if (dim !== lastCaptionDim) { lastCaptionDim = dim; captionsEl.style.opacity = dim; }
    }

    var live = [];
    for (var i = 0; i < callouts.length; i++) {
      var c = callouts[i];
      var on = reveal > (i / Math.max(1, callouts.length)) * 0.75 && fade > 0.5;
      if (on) {
        c.mesh.getWorldPosition(_v);
        _v.project(camera);
        if (_v.z > 1) on = false;
      }
      if (on !== c.on) {
        c.on = on;
        c.el.classList.toggle('is-on', on);
        c.leader.classList.toggle('is-on', on);
      }
      if (!on) continue;
      c.ax = (_v.x * 0.5 + 0.5) * w;
      c.ay = (1 - (_v.y * 0.5 + 0.5)) * h;
      live.push(c);
    }
    if (!live.length) return;

    /* Labels share one alignment column, so push them apart where two
       parts project to nearly the same height, then shift the set back
       inside the frame. */
    live.sort(function (a, b) { return a.ay - b.ay; });
    var GAP = 36, top = 78, bottom = h - 64;
    for (var j = 0; j < live.length; j++) {
      var want = live[j].ay;
      if (j > 0 && want < live[j - 1].ly + GAP) want = live[j - 1].ly + GAP;
      live[j].ly = want;
    }
    var overflow = live[live.length - 1].ly - bottom;
    if (overflow > 0) for (var m = 0; m < live.length; m++) live[m].ly -= overflow;
    if (live[0].ly < top) {
      var lift = top - live[0].ly;
      for (var n = 0; n < live.length; n++) live[n].ly = Math.min(bottom, live[n].ly + lift);
    }

    var colX = w * 0.64;
    for (var q = 0; q < live.length; q++) {
      var d = live[q];
      var dx = colX - d.ax, dy = d.ly - d.ay;
      d.leader.style.width = Math.sqrt(dx * dx + dy * dy).toFixed(1) + 'px';
      d.leader.style.transform =
        'translate(' + d.ax.toFixed(1) + 'px,' + d.ay.toFixed(1) + 'px) rotate(' + Math.atan2(dy, dx).toFixed(4) + 'rad)';
      d.el.style.transform =
        'translate(' + colX.toFixed(1) + 'px,' + d.ly.toFixed(1) + 'px) translateY(-50%)';
    }
  }

  function scrollProgress() {
    var rect = track.getBoundingClientRect();
    var travel = rect.height - window.innerHeight;
    if (travel <= 0) return 0;
    return clamp01(-rect.top / travel);
  }

  function inView() {
    var rect = track.getBoundingClientRect();
    return rect.bottom > -400 && rect.top < window.innerHeight + 400;
  }

  var hintHidden = false;

  function frame() {
    requestAnimationFrame(frame);
    if (!inView()) return;
    resize();

    var raw = scrollProgress();
    /* Slightly heavier damping than v1 — the lag is what makes the motion
       feel considered rather than reactive. */
    progress += (raw - progress) * (reduceMotion ? 1 : 0.075);

    if (modelReady && !introDone) {
      var elapsed = (window.performance || Date).now() - introStart;
      introMix = 1 - easeInOutCubic(clamp01(elapsed / INTRO_MS));
      if (raw > 0.004 || elapsed >= INTRO_MS) {
        if (raw > 0.004) introMix = 0;
        if (introMix <= 0.0001) { introMix = 0; introDone = true; }
      }
    }

    if (modelReady) {
      var timeline = progress;
      var avg = 0, reach = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.each = introDone || introMix === 0
          ? partSeparation(timeline, p.seq)
          : introSeparation(introMix, p.seq);
        avg += p.each;
        var r = p.each * p.dist;
        if (r > reach) reach = r;
      }
      avg /= Math.max(1, parts.length);
      reach = stackRise > 0 ? clamp01(reach / stackRise) : 0;
      applyLayout();

      var cam = sampleCamera(timeline);
      var az = cam.az - introMix * 0.7;
      /* Floor the zoom by the measured spread, or parts outrun the frame
         while the keyframes are still easing outward. */
      var zoom = Math.min(1, Math.max(cam.zoom, reach * 0.97) + introMix * 0.85);
      if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }

      var dist = distTight + (distWide - distTight) * zoom;
      var sp = Math.sin(cam.pol);
      camera.position.set(
        center.x + dist * sp * Math.sin(az),
        center.y + dist * Math.cos(cam.pol),
        center.z + dist * sp * Math.cos(az)
      );
      _target.set(center.x, center.y + composeBase + reach * stackRise * 0.52, center.z);
      camera.lookAt(_target);

      if (shadowMesh) {
        shadowMesh.material.opacity = 0.78 * (1 - avg * 0.72);
        var s = shadowBaseScale * (1 + avg * 0.45);
        shadowMesh.scale.set(s, s, 1);
      }

      updateCallouts(timeline, lastW, lastH);
      setAct(actFor(timeline));
      if (railFill) railFill.style.height = (timeline * 100).toFixed(1) + '%';

      var shouldHide = raw > 0.02;
      if (shouldHide !== hintHidden && hintEl) {
        hintHidden = shouldHide;
        hintEl.style.opacity = shouldHide ? '0' : '1';
      }
    }

    renderer.render(scene, camera);
  }
  frame();
})();
