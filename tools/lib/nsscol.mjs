// NSS collision meshes as the eden exporter dumps them (git-ignored, on the dump
// machine: tools/harness/state/eden/nss-golf-x/collision), for the generators
// that read them (tools/nss-export.mjs, nss-truth, build-terrain, build-course3d).
//
// collision/hNN.bin is laid out by hNN.json `layout`: verts float32[V][3] (NSS
// world metres, y up, -z toward the green), tris uint32[T][3], surface uint8[T]
// (the NSS attribute code below), material uint8[T] (index into hNN.json
// `materials`). Havok quads are split (a,b,c),(a,c,d), so a quad stored as
// (a,b,c,b) (the leaf and palm-leaf cards) gives a triangle and its reverse: a
// double-sided triangle. Some coincident triangles carry two surfaces (H20 rock
// + sand OB, ob + object, glass + object; H21 leaf + palm leaf), and a ray on
// the edge two triangles share hits both: hits within TIE_M (1 um) of the
// highest are one height, decided by TIE_ORDER (a code priority, below), then
// by triangle index, the same in topGround and rayHits. hNN-covers.bin holds
// the six HoleCover plugs (20 tris each, already in world coordinates, code 18
// GolfGreen), cover k closing cup k; loadCollision appends them after the
// field's triangles.
// Not in the field mesh, and dumped beside it as hNN-<name>.json + .bin (the
// field's layout, world coordinates) that load through `extras`, appended in
// the order asked: `water` (hNN-water: H3's sea, the separate actor
// Object_BGOBJ_GolfCourse03Water; no other hole has the file) and `leaf`
// (hNN-leaf: the TreeLeafNN canopies, GolfLeaf 25, all 21 holes). Not dumped
// as hole files: Hole1StartOBJ, the tee marks and the online platform
// (collision/objects/BGOBJ_GlfStartObj*.bin, in the platform's own frame,
// loadObject). H3's sea plane runs ~16 km out: give gridIndex a `bbox` (the
// map frame plus a margin) for it, or the grid is sized by the sea.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

// NSS surface codes (the union over the 21 field meshes, plus the three the
// exporter defines that no field mesh uses: 35 tee, 38 flag, 42 pin)
export const NSS_CODES = {
  5: "GolfFairway", 6: "GolfRough", 7: "GolfBunker", 8: "GolfWaterhazard", 10: "GolfOB",
  18: "GolfGreen", 24: "GolfGreenEdge", 25: "GolfLeaf", 30: "GolfCupside", 31: "GolfCup",
  32: "GolfRock", 34: "GolfGlass", 35: "GolfTee", 36: "GolfSandOB", 37: "GolfTree",
  38: "GolfFlag", 39: "GolfAirOB", 40: "GolfObject", 42: "GolfPin", 43: "GolfPalmLeaf", 44: "GolfBarrier",
};
// what a ball can lie on, seen from above (INTEGRATION.md 1.1); a vertical ray
// passes through every other code (leaves, cup walls and bottoms, glass, trees,
// air OB volumes, objects, palm leaves, barriers)
export const GROUND_CODES = new Set([5, 6, 7, 8, 10, 18, 24, 32, 36]);
export const PASS_CODES = new Set([25, 30, 31, 34, 37, 39, 40, 43, 44]);
// A tie (hits within TIE_M of the highest: coincident triangles with two
// surfaces, or a ray on a shared edge) goes to the code earliest here, then to
// the lower triangle index. Which of two coincident triangles NSS's own ray
// query reports is not decoded, and the triangle index carries no meaning, so
// this is a convention, chosen to err toward the penalty: the hazards first
// (water, OB, sand OB, air OB), then the lies from the worst to the best
// (bunker, rough, fringe, fairway, green), then rock (a bank's or wall's
// face: the lie beside it wins), then the codes a ray passes through, the
// cup's wall and bottom last (a cover's rim over its cup's wall reads as the
// cover, green). A code missing from the list ranks after all of them. Of 7.3 M rays laid out as tools/build-terrain.mjs and
// tools/nss-truth.mjs cast theirs on the 21 holes (2026-10-25), none is a tie
// between two codes (H20's 83 rock + sand OB pairs lie under water or other
// ground), and the rule changed none of their reads (code, triangle, y) from
// the triangle-index rule it replaced.
export const TIE_ORDER = Object.freeze([8, 10, 36, 39, 7, 6, 24, 5, 18, 32, 44, 40, 34, 37, 25, 43, 30, 31, 35, 38, 42]);
const RANK = new Uint16Array(256).fill(TIE_ORDER.length);
TIE_ORDER.forEach((c, i) => { RANK[c] = i; });

