(function () {
  'use strict';

  if (!window.THREE || !window.THREE.FBXLoader) return;
  var THREE = window.THREE;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initSection(section) {
    var modelUrl = section.getAttribute('data-model');
    var canvas = section.querySelector('.viewer-canvas');
    var stage = section.querySelector('.viewer-sticky');
    var statusEl = section.querySelector('.viewer-status');
    var statusText = section.querySelector('.viewer-status-text');
    var scrollCopy = section.querySelector('.viewer-scroll-copy');
    if (!modelUrl || !canvas || !stage) return;

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

    function fitCameraToSphere(radius, center) {
      var fov = camera.fov * (Math.PI / 180);
      var dist = (radius / Math.sin(fov / 2)) * 1.5;
      camera.position.set(center.x + dist * 0.18, center.y + radius * 0.32, center.z + dist * 0.92);
      camera.lookAt(center);
      camera.near = Math.max(0.01, dist / 100);
      camera.far = dist * 20;
      camera.updateProjectionMatrix();
    }

    function worldDirToLocal(mesh, worldDir) {
      var parentQuat = new THREE.Quaternion();
      if (mesh.parent) mesh.parent.getWorldQuaternion(parentQuat);
      return worldDir.clone().applyQuaternion(parentQuat.invert());
    }

    var parts = [];
    var modelReady = false;
    var loadStarted = false;
    var explodeCurrent = 1;
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
      if (statusEl) statusEl.hidden = true;
    }

    function showError(message) {
      if (statusText) statusText.textContent = message;
      var spin = statusEl ? statusEl.querySelector('.spin') : null;
      if (spin) spin.style.display = 'none';
    }

    function loadModel() {
      if (loadStarted) return;
      loadStarted = true;
      var loader = new THREE.FBXLoader();
      loader.load(
        modelUrl,
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
              var dist = Math.min(Math.max(baseDist, sphere.radius * 0.1) * 1.9, sphere.radius * 1.1);
              parts.push({ mesh: child, basePos: child.position.clone(), localDir: localDir, dist: dist });
              index++;
            });

            var maxReach = sphere.radius;
            for (var pi = 0; pi < parts.length; pi++) {
              maxReach = Math.max(maxReach, sphere.radius + parts[pi].dist);
            }
            /* Re-check size right before framing — the container may have
               been at a stale/transitional size (e.g. mid-layout, or
               before the sticky stage had settled) when the last resize
               ran, and camera framing needs the real aspect ratio. */
            resize();
            fitCameraToSphere(maxReach, overallCenter);
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
    }

    function getScrollProgress() {
      var rect = section.getBoundingClientRect();
      var travel = rect.height - window.innerHeight;
      if (travel <= 0) return 1;
      return Math.min(1, Math.max(0, -rect.top / travel));
    }

    /* Polled from the render loop rather than IntersectionObserver — the
       observer never fired in testing (confirmed with a bare no-op
       observer), while this rAF + getBoundingClientRect check is the same
       mechanism the scroll-scrub itself already relies on, so it's known
       to run every frame regardless. */
    var PRELOAD_MARGIN = 900;
    function isNearViewport() {
      var rect = section.getBoundingClientRect();
      return rect.bottom > -PRELOAD_MARGIN && rect.top < window.innerHeight + PRELOAD_MARGIN;
    }

    function render() {
      requestAnimationFrame(render);

      var visible = isNearViewport();
      if (!visible) return;
      if (!loadStarted) loadModel();
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
      }

      renderer.render(scene, camera);
    }
    render();
  }

  document.querySelectorAll('.viewer-scroll[data-model]').forEach(initSection);
})();
