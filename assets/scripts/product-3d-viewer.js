(function () {
  'use strict';

  var canvas = document.getElementById('productViewerCanvas');
  var stage = document.getElementById('viewerStage');
  var scrollTrack = document.getElementById('viewerScroll');
  var statusEl = document.getElementById('viewerStatus');
  var statusText = document.getElementById('viewerStatusText');
  var scrollCopy = document.getElementById('viewerScrollCopy');
  if (!canvas || !stage || !scrollTrack || !window.THREE || !window.THREE.FBXLoader) return;

  var THREE = window.THREE;
  var MODEL_URL = 'assets/models/c4e.fbx';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* Convert a world-space direction into the local space of a mesh's
     immediate parent, so offsetting mesh.position (local) by it produces
     the intended world-space displacement even inside a rotated hierarchy. */
  function worldDirToLocal(mesh, worldDir) {
    var parentQuat = new THREE.Quaternion();
    if (mesh.parent) mesh.parent.getWorldQuaternion(parentQuat);
    return worldDir.clone().applyQuaternion(parentQuat.invert());
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
      p.mesh.position.copy(p.basePos).addScaledVector(p.localDir, p.dist * t);
    }
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

  var loader = new THREE.FBXLoader();
  loader.load(
    MODEL_URL,
    function (object) {
      try {
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

        var index = 0;
        object.traverse(function (child) {
          if (!child.isMesh) return;
          var worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);
          var worldDir = worldPos.clone().sub(overallCenter);
          var baseDist = worldDir.length();
          if (baseDist < 1e-5) {
            worldDir.set(Math.sin(index * 1.31), Math.cos(index * 0.71) * 0.6, Math.cos(index * 1.93));
            baseDist = Math.max(sphere.radius * 0.12, 0.05);
          }
          worldDir.normalize();
          var localDir = worldDirToLocal(child, worldDir);
          /* Clamp per-part travel to the model's own scale. Without this,
             a large enclosing part (e.g. an outer casing shell) whose
             centroid sits close to the overall center — but whose surface
             is huge — could swing an oversized panel right up against the
             camera mid-scroll, filling the frame at near-clip range. */
          var dist = Math.min(Math.max(baseDist, sphere.radius * 0.1) * 1.9, sphere.radius * 1.1);
          parts.push({
            mesh: child,
            basePos: child.position.clone(),
            localDir: localDir,
            dist: dist
          });
          index++;
        });

        var maxReach = sphere.radius;
        for (var pi = 0; pi < parts.length; pi++) {
          maxReach = Math.max(maxReach, sphere.radius + parts[pi].dist);
        }
        resize();
        setCameraTargets(maxReach, sphere.radius, overallCenter);
        applyExplode(1);
        hideStatus();
        modelReady = true;
      } catch (setupError) {
        showError('The 3D model could not be displayed (' + setupError.message + ')');
      }
    },
    function (xhr) {
      if (xhr.lengthComputable && statusText) {
        var pct = Math.round((xhr.loaded / xhr.total) * 100);
        statusText.textContent = 'Loading model ' + pct + '%';
      }
    },
    function (loadError) {
      showError('The 3D model could not be loaded' + (loadError && loadError.message ? ' (' + loadError.message + ')' : ''));
    }
  );

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