const pad2 = (n) => String(n).padStart(2, "0");
const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");

// copy a byte range into its own (aligned) ArrayBuffer
function slice(buf, off, bytes) {
  return buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + bytes);
}

// one bin by its layout -> { nv, nt, verts: Float32Array, tris: Uint32Array, surface, material }
export function readMeshBin(buf, layout, what = "bin") {
  const L = layout;
  for (const [k, dt] of [["verts", "float32"], ["tris", "uint32"], ["surface", "uint8"], ["material", "uint8"]]) {
    if (!L[k] || L[k].dtype !== dt) throw new Error(`${what}: layout.${k} is not ${dt}`);
    if (L[k].offset + L[k].bytes > buf.length) throw new Error(`${what}: layout.${k} runs past the file`);
  }
  const nv = L.verts.shape[0], nt = L.tris.shape[0];
  if (L.verts.bytes !== nv * 12 || L.tris.bytes !== nt * 12 || L.surface.bytes !== nt || L.material.bytes !== nt) throw new Error(`${what}: layout sizes disagree`);
  const verts = new Float32Array(slice(buf, L.verts.offset, L.verts.bytes));
  const tris = new Uint32Array(slice(buf, L.tris.offset, L.tris.bytes));
  const surface = new Uint8Array(slice(buf, L.surface.offset, L.surface.bytes));
  const material = new Uint8Array(slice(buf, L.material.offset, L.material.bytes));
  for (let i = 0; i < tris.length; i++) if (tris[i] >= nv) throw new Error(`${what}: tri index ${tris[i]} >= ${nv} vertices`);
  return { nv, nt, verts, tris, surface, material };
}

// read <base>.json + <base>.bin (its `layout`, `binBytes`, `binSha1`)
function readPart(jsonPath, binPath, verify) {
  const meta = JSON.parse(readFileSync(jsonPath, "utf8"));
  const buf = readFileSync(binPath);
  if (verify) {
    if (meta.binBytes != null && buf.length !== meta.binBytes) throw new Error(`${binPath}: ${buf.length} bytes, its json says ${meta.binBytes}`);
    if (meta.binSha1 && sha1(buf) !== meta.binSha1) throw new Error(`${binPath}: SHA-1 differs from its json`);
  }
  return { meta, buf, sha1: sha1(buf) };
}

// a platform or other actor shape from collision/objects/<name>.json + .bin
// (actor-local coordinates)
export function loadObject(dir, name, { verify = true } = {}) {
  const p = readPart(join(dir, "objects", `${name}.json`), join(dir, "objects", `${name}.bin`), verify);
  return { name, sha1: p.sha1, meta: p.meta, ...readMeshBin(p.buf, p.meta.layout, name), parts: [{ name, tri0: 0, tri1: p.meta.layout.tris.shape[0] }] };
}

