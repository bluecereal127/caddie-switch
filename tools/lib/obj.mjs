// Wavefront OBJ geometry helpers for the WSR golf collision meshes
// (KCL -> OBJ via Wiimm SZS Tools). Pure Node: parser, per-group stats,
// boundary-loop tracing, top-down height rasterizer, 16-bit RAW / PNG writers.
//
// Conventions: the meshes are Y-up; X/Z is the ground plane. Rasters are
// row-major, column i <-> +X, row j <-> +Z (looking straight down -Y with +X
// to the right puts +Z at the BOTTOM of the image) unless flipZ is set.
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// wszst names groups "<class>_<type>_F<flag>" e.g. offroad_04_F0104 -> flag 0x0104.
// KCL flag: bits 0-4 collision type, bits 5-7 variant, bits 8-15 upper byte.
export function kclFlagFromGroup(name) {
  const m = /_F([0-9a-fA-F]{4})$/.exec(name);
  if (!m) return null;
  const flag = parseInt(m[1], 16);
  return { flag, type: flag & 0x1f, variant: (flag >> 5) & 0x7, hi: flag >> 8 };
}

// -> { verts: Float64Array [x,y,z,...], tris: Int32Array [a,b,c,...] (0-based),
//      triGroup: Int16Array group index per triangle, groups: [{name, flag, type, hi, tris}] }
export function parseObj(path) {
  const text = readFileSync(path, "utf8");
  const verts = [], tris = [], triGroup = [], groups = [];
  const byName = new Map();
  let cur = -1;
  const ensureGroup = (name) => {
    if (!byName.has(name)) {
      const f = kclFlagFromGroup(name);
      byName.set(name, groups.length);
      groups.push({ name, flag: f?.flag ?? null, type: f?.type ?? null, hi: f?.hi ?? null, tris: 0 });
    }
    return byName.get(name);
  };
  let pos = 0;
  const n = text.length;
  while (pos < n) {
    let end = text.indexOf("\n", pos);
    if (end < 0) end = n;
    const c0 = text.charCodeAt(pos), c1 = text.charCodeAt(pos + 1);
    if (c0 === 118 /* v */ && c1 === 32) {
      const parts = text.slice(pos + 2, end).trim().split(/\s+/);
      verts.push(+parts[0], +parts[1], +parts[2]);
    } else if (c0 === 102 /* f */ && c1 === 32) {
      const parts = text.slice(pos + 2, end).trim().split(/\s+/);
      const idx = parts.map((p) => {
        const k = parseInt(p, 10); // "a", "a/b", "a//c" all start with the vertex index
        return k < 0 ? verts.length / 3 + k : k - 1;
      });
      // wszst leaves "f 0 0 0" placeholders for dropped degenerate faces; skip any out-of-range index
      if (idx.length < 3 || idx.some((k) => !(k >= 0 && k < verts.length / 3))) { pos = end + 1; continue; }
      if (cur < 0) cur = ensureGroup("(default)");
      for (let k = 1; k + 1 < idx.length; k++) { // fan-triangulate n-gons
        tris.push(idx[0], idx[k], idx[k + 1]);
        triGroup.push(cur);
        groups[cur].tris++;
      }
    } else if (c0 === 103 /* g */ && (c1 === 32 || c1 === 9)) {
      cur = ensureGroup(text.slice(pos + 2, end).trim() || "(unnamed)");
    }
    pos = end + 1;
  }
  return {
    verts: Float64Array.from(verts),
    tris: Int32Array.from(tris),
    triGroup: Int16Array.from(triGroup),
    groups,
  };
}

export function triVerts(mesh, t) {
  const { verts, tris } = mesh;
  const a = tris[t * 3] * 3, b = tris[t * 3 + 1] * 3, c = tris[t * 3 + 2] * 3;
  return [verts[a], verts[a + 1], verts[a + 2], verts[b], verts[b + 1], verts[b + 2], verts[c], verts[c + 1], verts[c + 2]];
}

// Unit normal (right-hand rule on the stored winding) and 3D area.
export function triNormalArea(v) {
  const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2];
  const wx = v[6] - v[0], wy = v[7] - v[1], wz = v[8] - v[2];
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const l = Math.hypot(nx, ny, nz);
  return l > 0 ? { nx: nx / l, ny: ny / l, nz: nz / l, area: l / 2 } : { nx: 0, ny: 0, nz: 0, area: 0 };
}

