/* Battery packs, floating: the five production models, live, drifting down
   the page - one to the left, the next to the right.

   One fixed, full-screen canvas draws every model, so a pack is never
   clipped to its own box and only one WebGL context is paid for. Each row
   of the page carries an empty slot; every frame the slot's place on screen
   says where its pack floats. Scroll does the rest: a pack sweeps in from
   the opposite side, turns as it travels, lifts its layers slightly as it
   reaches the middle of the screen and closes up again as it leaves.

   The still render in each slot stays until its model has loaded. Models
   load one at a time, nearest first, so a visitor is never waiting on the
   72 MB behind the one in view.

   Look and lighting follow home-hero-3d.js. Skipped (the stills simply
   stay) with no WebGL, reduced motion, data saver or a narrow screen. */
(function () {
  'use strict';

  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-float-model]'));
  var stage = document.getElementById('floatStage');
  if (!rows.length || !stage) return;

  var THREE = window.THREE;
  if (!THREE || !window.WSTMLoader) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  var narrow = window.matchMedia('(max-width: 767px)').matches;
  if (reduceMotion || saveData || narrow) return;

  var FOV = 22;
  var DIST = 22;
  /* How far the layers open at the middle of the screen, as a share of the
     distances the hero's full explode uses. */
  var OPEN = 0.3;
  var LAYER_LIFT = 0.82;
  /* Sideways travel as a share of the screen width: how far from the other
     side a pack sweeps in, and how far outward it drifts on its way out. */
  var SWEEP_IN = 0.2;
  var DRIFT_OUT = 0.08;
  /* The packs trail the page a little, which is what makes them float. */
  var TRAIL = 0.12;

  var LAYER_TIERS = [
    { test: 'lid', y: 4.0 }, { test: 'cover', y: 4.0 },
    { test: 'harness', y: 3.15 }, { test: 'cable', y: 3.15 }, { test: 'wire', y: 3.15 },
    { test: 'connector', y: 3.15 }, { test: 'plug', y: 3.15 }, { test: 'socket', y: 3.15 },
    { test: 'solder', y: 3.15 }, { test: 'ntc', y: 3.15 }, { test: 'board', y: 3.15 },
    { test: 'pcb', y: 3.15 }, { test: 'fr4', y: 3.15 }, { test: 'cmu', y: 3.15 },
    { test: 'bms', y: 3.15 }, { test: 'dzlr', y: 3.15 }, { test: 'foam', y: 3.15 },
    { test: 'eva', y: 3.15 }, { test: 'rubber', y: 3.15 }, { test: 'gasket', y: 3.15 },
    { test: 'seal', y: 3.15 }, { test: 'tape', y: 3.15 },
    { test: 'top', y: 2.35 }, { test: 'busbar', y: 2.35 }, { test: 'terminal', y: 2.35 },
    { test: 'bottom', y: 0.85 }, { test: 'holder', y: 0.85 }, { test: 'tray', y: 0.85 },
    { test: 'divider', y: 0.85 }, { test: 'spacer', y: 0.85 },
    { test: 'cell', y: 1.6 }, { test: 'battery', y: 1.6 }, { test: 'highstar', y: 1.6 },
    { test: 'eve_c', y: 1.6 },
    { test: 'casing', anchor: true }, { test: 'enclosure', anchor: true },
    { test: 'housing', anchor: true }, { test: 'chassis', anchor: true },
    { test: 'shell', anchor: true }, { test: 'case', anchor: true }
  ];

  function tierFor(name) {
    var lower = (name || '').toLowerCase();
    for (var i = 0; i < LAYER_TIERS.length; i++) {
      if (lower.indexOf(LAYER_TIERS[i].test) !== -1) return LAYER_TIERS[i];
    }
    return null;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

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
    return;
  }
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  camera.position.set(0, 0, DIST);

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

  var entries = rows.map(function (row, i) {
    var shadow = document.createElement('div');
    shadow.className = 'float-shadow';
    stage.appendChild(shadow);
    var group = new THREE.Group();
    group.rotation.order = 'XYZ';
    group.visible = false;
    scene.add(group);
    var side = row.getAttribute('data-float-side') === 'right' ? 1 : -1;
    return {
      row: row,
      slot: row.querySelector('.float-slot'),
      shadow: shadow,
      group: group,
      url: row.getAttribute('data-float-model'),
      fit: parseFloat(row.getAttribute('data-float-fit')) || 1.2,
      side: side,
      index: i,
      yaw0: -side * 0.55 + i * 0.4,
      parts: [],
      ready: false,
      loading: false,
      failed: false,
      bornAt: 0,
      open: -1,
      s: 9
    };
  });

  stage.appendChild(renderer.domElement);
  renderer.domElement.className = 'float-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');

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
     close the other way round. `open` is 0 together to 1 fully open. */
  function applyOpen(e, open) {
    for (var i = 0; i < e.parts.length; i++) {
      var p = e.parts[i];
      var own = easeInOutCubic(clamp01(((1 - open) - p.delay) / (1 - p.delay)));
      var apart = (1 - own) * OPEN;
      p.mesh.position.copy(p.basePos).addScaledVector(p.delta, apart);
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
      var tier = tierFor(child.name);
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
        basePos: child.position.clone(),
        delta: worldToLocalDelta(child, wp, new THREE.Vector3(0, lift, 0)),
        delay: delay
      });
    });

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
      .catch(function () { e.failed = true; })
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

  var drewLast = false;
  function frame(now) {
    requestAnimationFrame(frame);
    var any = false;

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var r = e.slot.getBoundingClientRect();
      var cx0 = r.left + r.width / 2;
      var cy0 = r.top + r.height / 2;
      /* 0 with the slot centred on the screen, 1 as it reaches the bottom
         edge, -1 as it leaves at the top. */
      var s = (cy0 - H / 2) / (H / 2 + r.height / 2);
      e.s = s;

      var visible = e.ready && Math.abs(s) < 1.25;
      e.group.visible = visible;
      if (!visible) { e.shadow.style.opacity = '0'; continue; }
      any = true;

      var t = Math.max(-1, Math.min(1, s));
      var settle = 1 - smooth(Math.abs(t));
      var born = easeInOutCubic(clamp01((now - e.bornAt) / 900));
      var diameter = Math.min(r.width, r.height) * 0.96;

      var enter = t > 0 ? smooth(t) : 0;
      var leave = t < 0 ? smooth(-t) : 0;
      var cx = cx0 + (-e.side * SWEEP_IN * enter + e.side * DRIFT_OUT * leave) * W;
      var bob = Math.sin(now / 1000 * 0.8 + e.index * 1.3) * diameter * 0.018;
      var cy = cy0 - TRAIL * (cy0 - H / 2) + bob;

      var open = settle * settle * (3 - 2 * settle);
      if (Math.abs(open - e.open) > 0.003) {
        e.open = open;
        applyOpen(e, open);
      }

      var size = diameter / 2 * wpp * e.fit * (0.84 + 0.16 * settle) * (0.88 + 0.12 * born) / (1 + 0.5 * open);
      var g = e.group;
      g.position.set((cx - W / 2) * wpp, -(cy - H / 2) * wpp - size * 0.45 * open, 0);
      g.scale.setScalar(size);
      g.rotation.y = e.yaw0 - t * 1.6 + now / 1000 * 0.1;
      g.rotation.x = 0.3 - 0.1 * t;

      var sw = diameter * 0.92;
      var sh = diameter * 0.15;
      var lifted = 1 - open * 0.45;
      e.shadow.style.width = sw + 'px';
      e.shadow.style.height = sh + 'px';
      e.shadow.style.transform = 'translate3d(' + (cx - sw / 2).toFixed(1) + 'px,' + (cy + diameter * 0.5 - sh / 2).toFixed(1) + 'px,0)';
      e.shadow.style.opacity = (0.55 * born * (0.35 + 0.65 * settle) * lifted).toFixed(3);
    }

    pump();
    if (any || drewLast) renderer.render(scene, camera);
    drewLast = any;
  }
  requestAnimationFrame(frame);
})();
