/* Home hero: live 3D battery pack.

   The static render in `.hero-visual` stays in place as the poster. Once the
   page has loaded and the browser is idle, a real production model is loaded
   into a canvas over it: the pack starts as a wide exploded view, its pieces
   floating far out to the left and right, then drifts together into the
   finished product — on a timer, or sooner if the reader scrolls.

   Look and lighting follow product-3d-showcase.js: a prefiltered studio
   environment (lights alone leave PBR surfaces dead), ACES tone mapping, the
   same material palette assigned by part name, and a soft contact shadow
   that opens up while the pack is apart.

   Pieces come back in order — internals seat first, casing and lid close
   last — so nothing passes through the casing on the way in.

   Skipped (the poster simply stays) when: no WebGL, reduced motion, data
   saver, a narrow screen (the model is a large download), or the loader is
   missing. */
(function () {
  'use strict';

  var host = document.querySelector('.hero-visual[data-hero-3d]');
  if (!host) return;

  var THREE = window.THREE;
  if (!THREE) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  var narrow = window.matchMedia('(max-width: 767px)').matches;
  if (reduceMotion || saveData || narrow) return;

  var url = host.getAttribute('data-hero-3d');

  /* How far each layer travels, as a multiple of the pack's own radius.
     Matched by keyword against the CAD mesh name; most specific first. */
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

  var ASSEMBLE_DELAY_MS = 2000;
  var ASSEMBLE_MS = 4600;
  var VIEW_DIR = new THREE.Vector3(0.24, 0.3, 0.92).normalize();
  /* How far the pack is turned while it is apart (see the frame loop). The
     pieces' offsets are built in the pack's own space, so depth has to be
     measured along the view as the turned pack sees it. */
  var SPREAD_SPIN = -0.5;
  var SPREAD_VIEW = VIEW_DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -SPREAD_SPIN);
  /* Breathing room around the pack, as a share of the stage. */
  var FIT_MARGIN = 1.28;
  /* The pieces are thrown wide across the view and deep through it, barely
     up: they start spread out in front of and behind where they belong and
     settle forward or back into the finished pack. */
  var SPREAD = new THREE.Vector3(1.5, 0.22, 1.1);
  /* How much further out than the pack's own size the pieces begin. */
  var SPREAD_SCALE = 1;
  /* The camera never backs off more than this much beyond the framing of
     the finished pack. Pieces that swing wider than that pass out of frame
     on their way in, rather than shrinking the whole view to hold them. */
  var MAX_PULLBACK = 12;
  /* Turns like a globe: a slow drift the reader can grab and spin, which
     carries its own momentum and eases back to the drift when let go. */
  var SPIN_RATE = 0.22;
  var DRAG_SENSITIVITY = 0.0075;
  var SPIN_FRICTION = 2.4;
  var TILT_LIMIT = 0.42;
  /* How far through the view a piece may start, as a share of the pack's
     own size: a short reach towards the camera, a long one away from it. */
  var FORWARD_REACH = 1.1;
  var BACKWARD_REACH = 4;

  function tierFor(name) {
    var lower = (name || '').toLowerCase();
    for (var i = 0; i < LAYER_TIERS.length; i++) {
      if (lower.indexOf(LAYER_TIERS[i].test) !== -1) return LAYER_TIERS[i];
    }
    return null;
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* A world-space offset converted into the mesh's local space. CAD exports
     nest sub-assemblies under their own unit-scale nodes, so a world
     distance added straight to a local position would be scaled by them. */
  function worldToLocalDelta(mesh, worldPos, worldOffset) {
    var parent = mesh.parent;
    if (!parent) return worldOffset.clone();
    var a = parent.worldToLocal(worldPos.clone());
    var b = parent.worldToLocal(worldPos.clone().add(worldOffset));
    return b.sub(a);
  }

  function start() {
    var canvas = document.createElement('canvas');
    canvas.className = 'hero-visual-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      return; // no WebGL: the hero stays as text alone
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setClearColor(0x000000, 0);

    host.classList.add('is-3d');
    host.appendChild(canvas);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 6000);
    var group = new THREE.Group();
    scene.add(group);

    /* Studio environment, built as geometry and prefiltered into an env map:
       this is what puts real highlights on the metal parts. */
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

    /* The pack keeps the colours it was exported with. FBX brings Phong
       materials, which the studio environment cannot light properly, so each
       is rebuilt as a standard material carrying its own colour across, with
       shininess and specular becoming roughness and metalness. Materials are
       shared between meshes, so each one is converted only once. */
    var converted = {};
    function keepColour(source) {
      if (!source) return null;
      /* .wstm already carries standard materials, colour and all. */
      if (source.isMeshStandardMaterial) return source;
      if (converted[source.uuid]) return converted[source.uuid];
      var shininess = typeof source.shininess === 'number' ? source.shininess : 30;
      var specular = source.specular
        ? (source.specular.r + source.specular.g + source.specular.b) / 3
        : 0.2;
      var std = new THREE.MeshStandardMaterial({
        color: source.color ? source.color.clone() : new THREE.Color(0xb6bcc6),
        map: source.map || null,
        roughness: clamp01(1 - shininess / 120),
        metalness: clamp01(specular * 1.2),
        /* CAD exports the panels as open, single-sided skins; drawn from one
           side only they read as holes in the enclosure. */
        side: THREE.DoubleSide
      });
      converted[source.uuid] = std;
      return std;
    }

    /* The distance that holds the finished pack whichever way it is turned:
       its widest reach from its own axis, rather than the width it happens
       to show from one angle. Used once it is together and free to spin. */
    function restingDistance(margin) {
      var box = new THREE.Box3();
      for (var i = 0; i < parts.length; i++) box.expandByObject(parts[i].mesh);
      var mid = new THREE.Vector3();
      var size = new THREE.Vector3();
      box.getCenter(mid);
      box.getSize(size);
      restTarget.copy(mid);
      var reach = Math.sqrt(size.x * size.x + size.z * size.z) / 2;
      var tanV = Math.tan(camera.fov * Math.PI / 360);
      var tanH = tanV * camera.aspect;
      return Math.max(reach / tanH, (size.y / 2) / tanV) * margin + reach;
    }

    function ownMaterial(mesh) {
      if (Array.isArray(mesh.material)) return mesh.material.map(keepColour);
      return keepColour(mesh.material);
    }

    var lastW = 0, lastH = 0;
    function resize() {
      var r = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width));
      var h = Math.max(1, Math.round(r.height));
      if (w === lastW && h === lastH) return false;
      lastW = w; lastH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      return true;
    }
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
    else window.addEventListener('resize', resize);

    var parts = [];
    var ready = false;
    var readyAt = 0;
    var center = new THREE.Vector3();
    var yaw = 0, pitch = 0;
    var restDist = 0;
    var restTarget = new THREE.Vector3();
    var spinVelocity = 0, tiltVelocity = 0;
    var dragging = false, dragPointer = null, dragX = 0, dragY = 0, dragMoved = false, lastPointerAt = 0;
    var fitTarget = new THREE.Vector3();
    var camDist = 0;
    var wantDist = 0;
    var seatedDist = 0;
    var fitTick = 0;
    var lastFrame = 0;
    var shadowMesh = null, shadowScaleX = 1, shadowScaleZ = 1;
    var _q = new THREE.Quaternion();

    /* Frame the pack from the pieces themselves, every frame. Their corners
       are measured in the camera's own basis, the camera aims at the middle
       of that box and stands back far enough to hold it. The spread is far
       wider than it is tall, so fitting a bounding sphere instead would size
       the view by its diagonal and leave the width of the stage empty. */
    var RIGHT = new THREE.Vector3(VIEW_DIR.z, 0, -VIEW_DIR.x).normalize();
    var UP = new THREE.Vector3().crossVectors(VIEW_DIR, RIGHT).normalize();
    var _c = new THREE.Vector3();
    var corners = null;
    function fitDistance(margin) {
      if (!parts.length) return camDist || 1;
      if (!corners) corners = new Float32Array(parts.length * 24);
      var minR = Infinity, maxR = -Infinity;
      var minU = Infinity, maxU = -Infinity;
      var minF = Infinity, maxF = -Infinity;
      var n = 0, i, c;
      for (i = 0; i < parts.length; i++) {
        var mesh = parts[i].mesh;
        var geo = mesh.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        var b = geo.boundingBox;
        for (c = 0; c < 8; c++) {
          _c.set(c & 1 ? b.max.x : b.min.x, c & 2 ? b.max.y : b.min.y, c & 4 ? b.max.z : b.min.z)
            .applyMatrix4(mesh.matrixWorld);
          var r = _c.dot(RIGHT), u = _c.dot(UP), f = _c.dot(VIEW_DIR);
          corners[n++] = r; corners[n++] = u; corners[n++] = f;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
          if (f < minF) minF = f;
          if (f > maxF) maxF = f;
        }
      }
      var cR = (minR + maxR) / 2, cU = (minU + maxU) / 2, cF = (minF + maxF) / 2;
      fitTarget.set(0, 0, 0)
        .addScaledVector(RIGHT, cR)
        .addScaledVector(UP, cU)
        .addScaledVector(VIEW_DIR, cF);

      /* Exactly how far back the camera has to stand: for every corner, the
         distance at which it sits on the edge of the frame, allowing for how
         near to the camera that particular corner is. The widest piece is
         rarely the nearest one, so measuring per corner keeps the pack large
         instead of leaving a margin the size of the pack's depth. */
      var tanV = Math.tan(camera.fov * Math.PI / 360);
      var tanH = tanV * camera.aspect;
      var need = 0;
      for (i = 0; i < n; i += 3) {
        var dr = Math.abs(corners[i] - cR) * margin;
        var du = Math.abs(corners[i + 1] - cU) * margin;
        var df = corners[i + 2] - cF;
        var wide = dr / tanH + df;
        var tall = du / tanV + df;
        if (wide > need) need = wide;
        if (tall > need) need = tall;
      }
      return need;
    }

    /* A soft gradient disc standing in for a contact shadow: firm where the
       pack meets the floor, with a long penumbra. */
    function makeContactShadow(footprint) {
      var size = 512;
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var ctx = c.getContext('2d');
      var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      [[0, 0.9], [0.12, 0.82], [0.26, 0.6], [0.4, 0.36], [0.55, 0.18], [0.7, 0.08], [0.85, 0.025], [1, 0]]
        .forEach(function (s) { g.addColorStop(s[0], 'rgba(0,0,0,' + s[1] + ')'); });
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      var mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.55 });
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.rotation.x = -Math.PI / 2;
      /* Under the finished pack and shaped like its footprint: a disc sized
         off the bounding sphere sits beside a long unit rather than under it. */
      mesh.position.set(footprint.x, footprint.y - footprint.depth * 0.01, footprint.z);
      shadowScaleX = footprint.width * 1.5;
      shadowScaleZ = footprint.depth * 1.5;
      mesh.scale.set(shadowScaleX, shadowScaleZ, 1);
      mesh.renderOrder = -1;
      group.add(mesh);
      return mesh;
    }

    /* Where a piece floats while the pack is apart: out along `dir`, then
       stretched across the view. */
    function spreadOffset(dir, dist, radius) {
      var d = dist * SPREAD_SCALE;
      var off = new THREE.Vector3(dir.x * d, dir.y * d, dir.z * d).multiply(SPREAD);
      /* Depth is capped, tightly towards the camera and loosely away from it:
         a piece drifting back simply reads as further off, while one drifting
         forward would sweep past the lens and blot out the view. */
      var depth = off.dot(SPREAD_VIEW);
      var limit = depth > 0 ? radius * FORWARD_REACH : -radius * BACKWARD_REACH;
      if (Math.abs(depth) > Math.abs(limit)) off.addScaledVector(SPREAD_VIEW, limit - depth);
      return off;
    }

    /* `t` is how far apart the pack is, 1 exploded to 0 together. Each piece
       has its own delay on the way in, so the internals seat before the
       casing and lid close over them, and drifts gently while it is out. */
    function applyLayout(t, now) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var own = clamp01(((1 - t) - p.delay) / (1 - p.delay));
        var apart = 1 - own;
        var float = reduceMotion ? 0 : Math.sin(now / 1000 * 0.6 + p.phase) * apart;
        p.mesh.position.copy(p.basePos)
          .addScaledVector(p.delta, apart)
          .addScaledVector(p.drift, float);
        _q.setFromAxisAngle(p.spinAxis, apart * p.spinAmp);
        p.mesh.quaternion.copy(p.baseQuat).multiply(_q);
      }
    }

    function build(object) {
      try {
        var box = new THREE.Box3().setFromObject(object);
        var size = new THREE.Vector3();
        box.getSize(size);
        object.scale.multiplyScalar(2.6 / (Math.max(size.x, size.y, size.z) || 1));
        object.updateMatrixWorld(true);
        var sBox = new THREE.Box3().setFromObject(object);
        var sCenter = new THREE.Vector3();
        sBox.getCenter(sCenter);
        object.position.sub(sCenter);
        group.add(object);
        object.updateMatrixWorld(true);

        var box2 = new THREE.Box3().setFromObject(object);
        var sphere = box2.getBoundingSphere(new THREE.Sphere());
        var minY = box2.min.y;
        var height = Math.max(box2.max.y - minY, 1e-4);
        var hub = sphere.center;
        var dir = new THREE.Vector3();
        var index = 0;

        object.traverse(function (child) {
          if (!child.isMesh) return;
          child.material = ownMaterial(child) || child.material;
          child.castShadow = false;
          child.receiveShadow = false;

          var wp = new THREE.Vector3();
          child.getWorldPosition(wp);
          var tier = tierFor(child.name);

          /* Far out to begin with: the pieces start well clear of where they
             belong, so the hero opens on a genuine exploded view. */
          var dist;
          if (tier && tier.anchor) dist = sphere.radius * 0.9;
          else if (tier) dist = sphere.radius * (1.6 + tier.y * 0.55);
          else dist = sphere.radius * (1.5 + clamp01((wp.y - minY) / height) * 1.2);

          /* The pack closes in order: internals first, casing and lid last. */
          var delay;
          if (tier && tier.anchor) delay = 0.3;
          else if (tier && tier.y >= 3.9) delay = 0.26;
          else if (tier && tier.y >= 3) delay = 0.16;
          else if (tier && tier.y >= 2) delay = 0.08;
          else delay = 0;

          /* Outward from the centre, weighted sideways and through the view:
             every other piece is pushed towards the camera and the rest away
             from it, so they arrive from in front of and behind the pack
             rather than all in one plane. Pieces sitting on the axis get a
             deterministic push so they do not stay hidden in the middle. */
          dir.set(
            (wp.x - hub.x) * 6,
            (wp.y - hub.y) * 0.3,
            (wp.z - hub.z) * 1.2 + (index % 2 ? 1 : -1) * sphere.radius * 0.55
          );
          if (dir.lengthSq() < 1e-8) dir.set(index % 2 ? 1 : -1, 0.14, 0.5);
          dir.normalize();

          parts.push({
            mesh: child,
            basePos: child.position.clone(),
            baseQuat: child.quaternion.clone(),
            delta: worldToLocalDelta(child, wp, spreadOffset(dir, dist, sphere.radius)),
            /* A small sideways drift and a slow turn while the piece is out,
               both resolving to zero as it seats. */
            drift: worldToLocalDelta(child, wp, new THREE.Vector3(-dir.z, 0.35, dir.x).normalize().multiplyScalar(sphere.radius * 0.05)),
            spinAxis: new THREE.Vector3(
              Math.sin(index * 1.7), Math.cos(index * 0.9) * 0.4, Math.cos(index * 2.3)
            ).normalize(),
            spinAmp: 0.12 + (index % 7) * 0.012,
            phase: index * 0.7,
            delay: delay,
            dist: dist
          });
          index++;
        });

        resize();

        /* Frame the finished pack first: that framing is what the whole move
           settles into, and it caps how far the camera may pull back. */
        applyLayout(0, 0);
        object.updateMatrixWorld(true);
        seatedDist = fitDistance(FIT_MARGIN);
        restDist = restingDistance(FIT_MARGIN);
        var seatedBox = new THREE.Box3().setFromObject(object);
        var seatedSize = new THREE.Vector3();
        var seatedMid = new THREE.Vector3();
        seatedBox.getSize(seatedSize);
        seatedBox.getCenter(seatedMid);
        var footprint = {
          x: seatedMid.x, z: seatedMid.z, y: seatedBox.min.y,
          width: seatedSize.x, depth: seatedSize.z
        };
        applyLayout(1, 0);
        object.updateMatrixWorld(true);
        var reach = Math.min(fitDistance(FIT_MARGIN), seatedDist * MAX_PULLBACK);
        center.copy(fitTarget);
        camDist = wantDist = reach;
        camera.near = Math.max(0.01, seatedDist / 500);
        camera.far = reach * 20;
        camera.updateProjectionMatrix();

        shadowMesh = makeContactShadow(footprint);
        applyLayout(1, performance.now());
        ready = true;
        readyAt = performance.now();
        host.classList.add('is-3d-ready');
      } catch (e) {
        fail();
      }
    }

    function fail() {
      host.classList.remove('is-3d');
      canvas.remove();
    }

    /* The page starts fetching the model in its <head>, long before these
       scripts have run, so parse whatever that fetch brought back and only
       go to the network here if it is missing or failed. */
    var trimmed = url.toLowerCase().indexOf('.wstm') !== -1;
    var loader = trimmed ? window.WSTMLoader : (THREE.FBXLoader ? new THREE.FBXLoader() : null);
    if (!loader) return fail();
    var prefetched = window.__wstHeroModel;
    if (prefetched && typeof prefetched.then === 'function') {
      prefetched.then(function (buffer) {
        if (!buffer) return loader.load(url, build, undefined, fail);
        try {
          build(trimmed ? loader.parse(buffer) : loader.parse(buffer, ''));
        } catch (e) {
          fail();
        }
      }, function () { loader.load(url, build, undefined, fail); });
    } else {
      loader.load(url, build, undefined, fail);
    }

    /* Grab and spin. A vertical drag tilts within a limit and settles back;
       the page keeps its own vertical scrolling (see touch-action in the
       page styles), so dragging down the page still scrolls it. */
    canvas.addEventListener('pointerdown', function (e) {
      if (!ready || dragging) return;
      dragging = true;
      dragPointer = e.pointerId;
      dragX = e.clientX;
      dragY = e.clientY;
      dragMoved = false;
      spinVelocity = 0;
      tiltVelocity = 0;
      lastPointerAt = e.timeStamp;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('is-grabbing');
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== dragPointer) return;
      var dx = e.clientX - dragX;
      var dy = e.clientY - dragY;
      dragX = e.clientX;
      dragY = e.clientY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragMoved = true;
      yaw += dx * DRAG_SENSITIVITY;
      pitch = Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, pitch + dy * DRAG_SENSITIVITY * 0.6));
      /* Where the pointer was heading when it stopped becomes the spin it
         leaves behind. */
      var seconds = Math.max((e.timeStamp - lastPointerAt) / 1000, 0.008);
      lastPointerAt = e.timeStamp;
      spinVelocity = Math.max(-6, Math.min(6, dx * DRAG_SENSITIVITY / seconds));
      tiltVelocity = Math.max(-4, Math.min(4, dy * DRAG_SENSITIVITY * 0.6 / seconds));
    });

    function endDrag(e) {
      if (!dragging || (e && e.pointerId !== dragPointer)) return;
      dragging = false;
      dragPointer = null;
      canvas.classList.remove('is-grabbing');
      /* A flick carries on; a slow drag simply stops. */
      if (!dragMoved) { spinVelocity = 0; tiltVelocity = 0; }
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);

    /* How far the reader has scrolled the hero out of view, 0 to 1. */
    function scrollAssembled() {
      var hero = host.closest('.hero') || host;
      var h = hero.getBoundingClientRect().height || window.innerHeight;
      return clamp01(window.scrollY / (h * 0.45));
    }

    var visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }, { rootMargin: '120px 0px' }).observe(host);
    }

    var explode = 1;
    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible || !ready) return;
      if (resize() && restDist) restDist = restingDistance(FIT_MARGIN);

      /* Connect on the timer or on scroll, whichever is further along; once
         together the pack stays together. */
      var dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
      lastFrame = now;

      var timeT = easeInOutCubic(clamp01((now - readyAt - ASSEMBLE_DELAY_MS) / ASSEMBLE_MS));
      var scrollT = easeInOutCubic(scrollAssembled());
      var target = 1 - Math.max(timeT, scrollT);
      if (target < explode) explode = target;
      applyLayout(explode, now);

      /* The pack keeps turning on its own; a drag adds to that turn and
         leaves momentum behind, which friction takes back out. */
      if (!dragging) {
        yaw += (SPIN_RATE + spinVelocity) * dt;
        var decay = Math.exp(-SPIN_FRICTION * dt);
        spinVelocity *= decay;
        tiltVelocity *= decay;
        pitch += tiltVelocity * dt;
        pitch += (0 - pitch) * (1 - Math.exp(-1.2 * dt));
      }
      pitch = Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, pitch));
      group.rotation.y = SPREAD_SPIN + 0.62 * (1 - explode) + yaw;
      group.rotation.x = -0.08 + pitch;

      if (shadowMesh) {
        /* The shadow spreads and thins while the pack is apart. */
        shadowMesh.material.opacity = 0.55 * (1 - explode * 0.75);
        var spread = 1 + explode * 0.5;
        shadowMesh.scale.set(shadowScaleX * spread, shadowScaleZ * spread, 1);
      }

      /* Re-fit every frame: the pack fills the stage both while it floats
         apart and once it is together. Damped, so the pieces' own drift does
         not make the view breathe. */
      group.updateMatrixWorld(true);
      /* The fit walks every corner, so it runs on every third frame; the
         damping below carries the camera between those samples. */
      if (explode <= 0 && restDist) {
        /* Settled: hold a distance measured right round the turn, so spinning
           the pack does not make the view breathe in and out. */
        wantDist = restDist;
        center.copy(restTarget);
      } else if ((fitTick++ % 3) === 0) {
        wantDist = Math.min(fitDistance(FIT_MARGIN), seatedDist * MAX_PULLBACK);
      }
      /* Pull back quickly but close in gently: the view never lags behind a
         piece swinging outwards, so nothing is cut off at the edge. */
      var k = 1 - Math.exp((wantDist > camDist ? -14 : -6) * dt);
      camDist += (wantDist - camDist) * k;
      center.lerp(fitTarget, 1 - Math.exp(-3.5 * dt));
      camera.position.copy(center).addScaledVector(VIEW_DIR, camDist);
      camera.lookAt(center);

      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  /* Straight in: this script is deferred, so the document is parsed, and the
     model is already on its way from the <head> fetch. Waiting for the load
     event and an idle slot used to cost a second or more. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