export function triAreaXZ(v) {
  return Math.abs(((v[3] - v[0]) * (v[8] - v[2]) - (v[6] - v[0]) * (v[5] - v[2])) / 2);
}

export function meshBounds(mesh, pred) {
  const b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  const nt = mesh.tris.length / 3;
  for (let t = 0; t < nt; t++) {
    if (pred && !pred(t)) continue;
    const v = triVerts(mesh, t);
    for (let k = 0; k < 9; k += 3) {
      if (v[k] < b.x0) b.x0 = v[k]; if (v[k] > b.x1) b.x1 = v[k];
      if (v[k + 1] < b.y0) b.y0 = v[k + 1]; if (v[k + 1] > b.y1) b.y1 = v[k + 1];
      if (v[k + 2] < b.z0) b.z0 = v[k + 2]; if (v[k + 2] > b.z1) b.z1 = v[k + 2];
    }
  }
  return b;
}

// Per-group descriptive statistics (area-weighted where it matters).
export function groupStats(mesh) {
  const out = mesh.groups.map((g) => ({
    ...g, areaXZ: 0, area3D: 0, sumCx: 0, sumCz: 0, sumY: 0, sumNy: 0, vertTris: 0, maxTriAreaXZ: 0, bigTris: 0,
    bbox: { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity },
  }));
  const nt = mesh.tris.length / 3;
  for (let t = 0; t < nt; t++) {
    const g = out[mesh.triGroup[t]];
    const v = triVerts(mesh, t);
    const { ny, area } = triNormalArea(v);
    const axz = triAreaXZ(v);
    const cx = (v[0] + v[3] + v[6]) / 3, cy = (v[1] + v[4] + v[7]) / 3, cz = (v[2] + v[5] + v[8]) / 3;
    g.areaXZ += axz; g.area3D += area;
    g.sumCx += cx * axz; g.sumCz += cz * axz; g.sumY += cy * axz; g.sumNy += Math.abs(ny) * area;
    if (Math.abs(ny) < 0.1) g.vertTris++;
    if (axz > g.maxTriAreaXZ) g.maxTriAreaXZ = axz;
    if (axz > 1e5) g.bigTris++;
    const b = g.bbox;
    for (let k = 0; k < 9; k += 3) {
      if (v[k] < b.x0) b.x0 = v[k]; if (v[k] > b.x1) b.x1 = v[k];
      if (v[k + 1] < b.y0) b.y0 = v[k + 1]; if (v[k + 1] > b.y1) b.y1 = v[k + 1];
      if (v[k + 2] < b.z0) b.z0 = v[k + 2]; if (v[k + 2] > b.z1) b.z1 = v[k + 2];
    }
  }
  return out.map((g) => ({
    name: g.name, flag: g.flag, type: g.type, hi: g.hi, tris: g.tris,
    areaXZ: g.areaXZ, area3D: g.area3D, maxTriAreaXZ: g.maxTriAreaXZ, bigTris: g.bigTris,
    cx: g.areaXZ ? g.sumCx / g.areaXZ : null, cz: g.areaXZ ? g.sumCz / g.areaXZ : null,
    meanY: g.areaXZ ? g.sumY / g.areaXZ : null, meanAbsNy: g.area3D ? g.sumNy / g.area3D : null,
    vertFrac: g.tris ? g.vertTris / g.tris : 0, bbox: g.bbox,
  }));
}

