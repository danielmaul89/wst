(function () {
  'use strict';

  var canvas = document.getElementById('globeCanvas');
  if (!canvas) return;

  var wrap = canvas.parentElement;
  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var points = [];
  var size = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var rotation = -.2;
  var tilt = -.12;
  var dragging = false;
  var previousX = 0;
  var previousY = 0;
  var lastTime = 0;

  var markers = [
    { left:52.305, top:24.358, color:'#FBF9F5', label:'Aarhus · HQ', primary:true },
    { left:47.704, top:24.358, color:'#CBB08A', label:'United Kingdom' },
    { left:23.181, top:34.623, color:'#CBB08A', label:'North America' },
    { left:13.987, top:34.623, color:'#CBB08A', label:'West Coast' },
    { left:29.316, top:61.975, color:'#CBB08A', label:'South America' },
    { left:78.353, top:34.623, color:'#CBB08A', label:'China · Production' }
  ];

  function resize() {
    size = Math.round(wrap.clientWidth);
    if (!size) return;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(left, top) {
    var lon = ((left / 100) * Math.PI * 2 - Math.PI) + rotation;
    var lat = Math.PI / 2 - (top / 100) * Math.PI;
    var cosLat = Math.cos(lat);
    var x = cosLat * Math.sin(lon);
    var y = Math.sin(lat);
    var z = cosLat * Math.cos(lon);
    var cosTilt = Math.cos(tilt);
    var sinTilt = Math.sin(tilt);
    return {
      x: x,
      y: y * cosTilt - z * sinTilt,
      z: y * sinTilt + z * cosTilt
    };
  }

  function roundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function draw(timestamp) {
    if (!size) return;
    var center = size / 2;
    var radius = size * .425;
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.shadowColor = 'rgba(3,11,33,.25)';
    ctx.shadowBlur = size * .07;
    ctx.shadowOffsetY = size * .025;
    var sphere = ctx.createRadialGradient(
      center - radius * .34, center - radius * .4, radius * .04,
      center, center, radius * 1.15
    );
    sphere.addColorStop(0, '#1b294b');
    sphere.addColorStop(.42, '#0a1733');
    sphere.addColorStop(.78, '#030b21');
    sphere.addColorStop(1, '#010515');
    ctx.fillStyle = sphere;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius - 1, 0, Math.PI * 2);
    ctx.clip();

    points.forEach(function (point) {
      var projected = project(point.left, point.top);
      if (projected.z <= .015) return;
      var px = center + projected.x * radius * .965;
      var py = center - projected.y * radius * .965;
      ctx.globalAlpha = .25 + projected.z * .72;
      ctx.fillStyle = '#FBF9F5';
      ctx.beginPath();
      ctx.arc(px, py, .65 + projected.z * 1.18, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.globalAlpha = 1;

    markers.forEach(function (marker, markerIndex) {
      var projected = project(marker.left, marker.top);
      if (projected.z <= .08) return;
      var px = center + projected.x * radius * .965;
      var py = center - projected.y * radius * .965;
      var pulse = reduceMotion ? 0 : ((timestamp / 5600 + markerIndex * .16) % 1);

      ctx.strokeStyle = marker.primary
        ? 'rgba(251,249,245,' + ((1 - pulse) * .3) + ')'
        : 'rgba(203,176,138,' + ((1 - pulse) * .26) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, 8 + pulse * 18, 0, Math.PI * 2);
      ctx.stroke();

      ctx.shadowColor = marker.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = marker.color;
      ctx.beginPath();
      ctx.arc(px, py, marker.primary ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (projected.z > .6 && (marker.primary || markerIndex === 2 || markerIndex === 5)) {
        ctx.font = '500 11px Arbeit, Inter, Arial, sans-serif';
        var labelWidth = ctx.measureText(marker.label).width + 18;
        var labelX = Math.min(size - labelWidth - 8, px + 12);
        var labelY = py - 13;
        roundedRect(labelX, labelY, labelWidth, 25, 7);
        ctx.fillStyle = 'rgba(251,249,245,.94)';
        ctx.fill();
        ctx.fillStyle = '#030B21';
        ctx.fillText(marker.label, labelX + 9, labelY + 16.5);
      }
    });

    ctx.strokeStyle = 'rgba(15,42,92,.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, radius + .5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function tick(timestamp) {
    var delta = lastTime ? Math.min(timestamp - lastTime, 32) : 16;
    lastTime = timestamp;
    if (!dragging && !reduceMotion) rotation += delta * .000055;
    draw(timestamp);
    requestAnimationFrame(tick);
  }

  function pointerDown(event) {
    dragging = true;
    previousX = event.clientX;
    previousY = event.clientY;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    if (!dragging) return;
    rotation += (event.clientX - previousX) * .006;
    tilt += (event.clientY - previousY) * .004;
    tilt = Math.max(-.55, Math.min(.55, tilt));
    previousX = event.clientX;
    previousY = event.clientY;
  }

  function pointerUp() {
    dragging = false;
  }

  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);

  fetch('assets/map/wst-map.svg')
    .then(function (response) {
      if (!response.ok) throw new Error('Map unavailable');
      return response.text();
    })
    .then(function (svgText) {
      var match;
      var circlePattern = /cx="([\d.]+)" cy="([\d.]+)"/g;
      while ((match = circlePattern.exec(svgText))) {
        points.push({
          left: parseFloat(match[1]) / 1147.5 * 100,
          top: parseFloat(match[2]) / 514.4 * 100
        });
      }
      var pathPattern = /d="M([\d.]+),([\d.]+)/g;
      while ((match = pathPattern.exec(svgText))) {
        points.push({
          left: (parseFloat(match[1]) + 2.2) / 1147.5 * 100,
          top: parseFloat(match[2]) / 514.4 * 100
        });
      }
      wrap.classList.add('globe-ready');
      requestAnimationFrame(tick);
    })
    .catch(function () {
      canvas.style.display = 'none';
    });
})();
