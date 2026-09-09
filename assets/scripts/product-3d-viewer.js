(function () {
  'use strict';

  var canvas = document.getElementById('productViewerCanvas');
  var stage = document.getElementById('viewerStage');
  var statusEl = document.getElementById('viewerStatus');
  var statusText = document.getElementById('viewerStatusText');
  var replayBtn = document.getElementById('viewerReplay');
  if (!canvas || !stage || !window.THREE || !window.THREE.FBXLoader) return;

  var THREE = window.THREE;
  var MODEL_URL = 'assets/models/sl02.fbx';
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

  var width = 1, height = 1;
  function resize() {
    var rect = stage.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
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

  var cameraDistance = null;

  function fitCameraToSphere(radius, center) {
    var fov = camera.fov * (Math.PI / 180);
    var dist = (radius / Math.sin(fov / 2)) * 1.5;
    camera.position.set(center.x + dist * 0.18, center.y + radius * 0.32, center.z + dist * 0.92);
    camera.lookAt(center);
    camera.near = Math.max(0.01, dist / 100);
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    /* Captured here (not lazily on the first render frame) — frames render
       before the async model load resolves, so deriving this from
       camera.position.length() on "first frame seen" would lock onto the
       camera's pre-load default position (the origin) instead. */
    cameraDistance = camera.position.length();
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
  var explodeT = 1;
  var anim = null;

  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

  function applyExplode(t) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.mesh.position.copy(p.basePos).addScaledVector(p.localDir, p.dist * t);
    }
  }

  function startAnimation(from, to, duration) {
    anim = { from: from, to: to, start: performance.now(), duration: duration };
    if (replayBtn) replayBtn.classList.add('is-animating');
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
          parts.push({
            mesh: child,
            basePos: child.position.clone(),
            localDir: localDir,
            dist: Math.max(baseDist, sphere.radius * 0.1) * 1.9
          });
          index++;
        });

        fitCameraToSphere(sphere.radius, overallCenter);
        applyExplode(reduceMotion ? 0 : 1);
        hideStatus();

        if (!reduceMotion) startAnimation(1, 0, 2000);
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

  if (replayBtn) {
    replayBtn.addEventListener('click', function () {
      if (!parts.length) return;
      applyExplode(1);
      startAnimation(1, 0, 1600);
    });
  }

  /* Pointer drag to orbit, matching the pattern used by wst-globe-webgl.js */
  var dragging = false;
  var lastX = 0, lastY = 0;
  var velocityX = 0, velocityY = 0;
  var rotY = 0.35, rotX = -0.12;

  stage.addEventListener('pointerdown', function (event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', function (event) {
    if (!dragging) return;
    var dx = event.clientX - lastX;
    var dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    velocityX = dx * 0.005;
    velocityY = dy * 0.005;
    rotY += velocityX;
    rotX = Math.max(-0.9, Math.min(0.9, rotX + velocityY));
  });
  function releasePointer(event) {
    dragging = false;
    if (event && stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  }
  stage.addEventListener('pointerup', releasePointer);
  stage.addEventListener('pointercancel', releasePointer);

  var zoom = 1;
  stage.addEventListener('wheel', function (event) {
    event.preventDefault();
    zoom = Math.max(0.55, Math.min(2.2, zoom + event.deltaY * 0.0012));
  }, { passive: false });

  var visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }, { rootMargin: '160px 0px' }).observe(stage);
  }

  function render() {
    requestAnimationFrame(render);
    if (!visible) return;

    if (anim) {
      var now = performance.now();
      var t = Math.min(1, (now - anim.start) / anim.duration);
      var eased = easeOutCubic(t);
      applyExplode(anim.from + (anim.to - anim.from) * eased);
      if (t >= 1) {
        anim = null;
        if (replayBtn) replayBtn.classList.remove('is-animating');
      }
    }

    if (!dragging && !reduceMotion) {
      rotY += 0.0016 + velocityX;
      velocityX *= 0.94;
      velocityY *= 0.94;
    }
    group.rotation.y = rotY;
    group.rotation.x = rotX;

    if (cameraDistance !== null) {
      var dir = camera.position.clone().normalize();
      camera.position.copy(dir.multiplyScalar(cameraDistance * zoom));
    }

    renderer.render(scene, camera);
  }
  render();
})();