// Boundary loops of one group's triangle set: edges used by exactly one of the
// group's triangles, linked into closed loops. Vertices are merged by rounding
// (the exporter emits near-duplicate vertices). Interior loops = holes (cups).
// Weld vertex copies that sit within eps of each other (spatial hash with a
// neighbour search). The wszst OBJ export stores one corner as e.g. -46.876 and
// -46.875; rounding to a grid splits such pairs whenever they straddle a grid
// boundary (81 times in fc8 alone), which invents seams: fake holes in greens
// (the 15x15-unit "cup gaps") and tee pads broken into fragments.
export function weldVertices(mesh, eps = 0.01) {
  const n = mesh.verts.length / 3, id = new Int32Array(n), pos = [], cells = new Map();
  const cell = (v) => Math.floor(v / eps);
  for (let i = 0; i < n; i++) {
    const x = mesh.verts[i * 3], y = mesh.verts[i * 3 + 1], z = mesh.verts[i * 3 + 2];
    const cx = cell(x), cy = cell(y), cz = cell(z);
    let hit = -1;
    for (let dx = -1; dx <= 1 && hit < 0; dx++) for (let dy = -1; dy <= 1 && hit < 0; dy++) for (let dz = -1; dz <= 1 && hit < 0; dz++) {
      const list = cells.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz));
      if (list) for (const j of list) { const p = pos[j]; if (Math.abs(p[0] - x) <= eps && Math.abs(p[1] - y) <= eps && Math.abs(p[2] - z) <= eps) { hit = j; break; } }
    }
    if (hit < 0) { hit = pos.length; pos.push([x, y, z]); const k = cx + ',' + cy + ',' + cz; (cells.get(k) || cells.set(k, []).get(k)).push(hit); }
    id[i] = hit;
  }
  return { id, pos };
}

export function groupBoundaryLoops(mesh, gi, eps = 0.01) {
  const W = weldVertices(mesh, eps), vpos = W.pos;
  const id = (i) => W.id[i];
  const edges = new Map(); // "a,b" (a<b) -> count
  const nt = mesh.tris.length / 3;
  for (let t = 0; t < nt; t++) {
    if (mesh.triGroup[t] !== gi) continue;
    const a = id(mesh.tris[t * 3]), b = id(mesh.tris[t * 3 + 1]), c = id(mesh.tris[t * 3 + 2]);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      if (p === q) continue;
      const k = p < q ? p + "," + q : q + "," + p;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  const adj = new Map();
  for (const [k, c] of edges) {
    if (c !== 1) continue;
    const [p, q] = k.split(",").map(Number);
    if (!adj.has(p)) adj.set(p, []); if (!adj.has(q)) adj.set(q, []);
    adj.get(p).push(q); adj.get(q).push(p);
  }
  // Walk boundary EDGES, not vertices (Hierholzer with splicing). A vertex-
  // based walk stops at a pinch vertex (an outline touching itself, degree 4)
  // and leaves the rest as a fake small loop: on hole 9 that cut a spur off
  // the green and reported it as a "cup". Every boundary vertex has even
  // degree, so each connected boundary closes into one circuit.
  const usedE = new Set();
  const ek = (p, q) => (p < q ? p + "," + q : q + "," + p);
  const loops = [];
  for (const start of adj.keys()) {
    if (!adj.get(start).some((w) => !usedE.has(ek(start, w)))) continue;
    const stack = [start], circuit = [];
    while (stack.length) {
      const v = stack[stack.length - 1];
      const w = adj.get(v).find((u) => !usedE.has(ek(v, u)));
      if (w === undefined) circuit.push(stack.pop());
      else { usedE.add(ek(v, w)); stack.push(w); }
    }
    circuit.pop(); // the walk ends where it began
    const loop = circuit;
    if (loop.length < 2) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity, perim = 0;
    for (let i = 0; i < loop.length; i++) {
      const p = vpos[loop[i]], q = vpos[loop[(i + 1) % loop.length]];
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      perim += Math.hypot(q[0] - p[0], q[2] - p[2]);
    }
    loops.push({ n: loop.length, x0, z0, x1, z1, y0, y1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, perim, pts: loop.map((v) => vpos[v]) });
  }
  loops.sort((a, b) => b.perim - a.perim);
  return loops;
}

// Connected components of one group's triangles (triangles sharing a quantized
// vertex position are connected). Returns per component: triangle count, bbox,
// XZ-area-weighted centroid and height range. The tee pad shows up as a small,
// perfectly flat fairway-class component ringed by rough.
export function groupComponents(mesh, gi, eps = 0.01) {
  const Wd = weldVertices(mesh, eps);
  const key = (i) => Wd.id[i];
  const nt = mesh.tris.length / 3;
  const tris = [];
  for (let t = 0; t < nt; t++) if (mesh.triGroup[t] === gi) tris.push(t);
  const parent = new Int32Array(tris.length).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const seen = new Map();
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const kk = key(mesh.tris[t * 3 + k]);
      const j = seen.get(kk);
      if (j === undefined) seen.set(kk, i); else union(i, j);
    }
  });
  const comps = new Map();
  tris.forEach((t, i) => {
    const r = find(i);
    let c = comps.get(r);
    if (!c) { c = { tris: 0, areaXZ: 0, sx: 0, sz: 0, x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity }; comps.set(r, c); }
    const v = triVerts(mesh, t);
    const a = triAreaXZ(v);
    c.tris++; c.areaXZ += a;
    c.sx += a * (v[0] + v[3] + v[6]) / 3; c.sz += a * (v[2] + v[5] + v[8]) / 3;
    for (let k = 0; k < 9; k += 3) {
      c.x0 = Math.min(c.x0, v[k]); c.x1 = Math.max(c.x1, v[k]); c.z0 = Math.min(c.z0, v[k + 2]); c.z1 = Math.max(c.z1, v[k + 2]);
      c.y0 = Math.min(c.y0, v[k + 1]); c.y1 = Math.max(c.y1, v[k + 1]);
    }
  });
  return [...comps.values()].map((c) => ({
    tris: c.tris, areaXZ: c.areaXZ, cx: c.areaXZ ? c.sx / c.areaXZ : (c.x0 + c.x1) / 2, cz: c.areaXZ ? c.sz / c.areaXZ : (c.z0 + c.z1) / 2,
    w: c.x1 - c.x0, d: c.z1 - c.z0, y0: c.y0, y1: c.y1, x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1,
  })).sort((a, b) => b.areaXZ - a.areaXZ);
}

