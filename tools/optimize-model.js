/* Model optimiser (development tool, not part of the site).

   CAD exports tessellate flat sheet metal into a fine, even grid: the
   enclosure in HDR.fbx spends 1.4M triangles on panels whose faces are
   perfectly flat. Any vertex whose whole neighbourhood lies in one plane can
   be dissolved without moving the surface at all, so this walks each flat
   region, keeps its outline and its holes, and fills it again with as few
   triangles as the outline needs. Curved parts, hole walls and every edge
   between two planes are left exactly as they are.

   The result is written as .wstm, which the page reads straight into typed
   arrays instead of parsing an FBX tree. */
(function (global) {
  'use strict';

  var THREE = global.THREE;

  function weld(geometry, tolerance) {
    var pos = geometry.attributes.position.array;
    var nrm = geometry.attributes.normal ? geometry.attributes.normal.array : null;
    var count = pos.length / 3;
    var map = new Map();
    var unique = [];
    var remap = new Int32Array(count);
    var inv = 1 / tolerance;
    for (var i = 0; i < count; i++) {
      var x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      var key = Math.round(x * inv) + ',' + Math.round(y * inv) + ',' + Math.round(z * inv);
      var at = map.get(key);
      if (at === undefined) {
        at = unique.length / 3;
        map.set(key, at);
        unique.push(x, y, z);
      }
      remap[i] = at;
    }
    var tris = new Int32Array(count);
    for (var t = 0; t < count; t++) tris[t] = remap[t];
    return { positions: new Float64Array(unique), tris: tris, cornerNormals: nrm };
  }

  function triangleNormals(positions, tris) {
    var n = tris.length / 3;
    var nx = new Float64Array(n), ny = new Float64Array(n), nz = new Float64Array(n), nd = new Float64Array(n);
    var area = new Float64Array(n);
    for (var t = 0; t < n; t++) {
      var a = tris[t * 3] * 3, b = tris[t * 3 + 1] * 3, c = tris[t * 3 + 2] * 3;
      var ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
      var vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
      var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      var len = Math.sqrt(cx * cx + cy * cy + cz * cz);
      area[t] = len / 2;
      if (len > 0) { cx /= len; cy /= len; cz /= len; }
      nx[t] = cx; ny[t] = cy; nz[t] = cz;
      nd[t] = cx * positions[a] + cy * positions[a + 1] + cz * positions[a + 2];
    }
    return { nx: nx, ny: ny, nz: nz, nd: nd, area: area };
  }

  function edgeKey(a, b) { return a < b ? a * 33554432 + b : b * 33554432 + a; }

  /* Triangles that share an edge and lie in the same plane belong to the same
     flat region. */
  function planarClusters(tris, N, planeEpsilon) {
    var triCount = tris.length / 3;
    var parent = new Int32Array(triCount);
    for (var i = 0; i < triCount; i++) parent[i] = i;
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }

    var edges = new Map();
    for (var t = 0; t < triCount; t++) {
      for (var e = 0; e < 3; e++) {
        var v0 = tris[t * 3 + e], v1 = tris[t * 3 + (e + 1) % 3];
        var key = edgeKey(v0, v1);
        var other = edges.get(key);
        if (other === undefined) { edges.set(key, t); continue; }
        if (other >= 0) {
          var facing = N.nx[t] * N.nx[other] + N.ny[t] * N.ny[other] + N.nz[t] * N.nz[other];
          if (facing > 0.99995 && Math.abs(N.nd[t] - N.nd[other]) < planeEpsilon) union(t, other);
        }
        edges.set(key, -1); /* an edge with more than two triangles is left alone */
      }
    }
    var groups = new Map();
    for (var g = 0; g < triCount; g++) {
      var root = find(g);
      var list = groups.get(root);
      if (!list) { list = []; groups.set(root, list); }
      list.push(g);
    }
    return groups;
  }

  /* The outline of a flat region: edges used by only one of its triangles,
     walked into closed loops. */
  function boundaryLoops(cluster, tris) {
    var used = new Map();
    for (var i = 0; i < cluster.length; i++) {
      var t = cluster[i];
      for (var e = 0; e < 3; e++) {
        var a = tris[t * 3 + e], b = tris[t * 3 + (e + 1) % 3];
        var key = edgeKey(a, b);
        var hit = used.get(key);
        if (hit === undefined) used.set(key, [a, b, 1]);
        else hit[2]++;
      }
    }
    var adjacency = new Map();
    var edgeCount = 0;
    used.forEach(function (edge) {
      if (edge[2] !== 1) return;
      edgeCount++;
      var a = edge[0], b = edge[1];
      if (!adjacency.has(a)) adjacency.set(a, []);
      if (!adjacency.has(b)) adjacency.set(b, []);
      adjacency.get(a).push(b);
      adjacency.get(b).push(a);
    });
    if (!edgeCount) return null;
    var bad = false;
    adjacency.forEach(function (list) { if (list.length !== 2) bad = true; });
    if (bad) return null; /* pinched or non-manifold outline: leave the region alone */

    var loops = [];
    var seen = new Set();
    var failed = false;
    adjacency.forEach(function (_unused, start) {
      if (seen.has(start) || failed) return;
      var loop = [];
      var current = start, previous = -1;
      while (true) {
        loop.push(current);
        seen.add(current);
        var next = adjacency.get(current);
        var step = next[0] === previous ? next[1] : next[0];
        previous = current;
        current = step;
        if (current === start) break;
        if (loop.length > 500000) { failed = true; return; }
      }
      loops.push(loop);
    });
    return failed ? null : loops;
  }

  function retriangulateCluster(cluster, tris, positions, N, holder) {
    var first = cluster[0];
    var normal = new THREE.Vector3(N.nx[first], N.ny[first], N.nz[first]);
    var loops = boundaryLoops(cluster, tris);
    if (!loops || !loops.length) return null;

    var helper = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    var basisX = new THREE.Vector3().crossVectors(helper, normal).normalize();
    var basisY = new THREE.Vector3().crossVectors(normal, basisX).normalize();

    var flat = loops.map(function (loop) {
      return loop.map(function (v) {
        var x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
        return new THREE.Vector2(
          x * basisX.x + y * basisX.y + z * basisX.z,
          x * basisY.x + y * basisY.y + z * basisY.z
        );
      });
    });
    var areas = flat.map(function (points) { return Math.abs(THREE.ShapeUtils.area(points)); });
    var outerAt = areas.indexOf(Math.max.apply(null, areas));

    var contour = flat[outerAt];
    var holes = [];
    var indexLists = [loops[outerAt]];
    for (var i = 0; i < flat.length; i++) {
      if (i === outerAt) continue;
      holes.push(flat[i]);
      indexLists.push(loops[i]);
    }

    var faces;
    try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); }
    catch (err) { return null; }
    if (!faces || !faces.length) return null;

    var flatIndex = [];
    for (var l = 0; l < indexLists.length; l++) {
      for (var k = 0; k < indexLists[l].length; k++) flatIndex.push(indexLists[l][k]);
    }

    var before = 0;
    for (var c = 0; c < cluster.length; c++) before += N.area[cluster[c]];

    var after = 0;
    var produced = [];
    for (var f = 0; f < faces.length; f++) {
      var a = flatIndex[faces[f][0]], b = flatIndex[faces[f][1]], cc = flatIndex[faces[f][2]];
      if (a === undefined || b === undefined || cc === undefined) return null;
      var ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
      var ux = positions[b * 3] - ax, uy = positions[b * 3 + 1] - ay, uz = positions[b * 3 + 2] - az;
      var vx = positions[cc * 3] - ax, vy = positions[cc * 3 + 1] - ay, vz = positions[cc * 3 + 2] - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      after += len / 2;
      if (len === 0) continue;
      /* Keep the winding the region had. */
      if ((nx * normal.x + ny * normal.y + nz * normal.z) < 0) produced.push(a, cc, b);
      else produced.push(a, b, cc);
    }

    /* A flat region keeps its area exactly; anything else means the outline
       was read wrongly, so the original triangles stay. */
    if (before === 0 || Math.abs(after - before) / before > 0.005) return null;
    if (produced.length / 3 >= cluster.length) return null;
    holder.normal = normal;
    return produced;
  }

  function optimizeGeometry(geometry, options) {
    options = options || {};
    geometry.computeBoundingBox();
    var size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    var scale = Math.max(size.x, size.y, size.z) || 1;

    var welded = weld(geometry, options.weldTolerance || scale * 1e-6);
    var N = triangleNormals(welded.positions, welded.tris);
    var clusters = planarClusters(welded.tris, N, scale * 1e-5);

    var keptTris = [];
    var newTris = [];
    var newNormals = [];
    var regions = 0;
    var holder = {};

    clusters.forEach(function (cluster) {
      if (cluster.length >= 4) {
        var produced = retriangulateCluster(cluster, welded.tris, welded.positions, N, holder);
        if (produced) {
          regions++;
          for (var i = 0; i < produced.length; i += 3) {
            newTris.push(produced[i], produced[i + 1], produced[i + 2]);
            newNormals.push(holder.normal.x, holder.normal.y, holder.normal.z);
          }
          return;
        }
      }
      for (var c = 0; c < cluster.length; c++) keptTris.push(cluster[c]);
    });

    /* Rebuild: a vertex is shared only where position and normal both match,
       so hard edges stay hard. */
    var outPos = [];
    var outNrm = [];
    var outIdx = [];
    var lookup = new Map();
    function emit(vertex, nx, ny, nz) {
      var key = vertex + '|' + Math.round(nx * 500) + ',' + Math.round(ny * 500) + ',' + Math.round(nz * 500);
      var at = lookup.get(key);
      if (at === undefined) {
        at = outPos.length / 3;
        lookup.set(key, at);
        outPos.push(welded.positions[vertex * 3], welded.positions[vertex * 3 + 1], welded.positions[vertex * 3 + 2]);
        outNrm.push(nx, ny, nz);
      }
      outIdx.push(at);
    }

    var corner = welded.cornerNormals;
    for (var k = 0; k < keptTris.length; k++) {
      var t = keptTris[k];
      for (var e = 0; e < 3; e++) {
        var v = welded.tris[t * 3 + e];
        var source = t * 9 + e * 3;
        if (corner) emit(v, corner[source], corner[source + 1], corner[source + 2]);
        else emit(v, N.nx[t], N.ny[t], N.nz[t]);
      }
    }
    for (var m = 0; m < newTris.length; m += 3) {
      for (var p = 0; p < 3; p++) emit(newTris[m + p], newNormals[m], newNormals[m + 1], newNormals[m + 2]);
    }

    return {
      positions: new Float32Array(outPos),
      normals: new Float32Array(outNrm),
      indices: new Uint32Array(outIdx),
      before: welded.tris.length / 3,
      after: outIdx.length / 3,
      regions: regions
    };
  }

  global.WSTOptimizer = { optimizeGeometry: optimizeGeometry };
})(window);