// hole n's field mesh, with its six covers appended (covers: true) and any
// extras present on disk. Returns { hole, nv, nt, verts, tris, surface,
// material, parts: [{ name, tri0, tri1, k? }], covers: [{ k, tri0, tri1,
// min, max, centre }], meta, sha1: { field, covers, <extra>... }, missing }.
// Cover and extra triangles get material 255 (their own tables are not the
// field's).
export function loadCollision(dir, n, { covers = true, extras = [], verify = true } = {}) {
  const base = `h${pad2(n)}`;
  const field = readPart(join(dir, `${base}.json`), join(dir, `${base}.bin`), verify);
  if (field.meta.hole != null && field.meta.hole !== n) throw new Error(`${base}.json is hole ${field.meta.hole}`);
  const pieces = [{ name: "field", ...readMeshBin(field.buf, field.meta.layout, base) }];
  const sha = { field: field.sha1 };
  const coverList = [];
  if (covers) {
    const C = field.meta.covers;
    if (!C?.layout) throw new Error(`${base}.json has no covers`);
    const buf = readFileSync(join(dir, C.bin || `${base}-covers.bin`));
    if (verify && C.binSha1 && sha1(buf) !== C.binSha1) throw new Error(`${base}-covers.bin: SHA-1 differs from its json`);
    sha.covers = sha1(buf);
    const cm = readMeshBin(buf, C.layout, `${base}-covers`);
    for (let i = 0; i < cm.nt; i++) if (cm.surface[i] !== 18) throw new Error(`${base}-covers: tri ${i} is code ${cm.surface[i]}, not 18 (green)`);
    pieces.push({ name: "covers", ...cm, items: C.items });
  }
  const missing = [];
  for (const name of extras) {
    const jp = join(dir, `${base}-${name}.json`), bp = join(dir, `${base}-${name}.bin`);
    if (!existsSync(jp) || !existsSync(bp)) { missing.push(name); continue; }
    const p = readPart(jp, bp, verify);
    sha[name] = p.sha1;
    pieces.push({ name, ...readMeshBin(p.buf, p.meta.layout, `${base}-${name}`) });
  }
  const nv = pieces.reduce((s, p) => s + p.nv, 0), nt = pieces.reduce((s, p) => s + p.nt, 0);
  const verts = new Float32Array(nv * 3), tris = new Uint32Array(nt * 3), surface = new Uint8Array(nt), material = new Uint8Array(nt);
  const parts = [];
  let v0 = 0, t0 = 0;
  for (const p of pieces) {
    verts.set(p.verts, v0 * 3);
    for (let i = 0; i < p.nt * 3; i++) tris[t0 * 3 + i] = p.tris[i] + v0;
    surface.set(p.surface, t0);
    if (p.name === "field") material.set(p.material, t0); else material.fill(255, t0, t0 + p.nt);
    if (p.name === "covers") {
      for (const it of p.items) {
        const a = t0 + it.triRange[0], b = t0 + it.triRange[1];
        let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (let vi = v0 + it.vertexRange[0]; vi < v0 + it.vertexRange[1]; vi++) for (let c = 0; c < 3; c++) { const q = verts[vi * 3 + c]; if (q < mn[c]) mn[c] = q; if (q > mx[c]) mx[c] = q; }
        parts.push({ name: `cover${it.k}`, k: it.k, tri0: a, tri1: b });
        coverList.push({ k: it.k, tri0: a, tri1: b, min: mn, max: mx, centre: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] });
      }
    } else parts.push({ name: p.name, tri0: t0, tri1: t0 + p.nt });
    v0 += p.nv; t0 += p.nt;
  }
  return { hole: n, nv, nt, verts, tris, surface, material, parts, covers: coverList, meta: field.meta, sha1: sha, missing };
}

// a uniform XZ grid over the mesh (cellM metres): CSR cell lists of the
// triangles whose xz bounding box overlaps the cell, in triangle order.
// `codes` (a Set) indexes only those surfaces; triangles with no xz area
// (walls, seen from above) are left out, since a vertical ray cannot meet them.
// `bbox` = [x0, z0, x1, z1] (NSS metres) lays the grid over that box instead
// of over every vertex, and indexes only the triangles that reach it (a ray
// anywhere in the box reads exactly what it reads on the whole mesh); a ray
// outside the box, rounded out to whole cells, finds nothing. Without it H3's
// 16 km sea plane would make a 4,017 x 4,017 grid of 4 m cells.
export function gridIndex(mesh, cellM = 4, { codes = null, bbox = null } = {}) {
  const { verts: V, tris: T, surface: S, nt } = mesh;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  if (bbox) {
    [x0, z0, x1, z1] = bbox;
    if (![x0, z0, x1, z1].every(Number.isFinite) || x1 < x0 || z1 < z0) throw new Error(`gridIndex: bbox ${bbox} is not [x0, z0, x1, z1]`);
  } else {
    for (let i = 0; i < mesh.nv; i++) { const x = V[i * 3], z = V[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (!(x1 >= x0)) { x0 = z0 = 0; x1 = z1 = 1; }
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cellM) + 1), nz = Math.max(1, Math.ceil((z1 - z0) / cellM) + 1);
  const keep = new Uint8Array(nt);
  const range = new Int32Array(nt * 4);
  const count = new Uint32Array(nx * nz + 1);
  for (let t = 0; t < nt; t++) {
    if (codes && !codes.has(S[t])) continue;
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const ax = V[a], az = V[a + 2], bx = V[b], bz = V[b + 2], cx = V[c], cz = V[c + 2];
    const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (d === 0) continue;
    let i0 = Math.floor((Math.min(ax, bx, cx) - x0) / cellM), i1 = Math.floor((Math.max(ax, bx, cx) - x0) / cellM);
    let j0 = Math.floor((Math.min(az, bz, cz) - z0) / cellM), j1 = Math.floor((Math.max(az, bz, cz) - z0) / cellM);
    if (i1 < 0 || j1 < 0 || i0 >= nx || j0 >= nz) continue;   // only with a bbox: the triangle misses the grid
    if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0; if (i1 >= nx) i1 = nx - 1; if (j1 >= nz) j1 = nz - 1;
    keep[t] = 1; range[t * 4] = i0; range[t * 4 + 1] = i1; range[t * 4 + 2] = j0; range[t * 4 + 3] = j1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) count[j * nx + i + 1]++;
  }
  for (let c = 1; c <= nx * nz; c++) count[c] += count[c - 1];
  const start = count.slice();
  const items = new Uint32Array(count[nx * nz]);
  const fill = count.slice(0, nx * nz);
  for (let t = 0; t < nt; t++) {
    if (!keep[t]) continue;
    for (let j = range[t * 4 + 2]; j <= range[t * 4 + 3]; j++) for (let i = range[t * 4]; i <= range[t * 4 + 1]; i++) items[fill[j * nx + i]++] = t;
  }
  return { mesh, x0, z0, cell: cellM, nx, nz, start, items, codes, bbox: bbox ? [x0, z0, x1, z1] : null };
}