// Top-down max-Y rasterizer. include: Uint8Array per group (1 = rasterize).
// Returns height (Float32Array, -Infinity = nodata) and top (Int16Array group
// index of the topmost triangle, -1 = nodata).
export function rasterizeHeight(mesh, { x0, z0, x1, z1, w, h, include, flipZ = false, triFilter = null }) {
  const height = new Float32Array(w * h).fill(-Infinity);
  const top = new Int16Array(w * h).fill(-1);
  const sx = (x1 - x0) / w, sz = (z1 - z0) / h;
  const nt = mesh.tris.length / 3;
  for (let t = 0; t < nt; t++) {
    if (!include[mesh.triGroup[t]]) continue;
    const v = triVerts(mesh, t);
    if (triFilter && !triFilter(t, v)) continue;
    const au = (v[0] - x0) / sx - 0.5, bu = (v[3] - x0) / sx - 0.5, cu = (v[6] - x0) / sx - 0.5;
    const av = flipZ ? (z1 - v[2]) / sz - 0.5 : (v[2] - z0) / sz - 0.5;
    const bv = flipZ ? (z1 - v[5]) / sz - 0.5 : (v[5] - z0) / sz - 0.5;
    const cv = flipZ ? (z1 - v[8]) / sz - 0.5 : (v[8] - z0) / sz - 0.5;
    const area2 = (bu - au) * (cv - av) - (cu - au) * (bv - av);
    if (Math.abs(area2) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil(Math.min(au, bu, cu))), i1 = Math.min(w - 1, Math.floor(Math.max(au, bu, cu)));
    const j0 = Math.max(0, Math.ceil(Math.min(av, bv, cv))), j1 = Math.min(h - 1, Math.floor(Math.max(av, bv, cv)));
    if (i0 > i1 || j0 > j1) continue;
    const inv = 1 / area2, eps = 1e-7 * Math.abs(area2);
    const g = mesh.triGroup[t];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const w0 = (bu - i) * (cv - j) - (cu - i) * (bv - j);
        const w1 = (cu - i) * (av - j) - (au - i) * (cv - j);
        const w2 = (au - i) * (bv - j) - (bu - i) * (av - j);
        if (area2 > 0 ? (w0 < -eps || w1 < -eps || w2 < -eps) : (w0 > eps || w1 > eps || w2 > eps)) continue;
        const y = (w0 * v[1] + w1 * v[4] + w2 * v[7]) * inv;
        const idx = j * w + i;
        if (y > height[idx]) { height[idx] = y; top[idx] = g; }
      }
    }
  }
  return { height, top };
}

