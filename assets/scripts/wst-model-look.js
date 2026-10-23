/* Applies a model's look file: the materials, studio lighting and printed
   labels that make a trimmed CAD model read like the client's renders.

   A look file sits beside its model (assets/models/<name>.look.json) and is
   authored against the render in tools/look-compare.html, which uses this
   same script, so what was matched there is what a page shows.

     palette  one entry per material: linear colour, metalness, roughness
              and, optionally, emissive strength (lit LEDs)
     mesh     the palette entry for each mesh, in the model's own order
     studio   optional: the environment and lights the look was matched
              under (see buildEnv and light below)
     decals   optional: flat printed labels, each an image laid onto the
              face of a named part, in the model's own units

   Needs THREE on the page. */
(function (global) {
  'use strict';

  function vec(THREE, a) { return new THREE.Vector3(a[0], a[1], a[2]); }

  /* The studio as geometry, prefiltered into an env map: a dim room with
     softboxes, each placed by the direction it lies in. `room` is how
     bright the walls are; a look can ask for a brighter room for its
     glossy parts (studio.glossRoom), which show shape only by what they
     reflect. */
  function buildEnv(THREE, renderer, studio, room) {
    var env = new THREE.Scene();
    var roomMat = new THREE.MeshBasicMaterial({ color: 0xdfe1e4, side: THREE.BackSide });
    roomMat.color.multiplyScalar(room);
    env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), roomMat));
    var geo = new THREE.PlaneGeometry(1, 1);
    (studio.panels || []).forEach(function (p) {
      var mat = new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide });
      mat.color.multiplyScalar(p.intensity);
      var m = new THREE.Mesh(geo, mat);
      m.position.copy(vec(THREE, p.dir).normalize().multiplyScalar(12));
      m.lookAt(0, 0, 0);
      m.scale.set(p.size[0], p.size[1], 1);
      env.add(m);
    });
    var pmrem = new THREE.PMREMGenerator(renderer);
    var texture = pmrem.fromScene(env, 0.04).texture;
    pmrem.dispose();
    return texture;
  }

  /* Builds the look's environments once per renderer: `main` for the scene,
     `gloss` for the palette entries that ask for the brighter room. */
  function environments(THREE, renderer, look) {
    var studio = look.studio;
    if (!studio) return null;
    return {
      main: buildEnv(THREE, renderer, studio, studio.room),
      gloss: studio.glossRoom ? buildEnv(THREE, renderer, studio, studio.glossRoom) : null
    };
  }

  /* Assigns the look's materials by mesh order; an entry of -1 leaves the
     part out (fasteners, as in the renders). Returns false, leaving the
     model as it is, when the look was written for a different model. */
  function applyMaterials(THREE, object, look, envs) {
    var meshes = [];
    object.traverse(function (c) { if (c.isMesh && !c.userData.decal) meshes.push(c); });
    if (!look.mesh || meshes.length !== look.mesh.length) return false;
    var gloss = (look.studio && look.studio.gloss) || [];
    var made = {};
    var gone = [];
    meshes.forEach(function (m, i) {
      var k = look.mesh[i];
      if (k < 0) { gone.push(m); return; }
      var mat = made[k];
      if (!mat) {
        var e = look.palette[k];
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(e[0], e[1], e[2]),
          metalness: e[3],
          roughness: e[4],
          emissive: e[5] ? new THREE.Color(e[0], e[1], e[2]) : new THREE.Color(0),
          emissiveIntensity: e[5] || 0,
          /* CAD exports the panels as open, single-sided skins. */
          side: THREE.DoubleSide
        });
        if (envs && envs.gloss && gloss.indexOf(k) !== -1) mat.envMap = envs.gloss;
        mat.userData.look = true;
        made[k] = mat;
      }
      m.material = mat;
    });
    gone.forEach(function (m) {
      if (m.parent) m.parent.remove(m);
      m.geometry.dispose();
    });
    return true;
  }

  /* The faces a decal can lie on: which world axis it sits across (`at` is
     its depth on that axis), which two axes it spans - the image's width
     first, then its height - and the turn that faces a plane that way, so
     the image reads the right way round from outside. `sign` says which
     way the image's rightward and upward run along those two axes. */
  var FACES = {
    '-x': { across: 'x', span: ['z', 'y'], sign: [1, 1], rot: [0, -Math.PI / 2, 0] },
    '+x': { across: 'x', span: ['z', 'y'], sign: [-1, 1], rot: [0, Math.PI / 2, 0] },
    '+z': { across: 'z', span: ['x', 'y'], sign: [1, 1], rot: [0, 0, 0] },
    '-z': { across: 'z', span: ['x', 'y'], sign: [-1, 1], rot: [0, Math.PI, 0] },
    '+y': { across: 'y', span: ['x', 'z'], sign: [1, -1], rot: [-Math.PI / 2, 0, 0] }
  };

  /* A decal's face, depth and extent, in the model's own units. Decals
     written before faces existed lie on -x with their depth as `x`. */
  function decalFrame(d) {
    var face = FACES[d.face || '-x'];
    var at = d.at !== undefined ? d.at : d.x;
    var u = d[face.span[0]], v = d[face.span[1]];
    var centre = {};
    centre[face.across] = at;
    centre[face.span[0]] = (u[0] + u[1]) / 2;
    centre[face.span[1]] = (v[0] + v[1]) / 2;
    return { face: face, u: u, v: v, width: u[1] - u[0], height: v[1] - v[0], centre: centre };
  }

  /* A decal as a flat card on one face of the model, parented to the part
     it is printed on so it travels with it when the model comes apart.
     `texture` is a THREE texture or an image URL. */
  function makeDecal(THREE, object, d, texture) {
    if (typeof texture === 'string') texture = new THREE.TextureLoader().load(texture);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 8;
    var frame = decalFrame(d);
    var mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(frame.width, frame.height),
      new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.55, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2 })
    );
    mesh.userData.decal = true;
    object.updateMatrixWorld(true);
    var parent = object;
    if (d.parent) {
      object.traverse(function (c) {
        if (parent === object && c.isMesh && (c.name || '').toLowerCase().indexOf(d.parent) !== -1) parent = c;
      });
    }
    /* Placed in the model's space, then carried into the part's own. */
    var place = new THREE.Object3D();
    place.rotation.set(frame.face.rot[0], frame.face.rot[1], frame.face.rot[2]);
    place.position.set(frame.centre.x, frame.centre.y, frame.centre.z);
    place.updateMatrix();
    var inParent = new THREE.Matrix4().copy(parent.matrixWorld).invert()
      .multiply(object.matrixWorld).multiply(place.matrix);
    inParent.decompose(mesh.position, mesh.quaternion, mesh.scale);
    parent.add(mesh);
    return mesh;
  }

  /* Loads a look file and the decal images it names, relative to it. */
  function load(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (look) {
        if (look && look.decals) {
          var base = url.slice(0, url.lastIndexOf('/') + 1);
          look.decals.forEach(function (d) { if (d.src) d.url = base + d.src; });
        }
        return look;
      });
  }

  /* The look's key light: its direction from the model's centre, scaled to
     the model, and its colour and strength. */
  function placeKey(THREE, light, studio, centre, radius) {
    var k = studio.key;
    light.color.set(k.color);
    light.intensity = k.intensity;
    light.position.copy(centre).addScaledVector(vec(THREE, k.dir).normalize(), radius * 3);
    if (light.target) { light.target.position.copy(centre); light.target.updateMatrixWorld(); }
  }

  global.WSTModelLook = {
    load: load,
    environments: environments,
    applyMaterials: applyMaterials,
    makeDecal: makeDecal,
    decalFrame: decalFrame,
    placeKey: placeKey
  };
})(window);