const BARY_EPS = 1e-9;   // barycentric tolerance: a ray on an edge hits both sides
export const TIE_M = 1e-6;   // hits this close below the highest are one height (TIE_ORDER decides)

// the hits of the vertical ray at (x, z) among `codes` (all when null), into
// the shared scratch arrays HY (height) / HT (triangle), in triangle order;
// returns how many
let HY = new Float64Array(64), HT = new Int32Array(64);
function collect(idx, x, z, codes) {
  const { mesh, x0, z0, cell, nx, nz, start, items } = idx;
  const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
  if (i < 0 || j < 0 || i >= nx || j >= nz) return 0;
  const V = mesh.verts, T = mesh.tris, S = mesh.surface;
  let k = 0;
  for (let p = start[j * nx + i], e = start[j * nx + i + 1]; p < e; p++) {
    const t = items[p];
    if (codes && !codes.has(S[t])) continue;
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const ax = V[a], az = V[a + 2], bx = V[b], bz = V[b + 2], cx = V[c], cz = V[c + 2];
    const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (d === 0) continue;
    const u = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / d;
    const v = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / d;
    const w = 1 - u - v;
    if (u < -BARY_EPS || v < -BARY_EPS || w < -BARY_EPS) continue;
    if (k === HY.length) { const y2 = new Float64Array(k * 2), t2 = new Int32Array(k * 2); y2.set(HY); t2.set(HT); HY = y2; HT = t2; }
    HY[k] = u * V[a + 1] + v * V[b + 1] + w * V[c + 1]; HT[k] = t; k++;
  }
  return k;
}

// every hit of the vertical ray at (x, z) among `codes` (all codes when
// null): [{ y, code, tri }], highest first; hits within TIE_M below the
// highest of those left are one group, listed by TIE_ORDER then triangle
// index (so within a group y need not fall). The first is topGround's pick.
export function rayHits(idx, x, z, codes = null) {
  const k = collect(idx, x, z, codes), S = idx.mesh.surface;
  const hits = [];
  for (let i = 0; i < k; i++) hits.push({ y: HY[i], code: S[HT[i]], tri: HT[i] });
  hits.sort((p, q) => q.y - p.y || p.tri - q.tri);
  const out = [];
  for (let i = 0; i < hits.length;) {
    let j = i + 1;
    while (j < hits.length && hits[j].y >= hits[i].y - TIE_M) j++;
    out.push(...hits.slice(i, j).sort((p, q) => RANK[p.code] - RANK[q.code] || p.tri - q.tri));
    i = j;
  }
  return out;
}

// the top ground of a vertical ray at (x, z) among `codes` (the ground codes
// by default; null = every code): { y, code, tri, tie } | null. The highest
// hit, except that of the hits within TIE_M below it the code earliest in
// TIE_ORDER wins, then the lower triangle index (y is the winner's own);
// tie = true when a hit of another code was within TIE_M, so a caller can
// count the samples a tie decided.
export function topGround(idx, x, z, codes = GROUND_CODES) {
  const k = collect(idx, x, z, codes);
  if (!k) return null;
  const S = idx.mesh.surface;
  let top = -Infinity;
  for (let i = 0; i < k; i++) if (HY[i] > top) top = HY[i];
  const floor = top - TIE_M;
  let w = -1;
  for (let i = 0; i < k; i++) {
    if (HY[i] < floor) continue;
    if (w < 0) { w = i; continue; }
    const r = RANK[S[HT[i]]], rw = RANK[S[HT[w]]];
    if (r < rw || (r === rw && HT[i] < HT[w])) w = i;
  }
  const code = S[HT[w]];
  let tie = false;
  for (let i = 0; i < k; i++) if (HY[i] >= floor && S[HT[i]] !== code) { tie = true; break; }
  return { y: HY[w], code, tri: HT[w], tie };
}