// Fill nodata (-Infinity) with the nearest valid value (multi-source BFS, 4-neighbour).
export function fillNodata(height, w, h) {
  const out = Float32Array.from(height);
  const q = new Int32Array(w * h); let qh = 0, qt = 0;
  let missing = 0;
  for (let i = 0; i < w * h; i++) { if (out[i] === -Infinity) missing++; else q[qt++] = i; }
  if (!missing || qt === 0) return { height: out, filled: 0 };
  while (qh < qt) {
    const p = q[qh++]; const x = p % w, y = (p - x) / w; const val = out[p];
    if (x > 0 && out[p - 1] === -Infinity) { out[p - 1] = val; q[qt++] = p - 1; }
    if (x < w - 1 && out[p + 1] === -Infinity) { out[p + 1] = val; q[qt++] = p + 1; }
    if (y > 0 && out[p - w] === -Infinity) { out[p - w] = val; q[qt++] = p - w; }
    if (y < h - 1 && out[p + w] === -Infinity) { out[p + w] = val; q[qt++] = p + w; }
  }
  return { height: out, filled: missing };
}

// ---- PNG / RAW writers (self-contained, no pngjs) ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng({ width, height, bitDepth, colorType, rows }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(rows, { level: 9 })), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
// 16-bit greyscale PNG from a Uint16Array (row-major).
export function writePng16(path, u16, width, height) {
  const rows = Buffer.alloc(height * (1 + width * 2));
  for (let j = 0, o = 0; j < height; j++) {
    rows[o++] = 0; // filter: none
    for (let i = 0; i < width; i++) { const v = u16[j * width + i]; rows[o++] = v >> 8; rows[o++] = v & 0xff; }
  }
  writeFileSync(path, encodePng({ width, height, bitDepth: 16, colorType: 0, rows }));
}
// 8-bit RGB PNG from a Uint8Array/Buffer of r,g,b triples.
export function writePngRGB(path, rgb, width, height) {
  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let j = 0, o = 0; j < height; j++) {
    rows[o++] = 0;
    rows.set(rgb.subarray(j * width * 3, (j + 1) * width * 3), o); o += width * 3;
  }
  writeFileSync(path, encodePng({ width, height, bitDepth: 8, colorType: 2, rows }));
}
// 8-bit greyscale PNG.
export function writePng8(path, u8, width, height) {
  const rows = Buffer.alloc(height * (1 + width));
  for (let j = 0, o = 0; j < height; j++) { rows[o++] = 0; rows.set(u8.subarray(j * width, (j + 1) * width), o); o += width; }
  writeFileSync(path, encodePng({ width, height, bitDepth: 8, colorType: 0, rows }));
}
// Headerless 16-bit unsigned RAW (little-endian by default: what Unity / UE / World Machine call "RAW 16-bit").
export function writeRaw16(path, u16, littleEndian = true) {
  const buf = Buffer.alloc(u16.length * 2);
  for (let i = 0; i < u16.length; i++) littleEndian ? buf.writeUInt16LE(u16[i], i * 2) : buf.writeUInt16BE(u16[i], i * 2);
  writeFileSync(path, buf);
}

