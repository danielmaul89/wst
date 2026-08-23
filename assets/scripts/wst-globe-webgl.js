(function () {
  'use strict';

  var canvas = document.getElementById('wstGlobe');
  if (!canvas || !window.THREE) return;

  var THREE = window.THREE;
  var stage = canvas.parentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
  } catch (error) {
    stage.classList.add('orbit-unavailable');
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0, 4.32);

  var globe = new THREE.Group();
  globe.rotation.x = 0.3;
  globe.rotation.y = -0.18;
  globe.rotation.z = -0.13;
  scene.add(globe);

  var radius = 1;
  var ocean = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 128, 96),
    new THREE.ShaderMaterial({
      transparent: false,
      depthWrite: true,
      uniforms: {
        oceanBase: { value: new THREE.Color(0x07142d) },
        oceanLift: { value: new THREE.Color(0x102750) }
      },
      vertexShader: [
        'varying vec3 vViewNormal;',
        'void main(){',
        '  vViewNormal = normalize(normalMatrix * normal);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 oceanBase;',
        'uniform vec3 oceanLift;',
        'varying vec3 vViewNormal;',
        'void main(){',
        '  float facing = clamp(vViewNormal.z, 0.0, 1.0);',
        '  float rim = pow(1.0 - facing, 2.35);',
        '  float lowerLift = (1.0 - clamp(vViewNormal.y * .5 + .5, 0.0, 1.0)) * .055;',
        '  float edgeLift = min(.32, rim * .26 + lowerLift);',
        '  gl_FragColor = vec4(mix(oceanBase, oceanLift, edgeLift), 1.0);',
        '}'
      ].join('\n')
    })
  );
  globe.add(ocean);

  var atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.018, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        glowColor: { value: new THREE.Color(0x172b50) }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'void main(){',
        '  vNormal = normalize(normalMatrix * normal);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 glowColor;',
        'varying vec3 vNormal;',
        'void main(){',
        '  float rim = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);',
        '  gl_FragColor = vec4(glowColor, rim * 0.032);',
        '}'
      ].join('\n')
    })
  );
  atmosphere.visible = false;
  scene.add(atmosphere);

  var dotUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uColorA: { value: new THREE.Color(0x2d8fc8) },
    uColorB: { value: new THREE.Color(0x67c3ed) }
  };

  function geoToVector(latitude, longitude, distance) {
    var lat = latitude * Math.PI / 180;
    var lon = longitude * Math.PI / 180;
    return new THREE.Vector3(
      Math.cos(lat) * Math.sin(lon) * distance,
      Math.sin(lat) * distance,
      Math.cos(lat) * Math.cos(lon) * distance
    );
  }

  function makeDotTexture() {
    var dotCanvas = document.createElement('canvas');
    dotCanvas.width = dotCanvas.height = 32;
    var context = dotCanvas.getContext('2d');
    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(16, 16, 13, 0, Math.PI * 2);
    context.fill();
    var texture = new THREE.CanvasTexture(dotCanvas);
    texture.needsUpdate = true;
    return texture;
  }

  function createLandDots(positions) {
    var liftedPositions = new Float32Array(positions.length);
    for (var positionIndex = 0; positionIndex < positions.length; positionIndex += 3) {
      var px = positions[positionIndex];
      var py = positions[positionIndex + 1];
      var pz = positions[positionIndex + 2];
      var length = Math.sqrt(px * px + py * py + pz * pz) || 1;
      var lift = 1.022 / length;
      liftedPositions[positionIndex] = px * lift;
      liftedPositions[positionIndex + 1] = py * lift;
      liftedPositions[positionIndex + 2] = pz * lift;
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(liftedPositions, 3));
    geometry.computeBoundingSphere();
    var material = new THREE.PointsMaterial({
      color: 0xe7ddcb,
      map: makeDotTexture(),
      size: 0.0115,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.64,
      alphaTest: 0.18,
      depthWrite: false,
      depthTest: true
    });
    var dots = new THREE.Points(geometry, material);
    dots.renderOrder = 2;
    globe.add(dots);
    stage.dataset.landDots = String(liftedPositions.length / 3);
  }

  /* Denmark is always index 0 - every route is drawn out of it. Only the two
     anchors carry a DOM label; the customer countries stay unlabelled so the
     globe reads as activity rather than a wall of text. `traveler` is reserved
     for the long-haul routes, where a moving dot is legible. */
  var CUSTOMER_COLOR = 0xcbb08a;
  var locations = [
    { name: 'Denmark', lat: 56.16, lon: 10.2, color: CUSTOMER_COLOR, hq: true, label: true },
    { name: 'China', lat: 31.2, lon: 121.5, color: 0x496c9f, label: true, partner: true, traveler: true },

    { name: 'United States · East', lat: 40.7, lon: -74, color: CUSTOMER_COLOR, traveler: true },
    { name: 'United States · West', lat: 37.8, lon: -122.4, color: CUSTOMER_COLOR },
    { name: 'Mexico', lat: 19.43, lon: -99.13, color: CUSTOMER_COLOR, traveler: true },
    { name: 'Brazil', lat: -15.79, lon: -47.88, color: CUSTOMER_COLOR, traveler: true },
    { name: 'Morocco', lat: 31.8, lon: -7.1, color: CUSTOMER_COLOR },
    { name: 'Japan', lat: 35.69, lon: 139.69, color: CUSTOMER_COLOR, traveler: true },
    { name: 'Thailand', lat: 13.75, lon: 100.5, color: CUSTOMER_COLOR },
    { name: 'Singapore', lat: 1.35, lon: 103.82, color: CUSTOMER_COLOR, traveler: true },
    { name: 'Australia', lat: -33.87, lon: 151.21, color: CUSTOMER_COLOR, traveler: true },

    { name: 'United Kingdom', lat: 53, lon: -1.5, color: CUSTOMER_COLOR },
    { name: 'Sweden', lat: 59.33, lon: 18.07, color: CUSTOMER_COLOR },
    { name: 'Norway', lat: 60.5, lon: 8.5, color: CUSTOMER_COLOR },
    { name: 'Finland', lat: 60.17, lon: 24.94, color: CUSTOMER_COLOR },
    { name: 'Latvia', lat: 56.95, lon: 24.11, color: CUSTOMER_COLOR },
    { name: 'Germany', lat: 51.1, lon: 10.4, color: CUSTOMER_COLOR },
    { name: 'Netherlands', lat: 52.2, lon: 5.5, color: CUSTOMER_COLOR },
    { name: 'Belgium', lat: 50.85, lon: 4.35, color: CUSTOMER_COLOR },
    { name: 'France', lat: 46.6, lon: 2.4, color: CUSTOMER_COLOR },
    { name: 'Spain', lat: 40.42, lon: -3.7, color: CUSTOMER_COLOR },
    { name: 'Portugal', lat: 39.5, lon: -8.2, color: CUSTOMER_COLOR },
    { name: 'Italy', lat: 42.8, lon: 12.6, color: CUSTOMER_COLOR },
    { name: 'Austria', lat: 47.5, lon: 14.5, color: CUSTOMER_COLOR },
    { name: 'Slovenia', lat: 46.1, lon: 14.8, color: CUSTOMER_COLOR },
    { name: 'Slovakia', lat: 48.7, lon: 19.7, color: CUSTOMER_COLOR },
    { name: 'Poland', lat: 52.0, lon: 19.5, color: CUSTOMER_COLOR },
    { name: 'Serbia', lat: 44.0, lon: 21.0, color: CUSTOMER_COLOR }
  ];

  function makeGlowTexture(color) {
    var textureCanvas = document.createElement('canvas');
    textureCanvas.width = textureCanvas.height = 128;
    var context = textureCanvas.getContext('2d');
    var gradient = context.createRadialGradient(64, 64, 0, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',.88)');
    gradient.addColorStop(0.11, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',.62)');
    gradient.addColorStop(0.32, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',.13)');
    gradient.addColorStop(1, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    var texture = new THREE.CanvasTexture(textureCanvas);
    texture.needsUpdate = true;
    return texture;
  }

  function makeTravelerTexture(color) {
    var travelerCanvas = document.createElement('canvas');
    travelerCanvas.width = travelerCanvas.height = 128;
    var context = travelerCanvas.getContext('2d');
    var rgb = {
      r: Math.round(color.r * 255),
      g: Math.round(color.g * 255),
      b: Math.round(color.b * 255)
    };
    var glow = context.createRadialGradient(64, 64, 2, 64, 64, 54);
    glow.addColorStop(0, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',.42)');
    glow.addColorStop(1, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, 128, 128);
    context.save();
    context.translate(64, 64);
    context.fillStyle = '#fbf9f5';
    context.shadowColor = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',.75)';
    context.shadowBlur = 16;
    context.beginPath();
    context.arc(0, 0, 5.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
    var texture = new THREE.CanvasTexture(travelerCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  var markerSprites = [];
  var labelSprites = [];
  locations.forEach(function (location) {
    var color = new THREE.Color(location.color);
    var rgb = {
      r: Math.round(color.r * 255),
      g: Math.round(color.g * 255),
      b: Math.round(color.b * 255)
    };
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(rgb),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    }));
    sprite.position.copy(geoToVector(location.lat, location.lon, radius * 1.025));
    var size = location.hq ? 0.108 : (location.label ? 0.078 : 0.068);
    sprite.scale.set(size, size, 1);
    sprite.userData.baseSize = size;
    sprite.userData.phase = Math.random() * Math.PI * 2;
    globe.add(sprite);
    markerSprites.push(sprite);

    if (!location.label) return;

    var label = document.createElement('span');
    label.className = 'orbit-location-label' + (location.hq ? ' is-hq' : '');
    label.textContent = location.name + (location.hq ? ' · HQ' : (location.partner ? ' · Production' : ''));
    label.setAttribute('aria-hidden', 'true');
    stage.appendChild(label);
    var offsetX = 14;
    var offsetY = -20;
    if (location.hq) {
      offsetX = 18;
      offsetY = -42;
    }
    labelSprites.push({
      label: label,
      marker: sprite,
      opacity: 1,
      offsetX: offsetX,
      offsetY: offsetY
    });
  });

  function createRoute(destination, index) {
    var start = geoToVector(locations[0].lat, locations[0].lon, radius * 1.018);
    var end = geoToVector(destination.lat, destination.lon, radius * 1.018);
    var angle = start.angleTo(end);
    var sinAngle = Math.sin(angle);
    var arcLift = Math.min(0.18, 0.05 + angle * 0.065);
    var routePoints = [];
    for (var pointIndex = 0; pointIndex <= 72; pointIndex += 1) {
      var amount = pointIndex / 72;
      var vector;
      if (Math.abs(sinAngle) < 0.0001) {
        vector = start.clone().lerp(end, amount).normalize();
      } else {
        var fromWeight = Math.sin((1 - amount) * angle) / sinAngle;
        var toWeight = Math.sin(amount * angle) / sinAngle;
        vector = start.clone().multiplyScalar(fromWeight).add(end.clone().multiplyScalar(toWeight)).normalize();
      }
      vector.multiplyScalar(radius * 1.018 + Math.sin(Math.PI * amount) * arcLift);
      routePoints.push(vector);
    }
    /* Europe carries most of the routes, so the unlabelled customer arcs are
       drawn thinner and fainter than the two anchors to stop that cluster
       turning into a solid blob. */
    var isAnchor = Boolean(destination.label);
    var curve = new THREE.CatmullRomCurve3(routePoints, false, 'centripetal');
    var geometry = new THREE.TubeBufferGeometry(curve, isAnchor ? 72 : 40, isAnchor ? 0.0027 : 0.0015, 6, false);
    var material = new THREE.MeshBasicMaterial({
      color: destination.color,
      transparent: true,
      opacity: isAnchor ? 0.22 : 0.12,
      depthWrite: false
    });
    var mesh = new THREE.Mesh(geometry, material);
    mesh.userData.curve = curve;
    mesh.userData.baseOpacity = isAnchor ? 0.18 : 0.1;
    globe.add(mesh);

    if (!destination.traveler) return mesh;

    var destinationColor = new THREE.Color(destination.color);
    var traveler = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeTravelerTexture(destinationColor),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    }));
    traveler.scale.set(0.058, 0.058, 1);
    traveler.userData.routeIndex = index;
    traveler.userData.curve = curve;
    globe.add(traveler);
    mesh.userData.traveler = traveler;
    return mesh;
  }

  var routes = locations.slice(1).map(createRoute);
  var loaded = false;
  var visible = true;

  if (window.WST_GLOBE_LAND && window.WST_GLOBE_LAND.length) {
    createLandDots(window.WST_GLOBE_LAND);
    loaded = true;
    stage.classList.add('orbit-ready');
  } else {
    stage.classList.add('orbit-unavailable');
  }

  var width = 0;
  var height = 0;
  function resize() {
    var rect = stage.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    dotUniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);
  resize();

  var dragging = false;
  var previousX = 0;
  var previousY = 0;
  var velocityX = 0;
  var velocityY = 0;

  canvas.addEventListener('pointerdown', function (event) {
    dragging = true;
    previousX = event.clientX;
    previousY = event.clientY;
    velocityX = velocityY = 0;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!dragging) return;
    var deltaX = event.clientX - previousX;
    var deltaY = event.clientY - previousY;
    globe.rotation.y += deltaX * 0.0055;
    globe.rotation.x += deltaY * 0.0055;
    velocityX = deltaX * 0.00075;
    velocityY = deltaY * 0.00075;
    previousX = event.clientX;
    previousY = event.clientY;
  });
  function releasePointer(event) {
    dragging = false;
    if (event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }, { rootMargin: '180px 0px' }).observe(stage);
  }

  var clock = new THREE.Clock();
  var labelWorldPosition = new THREE.Vector3();
  var labelNormal = new THREE.Vector3();
  var labelToCamera = new THREE.Vector3();
  var labelScreenPosition = new THREE.Vector3();
  function render() {
    requestAnimationFrame(render);
    if (!visible) return;
    var elapsed = clock.getElapsedTime();
    dotUniforms.uTime.value = elapsed;

    if (!dragging && !reduceMotion) {
      globe.rotation.y += 0.00065 + velocityX;
      globe.rotation.x += velocityY;
      velocityX *= 0.965;
      velocityY *= 0.965;
    }

    routes.forEach(function (route, index) {
      route.material.opacity = route.userData.baseOpacity + 0.055 * Math.sin(elapsed * 0.62 + index);
      if (!route.userData.traveler) return;
      var progress = reduceMotion ? 0.62 : (elapsed * 0.09 + index * 0.17) % 1;
      route.userData.traveler.position.copy(route.userData.curve.getPointAt(progress));
    });

    markerSprites.forEach(function (sprite) {
      var pulse = reduceMotion ? 1 : 1 + Math.sin(elapsed * 1.35 + sprite.userData.phase) * 0.13;
      var size = sprite.userData.baseSize * pulse;
      sprite.scale.set(size, size, 1);
    });

    scene.updateMatrixWorld(true);
    labelSprites.forEach(function (entry) {
      entry.marker.getWorldPosition(labelWorldPosition);
      labelNormal.copy(labelWorldPosition).normalize();
      labelToCamera.copy(camera.position).sub(labelWorldPosition).normalize();
      var facing = labelNormal.dot(labelToCamera);
      var horizonFade = Math.max(0, Math.min(1, (facing + 0.015) / 0.22));
      horizonFade = horizonFade * horizonFade * (3 - 2 * horizonFade);
      entry.opacity += (horizonFade - entry.opacity) * 0.11;
      labelScreenPosition.copy(labelWorldPosition).project(camera);
      var labelX = (labelScreenPosition.x * 0.5 + 0.5) * width + entry.offsetX;
      var labelY = (-labelScreenPosition.y * 0.5 + 0.5) * height + entry.offsetY;
      entry.label.style.transform = 'translate3d(' + labelX.toFixed(2) + 'px,' + labelY.toFixed(2) + 'px,0)';
      entry.label.style.opacity = entry.opacity.toFixed(3);
      entry.label.style.visibility = entry.opacity > 0.018 ? 'visible' : 'hidden';
    });

    renderer.render(scene, camera);
  }
  render();
})();
