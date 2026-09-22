/* Reads .wstm, the trimmed model format written by tools/optimize-model.html.

   An FBX arrives as a tree of nodes and polygons that has to be walked,
   triangulated and turned into JavaScript objects before anything can be
   drawn - seconds of work for a CAD model. A .wstm holds the same parts as
   typed arrays laid out the way the GPU wants them: positions as 16-bit
   steps across each part's own box, normals as bytes, indices ready to use.
   Reading one is a handful of loops.

   Needs fflate (already on the page for the FBX loader) to unpack. */
(function (global) {
  'use strict';

  var THREE = global.THREE;

  function parse(buffer) {
    var raw = new Uint8Array(buffer);
    /* zlib, as written by CompressionStream('deflate'). */
    var bytes = global.fflate ? global.fflate.unzlibSync(raw) : raw;
    if (bytes[0] !== 87 || bytes[1] !== 83 || bytes[2] !== 84 || bytes[3] !== 77) {
      throw new Error('not a wstm file');
    }
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var version = view.getUint16(4, true);
    if (version !== 1) throw new Error('unsupported wstm version ' + version);
    var jsonLength = view.getUint32(6, true);
    var header = JSON.parse(new TextDecoder().decode(bytes.subarray(10, 10 + jsonLength)));
    var base = (10 + jsonLength + 3) & ~3;

    var geometries = header.geometries.map(function (entry) {
      var count = entry.v;
      var quantised = new Int16Array(bytes.buffer, bytes.byteOffset + base + entry.pos, count * 3);
      var packedNormals = new Int8Array(bytes.buffer, bytes.byteOffset + base + entry.nrm, count * 3);
      var positions = new Float32Array(count * 3);
      var normals = new Float32Array(count * 3);
      var minX = entry.min[0], minY = entry.min[1], minZ = entry.min[2];
      var spanX = entry.ext[0] / 65534, spanY = entry.ext[1] / 65534, spanZ = entry.ext[2] / 65534;
      for (var i = 0; i < count; i++) {
        var at = i * 3;
        positions[at] = minX + (quantised[at] + 32767) * spanX;
        positions[at + 1] = minY + (quantised[at + 1] + 32767) * spanY;
        positions[at + 2] = minZ + (quantised[at + 2] + 32767) * spanZ;
        normals[at] = packedNormals[at] / 127;
        normals[at + 1] = packedNormals[at + 1] / 127;
        normals[at + 2] = packedNormals[at + 2] / 127;
      }
      var indices = entry.idxBytes === 2
        ? new Uint16Array(bytes.buffer, bytes.byteOffset + base + entry.idx, entry.i).slice()
        : new Uint32Array(bytes.buffer, bytes.byteOffset + base + entry.idx, entry.i).slice();

      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      return geometry;
    });

    /* Films, tapes and seals are drawn flush with the body they lie on. The
       PET liner in this heavy machinery pack sits one micron off the
       enclosure wall - on a 265mm pack that is four parts in a million, far
       below what a depth buffer can separate, so the two surfaces trade the
       plane between them frame by frame and the wall flickers white. Any
       part whose thinnest side is under a hundredth of its longest is one of
       those films, and it is slid its own thickness towards the middle of
       the model: invisible at any size the pack is shown, and a hundred
       times the gap the exporter left. */
    var filmy = header.geometries.map(function (g) {
      var ext = g.ext.slice().sort(function (a, b) { return a - b; });
      return ext[2] > 0 && ext[0] / ext[2] < 0.01;
    });
    var films = [];

    var group = new THREE.Group();
    var materials = {};
    header.nodes.forEach(function (node) {
      var film = !!filmy[node.g];
      var key = node.c.join(',') + '|' + node.ro + '|' + node.me;
      var material = materials[key];
      if (!material) {
        material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(node.c[0], node.c[1], node.c[2]),
          roughness: node.ro,
          metalness: node.me,
          /* CAD exports the panels as open, single-sided skins; drawn from
             one side only they read as holes in the enclosure. */
          side: THREE.DoubleSide
        });
        materials[key] = material;
      }
      var mesh = new THREE.Mesh(geometries[node.g], material);
      if (film) films.push(mesh);
      mesh.name = node.n;
      /* The part's place in the pack was baked in when the file was written. */
      mesh.matrixAutoUpdate = false;
      mesh.matrix.fromArray(node.m);
      mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.matrixAutoUpdate = true;
      group.add(mesh);
    });

    if (films.length) {
      group.updateMatrixWorld(true);
      var whole = new THREE.Box3().setFromObject(group);
      var middle = whole.getCenter(new THREE.Vector3());
      var span = whole.getSize(new THREE.Vector3()).length();
      films.forEach(function (mesh) {
        var box = new THREE.Box3().setFromObject(mesh);
        var size = box.getSize(new THREE.Vector3());
        var axis = size.x <= size.y && size.x <= size.z ? 'x'
                 : size.y <= size.z ? 'y' : 'z';
        var centre = box.getCenter(new THREE.Vector3());
        var towards = middle[axis] - centre[axis];
        if (!towards) return;
        var step = Math.max(size[axis], span * 0.0004) * (towards > 0 ? 1 : -1);
        var local = mesh.parent.worldToLocal(centre.clone());
        var shifted = centre.clone();
        shifted[axis] += step;
        mesh.position.add(mesh.parent.worldToLocal(shifted).sub(local));
      });
      group.updateMatrixWorld(true);
    }

    return group;
  }

  /* Reads the body in chunks so a caller can show progress, in the shape
     THREE's loaders report it - so the two are interchangeable at the call
     site. */
  function load(url, onLoad, onProgress, onError) {
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var total = parseInt(r.headers.get('content-length') || '0', 10);
        if (!onProgress || !r.body || !r.body.getReader) return r.arrayBuffer();
        var reader = r.body.getReader();
        var chunks = [];
        var loaded = 0;
        return (function pump() {
          return reader.read().then(function (step) {
            if (step.done) {
              var out = new Uint8Array(loaded);
              var at = 0;
              chunks.forEach(function (c) { out.set(c, at); at += c.length; });
              return out.buffer;
            }
            chunks.push(step.value);
            loaded += step.value.length;
            onProgress({ lengthComputable: total > 0, loaded: loaded, total: total });
            return pump();
          });
        })();
      })
      .then(function (buffer) { onLoad(parse(buffer)); })
      .catch(function (err) { if (onError) onError(err); });
  }

  global.WSTMLoader = { load: load, parse: parse };
})(window);
