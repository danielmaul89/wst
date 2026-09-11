/* ===================================================================
   Showcase viewer — a directed, scroll-scrubbed teardown.

   Differs from product-3d-viewer.js in three ways that matter:

   1. It relights the model. FBX exports arrive with flat Phong materials
      and missing texture references, which render like a CAD viewer. Every
      material is replaced by a small PBR palette keyed off the part name,
      lit by an environment map generated procedurally at runtime (no HDR
      asset to ship), so metal actually reflects something.

   2. The explode is staged, not uniform. Each part carries a sequence
      number derived from its layer, and the timeline offsets each part's
      easing by that number — the lid leaves first and returns last, so the
      motion reads as a teardown rather than everything sliding at once.

   3. The camera is choreographed. It travels a keyframed spherical path
      (azimuth / elevation / distance / focal length) against the same
      timeline, instead of only dollying along a fixed axis.
   =================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('scCanvas');
  var stage = document.getElementById('scScreen');
  var track = document.getElementById('scTheatre');
  if (!canvas || !stage || !track || !window.THREE || !window.THREE.FBXLoader) return;

  var THREE = window.THREE;
  var loaderEl = document.getElementById('scLoader');
  var loaderPct = document.getElementById('scLoaderPct');
  var loaderBar = document.getElementById('scLoaderBar');
  var calloutLayer = document.getElementById('scCallouts');
  var captionsEl = document.getElementById('scCaptions');
  var captionEls = document.querySelectorAll('.sc-caption');
  var railFill = document.getElementById('scRailFill');
  var railActs = document.getElementById('scRailActs');
  var hintEl = document.getElementById('scHint');
  var partCountEl = document.getElementById('scPartCount');

  var MODEL_URL = 'assets/models/c4e.fbx';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------
     Timeline
     --------------------------------------------------------------- */
  var ACT_SEPARATE = 0.14;  // pack holds until here, then comes apart
  var ACT_INSPECT  = 0.46;  // fully apart, camera tours the stack
  var ACT_ASSEMBLE = 0.72;  // goes back together
  var STAGGER = 0.55;       // share of an act spent waiting your turn

  /* Camera keyframes. `zoom` is 0 (framed on the assembled pack) to 1
     (framed on the full exploded spread) — resolved against the model's
     real measurements at load, so it adapts to whatever is loaded. */
  var CAM_KEYS = [
    { at: 0.00, az: -0.55, pol: 1.24, zoom: 0.06, fov: 30 },
    { at: 0.13, az: -0.34, pol: 1.20, zoom: 0.14, fov: 30 },
    { at: 0.46, az:  0.30, pol: 1.06, zoom: 1.00, fov: 32 },
    { at: 0.59, az:  0.86, pol: 1.32, zoom: 0.93, fov: 32 },
    { at: 0.72, az:  1.24, pol: 1.12, zoom: 0.97, fov: 32 },
    /* Lands about 90 degrees around from the opening shot — far enough to
       feel like a new view, without swinging round to the casing's open
       end, which reads as an unfinished product. */
    { at: 1.00, az:  1.02, pol: 1.21, zoom: 0.08, fov: 30 }
  ];

  var INTRO_MS = 2600;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  /* Offsets a normalized 0..1 ramp by `delay`, so parts move in sequence
     while still all finishing inside the act. */
  function staggered(a, delay) {
    return clamp01((a - delay * STAGGER) / (1 - STAGGER));
  }

  /* ---------------------------------------------------------------
     Renderer / scene
     --------------------------------------------------------------- */
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
  renderer.toneMappingExposure = 1.06;
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 6000);
  var group = new THREE.Group();
  scene.add(group);

  /* Studio environment, built as geometry and prefiltered into an env map.
     This is what puts real highlights and reflections on the metal parts —
     lights alone leave PBR surfaces looking dead. */
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
      return m;
    }
    panel(0x11151f, 1.0, [0, 0, -14], [0, 0, 0], 40, 40);          // dark surround
    panel(0xffffff, 4.2, [0, 9, 0.5], [-Math.PI / 2, 0, 0], 15, 15); // overhead softbox
    panel(0xffd9ab, 2.1, [0, 2.6, -9.5], [0, 0, 0], 15, 9);          // warm rim, behind
    panel(0x9dc0ff, 1.35, [-8.5, 2.2, 2], [0, Math.PI / 2, 0], 13, 9); // cool fill, left
    panel(0xffffff, 0.85, [8.5, 2.2, 2], [0, -Math.PI / 2, 0], 13, 9); // soft fill, right
    return env;
  }

  var pmrem = new THREE.PMREMGenerator(renderer);
  var envTarget = pmrem.fromScene(buildEnvScene(), 0.04);
  scene.environment = envTarget.texture;
  pmrem.dispose();

  var key = new THREE.DirectionalLight(0xfff2e0, 1.9);
  key.position.set(5.5, 8.5, 6);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0xbcd4ff, 1.45);
  rim.position.set(-6, 3.5, -7.5);
  scene.add(rim);
  var fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-4, 1.5, 6);
  scene.add(fill);

  /* ---------------------------------------------------------------
     Material palette, assigned by part name
     --------------------------------------------------------------- */
  function std(color, metalness, roughness) {
    return new THREE.MeshStandardMaterial({ color: color, metalness: metalness, roughness: roughness });
  }
  var MATS = {
    casing:  std(0x171b23, 0.62, 0.44),
    lid:     std(0x272d38, 0.70, 0.34),
    polymer: std(0x2b303b, 0.10, 0.82),
    cell:    std(0xb9c0ca, 0.92, 0.26),
    busbar:  std(0xc08842, 0.94, 0.24),
    board:   std(0x16402f, 0.32, 0.58),
    cable:   std(0x0c0e14, 0.24, 0.74),
    soft:    std(0x23262f, 0.06, 0.92),
    steel:   std(0x8d949e, 0.96, 0.30),
    neutral: std(0x4a505c, 0.55, 0.48)
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

  /* ---------------------------------------------------------------
     Layers. `y` is how far the layer travels; `seq` (derived below) is
     when it goes — 0 leaves first and returns last.
     --------------------------------------------------------------- */
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
    /* Busbars sit on their own level above the top cell holder. Sharing a
       level put two callout labels at the same screen height. */
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

  /* Callouts: one anchor mesh per real, named component. Picked by the
     largest matching mesh so the leader line lands on the body of the
     part, not on some incidental fastener. */
  var CALLOUT_SPECS = [
    { test: 'casinglid', title: 'Casing lid', sub: 'Sealed top cover' },
    { test: 'harness', title: 'Cable harness', sub: 'Sense + power' },
    { test: 'dzlr', title: 'BMS board', sub: 'Protection + balancing' },
    { test: 'busbar', title: 'Busbars', sub: 'Cell interconnect' },
    { test: 'highstar', title: '21700 cells', sub: 'Cylindrical array' },
    { test: 'cellholder', title: 'Cell holders', sub: 'Retention + spacing' },
    { test: 'maincasing', title: 'Main casing', sub: 'Structural enclosure' }
  ];

  /* ---------------------------------------------------------------
     Sizing
     --------------------------------------------------------------- */
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

  /* Converts a world-space displacement into the local-space delta for
     mesh.position. CAD exports nest sub-assemblies under their own
     unit-conversion scale nodes, so a world distance written straight into
     a local position gets scaled by whatever that sub-tree does. */
  function worldToLocalDelta(mesh, worldPos, worldOffset) {
    var parent = mesh.parent;
    if (!parent) return worldOffset.clone();
    var a = parent.worldToLocal(worldPos.clone());
    var b = parent.worldToLocal(worldPos.clone().add(worldOffset));
    return b.sub(a);
  }

  /* ---------------------------------------------------------------
     State
     --------------------------------------------------------------- */
  var parts = [];
  var callouts = [];
  var modelReady = false;
  var center = new THREE.Vector3();
  var distTight = 10, distWide = 20, stackRise = 1, composeBase = 0;
  var shadowMesh = null, shadowBaseScale = 1;

  var progress = 0;      // damped
  var introMix = 1;      // 1 = intro pose, 0 = handed over to scroll
  var introStart = 0;
  var introDone = false;

  var _v = new THREE.Vector3();
  var _q = new THREE.Quaternion();
  var _target = new THREE.Vector3();

  /* Fits the camera to a box rather than to the bounding sphere. A sphere
     circumscribes the box, so framing against it leaves roughly a third of
     the frame empty on a pack this shape. `halfW` is the worst-case
     horizontal half-extent (corner-on, since the camera orbits). */
  function fitDistance(halfW, halfH, margin) {
    var tan = Math.tan(camera.fov * (Math.PI / 180) / 2);
    var byHeight = halfH / tan;
    var byWidth = halfW / (tan * Math.max(camera.aspect, 0.2));
    return Math.max(byHeight, byWidth) * margin;
  }

  /* Soft contact shadow — a gradient sprite on the floor. Cheaper and
     softer than a shadow map over 280 meshes, and it is what grounds the
     pack instead of leaving it floating in black. */
  function makeContactShadow(radius, floorY) {
    var size = 256;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.34)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(c);
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, floorY - radius * 0.015, center.z);
    shadowBaseScale = radius * 3.1;
    mesh.scale.set(shadowBaseScale, shadowBaseScale, 1);
    mesh.renderOrder = -1;
    group.add(mesh);
    return mesh;
  }

  /* ---------------------------------------------------------------
     Load + build
     --------------------------------------------------------------- */
  new THREE.FBXLoader().load(
    MODEL_URL,
    function (object) {
      try {
        var box = new THREE.Box3().setFromObject(object);
        var size = new THREE.Vector3();
        box.getSize(size);
        var scale = 2.6 / (Math.max(size.x, size.y, size.z) || 1);
        object.scale.setScalar(scale);
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
          child.castShadow = false;
          child.receiveShadow = false;

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

          /* 0 = outermost layer: first out, last back in. */
          var seq = clamp01(1 - tierY / TIER_MAX);

          /* Slight outward arc, peaking mid-travel, so parts swing clear
             of each other instead of sliding on rails. */
          var lateral = new THREE.Vector3(worldPos.x - center.x, 0, worldPos.z - center.z);
          if (lateral.lengthSq() < 1e-8) lateral.set(Math.cos(index * 2.4), 0, Math.sin(index * 2.4));
          lateral.normalize().multiplyScalar(radius * 0.07);

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
            spinAmp: 0.05 + (index % 7) * 0.006,
            each: 1,
            dist: dist
          });

          /* Track the biggest mesh per callout keyword. */
          var lname = (child.name || '').toLowerCase();
          for (var ci = 0; ci < CALLOUT_SPECS.length; ci++) {
            if (lname.indexOf(CALLOUT_SPECS[ci].test) === -1) continue;
            var b = new THREE.Box3().setFromObject(child);
            var s = new THREE.Vector3(); b.getSize(s);
            var vol = Math.max(s.x * s.y * s.z, 1e-9);
            if (!candidates[ci] || vol > candidates[ci].vol) {
              candidates[ci] = { mesh: child, vol: vol };
            }
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
        /* Margins are compositional, not just "make it fit": the caption
           owns the top of the frame and the hint the bottom, so the pack
           is framed to sit in the middle band rather than edge to edge. */
        distTight = fitDistance(halfW, halfH, 1.72);
        /* Exploded: the stack grows upward, and the camera target rises
           with it (see frame()), so only part of the rise counts against
           the framing. The arc widens the footprint slightly. */
        distWide = fitDistance(halfW * 1.12, halfH + stackRise * 0.62, 1.14);
        /* Nudges the assembled pack below the caption. */
        composeBase = halfH * 0.20;
        camera.near = Math.max(0.01, distTight / 140);
        camera.far = distWide * 24;
        camera.updateProjectionMatrix();

        /* Build callout DOM in the declared order, not discovery order. */
        for (var k = 0; k < CALLOUT_SPECS.length; k++) {
          if (!candidates[k]) continue;
          var spec = CALLOUT_SPECS[k];
          var leader = document.createElement('div');
          leader.className = 'sc-leader';
          var el = document.createElement('div');
          el.className = 'sc-callout';
          el.innerHTML =
            '<span class="sc-callout-title">' + spec.title + '</span>' +
            '<span class="sc-callout-sub">' + spec.sub + '</span>';
          if (calloutLayer) { calloutLayer.appendChild(leader); calloutLayer.appendChild(el); }
          callouts.push({
            el: el,
            leader: leader,
            mesh: candidates[k].mesh,
            on: false,
            ly: 0,
            settled: false
          });
        }

        if (partCountEl) partCountEl.textContent = parts.length + ' parts';

        applyLayout();
        modelReady = true;
        introStart = (window.performance || Date).now();
        if (loaderEl) {
          loaderEl.classList.add('is-done');
          setTimeout(function () { loaderEl.hidden = true; }, 950);
        }
      } catch (err) {
        if (loaderPct) loaderPct.textContent = 'Error';
        if (loaderBar) loaderBar.parentNode.style.display = 'none';
        var lbl = loaderEl ? loaderEl.querySelector('.sc-loader-label') : null;
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
      var lbl = loaderEl ? loaderEl.querySelector('.sc-loader-label') : null;
      if (lbl) lbl.textContent = 'The model could not be loaded';
    }
  );

  /* ---------------------------------------------------------------
     Per-frame layout
     --------------------------------------------------------------- */

  /* How far apart a given part is, at a given point on the timeline. */
  function partSeparation(p, seq) {
    if (p <= ACT_SEPARATE) return 0;
    if (p < ACT_INSPECT) {
      var a = (p - ACT_SEPARATE) / (ACT_INSPECT - ACT_SEPARATE);
      return easeOutCubic(staggered(a, seq));
    }
    if (p < ACT_ASSEMBLE) return 1;
    var b = (p - ACT_ASSEMBLE) / (1 - ACT_ASSEMBLE);
    return 1 - easeInOutCubic(staggered(b, 1 - seq));
  }

  /* The opening auto-play: the same assembly motion, resolving exactly
     into the act-1 pose so handing over to scroll is seamless. */
  function introSeparation(mix, seq) {
    return 1 - easeInOutCubic(staggered(1 - mix, 1 - seq));
  }

  /* Each part carries its own `t` along the timeline (set per frame), so
     the layout is just: lift by t, bow outward at mid-travel, and add a
     small settle-rotation that peaks in flight and resolves to square at
     both ends. */
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

  function sampleCamera(p) {
    var a = CAM_KEYS[0], b = CAM_KEYS[CAM_KEYS.length - 1];
    for (var i = 0; i < CAM_KEYS.length - 1; i++) {
      if (p >= CAM_KEYS[i].at && p <= CAM_KEYS[i + 1].at) { a = CAM_KEYS[i]; b = CAM_KEYS[i + 1]; break; }
      if (p < CAM_KEYS[0].at) { a = b = CAM_KEYS[0]; break; }
      if (p > CAM_KEYS[CAM_KEYS.length - 1].at) { a = b = CAM_KEYS[CAM_KEYS.length - 1]; break; }
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
    /* Fade in across the inspection act, one after another; clear out
       again as reassembly starts. */
    var reveal = clamp01((p - (ACT_INSPECT - 0.06)) / 0.16);
    var fade = 1 - clamp01((p - (ACT_ASSEMBLE - 0.04)) / 0.07);

    /* Let the caption recede while the callouts are doing the talking —
       otherwise the title column competes with the leader lines. */
    if (captionsEl) {
      var dim = Math.round((1 - reveal * fade * 0.74) * 100) / 100;
      if (dim !== lastCaptionDim) { lastCaptionDim = dim; captionsEl.style.opacity = dim; }
    }
    /* Pass 1 — project each anchor and decide visibility. */
    var live = [];
    for (var i = 0; i < callouts.length; i++) {
      var c = callouts[i];
      var slot = i / Math.max(1, callouts.length);
      var on = reveal > slot * 0.75 && fade > 0.5;
      if (on) {
        c.mesh.getWorldPosition(_v);
        _v.project(camera);
        if (_v.z > 1) on = false;
      }
      if (on !== c.on) {
        c.on = on;
        c.el.classList.toggle('is-on', on);
        c.leader.classList.toggle('is-on', on);
        if (!on) c.settled = false;
      }
      if (!on) continue;
      c.ax = (_v.x * 0.5 + 0.5) * w;
      c.ay = (1 - (_v.y * 0.5 + 0.5)) * h;
      live.push(c);
    }
    if (!live.length) return;

    /* Pass 2 — labels share one alignment column, so push them apart
       vertically where two parts project to nearly the same height, then
       shift the whole set back inside the frame. */
    live.sort(function (a, b) { return a.ay - b.ay; });
    var GAP = 42;
    var top = 96, bottom = h - 78;
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

    /* Pass 3 — place. The leader stretches and rotates from the part to
       wherever its label ended up. */
    var colX = w * 0.63;
    for (var q = 0; q < live.length; q++) {
      var d = live[q];
      var dx = colX - d.ax;
      var dy = d.ly - d.ay;
      var len = Math.sqrt(dx * dx + dy * dy);
      var ang = Math.atan2(dy, dx);
      d.leader.style.width = len.toFixed(1) + 'px';
      d.leader.style.transform =
        'translate(' + d.ax.toFixed(1) + 'px,' + d.ay.toFixed(1) + 'px) rotate(' + ang.toFixed(4) + 'rad)';
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
    /* Damped scrub — the weight is what makes it feel directed rather
       than nervously tracking the scrollbar. */
    progress += (raw - progress) * (reduceMotion ? 1 : 0.09);

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
      var avg = 0;
      var reach = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.each = introDone || introMix === 0
          ? partSeparation(timeline, p.seq)
          : introSeparation(introMix, p.seq);
        avg += p.each;
        /* How far the furthest-travelled part currently is, as a fraction
           of the full spread. The staggering means this is not the same
           curve as the timeline — the lid is clear of the frame long
           before the lower layers have moved. */
        var r = p.each * p.dist;
        if (r > reach) reach = r;
      }
      avg /= Math.max(1, parts.length);
      reach = stackRise > 0 ? clamp01(reach / stackRise) : 0;
      applyLayout();

      var cam = sampleCamera(timeline);
      /* The intro resolves into the act-1 pose by easing these back to 0. */
      var az = cam.az - introMix * 0.95;
      /* Never let the keyframed zoom sit tighter than the spread actually
         needs, or parts leave the frame mid-teardown. */
      var zoom = Math.min(1, Math.max(cam.zoom, reach * 0.97) + introMix * 0.85);
      if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }

      var dist = distTight + (distWide - distTight) * zoom;
      var sp = Math.sin(cam.pol);
      camera.position.set(
        center.x + dist * sp * Math.sin(az),
        center.y + dist * Math.cos(cam.pol),
        center.z + dist * sp * Math.cos(az)
      );
      /* Follow the stack upward as it comes apart, so the frame stays
         balanced instead of the top layer climbing into the site nav.
         Driven by reach rather than the average, because the average is
         held down by the casing, which never leaves the floor. */
      _target.set(center.x, center.y + composeBase + reach * stackRise * 0.52, center.z);
      camera.lookAt(_target);

      if (shadowMesh) {
        shadowMesh.material.opacity = 0.8 * (1 - avg * 0.72);
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