// Draw the projected edges of every triangle in the selected groups into an
// RGB buffer (Bresenham). Vertical wall triangles (banks, cliffs and retaining
// walls along the water edges and the edge of the terrain) have no footprint
// area, so this is how they become visible in a top-down preview.
export function drawEdges(mesh, { x0, z0, x1, z1, w, h, include, flipZ = false }, rgb, color) {
  const sx = (x1 - x0) / w, sz = (z1 - z0) / h;
  const put = (i, j) => { if (i >= 0 && j >= 0 && i < w && j < h) { const p = (j * w + i) * 3; rgb[p] = color[0]; rgb[p + 1] = color[1]; rgb[p + 2] = color[2]; } };
  const line = (ax, az, bx, bz) => {
    let i0 = Math.round((ax - x0) / sx - 0.5), j0 = Math.round((flipZ ? z1 - az : az - z0) / sz - 0.5);
    const i1 = Math.round((bx - x0) / sx - 0.5), j1 = Math.round((flipZ ? z1 - bz : bz - z0) / sz - 0.5);
    const di = Math.abs(i1 - i0), dj = -Math.abs(j1 - j0), si = i0 < i1 ? 1 : -1, sj = j0 < j1 ? 1 : -1;
    let err = di + dj;
    for (let n = 0; n < 100000; n++) {
      put(i0, j0);
      if (i0 === i1 && j0 === j1) break;
      const e2 = 2 * err;
      if (e2 >= dj) { err += dj; i0 += si; }
      if (e2 <= di) { err += di; j0 += sj; }
    }
  };
  const nt = mesh.tris.length / 3;
  for (let t = 0; t < nt; t++) {
    if (!include[mesh.triGroup[t]]) continue;
    const v = triVerts(mesh, t);
    line(v[0], v[2], v[3], v[5]); line(v[3], v[5], v[6], v[8]); line(v[6], v[8], v[0], v[2]);
  }
}

// Hillshade (0..1) from a height field in world units; light from the top-left by default.
export function hillshade(height, w, h, sx, sz, az = 315, alt = 45) {
  const out = new Float32Array(w * h);
  const azr = (az * Math.PI) / 180, altr = (alt * Math.PI) / 180;
  const lx = Math.cos(altr) * Math.sin(azr), ly = Math.sin(altr), lz = -Math.cos(altr) * Math.cos(azr);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const il = Math.max(i - 1, 0), ir = Math.min(i + 1, w - 1), jt = Math.max(j - 1, 0), jb = Math.min(j + 1, h - 1);
    const dx = (height[j * w + ir] - height[j * w + il]) / ((ir - il) * sx);
    const dz = (height[jb * w + i] - height[jt * w + i]) / ((jb - jt) * sz);
    const nx = -dx, ny = 1, nz = -dz; const l = Math.hypot(nx, ny, nz);
    out[j * w + i] = Math.max(0, (nx * lx + ny * ly + nz * lz) / l);
  }
  return out;
}

// Golf semantics of the WSR KCL collision types, as established from the
// fc1 / fc13 / fcJP12 previews against the in-game minimaps (see mesh-inspect):
//   1 fairway, 2 rough, 3 bunker, 4 outer ground (deep rough / OB terrain),
//   5 floor plane under water & OB (F0805, never visible), 6 green,
//   7 water surface, 9 fringe ring around the green, 0x0c walls (banks,
//   cliffs and retaining walls: along the water on most holes, at the edge of
//   the terrain on H12, H13 and H20, which have little or no water; none on
//   H6, H10 and H16; no tree trunks: the trees are objects in the course PMP
//   file, see tools/wsr-pins.mjs), 0x0d invisible fences, 0x0e special zone
//   (hole 1 only), 0x10 fall boundary (hole-5 mesh only).
export const KCL_GOLF = {
  1: "fairway", 2: "rough", 3: "bunker", 4: "ground", 5: "floor", 6: "green", 7: "water", 9: "fringe",
  12: "wall", 13: "wall", 14: "zone", 16: "fall",
};
export const SURFACE_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 9, 14, 16]); // rasterized into heightmaps
export const WALL_TYPES = new Set([12, 13]);
export const SEMANTIC_COLORS = {
  fairway: [128, 205, 70], rough: [78, 156, 58], bunker: [236, 216, 150], ground: [44, 96, 46], floor: [30, 60, 120],
  green: [160, 235, 150], water: [96, 165, 232], fringe: [176, 214, 96], wall: [60, 30, 15], zone: [205, 222, 255], fall: [20, 20, 60],
};
// Distinct colours per KCL collision type (raw view, semantics ignored).
export const TYPE_COLORS = {
  1: [60, 180, 75], 2: [191, 239, 69], 3: [245, 130, 48], 4: [67, 99, 216], 5: [255, 225, 25],
  6: [66, 212, 244], 7: [240, 50, 230], 8: [128, 128, 0], 9: [230, 25, 75], 10: [0, 128, 128],
  11: [220, 190, 255], 12: [145, 30, 180], 13: [128, 0, 0], 14: [170, 255, 195], 15: [255, 250, 200], 16: [0, 0, 117],
};
