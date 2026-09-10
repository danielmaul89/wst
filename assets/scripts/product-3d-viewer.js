(function () {
  'use strict';

  var canvas = document.getElementById('productViewerCanvas');
  var stage = document.getElementById('viewerStage');
  var scrollTrack = document.getElementById('viewerScroll');
  var statusEl = document.getElementById('viewerStatus');
  var statusText = document.getElementById('viewerStatusText');
  var scrollCopy = document.getElementById('viewerScrollCopy');
  var nextBtn = document.getElementById('viewerNextBtn');
  var modelNameEl = document.getElementById('viewerModelName');
  if (!canvas || !stage || !scrollTrack || !window.THREE || !window.THREE.FBXLoader) return;

  var THREE = window.THREE;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var MODELS = [
    { url: 'assets/models/c4e.fbx', label: 'Compact battery platform' },
    { url: 'assets/models/HDR.fbx', label: 'Heavy machinery platform' },
    { url: 'assets/models/wl03.fbx', label: 'UPS platform' },
    { url: 'assets/models/sl02.fbx', label: 'AGV platform' },
    { url: 'assets/models/B7W.fbx', label: 'Heavy machinery chassis' }
  ];
  var currentModelIndex = 0;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    if (statusText) statusText.textContent = '3D preview is not available on this device';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
  var group = new THREE.Group();
  scene.add(group);

  var hemi = new THREE.HemisphereLight(0xffffff, 0x38445c, 0.95);
  scene.add(hemi);
  var key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(6, 9, 7);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0xbfd0ff, 0.45);
  fill.position.set(-7, 2, -5);
  scene.add(fill);
  var rim = new THREE.DirectionalLight(0xffe3b8, 0.35);
  rim.position.set(0, 4, -8);
  scene.add(rim);

  var lastWidth = 0, lastHeight = 0;
  function resize() {
    var rect = stage.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width));
    var height = Math.max(1, Math.round(rect.height));
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(stage);
  } else {
    window.addEventListener('resize', resize);
  }

  /* A fixed viewing direction, not a fixed camera position — distance
     along it is animated with the explode progress (see render()), so
     the combined result doesn't sit small in a frame sized for the
     widest (exploded) spread. */
  var VIEW_DIR = new THREE.Vector3(0.18, 0.32, 0.92).normalize();
  var camCenter = new THREE.Vector3();
  var distExploded = 1;
  var distCombined = 1;

  function distanceForRadius(radius, margin) {
    var fov = camera.fov * (Math.PI / 180);
    return (radius / Math.sin(fov / 2)) * margin;
  }

  function setCameraTargets(explodedRadius, combinedRadius, center) {
    camCenter.copy(center);
    distExploded = distanceForRadius(explodedRadius, 1.15);
    distCombined = distanceForRadius(combinedRadius, 1.05);
    camera.near = Math.max(0.01, distCombined / 100);
    camera.far = distExploded * 20;
    camera.updateProjectionMatrix();
  }

  /* Convert a desired WORLD-space displacement into the LOCAL-space delta
     for mesh.position, via a full point transform through the parent's
     world matrix (not just a rotated unit vector). CAD-exported FBX files
     often nest sub-assemblies under their own internal unit-conversion
     scale node (e.g. a 0.0264 scale a few levels up) — a world-space
     distance added directly to local position would get crushed or
     blown up by that sub-tree's own scale, so the offset has to be
     computed by transforming the actual start/end WORLD points into the
     parent's local space and taking the difference. */
  function worldDisplacementToLocalDelta(mesh, worldPos, worldOffset) {
    var parent = mesh.parent;
    if (!parent) return worldOffset.clone();
    var targetWorld = worldPos.clone().add(worldOffset);
    var localOrigin = parent.worldToLocal(worldPos.clone());
    var localTarget = parent.worldToLocal(targetWorld);
    return localTarget.sub(localOrigin);
  }

  /* Vertical layer stack: real, named parts (a lid, a cell holder, a
     harness) are grouped into a handful of functional layers and lifted
     straight up — not scattered outward — so the model reads as a stack
     of flat slabs pulled apart, each layer moving as one rigid unit.
     Matched by keyword against the FBX mesh name (CAD exports keep names
     like "P_C4E5_CellHolderTop_REV03_C4E5-0004"); most-specific groups are
     checked first so e.g. "top" wins over the "cell" it's glued to. The
     outer casing/enclosure is the anchor layer and barely moves, so the
     rest of the stack reads as rising out of a fixed shell. Anything
     unmatched (mostly small hardware) rises by an amount based on its own
     height in the model, so it still lands near the layer it sits close
     to. */
  var LAYER_TIERS = [
    { test: 'lid', y: 4.0 },
    { test: 'cover', y: 4.0 },
    { test: 'harness', y: 3.15 },
    { test: 'cable', y: 3.15 },
    { test: 'wire', y: 3.15 },
    { test: 'connector', y: 3.15 },
    { test: 'plug', y: 3.15 },
    { test: 'socket', y: 3.15 },
    { test: 'solder', y: 3.15 },
    { test: 'ntc', y: 3.15 },
    { test: 'board', y: 3.15 },
    { test: 'pcb', y: 3.15 },
    { test: 'fr4', y: 3.15 },
    { test: 'cmu', y: 3.15 },
    { test: 'bms', y: 3.15 },
    { test: 'dzlr', y: 3.15 },
    { test: 'foam', y: 3.15 },
    { test: 'eva', y: 3.15 },
    { test: 'rubber', y: 3.15 },
    { test: 'gasket', y: 3.15 },
    { test: 'seal', y: 3.15 },
    { test: 'tape', y: 3.15 },
    { test: 'top', y: 2.35 },
    { test: 'busbar', y: 2.35 },
    { test: 'terminal', y: 2.35 },
    { test: 'bottom', y: 0.85 },
    { test: 'holder', y: 0.85 },
    { test: 'tray', y: 0.85 },
    { test: 'divider', y: 0.85 },
    { test: 'spacer', y: 0.85 },
    { test: 'cell', y: 1.6 },
    { test: 'battery', y: 1.6 },
    { test: 'highstar', y: 1.6 },
    { test: 'eve_c', y: 1.6 },
    { test: 'casing', anchor: true },
    { test: 'enclosure', anchor: true },
    { test: 'housing', anchor: true },
    { test: 'chassis', anchor: true },
    { test: 'shell', anchor: true },
    { test: 'case', anchor: true }
  ];

  function layerTierForName(name) {
    var lower = (name || '').toLowerCase();
    for (var i = 0; i < LAYER_TIERS.length; i++) {
      if (lower.indexOf(LAYER_TIERS[i].test) !== -1) return LAYER_TIERS[i];
    }
    return null;
  }

  var parts = [];
  var modelReady = false;
  var explodeCurrent = 1; // 1 = fully separated, 0 = fully combined
  var ROT_Y_START = -0.55;
  var ROT_Y_END = 0.32;
  var ROT_X = -0.1;

  function applyExplode(t) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.mesh.position.copy(p.basePos).addScaledVector(p.localDelta, t);
    }
  }

  function showStatus(message) {
    if (!statusEl) return;
    statusEl.hidden = false;
    var spin = statusEl.querySelector('.spin');
    if (spin) spin.style.display = '';
    if (statusText) statusText.textContent = message;
  }

  function hideStatus() {
    if (!statusEl) return;
    statusEl.hidden = true;
  }

  function showError(message) {
    if (statusText) statusText.textContent = message;
    var spin = statusEl ? statusEl.querySelector('.spin') : null;
    if (spin) spin.style.display = 'none';
  }

  /* Frees GPU resources for a previously-loaded model before swapping in
     the next one — without this, clicking through several models would
     leak geometry/texture memory for each one left behind. */
  function disposeObject3D(object) {
    object.traverse(function (child) {
      if (!child.isMesh) return;
      if (child.geometry) child.geometry.dispose();
      var materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(function (mat) {
        if (!mat) return;
        for (var key in mat) {
          var value = mat[key];
          if (value && value.isTexture) value.dispose();
        }
        mat.dispose();
      });
    });
  }

  var currentObject = null;
  var loadToken = 0;

  function loadModel(url, label) {
    var token = ++loadToken;
    modelReady = false;
    if (nextBtn) nextBtn.disabled = true;
    showStatus('Loading model');

    var loader = new THREE.FBXLoader();
    loader.load(
      url,
      function (object) {
        if (token !== loadToken) return; // a newer switch started; drop this one
        try {
          if (currentObject) {
            group.remove(currentObject);
            disposeObject3D(currentObject);
          }
          currentObject = object;
          parts = [];

          var box = new THREE.Box3().setFromObject(object);
          var size = new THREE.Vector3();
          box.getSize(size);

          var maxDim = Math.max(size.x, size.y, size.z) || 1;
          var targetSize = 2.6;
          var scale = targetSize / maxDim;
          object.scale.setScalar(scale);
          object.updateMatrixWorld(true);

          /* Recenter using the box computed AFTER scaling — computing it
             from the pre-scale box and subtracting that (unscaled) center
             left the model wildly off-origin, since position isn't itself
             scaled by object.scale in Three.js's local transform. */
          var scaledBox = new THREE.Box3().setFromObject(object);
          var scaledCenter = new THREE.Vector3();
          scaledBox.getCenter(scaledCenter);
          object.position.sub(scaledCenter);
          group.add(object);
          object.updateMatrixWorld(true);

          var box2 = new THREE.Box3().setFromObject(object);
          var sphere = box2.getBoundingSphere(new THREE.Sphere());
          var overallCenter = sphere.center.clone();

          var overallMinY = box2.min.y;
          var overallHeight = Math.max(box2.max.y - overallMinY, 1e-4);
          var UP = new THREE.Vector3(0, 1, 0);

          object.traverse(function (child) {
            if (!child.isMesh) return;
            var worldPos = new THREE.Vector3();
            child.getWorldPosition(worldPos);
            var yFrac = (worldPos.y - overallMinY) / overallHeight;

            var tier = layerTierForName(child.name);
            var dist;
            if (tier && tier.anchor) {
              /* The outer casing/enclosure barely lifts, so it reads as the
                 fixed shell everything else rises out of. */
              dist = sphere.radius * 0.15;
            } else if (tier) {
              dist = sphere.radius * tier.y;
            } else {
              /* Unmatched hardware (small fasteners, odd tapes) rises by an
                 amount based on its own height in the model, so it still
                 lands near the layer it physically sits close to. */
              dist = sphere.radius * (0.25 + Math.min(Math.max(yFrac, 0), 1) * 3.6);
            }

            var localDelta = worldDisplacementToLocalDelta(child, worldPos, UP.clone().multiplyScalar(dist));
            parts.push({
              mesh: child,
              basePos: child.position.clone(),
              localDelta: localDelta,
              dist: dist
            });
          });

          var maxReach = sphere.radius;
          for (var pi = 0; pi < parts.length; pi++) {
            maxReach = Math.max(maxReach, sphere.radius + parts[pi].dist);
          }
          resize();
          setCameraTargets(maxReach, sphere.radius, overallCenter);
          explodeCurrent = 1;
          applyExplode(1);
          hideStatus();
          modelReady = true;
          if (nextBtn) nextBtn.disabled = false;
          if (modelNameEl && label) modelNameEl.textContent = label;
        } catch (setupError) {
          showError('The 3D model could not be displayed (' + setupError.message + ')');
          if (nextBtn) nextBtn.disabled = false;
        }
      },
      function (xhr) {
        if (token !== loadToken) return;
        if (xhr.lengthComputable && statusText) {
          var pct = Math.round((xhr.loaded / xhr.total) * 100);
          statusText.textContent = 'Loading model ' + pct + '%';
        }
      },
      function (loadError) {
        if (token !== loadToken) return;
        showError('The 3D model could not be loaded' + (loadError && loadError.message ? ' (' + loadError.message + ')' : ''));
        if (nextBtn) nextBtn.disabled = false;
      }
    );
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      currentModelIndex = (currentModelIndex + 1) % MODELS.length;
      loadModel(MODELS[currentModelIndex].url, MODELS[currentModelIndex].label);
    });
  }

  loadModel(MODELS[currentModelIndex].url, MODELS[currentModelIndex].label);

  /* Scroll progress through the tall track (0 at the top of the track,
     1 once it has fully scrolled past, while the stage stays pinned). */
  function getScrollProgress() {
    var rect = scrollTrack.getBoundingClientRect();
    var travel = rect.height - window.innerHeight;
    if (travel <= 0) return 1;
    return Math.min(1, Math.max(0, -rect.top / travel));
  }

  var visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }, { rootMargin: '200px 0px' }).observe(scrollTrack);
  }

  function render() {
    requestAnimationFrame(render);
    if (!visible) return;
    resize();

    var progress = getScrollProgress();

    if (scrollCopy) {
      var hintOpacity = 1 - Math.min(1, progress / 0.12);
      scrollCopy.style.opacity = hintOpacity.toFixed(2);
      scrollCopy.style.pointerEvents = hintOpacity > 0.05 ? 'auto' : 'none';
    }

    if (modelReady) {
      var target = 1 - progress;
      explodeCurrent += (target - explodeCurrent) * (reduceMotion ? 1 : 0.14);
      applyExplode(explodeCurrent);

      group.rotation.y = ROT_Y_START + (ROT_Y_END - ROT_Y_START) * progress;
      group.rotation.x = ROT_X;

      /* Dolly in as the parts come together — a fixed camera sized to
         fit the exploded spread left the assembled result looking
         small by comparison. */
      var camDist = distCombined + (distExploded - distCombined) * explodeCurrent;
      camera.position.copy(camCenter).addScaledVector(VIEW_DIR, camDist);
      camera.lookAt(camCenter);
    }

    renderer.render(scene, camera);
  }
  render();
})();
