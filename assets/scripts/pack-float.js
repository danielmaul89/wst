/* Battery packs, live: the five production models down the page - one to the
   left, the next to the right - each standing still until the page reaches
   it, then spinning and folding fully apart with its real parts named.

   One fixed, full-screen canvas draws every model, so a pack is never
   clipped to its own box and only one WebGL context is paid for. Each pack's
   row is tall and holds a pinned screen; the empty slot in that screen says
   where its pack floats, and the scroll position through the row drives the
   sequence:

     rest        stands still in its slot, assembled
     fold out    one full turn as the layers part, ending at its showing angle
     details     parts are named one by one, a line to each real part
     close up    the layers return as it turns once more, the name comes back

   The still render in each slot stays until its model has loaded. Models
   load one at a time, nearest first, so a visitor is never waiting on the
   72 MB behind the one in view.

   Layers, part keywords and titles are the ones product-3d-showcase.js uses
   for the same models, so what is named here is what that page names.
   Look and lighting follow home-hero-3d.js. Skipped (the stills simply
   stay) with no WebGL, reduced motion, data saver or a narrow screen. */
(function () {
  'use strict';

  /* The page hides its still renders from the start whenever it expects to
     run live (see the script in its head), so that they never flash up and
     vanish. Anything that stops it running puts them back. */
  var root = document.documentElement;
  function bail() { root.classList.remove('float-pending'); }

  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-float-model]'));
  var stage = document.getElementById('floatStage');
  if (!rows.length || !stage) return bail();

  var THREE = window.THREE;
  if (!THREE || !window.WSTMLoader) return bail();

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  var narrow = window.matchMedia('(max-width: 767px)').matches;
  if (reduceMotion || saveData || narrow) return bail();

  var FOV = 22;
  var DIST = 22;
  /* How far a layer travels when the pack is fully apart, as a share of the
     pack's own size. */
  var LAYER_LIFT = 0.55;

  var GENERIC_TIERS = [
    { test: 'lid', y: 4.05 }, { test: 'cover', y: 4.05 },
    { test: 'harness', y: 3.15 }, { test: 'cable', y: 3.15 }, { test: 'wire', y: 3.15 },
    { test: 'connector', y: 3.15 }, { test: 'solder', y: 3.15 }, { test: 'ntc', y: 3.15 },
    { test: 'board', y: 2.62 }, { test: 'pcb', y: 2.62 }, { test: 'fr4', y: 2.62 },
    { test: 'cmu', y: 2.62 }, { test: 'bms', y: 2.62 }, { test: 'dzlr', y: 2.62 },
    { test: 'tape', y: 2.2 }, { test: 'heatpad', y: 2.2 }, { test: 'eva', y: 2.2 },
    { test: 'foam', y: 2.2 }, { test: 'rubber', y: 2.2 }, { test: 'epdm', y: 2.2 },
    { test: 'seal', y: 2.2 },
    { test: 'busbar', y: 2.05 }, { test: 'terminal', y: 2.05 },
    { test: 'top', y: 1.78 },
    { test: 'cell', y: 1.16 }, { test: 'highstar', y: 1.16 }, { test: 'inr2', y: 1.16 },
    { test: 'eve_c', y: 1.16 },
    { test: 'bottom', y: 0.6 }, { test: 'holder', y: 0.6 }, { test: 'tray', y: 0.6 },
    { test: 'divider', y: 0.6 }, { test: 'spacer', y: 0.6 },
    { test: 'casing', anchor: true }, { test: 'enclosure', anchor: true },
    { test: 'housing', anchor: true }, { test: 'case', anchor: true }
  ];

  /* From product-3d-showcase.js: a model's own layers first, then the
     generic list; callouts in order from the top of the stack down. */
  var SPECS = {
    'compact': {
      cells: '21700 cylindrical',
      callouts: [
        { test: 'casinglid', title: 'Casing lid', sub: 'Sealed top cover' },
        { test: 'harness', title: 'Cable harness', sub: 'Sense + power' },
        { test: 'dzlr', title: 'BMS board', sub: 'Protection + balancing' },
        { test: 'busbar', title: 'Busbars', sub: 'Cell interconnect' },
        { test: 'cellholder', title: 'Cell holders', sub: 'Retention + spacing' },
        { test: 'highstar', title: '21700 cells', sub: 'Cylindrical array' },
        { test: 'maincasing', title: 'Main casing', sub: 'Structural enclosure' }
      ]
    },
    'heavy-machinery': {
      cells: 'EVE C40 prismatic',
      callouts: [
        { test: 'enclosure_lid', title: 'Enclosure lid', sub: 'Sealed top cover' },
        { test: 'hdrcable', title: 'Power cables', sub: 'Pack terminals' },
        { test: 'cmu_pcb', title: 'CMU board', sub: 'Cell monitoring' },
        { test: 'heatpad', title: 'Heat pads', sub: 'Thermal interface' },
        { test: 'busbarseries', title: 'Series busbars', sub: 'Cell interconnect' },
        { test: 'eve_c40', title: 'EVE C40 cells', sub: 'Prismatic array' },
        { test: 'enclosure_case', title: 'Enclosure', sub: 'Structural housing' }
      ]
    },
    'ups': {
      cells: 'Rack enclosure',
      tiers: [
        { test: 'bp_fr4_top', y: 3.7 }, { test: 'fans_bracket', y: 3.05 }, { test: 'fan', y: 3.05 },
        { test: 'ens', y: 2.62 }, { test: 'connector_metal', y: 2.05 }, { test: 'bp_fr4_bottom', y: 0.6 },
        { test: 'rack_bracket', anchor: true }, { test: 'side_metal', anchor: true },
        { test: 'rear_metal', anchor: true }, { test: 'front_metal', anchor: true },
        { test: 'plastic_front', anchor: true }, { test: 'cube', anchor: true }
      ],
      callouts: [
        { test: 'bp_fr4_top', title: 'Top insulator', sub: 'FR4 cover sheet' },
        { test: 'fan', title: 'Cooling fans', sub: 'Forced airflow' },
        { test: 'ens', title: 'Indicator board', sub: 'Status LEDs' },
        { test: 'connector_metal', title: 'Connector panel', sub: 'Pack interface' },
        { test: 'rack_bracket', title: 'Rack brackets', sub: '19-inch mounting' },
        { test: 'side_metal', title: 'Sheet metal shell', sub: 'Structural housing' }
      ]
    },
    'agv': {
      cells: 'Sealed enclosure',
      tiers: [
        { test: 'service_lid', y: 4.05 }, { test: 'if-fm', y: 2.05 },
        { test: 'molex', y: 2.62 }, { test: 'case_rev', anchor: true }
      ],
      callouts: [
        { test: 'service_lid', title: 'Service lid', sub: 'Access hatch' },
        { test: '_lid_rev', title: 'Casing lid', sub: 'Sealed top cover' },
        { test: 'harness', title: 'Cable harness', sub: 'Comms + sense' },
        { test: 'if-fm', title: 'Pack terminals', sub: 'Positive + negative' },
        { test: 'eva', title: 'EVA padding', sub: 'Shock isolation' },
        { test: 'divider', title: 'Divider', sub: 'Internal partition' },
        { test: 'case_rev', title: 'Case', sub: 'Structural enclosure' }
      ]
    },
    'chassis': {
      cells: 'Bend-plate chassis',
      tiers: [
        { test: 'lid_', y: 4.05 }, { test: 'small_lid', y: 4.05 },
        { test: 'msd', y: 3.4 }, { test: 'rsd', y: 3.4 }, { test: 'cmu', y: 2.62 },
        { test: 'busbar', y: 2.05 }, { test: 'component_layer', y: 1.6 },
        { test: 'layer_rubber', y: 0.8 }, { test: 'support_plate', y: 0.6 },
        { test: 'inner_plate_holder', y: 0.6 },
        { test: 'bend_plate', anchor: true }, { test: 'straight_plate', anchor: true },
        { test: 'reinforcementplate', anchor: true }, { test: 'mounting_flange', anchor: true },
        { test: 'corner_flange', anchor: true }, { test: 'locking_plate', anchor: true },
        { test: 'bottom_stop-plate', anchor: true }
      ],
      callouts: [
        { test: 'lid_', title: 'Lids', sub: 'Sealed covers' },
        { test: 'msd', title: 'Service disconnect', sub: 'Manual isolation' },
        { test: 'cmu', title: 'BMS master + CMU', sub: 'Cell monitoring' },
        { test: 'busbar', title: 'Busbars', sub: 'Shunt to relay' },
        { test: 'component_layer', title: 'Component layer', sub: 'Contactors + shunt' },
        { test: 'bend_plate', title: 'Bend plates', sub: 'Structural chassis' }
      ]
    }
  };

  function tierFor(spec, name) {
    var lower = (name || '').toLowerCase();
    var i;
    var own = spec.tiers || [];
    for (i = 0; i < own.length; i++) if (lower.indexOf(own[i].test) !== -1) return own[i];
    for (i = 0; i < GENERIC_TIERS.length; i++) if (lower.indexOf(GENERIC_TIERS[i].test) !== -1) return GENERIC_TIERS[i];
    return null;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function wrapAngle(a) { return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2)); }

  /* A world-space offset converted into the mesh's local space: CAD exports
     nest sub-assemblies under their own scale nodes. */
  function worldToLocalDelta(mesh, worldPos, worldOffset) {
    var parent = mesh.parent;
    if (!parent) return worldOffset.clone();
    var a = parent.worldToLocal(worldPos.clone());
    var b = parent.worldToLocal(worldPos.clone().add(worldOffset));
    return b.sub(a);
  }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    return bail();
  }
  /* The tall, pinned layout only applies once the pack can actually be shown. */
  document.documentElement.classList.add('float-3d');

  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  camera.position.set(0, 0, DIST);
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

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
    panel(0x11151f, 1.0, [0, 0, -14], [0, 0, 0], 40, 40);
    panel(0xffffff, 4.2, [0, 9, 0.5], [-Math.PI / 2, 0, 0], 15, 15);
    panel(0xffd9ab, 2.1, [0, 2.6, -9.5], [0, 0, 0], 15, 9);
    panel(0x9dc0ff, 1.35, [-8.5, 2.2, 2], [0, Math.PI / 2, 0], 13, 9);
    panel(0xffffff, 0.85, [8.5, 2.2, 2], [0, -Math.PI / 2, 0], 13, 9);
    return env;
  }
  var pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(buildEnvScene(), 0.04).texture;
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

  /* Behind everything the canvas draws: the backdrop and its drawing grid. */
  var backdrop = document.createElement('div');
  backdrop.className = 'float-backdrop';
  var grid = document.createElement('div');
  grid.className = 'float-grid';
  stage.insertBefore(grid, stage.firstChild);
  stage.insertBefore(backdrop, stage.firstChild);

  var SVGNS = 'http://www.w3.org/2000/svg';
  var leaders = document.createElementNS(SVGNS, 'svg');
  leaders.setAttribute('class', 'float-leaders');
  leaders.setAttribute('aria-hidden', 'true');

  var entries = rows.map(function (row, i) {
    var shadow = document.createElement('div');
    shadow.className = 'float-shadow';
    stage.appendChild(shadow);
    var group = new THREE.Group();
    group.rotation.order = 'XYZ';
    group.visible = false;
    scene.add(group);
    var side = row.getAttribute('data-float-side') === 'right' ? 1 : -1;

    var details = document.createElement('div');
    details.className = 'float-details';
    var list = document.createElement('ul');
    list.className = 'float-labels';
    var specLine = document.createElement('p');
    specLine.className = 'float-spec';
    details.appendChild(list);
    details.appendChild(specLine);
    row.querySelector('.float-pin').appendChild(details);

    return {
      row: row,
      slot: row.querySelector('.float-slot'),
      copy: row.querySelector('.float-copy'),
      details: details,
      list: list,
      specLine: specLine,
      shadow: shadow,
      group: group,
      spec: SPECS[row.getAttribute('data-float-key')] || { callouts: [] },
      url: row.getAttribute('data-float-model'),
      fit: parseFloat(row.getAttribute('data-float-fit')) || 1.2,
      side: side,
      index: i,
      yaw0: -side * 0.55,
      holdYaw: parseFloat(row.getAttribute('data-float-yaw')),
      accent: (row.getAttribute('data-float-accent') || '15,42,92').split(',').map(Number),
      sx: 0,
      sy: 0,
      parts: [],
      callouts: [],
      openHalfY: 1,
      openReach: 1,
      openCentreY: 0,
      ready: false,
      loading: false,
      failed: false,
      bornAt: 0,
      open: -1,
      s: 9
    };
  });
  entries.forEach(function (e) { if (isNaN(e.holdYaw)) e.holdYaw = e.side * 0.5; });

  stage.appendChild(renderer.domElement);
  renderer.domElement.className = 'float-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.appendChild(leaders);

  var W = 0, H = 0, wpp = 1;
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    if (w === W && h === H) return;
    W = w; H = h;
    var pr = Math.min(window.devicePixelRatio || 1, 2);
    while (W * H * pr * pr > 6e6 && pr > 1) pr -= 0.25;
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    wpp = 2 * DIST * Math.tan(FOV * Math.PI / 360) / H;
  }
  resize();
  window.addEventListener('resize', resize);

  /* Layers open in order: the lid and harness first, the casing last, and
     close the other way round. `open` is 0 together to 1 fully apart. */
  function applyOpen(e, open) {
    for (var i = 0; i < e.parts.length; i++) {
      var p = e.parts[i];
      var own = easeInOutCubic(clamp01(((1 - open) - p.delay) / (1 - p.delay)));
      p.mesh.position.copy(p.basePos).addScaledVector(p.delta, 1 - own);
    }
  }

  function build(e, object) {
    /* Sized by how far it reaches round its own vertical axis and how tall it
       is, not by a sphere round the corners: a long, flat rack unit would
       otherwise come out a fraction of the size of a tall one. */
    var box = new THREE.Box3().setFromObject(object);
    var extent = box.getSize(new THREE.Vector3());
    var radius = Math.max(Math.sqrt(extent.x * extent.x + extent.z * extent.z) / 2, extent.y / 2) || 1;
    object.scale.multiplyScalar(1 / radius);
    object.updateMatrixWorld(true);
    var centre = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    object.position.sub(centre);
    e.group.add(object);
    e.group.updateMatrixWorld(true);

    var box2 = new THREE.Box3().setFromObject(object);
    var sphere = box2.getBoundingSphere(new THREE.Sphere());
    var minY = box2.min.y;
    var height = Math.max(box2.max.y - minY, 1e-4);
    var wp = new THREE.Vector3();

    object.traverse(function (child) {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.getWorldPosition(wp);
      var tier = tierFor(e.spec, child.name);
      var yFrac = clamp01((wp.y - minY) / height);
      var tierY;
      if (tier && tier.anchor) tierY = 0.12;
      else if (tier) tierY = tier.y;
      else tierY = 0.25 + yFrac * 3.4;
      var lift = sphere.radius * tierY * LAYER_LIFT;
      var delay;
      if (tier && tier.anchor) delay = 0.3;
      else if (tier && tier.y >= 3.9) delay = 0.26;
      else if (tier && tier.y >= 3) delay = 0.16;
      else if (tier && tier.y >= 2) delay = 0.08;
      else delay = 0;
      e.parts.push({
        mesh: child,
        name: (child.name || '').toLowerCase(),
        basePos: child.position.clone(),
        delta: worldToLocalDelta(child, wp, new THREE.Vector3(0, lift, 0)),
        delay: delay
      });
    });

    /* How big the pack is, and where its middle sits, once fully apart, so
       the view can make room for it. */
    applyOpen(e, 1);
    e.group.updateMatrixWorld(true);
    var apart = new THREE.Box3().setFromObject(e.group);
    var aSize = apart.getSize(new THREE.Vector3());
    var aMid = apart.getCenter(new THREE.Vector3());
    e.openHalfY = Math.max(aSize.y / 2, 0.5);
    e.openReach = Math.max(Math.sqrt(aSize.x * aSize.x + aSize.z * aSize.z) / 2, 0.5);
    e.openCentreY = aMid.y;
    applyOpen(e, 0);
    e.group.updateMatrixWorld(true);

    /* One anchor part per named component: the largest that matches, so the
       line lands on the body of the part and not an incidental fastener. */
    var v = new THREE.Vector3();
    e.spec.callouts.forEach(function (c) {
      var best = null, bestVol = -1;
      e.parts.forEach(function (p) {
        if (p.name.indexOf(c.test) === -1) return;
        var g = p.mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        g.boundingBox.getSize(v);
        var vol = v.x * v.y * v.z;
        if (vol > bestVol) { bestVol = vol; best = p; }
      });
      if (!best) return;
      var li = document.createElement('li');
      li.className = 'float-label';
      li.innerHTML = '<span class="float-label-title"></span><span class="float-label-sub"></span>';
      li.firstChild.textContent = c.title;
      li.lastChild.textContent = c.sub;
      e.list.appendChild(li);
      var path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('class', 'float-leader');
      path.setAttribute('pathLength', '1');
      var dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('class', 'float-dot');
      dot.setAttribute('r', '4');
      leaders.appendChild(path);
      leaders.appendChild(dot);
      var g2 = best.mesh.geometry;
      e.callouts.push({
        el: li, path: path, dot: dot, mesh: best.mesh,
        anchorLocal: g2.boundingBox.getCenter(new THREE.Vector3())
      });
    });
    e.specLine.textContent = e.parts.length + ' parts' + (e.spec.cells ? ' · ' + e.spec.cells : '');

    e.ready = true;
    e.bornAt = performance.now();
    e.row.classList.add('is-live');
  }

  var busy = false;
  function load(e) {
    busy = true;
    e.loading = true;
    fetch(e.url)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buffer) {
        /* Parsing a big model blocks the thread, so let a frame go first. */
        return new Promise(function (resolve) { setTimeout(resolve, 40); }).then(function () {
          build(e, window.WSTMLoader.parse(buffer));
        });
      })
      .catch(function () { e.failed = true; e.row.classList.add('is-failed'); })
      .then(function () { busy = false; e.loading = false; });
  }

  /* One at a time, nearest to the middle of the screen first, and only once
     it is within about two screens of being seen. */
  function pump() {
    if (busy) return;
    var best = null, bestD = 2.4;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.ready || e.failed || e.loading) continue;
      var d = Math.abs(e.s);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) load(best);
  }

  /* The backdrop follows whichever pack the page is nearest: its tint, a
     spotlight on it, and a grid that comes up as it opens. Values are
     rounded and only written when they change, since each write repaints a
     screen-sized gradient. */
  var lastPaint = '';
  function paintBackdrop() {
    var wSum = 0, r = 0, g = 0, b = 0, o = 0, gx = 0, gy = 0;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var w = smooth(1 - Math.abs(e.s));
      if (w <= 0) continue;
      wSum += w;
      r += w * e.accent[0]; g += w * e.accent[1]; b += w * e.accent[2];
      o += w * Math.max(e.open, 0);
      gx += w * e.sx; gy += w * e.sy;
    }
    var tint, tintA, glowA, gridA, glowX, glowY;
    if (wSum < 0.001) {
      tint = '15,42,92'; tintA = 0.2; glowA = 0.45; gridA = 0; glowX = W / 2; glowY = H * 0.4;
    } else {
      var open = o / wSum;
      tint = Math.round(r / wSum) + ',' + Math.round(g / wSum) + ',' + Math.round(b / wSum);
      tintA = 0.36 + 0.16 * open;
      glowA = 0.5 + 0.4 * open;
      gridA = open;
      glowX = gx / wSum; glowY = gy / wSum;
    }
    var sy = window.scrollY || 0;
    var bx = (10 + 14 * Math.sin(sy / 1300)).toFixed(1);
    var by = (6 + 10 * Math.cos(sy / 1700)).toFixed(1);
    var key = [tint, tintA.toFixed(3), glowA.toFixed(3), gridA.toFixed(3), Math.round(glowX), Math.round(glowY), bx, by].join('|');
    if (key === lastPaint) return;
    lastPaint = key;
    var st = stage.style;
    st.setProperty('--tint', tint);
    st.setProperty('--tint-a', tintA.toFixed(3));
    st.setProperty('--tint2-a', (0.26 + 0.1 * gridA).toFixed(3));
    st.setProperty('--glow-a', glowA.toFixed(3));
    st.setProperty('--grid-a', gridA.toFixed(3));
    st.setProperty('--glow-x', Math.round(glowX) + 'px');
    st.setProperty('--glow-y', Math.round(glowY) + 'px');
    st.setProperty('--bx', bx + '%');
    st.setProperty('--by', by + '%');
  }

  function hideLeaders(e) {
    for (var j = 0; j < e.callouts.length; j++) {
      e.callouts[j].path.style.opacity = '0';
      e.callouts[j].dot.style.opacity = '0';
    }
  }

  var _v = new THREE.Vector3();
  var drewLast = false;
  function frame(now) {
    requestAnimationFrame(frame);
    var any = false;
    var vis = 0;

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var r = e.slot.getBoundingClientRect();
      var cx0 = r.left + r.width / 2;
      var cy0 = r.top + r.height / 2;
      e.sx = cx0;
      e.sy = cy0;
      /* 0 with the slot centred on the screen, 1 as it reaches the bottom
         edge, -1 as it leaves at the top. */
      var s = (cy0 - H / 2) / (H / 2 + r.height / 2);
      e.s = s;

      /* How far through its row the page is: the row is tall and its screen
         pinned, so this runs 0 to 1 while the pack holds the screen. */
      var rr = e.row.getBoundingClientRect();
      var travel = rr.height - H;
      var p = travel > 0 ? clamp01(-rr.top / travel) : 0;

      var diameter = Math.min(r.width, r.height) * 0.96;
      var visible = e.ready && Math.abs(s) < 1.25;
      e.group.visible = visible;
      if (!visible) {
        /* While a pack is still on its way, its slot holds only the soft shadow
           it will stand on, breathing slowly - not a picture of something else. */
        if (!e.ready && !e.failed && Math.abs(s) < 1.2) {
          var psw = diameter * 0.92, psh = diameter * 0.15;
          e.shadow.style.width = psw + 'px';
          e.shadow.style.height = psh + 'px';
          e.shadow.style.transform = 'translate3d(' + (cx0 - psw / 2).toFixed(1) + 'px,' + (cy0 + diameter * 0.5 - psh / 2).toFixed(1) + 'px,0)';
          e.shadow.style.opacity = (0.16 + 0.07 * Math.sin(now / 520)).toFixed(3);
        } else {
          e.shadow.style.opacity = '0';
        }
        e.copy.style.opacity = '1';
        e.details.style.visibility = 'hidden';
        hideLeaders(e);
        continue;
      }
      any = true;

      var born = easeInOutCubic(clamp01((now - e.bornAt) / 900));

      /* The fold: apart between 14% and 40% of the way through, held, and
         back together by 96%. */
      var fold = smooth((p - 0.14) / 0.26);
      var close = smooth((p - 0.84) / 0.12);
      var open = Math.min(fold, 1 - close);
      if (Math.abs(open - e.open) > 0.002) {
        e.open = open;
        applyOpen(e, open);
      }

      /* It stands where its slot is and moves with the page, nothing more. */
      var cx = cx0;
      var cy = cy0;

      /* Together it is sized to its slot; apart it is taller than it is wide
         and is given the height of the screen instead, held back from the
         edges by the width it can have beside the names. */
      var sizeClosed = diameter / 2 * e.fit * (0.88 + 0.12 * born);
      var sizeOpen = Math.min(H * 0.74 / (2 * e.openHalfY), W * 0.46 / (2 * e.openReach)) * (0.88 + 0.12 * born);
      var shrink = smooth(open * 1.5);
      var size = (sizeClosed + (sizeOpen - sizeClosed) * shrink) * wpp;

      var g = e.group;
      g.position.set((cx - W / 2) * wpp, -(cy - H / 2) * wpp - e.openCentreY * size * open, 0);
      g.scale.setScalar(size);

      /* Still at its resting angle until the row pins. Then a gentle turn to the
         angle it is shown at as it folds out, and back again as it closes. */
      g.rotation.y = e.yaw0 + wrapAngle(e.holdYaw - e.yaw0) * (fold - close);
      g.rotation.x = 0.3 + (0.22 - 0.3) * open;

      var sw = diameter * 0.92;
      var sh = diameter * 0.15;
      e.shadow.style.width = sw + 'px';
      e.shadow.style.height = sh + 'px';
      e.shadow.style.transform = 'translate3d(' + (cx - sw / 2).toFixed(1) + 'px,' + (cy + diameter * 0.5 + open * (H * 0.42 - diameter * 0.5) - sh / 2).toFixed(1) + 'px,0)';
      e.shadow.style.opacity = (0.55 * (0.3 + 0.7 * born) * (1 - open * 0.7)).toFixed(3);

      /* The name leaves as the pack opens and comes back as it closes. */
      var nameOn = Math.max(1 - smooth((p - 0.1) / 0.1), smooth((p - 0.94) / 0.05));
      e.copy.style.opacity = nameOn.toFixed(3);

      /* The details: one part named after another while it holds. */
      var n = e.callouts.length;
      var q = clamp01((p - 0.42) / 0.38);
      var away = 1 - smooth((p - 0.84) / 0.08);
      var showing = n && p > 0.4 && away > 0.01;
      e.details.style.visibility = showing ? 'visible' : 'hidden';
      if (showing) {
        e.group.updateMatrixWorld(true);
        for (var k = 0; k < n; k++) {
          var c = e.callouts[k];
          var a = smooth(q * (n + 1) - k) * away;
          c.el.style.opacity = a.toFixed(3);
          c.el.style.transform = 'translateY(' + ((1 - a) * 10).toFixed(1) + 'px)';
          _v.copy(c.anchorLocal);
          c.mesh.localToWorld(_v);
          _v.project(camera);
          var sx = (_v.x + 1) / 2 * W;
          var sy = (1 - _v.y) / 2 * H;
          var lr = c.el.getBoundingClientRect();
          var lx = e.side < 0 ? lr.left - 16 : lr.right + 16;
          var ly = lr.top + 16;
          c.path.setAttribute('d', 'M' + lx.toFixed(1) + ' ' + ly.toFixed(1) + ' L' + sx.toFixed(1) + ' ' + sy.toFixed(1));
          c.path.style.strokeDashoffset = (1 - a).toFixed(3);
          c.path.style.opacity = a > 0.01 ? '1' : '0';
          c.dot.setAttribute('cx', sx.toFixed(1));
          c.dot.setAttribute('cy', sy.toFixed(1));
          c.dot.style.opacity = a.toFixed(3);
        }
        e.specLine.style.opacity = (smooth(q * (n + 1) - n) * away).toFixed(3);
        vis++;
      } else {
        hideLeaders(e);
      }
    }

    paintBackdrop();
    pump();
    if (any || drewLast) renderer.render(scene, camera);
    drewLast = any;
  }
  requestAnimationFrame(frame);
})();
