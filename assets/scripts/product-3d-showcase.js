/* ===================================================================
   Showcase viewer — a directed, scroll-scrubbed teardown.

   Differs from product-3d-viewer.js in three ways that matter:

   1. It relights the model. FBX exports arrive with flat Phong materials
      and missing texture references, which render like a CAD viewer. Every
      material is replaced by a small PBR palette keyed off the part name,
      lit by an environment map generated procedurally at runtime (no HDR
      asset to ship), so metal actually reflects something.

   2. The explode is staged, not uniform. Each part carries a sequence
      number derived from its layer, and the timeline offsets each part's
      easing by that number — the lid leaves first and returns last, so the
      motion reads as a teardown rather than everything sliding at once.

   3. The camera is choreographed. It travels a keyframed spherical path
      (azimuth / elevation / distance / focal length) against the same
      timeline, instead of only dollying along a fixed axis.
   =================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('scCanvas');
  var stage = document.getElementById('scScreen');
  var track = document.getElementById('scTheatre');
  if (!canvas || !stage || !track || !window.THREE || !window.THREE.FBXLoader) return;

  var THREE = window.THREE;
  var loaderEl = document.getElementById('scLoader');
  var loaderPct = document.getElementById('scLoaderPct');
  var loaderBar = document.getElementById('scLoaderBar');
  var calloutLayer = document.getElementById('scCallouts');
  var hintEl = document.getElementById('scHint');
  var partCountEl = document.getElementById('scPartCount');
  var platformEl = document.getElementById('scPlatform');
  var cellsEl = document.getElementById('scCellFormat');
  var nextBtn = document.getElementById('scNextBtn');
  var switchName = document.getElementById('scSwitchName');
  var switchIndex = document.getElementById('scSwitchIndex');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------
     Timeline
     --------------------------------------------------------------- */
  var ACT_SEPARATE = 0.14;  // pack holds until here, then comes apart
  var ACT_INSPECT  = 0.46;  // fully apart, camera tours the stack
  var ACT_ASSEMBLE = 0.72;  // goes back together
  var STAGGER = 0.55;       // share of an act spent waiting your turn

  /* Camera keyframes. `zoom` is 0 (framed on the assembled pack) to 1
     (framed on the full exploded spread) — resolved against the model's
     real measurements at load, so it adapts to whatever is loaded. */
  var CAM_KEYS = [
    { at: 0.00, az: -0.55, pol: 1.24, zoom: 0.06, fov: 30 },
    { at: 0.13, az: -0.34, pol: 1.20, zoom: 0.14, fov: 30 },
    /* While the pack is open the camera only drifts: height held nearly
       level and a ~25 degree turn, so each scroll step reads as a glide
       rather than a bob and swing. */
    { at: 0.46, az:  0.30, pol: 1.10, zoom: 1.00, fov: 32 },
    { at: 0.59, az:  0.52, pol: 1.12, zoom: 0.99, fov: 32 },
    { at: 0.72, az:  0.74, pol: 1.13, zoom: 0.98, fov: 32 },
    /* Lands about 90 degrees around from the opening shot — far enough to
       feel like a new view, without swinging round to the casing's open
       end, which reads as an unfinished product. */
    { at: 1.00, az:  1.02, pol: 1.21, zoom: 0.08, fov: 30 }
  ];

  var INTRO_MS = 2600;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  /* Offsets a normalized 0..1 ramp by `delay`, so parts move in sequence
     while still all finishing inside the act. */
  function staggered(a, delay) {
    return clamp01((a - delay * STAGGER) / (1 - STAGGER));
  }

  /* ---------------------------------------------------------------
     Renderer / scene
     --------------------------------------------------------------- */
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    if (loaderPct) loaderPct.textContent = 'Unavailable';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 6000);
  var group = new THREE.Group();
  scene.add(group);

  /* Studio environment, built as geometry and prefiltered into an env map.
     This is what puts real highlights and reflections on the metal parts —
     lights alone leave PBR surfaces looking dead. */
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
      return m;
    }
    panel(0x11151f, 1.0, [0, 0, -14], [0, 0, 0], 40, 40);          // dark surround
    panel(0xffffff, 4.2, [0, 9, 0.5], [-Math.PI / 2, 0, 0], 15, 15); // overhead softbox
    panel(0xffd9ab, 2.1, [0, 2.6, -9.5], [0, 0, 0], 15, 9);          // warm rim, behind
    panel(0x9dc0ff, 1.35, [-8.5, 2.2, 2], [0, Math.PI / 2, 0], 13, 9); // cool fill, left
    panel(0xffffff, 0.85, [8.5, 2.2, 2], [0, -Math.PI / 2, 0], 13, 9); // soft fill, right
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

  /* ---------------------------------------------------------------
     Material palette, assigned by part name
     --------------------------------------------------------------- */
  function std(color, metalness, roughness) {
    return new THREE.MeshStandardMaterial({ color: color, metalness: metalness, roughness: roughness });
  }

  /* The pack wears the colours it was drawn in. CAD exports arrive as Phong
     materials, which the studio environment cannot light properly, so each
     one is rebuilt as a standard material carrying its own colour across;
     shininess and specular become roughness and metalness. Materials are
     shared between parts, so each is converted once. */
  var converted = {};
  function ownMaterial(source) {
    if (!source) return MATS.neutral;
    if (source.isMeshStandardMaterial) return source;
    if (converted[source.uuid]) return converted[source.uuid];
    var shininess = typeof source.shininess === 'number' ? source.shininess : 30;
    var specular = source.specular
      ? (source.specular.r + source.specular.g + source.specular.b) / 3
      : 0.2;
    var mat = new THREE.MeshStandardMaterial({
      color: window.WSTCadColour
        ? window.WSTCadColour.fromMaterial(source, THREE)
        : (source.color ? source.color.clone() : new THREE.Color(0xb6bcc6)),
      map: source.map || null,
      roughness: clamp01(1 - shininess / 120),
      metalness: clamp01(specular * 1.2),
      /* CAD exports the panels as open, single-sided skins; drawn from one
         side only they read as holes in the enclosure. */
      side: THREE.DoubleSide
    });
    converted[source.uuid] = mat;
    return mat;
  }

  function materialsFor(mesh) {
    if (Array.isArray(mesh.material)) return mesh.material.map(ownMaterial);
    return ownMaterial(mesh.material);
  }
  var MATS = {
    casing:  std(0x171b23, 0.62, 0.44),
    lid:     std(0x272d38, 0.70, 0.34),
    polymer: std(0x2b303b, 0.10, 0.82),
    cell:    std(0xb9c0ca, 0.92, 0.26),
    busbar:  std(0xc08842, 0.94, 0.24),
    board:   std(0x16402f, 0.32, 0.58),
    cable:   std(0x0c0e14, 0.24, 0.74),
    soft:    std(0x23262f, 0.06, 0.92),
    steel:   std(0x8d949e, 0.96, 0.30),
    neutral: std(0x4a505c, 0.55, 0.48)
  };
  /* The CAD export delivers parts of the enclosure as open, single-sided
     skins (no back face, no wall thickness). Rendered one-sided they vanish
     when seen from behind and read as holes in the casing, so the enclosure
     materials draw both sides. */
  MATS.casing.side = THREE.DoubleSide;
  MATS.lid.side = THREE.DoubleSide;

  var MAT_RULES = [
    { test: 'lid', mat: 'lid' },
    { test: 'cover', mat: 'lid' },
    { test: 'harness', mat: 'cable' },
    { test: 'cable', mat: 'cable' },
    { test: 'wire', mat: 'cable' },
    { test: 'solder', mat: 'steel' },
    { test: 'ntc', mat: 'cable' },
    { test: 'busbar', mat: 'busbar' },
    { test: 'terminal', mat: 'busbar' },
    { test: 'board', mat: 'board' },
    { test: 'pcb', mat: 'board' },
    { test: 'fr4', mat: 'board' },
    { test: 'dzlr', mat: 'board' },
    { test: 'bms', mat: 'board' },
    { test: 'cell', mat: 'cell' },
    { test: 'highstar', mat: 'cell' },
    { test: 'inr2', mat: 'cell' },
    { test: 'eve_c', mat: 'cell' },
    { test: 'heatpad', mat: 'soft' },
    { test: 'holder', mat: 'polymer' },
    { test: 'tray', mat: 'polymer' },
    { test: 'divider', mat: 'polymer' },
    { test: 'spacer', mat: 'polymer' },
    { test: 'tape', mat: 'soft' },
    { test: 'eva', mat: 'soft' },
    { test: 'foam', mat: 'soft' },
    { test: 'rubber', mat: 'soft' },
    { test: 'epdm', mat: 'soft' },
    { test: 'seal', mat: 'soft' },
    { test: 'screw', mat: 'steel' },
    { test: 'bolt', mat: 'steel' },
    { test: 'nut', mat: 'steel' },
    { test: 'washer', mat: 'steel' },
    { test: 'bn_', mat: 'steel' },
    { test: 'iso_', mat: 'steel' },
    { test: 'gb_', mat: 'steel' },
    { test: 'casing', mat: 'casing' },
    { test: 'enclosure', mat: 'casing' },
    { test: 'housing', mat: 'casing' },
    { test: 'case', mat: 'casing' }
  ];

  function materialFor(name) {
    var lower = (name || '').toLowerCase();
    for (var i = 0; i < MAT_RULES.length; i++) {
      if (lower.indexOf(MAT_RULES[i].test) !== -1) return MATS[MAT_RULES[i].mat];
    }
    return MATS.neutral;
  }

  /* ---------------------------------------------------------------
     Layers. `y` is how far the layer travels; `seq` (derived below) is
     when it goes — 0 leaves first and returns last.
     --------------------------------------------------------------- */
  var LAYER_TIERS = [
    { test: 'lid', y: 4.05 },
    { test: 'cover', y: 4.05 },
    { test: 'harness', y: 3.15 },
    { test: 'cable', y: 3.15 },
    { test: 'wire', y: 3.15 },
    { test: 'connector', y: 3.15 },
    { test: 'solder', y: 3.15 },
    { test: 'ntc', y: 3.15 },
    { test: 'board', y: 2.62 },
    { test: 'pcb', y: 2.62 },
    { test: 'fr4', y: 2.62 },
    { test: 'cmu', y: 2.62 },
    { test: 'bms', y: 2.62 },
    { test: 'dzlr', y: 2.62 },
    { test: 'tape', y: 2.20 },
    { test: 'heatpad', y: 2.20 },
    { test: 'eva', y: 2.20 },
    { test: 'foam', y: 2.20 },
    { test: 'rubber', y: 2.20 },
    { test: 'epdm', y: 2.20 },
    { test: 'seal', y: 2.20 },
    /* Busbars sit on their own level above the top cell holder. Sharing a
       level put two callout labels at the same screen height. */
    { test: 'busbar', y: 2.05 },
    { test: 'terminal', y: 2.05 },
    { test: 'top', y: 1.78 },
    { test: 'cell', y: 1.16 },
    { test: 'highstar', y: 1.16 },
    { test: 'inr2', y: 1.16 },
    { test: 'eve_c', y: 1.16 },
    { test: 'bottom', y: 0.60 },
    { test: 'holder', y: 0.60 },
    { test: 'tray', y: 0.60 },
    { test: 'divider', y: 0.60 },
    { test: 'spacer', y: 0.60 },
    { test: 'casing', anchor: true },
    { test: 'enclosure', anchor: true },
    { test: 'housing', anchor: true },
    { test: 'case', anchor: true }
  ];
  var TIER_MAX = 4.05;

  /* A platform may name its own layers. The generic list above reads the
     vocabulary of a cell pack - lid, busbar, cell holder - and a machine
     assembly does not use it: the UPS rack's structure is called
     `QKW4_BP_side_metal` and nothing in it says "casing". Without an anchor
     the enclosure would fly apart with everything else, so those models
     declare the few names that matter and the generic list handles the rest.
     */
  var modelTiers = [];

  function tierFor(name) {
    var lower = (name || '').toLowerCase();
    var i;
    for (i = 0; i < modelTiers.length; i++) {
      if (lower.indexOf(modelTiers[i].test) !== -1) return modelTiers[i];
    }
    for (i = 0; i < LAYER_TIERS.length; i++) {
      if (lower.indexOf(LAYER_TIERS[i].test) !== -1) return LAYER_TIERS[i];
    }
    return null;
  }

  /* Each platform gets its own callout set, because the anchors are matched
     against real mesh names out of the CAD and those are specific to the
     model — c4e's cells are Highstar 21700s, HDR's are EVE prismatics, and
     neither keyword finds anything in the other file. Titles are taken from
     what the geometry is actually called, not invented.

     Callouts are declared top of stack downward so the leaders read in
     order. One anchor mesh per component, picked by largest match so the
     line lands on the body of the part and not an incidental fastener. */
  var MODELS = [
    {
      key: 'compact',
      url: 'assets/models/c4e.wstm',
      name: 'Compact battery platform',
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
    {
      key: 'heavy-machinery',
      url: 'assets/models/HDR.wstm',
      name: 'Heavy machinery platform',
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
    {
      key: 'ups',
      url: 'assets/models/wl03.wstm',
      name: 'UPS platform',
      cells: 'GridPower modules',
      /* A 19-inch rack unit: the structure is sheet metal panels and rack
         brackets, none of which the generic vocabulary recognises. */
      tiers: [
        { test: 'bp_fr4_top', y: 3.70 },
        { test: 'fans_bracket', y: 3.05 },
        { test: 'fan', y: 3.05 },
        { test: 'ens', y: 2.62 },
        { test: 'gridpower', y: 1.16 },
        { test: 'bp_fr4_bottom', y: 0.60 },
        { test: 'rack_bracket', anchor: true },
        { test: 'side_metal', anchor: true },
        { test: 'rear_metal', anchor: true },
        { test: 'front_metal', anchor: true },
        { test: 'plastic_front', anchor: true },
        { test: 'cube', anchor: true }
      ],
      callouts: [
        { test: 'bp_fr4_top', title: 'Top insulator', sub: 'FR4 cover sheet' },
        { test: 'fan', title: 'Cooling fans', sub: 'Forced airflow' },
        { test: 'ens', title: 'Indicator board', sub: 'Status LEDs' },
        { test: 'gridpower', title: 'GridPower modules', sub: 'Series string' },
        { test: 'rack_bracket', title: 'Rack brackets', sub: '19-inch mounting' },
        { test: 'side_metal', title: 'Sheet metal shell', sub: 'Structural housing' }
      ]
    },
    {
      key: 'agv',
      url: 'assets/models/sl02.wstm',
      name: 'AGV platform',
      cells: 'Sealed enclosure',
      tiers: [
        { test: 'service_lid', y: 4.05 },
        { test: 'if-fm', y: 2.05 },
        { test: 'molex', y: 2.62 },
        { test: 'case_rev', anchor: true }
      ],
      callouts: [
        { test: 'service_lid', title: 'Service lid', sub: 'Access hatch' },
        { test: '_lid_rev', title: 'Casing lid', sub: 'Sealed top cover' },
        { test: 'harness', title: 'Cable harness', sub: 'Comms + sense' },
        { test: 'if-fm', title: 'Terminal plates', sub: 'Pack interconnect' },
        { test: 'eva', title: 'EVA padding', sub: 'Shock isolation' },
        { test: 'divider', title: 'Divider', sub: 'Internal partition' },
        { test: 'case_rev', title: 'Case', sub: 'Structural enclosure' }
      ]
    },
    {
      key: 'chassis',
      url: 'assets/models/B7W.wstm',
      name: 'Heavy machinery chassis',
      cells: 'Module string',
      tiers: [
        { test: 'lid_', y: 4.05 },
        { test: 'small_lid', y: 4.05 },
        { test: 'msd', y: 3.40 },
        { test: 'rsd', y: 3.40 },
        { test: 'cmu', y: 2.62 },
        { test: 'busbar', y: 2.05 },
        { test: 'component_layer', y: 1.60 },
        { test: 'm31s', y: 1.16 },
        { test: 'layer_rubber', y: 0.80 },
        { test: 'support_plate', y: 0.60 },
        { test: 'inner_plate_holder', y: 0.60 },
        { test: 'bend_plate', anchor: true },
        { test: 'straight_plate', anchor: true },
        { test: 'reinforcementplate', anchor: true },
        { test: 'mounting_flange', anchor: true },
        { test: 'corner_flange', anchor: true },
        { test: 'locking_plate', anchor: true },
        { test: 'bottom_stop-plate', anchor: true }
      ],
      callouts: [
        { test: 'lid_', title: 'Lids', sub: 'Sealed covers' },
        { test: 'msd', title: 'Service disconnect', sub: 'Manual isolation' },
        { test: 'cmu', title: 'BMS master + CMU', sub: 'Cell monitoring' },
        { test: 'busbar', title: 'Busbars', sub: 'Shunt to relay' },
        { test: 'm31s', title: 'Modules', sub: 'Series string' },
        { test: 'bend_plate', title: 'Bend plates', sub: 'Structural chassis' }
      ]
    }
  ];

  /* ---------------------------------------------------------------
     Sizing
     --------------------------------------------------------------- */
  var lastW = 0, lastH = 0;
  function resize() {
    var rect = stage.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);

  /* Converts a world-space displacement into the local-space delta for
     mesh.position. CAD exports nest sub-assemblies under their own
     unit-conversion scale nodes, so a world distance written straight into
     a local position gets scaled by whatever that sub-tree does. */
  function worldToLocalDelta(mesh, worldPos, worldOffset) {
    var parent = mesh.parent;
    if (!parent) return worldOffset.clone();
    var a = parent.worldToLocal(worldPos.clone());
    var b = parent.worldToLocal(worldPos.clone().add(worldOffset));
    return b.sub(a);
  }

  /* ---------------------------------------------------------------
     State
     --------------------------------------------------------------- */
  var parts = [];
  var callouts = [];
  var modelReady = false;
  var center = new THREE.Vector3();
  var distTight = 10, distWide = 20, stackRise = 1, composeBase = 0;
  var shadowMesh = null, shadowBaseScale = 1;
  var occluder = null;
  var currentObject = null;
  /* Which platform this page shows. The showcase names none and starts on
     the first, with the switcher walking the rest; a product page names its
     own and carries no switcher. */
  var currentModel = 0;
  var wanted = track.getAttribute('data-model');
  if (wanted) {
    for (var mi = 0; mi < MODELS.length; mi++) {
      if (MODELS[mi].key === wanted) { currentModel = mi; break; }
    }
  }

  var loadToken = 0;

  var progress = 0;      // damped
  var introMix = 1;      // 1 = intro pose, 0 = handed over to scroll
  var introStart = 0;
  var introDone = false;

  var _v = new THREE.Vector3();
  var _q = new THREE.Quaternion();
  var _target = new THREE.Vector3();

  /* Fits the camera to a box rather than to the bounding sphere. A sphere
     circumscribes the box, so framing against it leaves roughly a third of
     the frame empty on a pack this shape. `halfW` is the worst-case
     horizontal half-extent (corner-on, since the camera orbits). */
  function fitDistance(halfW, halfH, margin) {
    var tan = Math.tan(camera.fov * (Math.PI / 180) / 2);
    var byHeight = halfH / tan;
    var byWidth = halfW / (tan * Math.max(camera.aspect, 0.2));
    return Math.max(byHeight, byWidth) * margin;
  }

  /* Soft contact shadow — a gradient sprite on the floor. Cheaper and
     softer than a shadow map over 280 meshes, and it is what grounds the
     pack instead of leaving it floating in black. */
  function makeContactShadow(radius, floorY) {
    var size = 512;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    /* Many stops approximating a gaussian falloff: a firm core where the
       pack meets the floor, then a long soft penumbra. Three stops read as
       a hard-edged disc. */
    [[0, 0.9], [0.12, 0.82], [0.26, 0.6], [0.4, 0.36], [0.55, 0.18], [0.7, 0.08], [0.85, 0.025], [1, 0]]
      .forEach(function (s) { g.addColorStop(s[0], 'rgba(0,0,0,' + s[1] + ')'); });
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(c);
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, floorY - radius * 0.015, center.z);
    shadowBaseScale = radius * 3.1;
    mesh.scale.set(shadowBaseScale, shadowBaseScale, 1);
    mesh.renderOrder = -1;
    group.add(mesh);
    return mesh;
  }

  /* Releases a model's GPU resources before the next one takes its place.
     Without this, switching back and forth would strand geometry and
     textures for every model left behind. */
  function disposeObject3D(object) {
    object.traverse(function (child) {
      if (!child.isMesh) return;
      if (child.geometry) child.geometry.dispose();
      var mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(function (mat) {
        if (!mat) return;
        for (var k in mat) { if (mat[k] && mat[k].isTexture) mat[k].dispose(); }
        mat.dispose();
      });
    });
  }

  /* ---------------------------------------------------------------
     Load + build
     --------------------------------------------------------------- */
  function loadModel(spec) {
    var token = ++loadToken;
    modelReady = false;
    if (nextBtn) nextBtn.disabled = true;
    if (loaderEl) {
      loaderEl.hidden = false;
      loaderEl.classList.remove('is-done');
      if (loaderPct) loaderPct.textContent = '0%';
      if (loaderBar) loaderBar.style.width = '0%';
    }

    modelTiers = spec.tiers || [];

  /* .wstm is the same geometry written for a browser rather than for a CAD
     package - typed arrays it can hand straight to the GPU. The FBX path
     stays for anything not converted yet. */
  var reader = /\.wstm$/i.test(spec.url) && window.WSTMLoader
    ? window.WSTMLoader
    : new THREE.FBXLoader();

  reader.load(
    spec.url,
    function (object) {
      if (token !== loadToken) return; // a newer switch already started
      try {
        /* Clear the outgoing model before measuring the incoming one. */
        if (currentObject) { group.remove(currentObject); disposeObject3D(currentObject); currentObject = null; }
        if (occluder) {
          group.remove(occluder);
          occluder.geometry.dispose();
          occluder.material.dispose();
          occluder = null;
        }
        if (shadowMesh) {
          group.remove(shadowMesh);
          if (shadowMesh.material.map) shadowMesh.material.map.dispose();
          shadowMesh.material.dispose();
          shadowMesh.geometry.dispose();
          shadowMesh = null;
        }
        currentObject = object;
        parts = [];
        callouts = [];
        if (calloutLayer) calloutLayer.innerHTML = '';

        var box = new THREE.Box3().setFromObject(object);
        var size = new THREE.Vector3();
        box.getSize(size);
        var scale = 2.6 / (Math.max(size.x, size.y, size.z) || 1);
        /* Multiply rather than overwrite: an exporter may carry its unit
           scale on the root node, and the box above was measured with it. */
        object.scale.multiplyScalar(scale);
        object.updateMatrixWorld(true);

        var sBox = new THREE.Box3().setFromObject(object);
        var sCenter = new THREE.Vector3();
        sBox.getCenter(sCenter);
        object.position.sub(sCenter);
        group.add(object);
        object.updateMatrixWorld(true);

        var box2 = new THREE.Box3().setFromObject(object);
        var sphere = box2.getBoundingSphere(new THREE.Sphere());
        center.copy(sphere.center);
        var radius = sphere.radius;
        var minY = box2.min.y;
        var height = Math.max(box2.max.y - minY, 1e-4);
        var UP = new THREE.Vector3(0, 1, 0);

        var candidates = {};
        var index = 0;

        object.traverse(function (child) {
          if (!child.isMesh) return;

          child.material = materialsFor(child);
          child.castShadow = false;
          child.receiveShadow = false;

          var worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);
          var yFrac = clamp01((worldPos.y - minY) / height);

          var tier = tierFor(child.name);
          var dist, tierY;
          if (tier && tier.anchor) {
            tierY = 0.1;
            dist = radius * 0.14;
          } else if (tier) {
            tierY = tier.y;
            dist = radius * tier.y;
          } else {
            tierY = 0.25 + yFrac * 3.4;
            dist = radius * tierY;
          }

          /* 0 = outermost layer: first out, last back in. */
          var seq = clamp01(1 - tierY / TIER_MAX);

          /* Slight outward arc, peaking mid-travel, so parts swing clear
             of each other instead of sliding on rails. */
          var lateral = new THREE.Vector3(worldPos.x - center.x, 0, worldPos.z - center.z);
          if (lateral.lengthSq() < 1e-8) lateral.set(Math.cos(index * 2.4), 0, Math.sin(index * 2.4));
          lateral.normalize().multiplyScalar(radius * 0.07);

          parts.push({
            mesh: child,
            seq: seq,
            basePos: child.position.clone(),
            baseQuat: child.quaternion.clone(),
            deltaUp: worldToLocalDelta(child, worldPos, UP.clone().multiplyScalar(dist)),
            deltaArc: worldToLocalDelta(child, worldPos, lateral),
            spinAxis: new THREE.Vector3(
              Math.sin(index * 1.7), Math.cos(index * 0.9) * 0.4, Math.cos(index * 2.3)
            ).normalize(),
            spinAmp: 0.05 + (index % 7) * 0.006,
            each: 0, // seated: the pack is closed from the first frame
            dist: dist,
            anchor: !!(tier && tier.anchor),
            clearT: 0
          });

          /* Track the biggest mesh per callout keyword. */
          var lname = (child.name || '').toLowerCase();
          for (var ci = 0; ci < spec.callouts.length; ci++) {
            if (lname.indexOf(spec.callouts[ci].test) === -1) continue;
            var b = new THREE.Box3().setFromObject(child);
            var s = new THREE.Vector3(); b.getSize(s);
            var vol = Math.max(s.x * s.y * s.z, 1e-9);
            if (!candidates[ci] || vol > candidates[ci].vol) {
              candidates[ci] = { mesh: child, vol: vol };
            }
          }
          index++;
        });

        /* Parts that sit inside the casing must travel straight up until
           they clear its rim. The outward bow peaks at ~5.6 raw units on
           c4e, while the whole gap from the cell holders to the casing's
           outer face, wall included, is ~3.2 — so bowing inside the casing
           drives parts through the wall. clearT is the point on a part's
           own travel where its underside passes the rim. */
        var anchorBox = new THREE.Box3();
        for (var ai = 0; ai < parts.length; ai++) if (parts[ai].anchor) anchorBox.expandByObject(parts[ai].mesh);
        if (!anchorBox.isEmpty()) {
          var eps = Math.max(anchorBox.max.x - anchorBox.min.x, anchorBox.max.z - anchorBox.min.z) * 0.01;
          for (var pi2 = 0; pi2 < parts.length; pi2++) {
            var pp = parts[pi2];
            if (pp.anchor || pp.dist <= 0) continue;
            var pb = new THREE.Box3().setFromObject(pp.mesh);
            var insideXZ = pb.min.x >= anchorBox.min.x - eps && pb.max.x <= anchorBox.max.x + eps &&
                           pb.min.z >= anchorBox.min.z - eps && pb.max.z <= anchorBox.max.z + eps;
            if (insideXZ && pb.min.y < anchorBox.max.y) {
              pp.clearT = clamp01((anchorBox.max.y - pb.min.y) / pp.dist);
            }
          }
        }

        /* Inner shell. The casing export has genuine openings — its side
           panels are open skins and the shell has thousands of unstitched
           edges; welding does not close them (they stay open at every
           tolerance until real detail starts collapsing). Instead a shell in
           the casing material, shaped to the wall's own taper and corners,
           sits just inside it while the pack is fully assembled, so a gap
           reads as continuous casing rather than bright cells behind it.
           Skipped when a model leaves no room for it. */
        if (!anchorBox.isEmpty()) {
          var ac = new THREE.Vector3(); anchorBox.getCenter(ac);
          var ah = new THREE.Vector3(); anchorBox.getSize(ah).multiplyScalar(0.5);
          var ePad = Math.max(ah.x, ah.z) * 0.02;
          var inner = new THREE.Box3();
          for (var oi = 0; oi < parts.length; oi++) {
            if (parts[oi].anchor) continue;
            var ob = new THREE.Box3().setFromObject(parts[oi].mesh);
            var ocy = (ob.min.y + ob.max.y) / 2;
            if (ob.min.x >= anchorBox.min.x - ePad && ob.max.x <= anchorBox.max.x + ePad &&
                ob.min.z >= anchorBox.min.z - ePad && ob.max.z <= anchorBox.max.z + ePad &&
                ocy < anchorBox.max.y - ah.y * 0.1) inner.union(ob);
          }

          if (!inner.isEmpty()) {
            var icx = Math.max(Math.abs(inner.min.x - ac.x), Math.abs(inner.max.x - ac.x));
            var icz = Math.max(Math.abs(inner.min.z - ac.z), Math.abs(inner.max.z - ac.z));

            /* Measure the outer wall with horizontal rays, not from vertices:
               a flat face has almost no vertices at mid-height, so a vertex
               scan finds whatever inner sheet is densest instead of the
               outside. Per height band, rays go from the casing centre
               across each face (faceDepth) and towards the four corners
               (farAlong); the furthest hit is the outer surface. Triangles
               are bucketed by band first so each ray only tests the wall at
               its own height. */
            var BANDS = 16;
            var yA = anchorBox.min.y, yH = Math.max(anchorBox.max.y - yA, 1e-6);
            var tris = [], buckets = [];
            for (var bi = 0; bi < BANDS; bi++) buckets.push([]);
            var va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
            for (var aj = 0; aj < parts.length; aj++) {
              if (!parts[aj].anchor) continue;
              var am = parts[aj].mesh, ag = am.geometry, ap = ag.attributes.position, aix = ag.index;
              var triCount = aix ? aix.count / 3 : ap.count / 3;
              for (var ti = 0; ti < triCount; ti++) {
                va.fromBufferAttribute(ap, aix ? aix.getX(ti * 3) : ti * 3).applyMatrix4(am.matrixWorld);
                vb.fromBufferAttribute(ap, aix ? aix.getX(ti * 3 + 1) : ti * 3 + 1).applyMatrix4(am.matrixWorld);
                vc.fromBufferAttribute(ap, aix ? aix.getX(ti * 3 + 2) : ti * 3 + 2).applyMatrix4(am.matrixWorld);
                var tBase = tris.length / 9;
                tris.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
                var bLo = Math.floor((Math.min(va.y, vb.y, vc.y) - yA) / yH * BANDS);
                var bHi = Math.floor((Math.max(va.y, vb.y, vc.y) - yA) / yH * BANDS);
                for (var bk = Math.max(0, bLo); bk <= Math.min(BANDS - 1, bHi); bk++) buckets[bk].push(tBase);
              }
            }

            /* Furthest hit of a horizontal ray (Möller–Trumbore, dir.y = 0). */
            var castFar = function (band, y, ox, oz, dx, dz) {
              var list = buckets[band], best = -1;
              for (var li = 0; li < list.length; li++) {
                var o = list[li] * 9, ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
                var e1x = tris[o + 3] - ax, e1y = tris[o + 4] - ay, e1z = tris[o + 5] - az;
                var e2x = tris[o + 6] - ax, e2y = tris[o + 7] - ay, e2z = tris[o + 8] - az;
                var px = -dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y;
                var det = e1x * px + e1y * py + e1z * pz;
                if (det > -1e-16 && det < 1e-16) continue;
                var inv = 1 / det, sx = ox - ax, sy = y - ay, sz = oz - az;
                var u = (sx * px + sy * py + sz * pz) * inv;
                if (u < 0 || u > 1) continue;
                var qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
                var vv = (dx * qx + dz * qz) * inv;
                if (vv < 0 || u + vv > 1) continue;
                var tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
                if (tt > best) best = tt;
              }
              return best;
            };
            var spread = Math.min(ah.x, ah.z) * 0.06;
            var farAlong = function (band, y, dx, dz, ox, oz) {
              var h0 = castFar(band, y, ox - dz * spread, oz + dx * spread, dx, dz);
              var h1 = castFar(band, y, ox, oz, dx, dz);
              var h2 = castFar(band, y, ox + dz * spread, oz - dx * spread, dx, dz);
              return Math.max(Math.min(h0, h1), Math.min(Math.max(h0, h1), h2));
            };
            /* Face depth. The export has real openings in the middle of its
               faces — on c4e a rectangle in the front face with a perforated
               sheet ~2 units behind it — so rays through the centre land on
               that sheet, and a shell placed there leaves the recessed panel
               showing. Five rays fanned across the face instead, taking the
               second-furthest hit: rays through the opening are outvoted by
               the ones striking the face beside it, and a single rib or boss
               standing proud of the face can't push the shell out. */
            var faceDepth = function (band, y, dx, dz) {
              var half = dx !== 0 ? ah.z : ah.x, hits = [];
              [-0.75, -0.45, 0, 0.45, 0.75].forEach(function (f) {
                hits.push(castFar(band, y, ac.x - dz * half * f, ac.z + dx * half * f, dx, dz));
              });
              hits.sort(function (a, b) { return b - a; });
              return hits[1];
            };

            /* Internals extent per band, so the tapered bottom and the rim
               are judged against what is actually at that height. */
            var inBand = [];
            for (var ib = 0; ib < BANDS; ib++) inBand.push({ x: 0, z: 0 });
            for (var oj = 0; oj < parts.length; oj++) {
              if (parts[oj].anchor) continue;
              var obb = new THREE.Box3().setFromObject(parts[oj].mesh), oyc = (obb.min.y + obb.max.y) / 2;
              if (!(obb.min.x >= anchorBox.min.x - ePad && obb.max.x <= anchorBox.max.x + ePad &&
                    obb.min.z >= anchorBox.min.z - ePad && obb.max.z <= anchorBox.max.z + ePad &&
                    oyc < anchorBox.max.y - ah.y * 0.1)) continue;
              var om = parts[oj].mesh, opa = om.geometry.attributes.position;
              for (var ov = 0; ov < opa.count; ov++) {
                va.fromBufferAttribute(opa, ov).applyMatrix4(om.matrixWorld);
                var obn = Math.floor((va.y - yA) / yH * BANDS);
                if (obn < 0 || obn >= BANDS) continue;
                inBand[obn].x = Math.max(inBand[obn].x, Math.abs(va.x - ac.x));
                inBand[obn].z = Math.max(inBand[obn].z, Math.abs(va.z - ac.z));
              }
            }

            /* Per band: inset half-extents, and the corner radius solved
               from where the corner ray meets the wall (on a rounded
               rectangle, a point at distances a, b inside the box corner
               lies on an arc of radius (a + b) + sqrt(2ab)). */
            var inset = Math.max(ah.x, ah.z) * 0.006;
            var profile = [];
            for (var pbn = 0; pbn < BANDS; pbn++) {
              var yb = yA + (pbn + 0.5) / BANDS * yH;
              var xp = faceDepth(pbn, yb, 1, 0), xn = faceDepth(pbn, yb, -1, 0);
              var zp = faceDepth(pbn, yb, 0, 1), zn = faceDepth(pbn, yb, 0, -1);
              if (xp <= 0 || xn <= 0 || zp <= 0 || zn <= 0) { profile.push(null); continue; }
              /* Each face measured on its own: the export's walls are not
                 symmetric about the centre (on c4e the back face sits ~0.05
                 inside the front), so sizing both sides from the nearer one
                 left the shell short of the front face. */
              var hx = (xp + xn) / 2 - inset, hz = (zp + zn) / 2 - inset;
              var ocx = (xp - xn) / 2, ocz = (zp - zn) / 2;
              var diagLen = Math.sqrt(hx * hx + hz * hz), rr = 0;
              var corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
              for (var cq = 0; cq < 4; cq++) {
                var cdx = corners[cq][0] * hx / diagLen, cdz = corners[cq][1] * hz / diagLen;
                var tc = farAlong(pbn, yb, cdx, cdz, ac.x + ocx, ac.z + ocz) - inset;
                if (tc <= 0) continue;
                var ca = hx - tc * hx / diagLen, cb = hz - tc * hz / diagLen;
                if (ca < 0 || cb < 0) continue;
                rr = Math.max(rr, ca + cb + Math.sqrt(2 * ca * cb));
              }
              var clear = Math.min(xp, xn) > inBand[pbn].x + 2 * inset && Math.min(zp, zn) > inBand[pbn].z + 2 * inset;
              profile.push(clear ? { y: yb, x: hx, z: hz, cx: ocx, cz: ocz, r: Math.min(rr, hx, hz) } : null);
            }

            /* Use the longest unbroken run of good bands. The rim and the
               floor are where measurements go wrong (lips, bosses, the
               floor itself), so they drop out instead of vetoing the shell. */
            var runStart = -1, runLen = 0;
            for (var rs = 0, cur = 0; rs <= BANDS; rs++) {
              if (rs < BANDS && profile[rs]) {
                cur++;
                if (cur > runLen) { runLen = cur; runStart = rs - cur + 1; }
              } else {
                cur = 0;
              }
            }

            if (runLen >= BANDS / 2) {
              var run = profile.slice(runStart, runStart + runLen);
              /* Light smoothing that never widens a band (min for extents)
                 and never sharpens a corner (max for radius). */
              var sm = run.map(function (p, i) {
                var a = run[Math.max(0, i - 1)], c = run[Math.min(run.length - 1, i + 1)];
                return {
                  y: p.y,
                  band: runStart + i,
                  cx: p.cx,
                  cz: p.cz,
                  x: Math.min(p.x, (a.x + 2 * p.x + c.x) / 4),
                  z: Math.min(p.z, (a.z + 2 * p.z + c.z) / 4),
                  r: Math.min(Math.max(p.r, (a.r + 2 * p.r + c.r) / 4), Math.min(p.x, p.z))
                };
              });

              var ARC = 10, ringN = ARC * 4, pos = [];
              /* The corners are not all the same shape (on c4e the back
                 corners are rounder than the front), so every ring vertex is
                 also checked against the wall along its own direction and
                 pulled in wherever it would stand proud of it. */
              var ringAt = function (y, p) {
                var sx = [1, -1, -1, 1], sz = [1, 1, -1, -1];
                var ox = ac.x + p.cx, oz = ac.z + p.cz;
                for (var qd = 0; qd < 4; qd++) {
                  var ccx = sx[qd] * (p.x - p.r), ccz = sz[qd] * (p.z - p.r);
                  for (var s = 0; s < ARC; s++) {
                    var th = (qd + s / (ARC - 1)) * Math.PI / 2;
                    var vx = ccx + p.r * Math.cos(th), vz = ccz + p.r * Math.sin(th);
                    var vl = Math.sqrt(vx * vx + vz * vz);
                    if (vl > 1e-6) {
                      var wall = farAlong(p.band, p.y, vx / vl, vz / vl, ox, oz) - inset;
                      if (wall > 0 && wall < vl) { vx *= wall / vl; vz *= wall / vl; }
                    }
                    pos.push(ox + vx, y, oz + vz);
                  }
                }
              };
              var bandH = yH / BANDS;
              ringAt(sm[0].y - bandH * 0.35, sm[0]);
              for (var rb = 0; rb < sm.length; rb++) ringAt(sm[rb].y, sm[rb]);
              ringAt(sm[sm.length - 1].y + bandH * 0.35, sm[sm.length - 1]);

              var rings = sm.length + 2, idx = [];
              for (var rk = 0; rk < rings - 1; rk++) {
                for (var rj = 0; rj < ringN; rj++) {
                  var a0 = rk * ringN + rj, a1 = rk * ringN + (rj + 1) % ringN;
                  idx.push(a0, a0 + ringN, a1, a1, a0 + ringN, a1 + ringN);
                }
              }
              var og = new THREE.BufferGeometry();
              og.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
              og.setIndex(idx);
              og.computeVertexNormals();
              occluder = new THREE.Mesh(og, MATS.casing.clone());
              occluder.userData.innerShell = true;
              occluder.visible = false;
              group.add(occluder);
            }
          }
        }

        var maxReach = radius;
        for (var i = 0; i < parts.length; i++) maxReach = Math.max(maxReach, radius + parts[i].dist);
        stackRise = maxReach - radius;

        shadowMesh = makeContactShadow(radius, minY);

        resize();
        var bSize = new THREE.Vector3();
        box2.getSize(bSize);
        var halfW = Math.sqrt(bSize.x * bSize.x + bSize.z * bSize.z) / 2;
        var halfH = bSize.y / 2;
        /* Margins are compositional, not just "make it fit": the caption
           owns the top of the frame and the hint the bottom, so the pack
           is framed to sit in the middle band rather than edge to edge. */
        distTight = fitDistance(halfW, halfH, 1.72);
        /* Exploded: the stack grows upward, and the camera target rises
           with it (see frame()), so only part of the rise counts against
           the framing. The arc widens the footprint slightly. */
        distWide = fitDistance(halfW * 1.12, halfH + stackRise * 0.62, 1.14);
        /* Nudges the assembled pack below the caption. */
        composeBase = halfH * 0.20;
        camera.near = Math.max(0.01, distTight / 140);
        camera.far = distWide * 4;
        camera.updateProjectionMatrix();

        /* Build callout DOM in the declared order, not discovery order. */
        for (var k = 0; k < spec.callouts.length; k++) {
          if (!candidates[k]) continue;
          var cs = spec.callouts[k];
          var leader = document.createElement('div');
          leader.className = 'sc-leader';
          var el = document.createElement('div');
          el.className = 'sc-callout';
          el.innerHTML =
            '<span class="sc-callout-title">' + cs.title + '</span>' +
            '<span class="sc-callout-sub">' + cs.sub + '</span>';
          if (calloutLayer) { calloutLayer.appendChild(leader); calloutLayer.appendChild(el); }
          callouts.push({
            el: el,
            leader: leader,
            mesh: candidates[k].mesh,
            /* The dot sits on the middle of the part's own geometry. The
               mesh origin is often nowhere near the part in these CAD
               exports, so the in-flight tilt swung the dot around. */
            anchorLocal: (function (g) {
              if (!g.boundingBox) g.computeBoundingBox();
              return g.boundingBox.getCenter(new THREE.Vector3());
            })(candidates[k].mesh.geometry),
            on: false,
            ly: 0,
            eased: false,
            draw: 0
          });
        }

        if (partCountEl) partCountEl.textContent = parts.length + ' parts';
        if (platformEl) platformEl.textContent = spec.name;
        if (cellsEl) cellsEl.textContent = spec.cells;
        if (switchName) switchName.textContent = spec.name;
        if (switchIndex) {
          switchIndex.textContent =
            ('0' + (currentModel + 1)).slice(-2) + ' / ' + ('0' + MODELS.length).slice(-2);
        }

        applyLayout();
        modelReady = true;
        /* Replay the opening camera move for the incoming model. The pack
           stays closed during it; the hand-off cancels the move immediately
           if the reader is already scrolled into the teardown. */
        introMix = 1;
        introDone = false;
        introStart = (window.performance || Date).now();
        if (nextBtn) nextBtn.disabled = false;
        if (loaderEl) {
          loaderEl.classList.add('is-done');
          setTimeout(function () { if (token === loadToken) loaderEl.hidden = true; }, 950);
        }
      } catch (err) {
        if (loaderPct) loaderPct.textContent = 'Error';
        if (loaderBar) loaderBar.parentNode.style.display = 'none';
        var lbl = loaderEl ? loaderEl.querySelector('.sc-loader-label') : null;
        if (lbl) lbl.textContent = 'Could not display the model (' + err.message + ')';
        if (nextBtn) nextBtn.disabled = false;
      }
    },
    function (xhr) {
      if (token !== loadToken || !xhr.lengthComputable) return;
      var pct = Math.round((xhr.loaded / xhr.total) * 100);
      if (loaderPct) loaderPct.textContent = pct + '%';
      if (loaderBar) loaderBar.style.width = pct + '%';
    },
    function () {
      if (token !== loadToken) return;
      if (loaderPct) loaderPct.textContent = 'Error';
      var lbl = loaderEl ? loaderEl.querySelector('.sc-loader-label') : null;
      if (lbl) lbl.textContent = 'The model could not be loaded';
      if (nextBtn) nextBtn.disabled = false;
    }
  );
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      currentModel = (currentModel + 1) % MODELS.length;
      loadModel(MODELS[currentModel]);
    });
  }

  loadModel(MODELS[currentModel]);

  /* ---------------------------------------------------------------
     Per-frame layout
     --------------------------------------------------------------- */

  /* How far apart a given part is, at a given point on the timeline. */
  function partSeparation(p, seq) {
    if (p <= ACT_SEPARATE) return 0;
    if (p < ACT_INSPECT) {
      var a = (p - ACT_SEPARATE) / (ACT_INSPECT - ACT_SEPARATE);
      return easeOutCubic(staggered(a, seq));
    }
    if (p < ACT_ASSEMBLE) return 1;
    var b = (p - ACT_ASSEMBLE) / (1 - ACT_ASSEMBLE);
    return 1 - easeInOutCubic(staggered(b, 1 - seq));
  }

  /* Each part carries its own `t` along the timeline (set per frame), so
     the layout is just: lift by t, bow outward at mid-travel, and add a
     small settle-rotation that peaks in flight and resolves to square at
     both ends. */
  function applyLayout() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var t = p.each;
      /* The casing never bows or tilts (parts are seated in it), and a part
         inside the casing only starts to once it is clear of the rim. */
      var free = p.anchor ? 0 : (p.clearT > 0 ? smoothstep(clamp01((t - p.clearT) / 0.12)) : 1);
      var arc = Math.sin(t * Math.PI) * free;
      p.mesh.position.copy(p.basePos)
        .addScaledVector(p.deltaUp, t)
        .addScaledVector(p.deltaArc, arc);
      if (reduceMotion) continue;
      _q.setFromAxisAngle(p.spinAxis, arc * p.spinAmp);
      p.mesh.quaternion.copy(p.baseQuat).multiply(_q);
    }
  }

  /* Camera path. Easing each segment separately (smoothstep between
     neighbouring keys) brings the camera to a standstill at every keyframe,
     which reads as stop-start. Instead each channel is a single
     monotone cubic through all keys (Fritsch–Carlson): velocity is
     continuous through the keys, it still passes exactly through them, and
     unlike a Catmull-Rom it never overshoots a key — the zoom or azimuth
     cannot swing past the framing it was set to. Zero tangents at both ends
     keep the gentle start and landing. */
  var CAM_CHANNELS = ['az', 'pol', 'zoom', 'fov'];
  var camTangents = (function () {
    var n = CAM_KEYS.length, out = {};
    CAM_CHANNELS.forEach(function (ch) {
      var d = [], m = new Array(n);
      for (var i = 0; i < n - 1; i++) {
        d.push((CAM_KEYS[i + 1][ch] - CAM_KEYS[i][ch]) / (CAM_KEYS[i + 1].at - CAM_KEYS[i].at));
      }
      m[0] = 0;
      m[n - 1] = 0;
      for (var j = 1; j < n - 1; j++) m[j] = d[j - 1] * d[j] <= 0 ? 0 : (d[j - 1] + d[j]) / 2;
      for (var k = 0; k < n - 1; k++) {
        if (d[k] === 0) { m[k] = 0; m[k + 1] = 0; continue; }
        var a = m[k] / d[k], b = m[k + 1] / d[k], s = a * a + b * b;
        if (s > 9) { var t = 3 / Math.sqrt(s); m[k] = t * a * d[k]; m[k + 1] = t * b * d[k]; }
      }
      out[ch] = m;
    });
    return out;
  })();

  function sampleCamera(p) {
    var n = CAM_KEYS.length;
    if (p < CAM_KEYS[0].at) p = CAM_KEYS[0].at;
    if (p > CAM_KEYS[n - 1].at) p = CAM_KEYS[n - 1].at;
    var i = 0;
    while (i < n - 2 && p > CAM_KEYS[i + 1].at) i++;
    var a = CAM_KEYS[i], b = CAM_KEYS[i + 1], h = b.at - a.at;
    var t = h > 0 ? (p - a.at) / h : 0, t2 = t * t, t3 = t2 * t;
    var h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    var out = {};
    for (var c = 0; c < CAM_CHANNELS.length; c++) {
      var ch = CAM_CHANNELS[c];
      out[ch] = h00 * a[ch] + h10 * h * camTangents[ch][i] + h01 * b[ch] + h11 * h * camTangents[ch][i + 1];
    }
    return out;
  }

  function updateCallouts(p, w, h, dt) {
    /* Fade in across the inspection act, one after another; clear out
       again as reassembly starts. */
    var reveal = clamp01((p - (ACT_INSPECT - 0.06)) / 0.16);
    var fade = 1 - clamp01((p - (ACT_ASSEMBLE - 0.04)) / 0.07);

    /* Pass 1 — project each anchor and decide visibility. The camera's
       matrices are otherwise only refreshed inside renderer.render, after
       this runs, so projecting without this lags the model by a frame and
       the dots step whenever the camera moves. */
    camera.updateMatrixWorld();
    var live = [];
    for (var i = 0; i < callouts.length; i++) {
      var c = callouts[i];
      var slot = i / Math.max(1, callouts.length);
      var on = reveal > slot * 0.75 && fade > 0.5;
      if (on) {
        c.mesh.updateWorldMatrix(true, false);
        _v.copy(c.anchorLocal).applyMatrix4(c.mesh.matrixWorld);
        _v.project(camera);
        if (_v.z > 1) on = false;
      }
      if (on !== c.on) {
        c.on = on;
        c.el.classList.toggle('is-on', on);
        c.leader.classList.toggle('is-on', on);
        if (!on) {
          c.eased = false;
          c.draw = 0;
          c.leader.style.opacity = '';
          c.leader.style.width = '0px';
          c.el.style.opacity = '';
        }
      }
      if (!on) continue;
      c.draw = Math.min(1, c.draw + (dt || 1 / 60) / 0.55);
      c.leader.style.opacity = '1';
      c.ax = (_v.x * 0.5 + 0.5) * w;
      c.ay = (1 - (_v.y * 0.5 + 0.5)) * h;
      live.push(c);
    }
    if (!live.length) return;

    /* Pass 2 — labels share one alignment column, so push them apart
       vertically where two parts project to nearly the same height, then
       shift the whole set back inside the frame. */
    /* Labels keep their declared order (top of the stack downward) rather
       than being re-sorted by projected height every frame — re-sorting
       swapped neighbours whenever two parts crossed, and the labels jumped
       a full gap at a time. Targets are then eased, so any push from the
       gap rule or the frame edges glides instead of snapping. */
    var GAP = 42;
    var top = 96, bottom = h - 78;
    for (var j = 0; j < live.length; j++) {
      var want = live[j].ay;
      if (j > 0 && want < live[j - 1].ty + GAP) want = live[j - 1].ty + GAP;
      live[j].ty = want;
    }
    var overflow = live[live.length - 1].ty - bottom;
    if (overflow > 0) for (var m = 0; m < live.length; m++) live[m].ty -= overflow;
    if (live[0].ty < top) {
      var lift = top - live[0].ty;
      for (var n = 0; n < live.length; n++) live[n].ty = Math.min(bottom, live[n].ty + lift);
    }
    var follow = reduceMotion ? 1 : 1 - Math.exp(-14 * (dt || 1 / 60));
    for (var e = 0; e < live.length; e++) {
      var le = live[e];
      if (!le.eased) { le.ly = le.ty; le.eased = true; }
      else le.ly += (le.ty - le.ly) * follow;
    }

    /* Pass 3 — place. The leader stretches and rotates from the part to
       wherever its label ended up. */
    var colX = w * 0.63;
    for (var q = 0; q < live.length; q++) {
      var d = live[q];
      var dx = colX - d.ax;
      var dy = d.ly - d.ay;
      var len = Math.sqrt(dx * dx + dy * dy);
      var ang = Math.atan2(dy, dx);
      /* Draw-in: the leader grows out from the part to its label and the
         label settles in from a short offset, rather than both just fading. */
      var dr = easeOutCubic(reduceMotion ? 1 : d.draw);
      d.leader.style.width = (len * dr).toFixed(1) + 'px';
      d.leader.style.transform =
        'translate(' + d.ax.toFixed(1) + 'px,' + d.ay.toFixed(1) + 'px) rotate(' + ang.toFixed(4) + 'rad)';
      d.el.style.transform =
        'translate(' + (colX + (1 - dr) * 14).toFixed(1) + 'px,' + d.ly.toFixed(1) + 'px) translateY(-50%)';    }
  }

  function scrollProgress() {
    var rect = track.getBoundingClientRect();
    var travel = rect.height - window.innerHeight;
    if (travel <= 0) return 0;
    return clamp01(-rect.top / travel);
  }

  function inView() {
    var rect = track.getBoundingClientRect();
    return rect.bottom > -400 && rect.top < window.innerHeight + 400;
  }

  var hintHidden = false;
  var lastFrameAt = 0;
  var camProgress = 0;

  function frame() {
    requestAnimationFrame(frame);
    if (!inView()) return;
    resize();

    var now = (window.performance || Date).now();
    var dt = lastFrameAt ? Math.min(0.1, (now - lastFrameAt) / 1000) : 1 / 60;
    lastFrameAt = now;

    var raw = scrollProgress();
    /* Damped scrub, integrated against real elapsed time so it settles at
       the same speed on 60Hz and 120Hz displays — a fixed per-frame lerp
       runs twice as fast on a 120Hz screen. 5.66/s equals the previous
       0.09-per-frame weight at 60fps. */
    progress += (raw - progress) * (reduceMotion ? 1 : 1 - Math.exp(-5.66 * dt));
    /* The camera follows on a softer spring than the parts, so a mouse-wheel
       step turns into one continuous glide instead of a jump and settle. */
    camProgress += (raw - camProgress) * (reduceMotion ? 1 : 1 - Math.exp(-2.6 * dt));

    if (modelReady && !introDone) {
      var elapsed = (window.performance || Date).now() - introStart;
      introMix = 1 - easeInOutCubic(clamp01(elapsed / INTRO_MS));
      if (raw > 0.004 || elapsed >= INTRO_MS) {
        if (raw > 0.004) introMix = 0;
        if (introMix <= 0.0001) { introMix = 0; introDone = true; }
      }
    }

    if (modelReady) {
      var timeline = progress;
      var avg = 0;
      var reach = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        /* The pack opens only on scroll. The intro is a camera move around
           the closed pack, never a fold-out. */
        p.each = partSeparation(timeline, p.seq);
        avg += p.each;
        /* How far the furthest-travelled part currently is, as a fraction
           of the full spread. The staggering means this is not the same
           curve as the timeline — the lid is clear of the frame long
           before the lower layers have moved. */
        var r = p.each * p.dist;
        if (r > reach) reach = r;
      }
      avg /= Math.max(1, parts.length);
      reach = stackRise > 0 ? clamp01(reach / stackRise) : 0;
      applyLayout();

      var cam = sampleCamera(camProgress);
      /* The intro resolves into the act-1 pose by easing these back to 0. */
      var az = cam.az - introMix * 0.95;
      /* Never let the keyframed zoom sit tighter than the spread actually
         needs, or parts leave the frame mid-teardown. */
      var zoom = Math.min(1, Math.max(cam.zoom, reach * 0.97) + introMix * 0.85);
      if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }

      var dist = distTight + (distWide - distTight) * zoom;
      var sp = Math.sin(cam.pol);
      camera.position.set(
        center.x + dist * sp * Math.sin(az),
        center.y + dist * Math.cos(cam.pol),
        center.z + dist * sp * Math.cos(az)
      );
      /* Follow the stack upward as it comes apart, so the frame stays
         balanced instead of the top layer climbing into the site nav.
         Driven by reach rather than the average, because the average is
         held down by the casing, which never leaves the floor. */
      _target.set(center.x, center.y + composeBase + reach * stackRise * 0.52, center.z);
      camera.lookAt(_target);

      /* Only while every part is seated — the lid is the first thing to
         move, so the shell is gone before the inside can be seen. */
      if (occluder) occluder.visible = reach < 0.002;

      if (shadowMesh) {
        shadowMesh.material.opacity = 0.8 * (1 - avg * 0.72);
        var s = shadowBaseScale * (1 + avg * 0.45);
        shadowMesh.scale.set(s, s, 1);
      }

      updateCallouts(timeline, lastW, lastH, dt);

      var shouldHide = raw > 0.02;
      if (shouldHide !== hintHidden && hintEl) {
        hintHidden = shouldHide;
        hintEl.style.opacity = shouldHide ? '0' : '1';
      }
    }

    renderer.render(scene, camera);
  }
  frame();
})();
