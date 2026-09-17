/* Home hero: live 3D battery pack.

   The static render in `.hero-visual` stays in place as the poster. Once the
   page has loaded and the browser is idle, a real production model is loaded
   into a canvas over it. The pack starts as a full exploded view and gathers
   into the centre, either on a timer or as the reader scrolls, whichever
   comes first, then settles into a slow drift.

   Parts fly outward from the pack's centre, weighted sideways so the view
   opens to the left and right rather than stacking upward. They come back in
   order: the internals seat first, the casing and lid close last, so nothing
   passes through the casing on the way in. Layer rules and the
   world-to-local offset handling follow product-3d-viewer.js.

   Skipped (the poster simply stays) when: no WebGL, reduced motion, data
   saver, a narrow screen (the model is a large download), or the loader is
   missing. */
(function () {
  'use strict';

  var host = document.querySelector('.hero-visual[data-hero-3d]');
  if (!host) return;

  var THREE = window.THREE;
  if (!THREE || !THREE.FBXLoader) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  var narrow = window.matchMedia('(max-width: 767px)').matches;
  if (reduceMotion || saveData || narrow) return;

  var url = host.getAttribute('data-hero-3d');

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

  var ASSEMBLE_DELAY_MS = 450;
  var ASSEMBLE_MS = 2600;
  var VIEW_DIR = new THREE.Vector3(0.22, 0.3, 0.93).normalize();

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
      return; // no WebGL: keep the poster
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);

    host.classList.add('is-3d');
    host.appendChild(canvas);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
    var group = new THREE.Group();
    scene.add(group);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x38445c, 0.95));
    var key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(6, 9, 7);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xbfd0ff, 0.45);
    fill.position.set(-7, 2, -5);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xffe3b8, 0.35);
    rim.position.set(0, 4, -8);
    scene.add(rim);

    var lastW = 0, lastH = 0;
    function resize() {
      var r = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width));
      var h = Math.max(1, Math.round(r.height));
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
    else window.addEventListener('resize', resize);

    var parts = [];
    var ready = false;
    var readyAt = 0;
    var center = new THREE.Vector3();
    var distExploded = 1, distCombined = 1;

    function fitDistance(radius, margin) {
      var vFov = camera.fov * Math.PI / 180;
      var hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      var fov = Math.min(vFov, hFov);
      return (radius / Math.sin(fov / 2)) * margin;
    }

    /* `t` is how far apart the pack is, 1 exploded to 0 together. Each part
       has its own delay on the way in, so the internals seat before the
       casing and lid close over them. */
    function applyExplode(t) {
      var assembled = 1 - t;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var own = clamp01((assembled - p.delay) / (1 - p.delay));
        p.mesh.position.copy(p.basePos).addScaledVector(p.delta, 1 - own);
      }
    }

    new THREE.FBXLoader().load(url, function (object) {
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
          var wp = new THREE.Vector3();
          child.getWorldPosition(wp);
          var tier = tierFor(child.name);

          /* How far out: the casing opens only a little, named layers travel
             by their type, and unmatched hardware by where it sits. */
          var dist;
          if (tier && tier.anchor) dist = sphere.radius * 0.4;
          else if (tier) dist = sphere.radius * (0.8 + tier.y * 0.3);
          else dist = sphere.radius * (0.75 + clamp01((wp.y - minY) / height) * 0.9);

          /* The pack closes in order: internals first, casing and lid last. */
          var delay;
          if (tier && tier.anchor) delay = 0.3;
          else if (tier && tier.y >= 3.9) delay = 0.26;
          else if (tier && tier.y >= 3) delay = 0.16;
          else if (tier && tier.y >= 2) delay = 0.08;
          else delay = 0;

          /* Outward from the centre, weighted sideways so the view opens to
             the left and right. Parts sitting on the axis get a deterministic
             push so they do not stay hidden in the middle. */
          dir.set((wp.x - hub.x) * 2.4, (wp.y - hub.y) * 0.8, (wp.z - hub.z) * 1.1);
          if (dir.lengthSq() < 1e-8) dir.set(index % 2 ? 1 : -1, 0.14, 0);
          dir.normalize();
          index++;

          parts.push({
            mesh: child,
            basePos: child.position.clone(),
            delta: worldToLocalDelta(child, wp, dir.clone().multiplyScalar(dist)),
            delay: delay,
            dist: dist
          });
        });

        var reach = sphere.radius;
        for (var i = 0; i < parts.length; i++) reach = Math.max(reach, sphere.radius + parts[i].dist);
        resize();
        center.copy(sphere.center);
        /* The exploded view spreads evenly around the centre, so frame the
           full spread from there. */
        distExploded = fitDistance(reach, 1.04);
        distCombined = fitDistance(sphere.radius, 1.02);
        camera.near = Math.max(0.01, distCombined / 100);
        camera.far = distExploded * 20;
        camera.updateProjectionMatrix();

        applyExplode(1);
        ready = true;
        readyAt = performance.now();
        host.classList.add('is-3d-ready');
      } catch (e) {
        host.classList.remove('is-3d');
        canvas.remove();
      }
    }, undefined, function () {
      host.classList.remove('is-3d');
      canvas.remove();
    });

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
      resize();

      /* Connect on the timer or on scroll, whichever is further along; once
         assembled the pack stays together. */
      var timeT = easeInOutCubic(clamp01((now - readyAt - ASSEMBLE_DELAY_MS) / ASSEMBLE_MS));
      var scrollT = easeInOutCubic(scrollAssembled());
      var target = 1 - Math.max(timeT, scrollT);
      if (target < explode) explode = target;
      applyExplode(explode);

      var t = now / 1000;
      group.rotation.y = -0.55 + 0.7 * (1 - explode) + Math.sin(t * 0.22) * 0.08 * (1 - explode);
      group.rotation.x = -0.08;

      /* Pull back for the spread, in close once the pack is together. */
      var dist = distCombined + (distExploded - distCombined) * explode;
      camera.position.copy(center).addScaledVector(VIEW_DIR, dist);
      camera.lookAt(center);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  function whenIdle(fn) {
    if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 1500 });
    else setTimeout(fn, 300);
  }

  if (document.readyState === 'complete') whenIdle(start);
  else window.addEventListener('load', function () { whenIdle(start); }, { once: true });
})();
