// NSS's course for NSS's ball: public/course3d v2 (tools/build-course3d.mjs, the
// Switch game's own collision triangles) as the ground src/nsssim.js flies its
// ball over (meshGround's contacts / pass / leafTouch callbacks), for the live
// solver (src/live3d-core.js) and its tests. Pure ES module, no Node or DOM API:
// the app's worker imports it.
//
// What the course holds, NSS metres throughout (course3d keeps the dump's float32
// vertices verbatim: mesh = 10 nss + O):
//   - the ground pack and the tree pack, each course3d model attribute as the
//     ball's attribute (ATTR_OF_MODEL: fairway, rough, bunker, OB, green, water,
//     fringe, sand OB, air OB, the cups' walls and bottoms, the baked trunks,
//     leaves and palm leaves). course3d folds GolfRock, GolfGlass, GolfObject and
//     GolfBarrier into one "wall" (12); it plays as Rock here, 277,192 of the
//     dump's 285,123 such triangles (Object 5,079, Barrier 2,760, Glass 92), and
//     the only recorded stroke that met one (h08s1) met rock;
//   - the cups: course3d carries every cup's own triangles (Cupside 22, Cup 23:
//     the rim's bevel, the wall and the bottom, 100 a cup, as the field mesh has
//     them) and the six HoleCover plugs (20 green triangles each). The cup in play
//     is open, its cover out; the other five are closed by their covers, over
//     their cups, as in the game (and as tools/test-nsssim.mjs replays over the
//     dump). A cup's bone (the cup's bottom, the AddGravityHole centre, the
//     flagstick's foot) is meta.bones' (the GolfCourseNNholeK bone);
//   - NSS's actor trees (meta.trees: the Obj_Glf_<kind> bones, nearly every tree
//     in play) as the game's own collision: their kind's mesh (meta.kinds, the
//     Phive shape of Object_Obj_Glf_<kind>, in the bin's KV / KT / KA: trunk and
//     limbs GolfTree, the crown GolfLeaf, a conifer's branches and a palm's
//     fronds GolfPalmLeaf) placed by the bone's SRT (placeActorTree: W =
//     float32((V * S) R^T + T), R = Rz Ry Rx of the bone's Euler angles, shipped
//     as numbers so no engine's trigonometry enters), every vertex the eden dump's
//     collision/hNN-actors.bin to the bit (tools/build-course3d.mjs refuses
//     otherwise), its triangles in the dump's order, double-sided cards and all;
//   - the online platform (BGOBJ_GlfStartObj and BGOBJ_GlfStartObjHigh, GolfObject:
//     the dump's collision/objects, 32 + 154 triangles, embedded below in
//     units of 1/512 m, exactly) posed at Glf_RotateOBJ with the platform's yaw,
//     in play only for a stroke from the platform (local play has none).
//
// nssCourse(meta, bin, { actorTrees = true }) -> course: { meta, hole, U, O, cups
//   (c0..c5: { x, z, y (the bone), top (the cover's top: the green over the cup),
//   tris (its cover's), difficult }), trees (the actor trees placed: id, kind, nss,
//   x, y, z (the bone), tri0, tri1), nt, ..., ground({ cupKey, platform }) -> the
//   ground for nsssim.run (cached), topGround(x, z) -> { y, attr, ny, n, wet } |
//   null (the highest solid ground under a point: what a ball dropped there rests
//   on; wet = the water's surface when water lies over it) }.
// placeActorTree(kv, S, R, T) -> Float32Array: a kind's local vertices placed.
// eulerR([rx, ry, rz]) -> R (row-major, Rz Ry Rx): what tools/build-course3d.mjs ships.
// culledGround(g, verts, tris, n): g's contacts / pass / leafTouch with a cheap test in front
// (a grid of the triangles' highest points): a step above every triangle near it
// meets none, as g itself would report, so the results are g's to the bit.
import * as S from "../../src/nsssim.js";

export const M_PER_YD = 0.9144;
const CUP = S.PHYSICS.cup;
const A = S.ATTR;

// course3d v2 model attribute -> the ball's attribute (src/nsssim.js ATTR)
export const ATTR_OF_MODEL = Object.freeze({
  1: A.fairway, 2: A.rough, 3: A.bunker, 4: A.ob, 6: A.green, 7: A.water, 9: A.fringe,
  12: A.rock, 17: A.sandOb, 18: A.airOb, 19: A.tree, 20: A.leaf, 21: A.palmLeaf, 22: A.cupside, 23: A.cup,
});
// the ball's attribute -> course3d's (the live solver reports lies in course3d's numbers: a ball
// on the cup's lip or in it lies on the green)
export const MODEL_OF_ATTR = Object.freeze({
  [A.fairway]: 1, [A.rough]: 2, [A.bunker]: 3, [A.ob]: 4, [A.green]: 6, [A.water]: 7, [A.fringe]: 9,
  [A.rock]: 12, [A.sandOb]: 17, [A.airOb]: 18, [A.tree]: 19, [A.leaf]: 20, [A.palmLeaf]: 21,
  [A.cupside]: 6, [A.cup]: 6, [A.object]: 12,
});
// the ball's attribute as the lie a golfer names
export const LIE_NAME = Object.freeze({
  [A.default]: "default", [A.fairway]: "fairway", [A.rough]: "rough", [A.bunker]: "bunker", [A.water]: "water",
  [A.ob]: "OB", [A.green]: "green", [A.fringe]: "fringe", [A.leaf]: "leaf", [A.cupside]: "cup", [A.cup]: "cup",
  [A.rock]: "rock", [A.glass]: "glass", [A.tee]: "tee", [A.sandOb]: "sand OB", [A.tree]: "tree", [A.flag]: "flag",
  [A.airOb]: "air OB", [A.object]: "platform", [A.pin]: "pin", [A.palmLeaf]: "palm leaf", [A.barrier]: "barrier",
});
// the solid ground a ball can come to rest on, seen from above (water is crossed; the
// cups' walls and bottoms are under their covers or the open hole)
const GROUND = new Uint8Array(32);
for (const a of [A.fairway, A.rough, A.bunker, A.ob, A.green, A.fringe, A.rock, A.sandOb, A.object]) GROUND[a] = 1;

// ---------------------------------------------------------------- actor trees

// R = Rz Ry Rx of a bone's Euler angles (rad), row-major: the dump's tree decode's
// convention (nss-trees.py euler_R). tools/build-course3d.mjs computes it and ships the
// nine numbers, and checks the placement it gives against the dump's own (numpy's) to the
// bit: on all 151,635 vertices of the 444 trees it is
export function eulerR([rx, ry, rz]) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]], Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
  const mm = (P, Q) => P.map((_, i) => [0, 1, 2].map((j) => P[i][0] * Q[0][j] + P[i][1] * Q[1][j] + P[i][2] * Q[2][j]));
  return mm(mm(Rz, Ry), Rx).flat();
}
// a kind's local vertices kv ([n * 3]) placed by a bone's scale S, rotation R (eulerR) and
// translation T (NSS metres): float32((v * S) R^T + T), the products and sums in doubles in
// numpy's order (tools/nss-actortrees.py: (V * scale) @ R.T + translate, then float32)
export function placeActorTree(kv, Sc, R, T) {
  const n = kv.length / 3, out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const a = kv[3 * i] * Sc[0], b = kv[3 * i + 1] * Sc[1], c = kv[3 * i + 2] * Sc[2];
    out[3 * i] = a * R[0] + b * R[1] + c * R[2] + T[0];
    out[3 * i + 1] = a * R[3] + b * R[4] + c * R[5] + T[1];
    out[3 * i + 2] = a * R[6] + b * R[7] + c * R[8] + T[2];
  }
  return out;
}

// a triangle soup: vertices, triangles, attributes
function soup() {
  const v = [], t = [], a = [];
  const vert = (x, y, z) => { v.push(x, y, z); return v.length / 3 - 1; };
  const plain = (i, j, k, attr) => { t.push(i, j, k); a.push(attr); };
  return { v, t, a, vert, plain };
}

// ---------------------------------------------------------------- the platform

// BGOBJ_GlfStartObj (the low tier) and BGOBJ_GlfStartObjHigh (the high tier and
// its steps), GolfObject, in the platform's own frame (+x the player's left, +z
// toward the green), vertices x 512 (every one a multiple of 1/512 m): the dump's
// collision/objects (SHA-1 8f1faa69e3d5... and b0da7711223f...), checked against it
// by tools/test-course3d.mjs when the dump is there
export const PLATFORM_DECKS = Object.freeze({
  low: {
    v: [-3123, -545, 128, -3123, -545, 1920, -3123, 51, 128, -3123, 51, 1920, -3110, 60, 138, -3110, 60, 1910, -3046, 51, 205, -3046, 51, 1664, -3046, 60, 205, -3046, 60, 1664, 3046, 51, 205, 3046, 51, 1664, 3046, 60, 205, 3046, 60, 1664, 3110, 60, 138, 3110, 60, 1910, 3123, -545, 128, 3123, -545, 1920, 3123, 51, 128, 3123, 51, 1920],
    t: [1, 3, 2, 1, 2, 0, 11, 10, 6, 11, 6, 7, 19, 17, 16, 19, 16, 18, 17, 19, 3, 17, 3, 1, 5, 4, 2, 5, 2, 3, 19, 18, 14, 19, 14, 15, 18, 2, 4, 18, 4, 14, 15, 5, 3, 15, 3, 19, 7, 6, 8, 7, 8, 9, 13, 12, 10, 13, 10, 11, 12, 8, 6, 12, 6, 10, 11, 7, 9, 11, 9, 13, 15, 14, 12, 15, 12, 13, 9, 8, 4, 9, 4, 5, 14, 4, 8, 14, 8, 12, 15, 13, 9, 15, 9, 5],
  },
  high: {
    v: [-4915, -545, -1664, -4915, -545, 128, -4915, -230, -1664, -4915, -230, 128, -4659, -230, -1664, -4659, -230, 128, -4659, -77, -1664, -4659, -77, 128, -4403, -77, -1664, -4403, -77, 128, -4403, 77, -1664, -4403, 77, 128, -4147, 77, -1664, -4147, 77, 128, -4147, 230, -1664, -4147, 230, 128, -3891, 230, -1664, -3891, 230, 128, -3891, 384, -1664, -3891, 384, 128, -3635, 384, -1664, -3635, 384, 128, -3635, 538, -1664, -3635, 538, 128, -3379, 538, -1664, -3379, 538, 128, -3379, 691, -1664, -3379, 691, 128, -3123, 691, -1664, -3123, 691, 128, -3123, 854, -1664, -3123, 854, 128, -3110, 863, -1654, -3110, 863, 118, -3046, 854, -1587, -3046, 854, -128, -3046, 863, -1587, -3046, 863, -128, -2867, -545, -1664, -2867, -545, 128, -2867, -535, -1664, -2867, 854, -1664, -2867, 854, 128, 2867, -545, 128, 2867, -535, -1664, 2867, -535, 128, 2867, 854, -1664, 2867, 854, 128, 3046, 854, -1587, 3046, 854, -128, 3046, 863, -1587, 3046, 863, -128, 3110, 863, -1654, 3110, 863, 118, 3123, 701, -1664, 3123, 701, 128, 3123, 854, -1664, 3123, 854, 128, 3379, 547, -1664, 3379, 547, 128, 3379, 701, -1664, 3379, 701, 128, 3635, 393, -1664, 3635, 393, 128, 3635, 547, -1664, 3635, 547, 128, 3891, 240, -1664, 3891, 240, 128, 3891, 393, -1664, 3891, 393, 128, 4147, 86, -1664, 4147, 86, 128, 4147, 240, -1664, 4147, 240, 128, 4403, -67, -1664, 4403, -67, 128, 4403, 86, -1664, 4403, 86, 128, 4659, -221, -1664, 4659, -221, 128, 4659, -67, -1664, 4659, -67, 128, 4915, -535, -1664, 4915, -535, 128, 4915, -221, -1664, 4915, -221, 128],
    t: [37, 33, 53, 37, 53, 51, 49, 35, 37, 49, 37, 51, 32, 52, 56, 32, 56, 30, 43, 47, 42, 43, 42, 39, 53, 33, 31, 53, 31, 57, 52, 32, 36, 52, 36, 50, 44, 40, 41, 44, 41, 46, 49, 48, 34, 49, 34, 35, 50, 36, 34, 50, 34, 48, 8, 9, 11, 8, 11, 10, 12, 10, 11, 12, 11, 13, 24, 22, 23, 24, 23, 25, 15, 14, 12, 15, 12, 13, 27, 25, 39, 27, 39, 29, 23, 21, 39, 23, 39, 25, 16, 14, 15, 16, 15, 17, 31, 29, 39, 31, 39, 42, 19, 21, 20, 19, 20, 18, 31, 30, 28, 31, 28, 29, 27, 26, 24, 27, 24, 25, 36, 37, 35, 36, 35, 34, 32, 33, 37, 32, 37, 36, 20, 21, 23, 20, 23, 22, 16, 17, 19, 16, 19, 18, 28, 26, 27, 28, 27, 29, 33, 32, 30, 33, 30, 31, 4, 38, 0, 4, 0, 2, 1, 39, 5, 1, 5, 3, 6, 8, 38, 6, 38, 4, 39, 9, 7, 39, 7, 5, 38, 12, 14, 38, 14, 16, 38, 8, 10, 38, 10, 12, 39, 13, 11, 39, 11, 9, 38, 16, 18, 38, 18, 20, 3, 2, 0, 3, 0, 1, 38, 20, 22, 38, 22, 24, 19, 17, 39, 19, 39, 21, 38, 28, 30, 38, 30, 41, 38, 24, 26, 38, 26, 28, 4, 5, 7, 4, 7, 6, 4, 2, 3, 4, 3, 5, 15, 13, 39, 15, 39, 17, 8, 6, 7, 8, 7, 9, 66, 68, 69, 66, 69, 67, 73, 71, 70, 73, 70, 72, 69, 68, 62, 69, 62, 63, 73, 72, 66, 73, 66, 67, 74, 75, 81, 74, 81, 80, 81, 79, 78, 81, 78, 80, 70, 71, 77, 70, 77, 76, 77, 75, 74, 77, 74, 76, 81, 75, 45, 81, 45, 79, 44, 74, 80, 44, 80, 78, 77, 71, 45, 77, 45, 75, 76, 74, 44, 76, 44, 70, 78, 79, 85, 78, 85, 84, 85, 83, 82, 85, 82, 84, 79, 45, 83, 79, 83, 85, 82, 44, 78, 82, 78, 84, 51, 50, 48, 51, 48, 49, 58, 59, 65, 58, 65, 64, 56, 54, 44, 56, 44, 46, 57, 55, 54, 57, 54, 56, 65, 63, 62, 65, 62, 64, 57, 56, 52, 57, 52, 53, 50, 51, 53, 50, 53, 52, 61, 59, 58, 61, 58, 60, 54, 55, 61, 54, 61, 60, 45, 67, 69, 45, 69, 63, 68, 66, 44, 68, 44, 62, 73, 67, 45, 73, 45, 71, 72, 70, 44, 72, 44, 66, 45, 63, 65, 45, 65, 59, 60, 58, 44, 60, 44, 54, 45, 55, 57, 45, 57, 47, 64, 62, 44, 64, 44, 58, 45, 59, 61, 45, 61, 55],
  },
});
// where a player's ball rests on each tier, platform-local (slots.md section 6: the
// mats 0.099609 / 1.667969 m up, the deck meshes' own flat planes; the tiers' bones
// at z +2.0 / -1.5)
export const PLATFORM_TIERS = Object.freeze({ low: { matY: 51 / 512, z: 2.0 }, high: { matY: 854 / 512, z: -1.5 } });
// platform-local -> NSS world: world = origin + Ry(yaw) local (tools/lib/nssreg.mjs platformToWorld)
export function platformToWorld(origin, yawDeg, [lx, ly, lz]) {
  const t = (yawDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return [origin[0] + c * lx + s * lz, origin[1] + ly, origin[2] - s * lx + c * lz];
}

// ---------------------------------------------------------------- grounds

// g (a meshGround over verts / tris, the first n triangles) behind a test that
// skips the query when no triangle can be a candidate: a grid (cell m) of the
// highest point of every triangle whose xz box meets the cell, and the highest
// of the triangles too big to grid. meshGround's candidates are the triangles
// whose boxes meet the step's box grown by r; a step whose lowest point less r is
// above all of them near it gets none, so contacts and pass return [] as g would.
export function culledGround(g, verts, tris, n, { cell = 8, bigCells = 4096 } = {}) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const bx = new Float64Array(5 * n);
  for (let t = 0; t < n; t++) {
    const a = 3 * tris[3 * t], b = 3 * tris[3 * t + 1], c = 3 * tris[3 * t + 2];
    const ax = Math.min(verts[a], verts[b], verts[c]), az = Math.min(verts[a + 2], verts[b + 2], verts[c + 2]);
    const cx = Math.max(verts[a], verts[b], verts[c]), cz = Math.max(verts[a + 2], verts[b + 2], verts[c + 2]);
    bx[5 * t] = ax; bx[5 * t + 1] = cx; bx[5 * t + 2] = az; bx[5 * t + 3] = cz; bx[5 * t + 4] = Math.max(verts[a + 1], verts[b + 1], verts[c + 1]);
    if (ax < x0) x0 = ax; if (az < z0) z0 = az; if (cx > x1) x1 = cx; if (cz > z1) z1 = cz;
  }
  if (!(x1 >= x0)) { x0 = z0 = 0; x1 = z1 = 1; }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell) + 1), nz = Math.max(1, Math.ceil((z1 - z0) / cell) + 1);
  const top = new Float64Array(nx * nz).fill(-Infinity);
  let big = -Infinity;
  for (let t = 0; t < n; t++) {
    const i0 = Math.floor((bx[5 * t] - x0) / cell), i1 = Math.floor((bx[5 * t + 1] - x0) / cell);
    const j0 = Math.floor((bx[5 * t + 2] - z0) / cell), j1 = Math.floor((bx[5 * t + 3] - z0) / cell), y = bx[5 * t + 4];
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > bigCells) { if (y > big) big = y; continue; }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (y > top[j * nx + i]) top[j * nx + i] = y;
  }
  // the step's box exactly as meshGround's candidates builds it
  const may = (ox, oy, oz, ex, ey, ez, r) => {
    const by0 = Math.min(oy, ey) - r;
    if (big >= by0) return true;
    const sx0 = Math.min(ox, ex) - r, sx1 = Math.max(ox, ex) + r, sz0 = Math.min(oz, ez) - r, sz1 = Math.max(oz, ez) + r;
    if (sx1 < x0 || sx0 > x1 || sz1 < z0 || sz0 > z1) return false;
    const i0 = Math.max(0, Math.floor((sx0 - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((sx1 - x0) / cell));
    const j0 = Math.max(0, Math.floor((sz0 - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((sz1 - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (top[j * nx + i] >= by0) return true;
    return false;
  };
  return {
    kind: "mesh",
    contacts: (o, e, r) => (may(o[0], o[1], o[2], e[0], e[1], e[2], r) ? g.contacts(o, e, r) : []),
    pass: (o, D, r) => (may(o[0], o[1], o[2], o[0] + D[0], o[1] + D[1], o[2] + D[2], r) ? g.pass(o, D, r) : []),
    // the canopy counter's leaf contacts (meshGround's, on a mesh with Leaf triangles): the same step box as pass
    leafTouch: g.leafTouch ? (o, D, r) => (may(o[0], o[1], o[2], o[0] + D[0], o[1] + D[1], o[2] + D[2], r) ? g.leafTouch(o, D, r) : []) : null,
    faceNormal: g.faceNormal,
    triangles: g.triangles,
  };
}

// several grounds as one: the contacts of each, the pass-through faces of each in
// the order the step crosses them
function joinGrounds(list) {
  if (list.length === 1) return list[0];
  return {
    kind: "mesh",
    contacts(o, e, r) {
      let out = null;
      for (const g of list) { const c = g.contacts(o, e, r); if (c.length) out = out ? out.concat(c) : c; }
      return out ?? [];
    },
    pass(o, D, r) {
      let out = null, n = 0;
      for (const g of list) { const c = g.pass(o, D, r); if (c.length) { out = out ? out.concat(c) : c; n++; } }
      if (n > 1) out.sort((p, q) => p.t - q.t);
      return out ?? [];
    },
    // each member's leaf contacts in turn (members without Leaf triangles have none)
    leafTouch: list.some((g) => g.leafTouch) ? (o, D, r) => {
      let out = null;
      for (const g of list) if (g.leafTouch) { const c = g.leafTouch(o, D, r); if (c.length) out = out ? out.concat(c) : c; }
      return out ?? [];
    } : null,
  };
}

// a mesh from a soup, gridded and culled
function meshOf(m, cell = 4) {
  const verts = Float64Array.from(m.v), tris = Uint32Array.from(m.t), attr = Uint8Array.from(m.a);
  return culledGround(S.meshGround({ verts, tris, attr }, { cell }), verts, tris, attr.length);
}

// ---------------------------------------------------------------- the course

const COVER_TRIS = 20, COVER_R_M = 0.25, HUB_M = 0.02, CUP_OWN_M = 0.25, CUP_OWN_TRIS = 100;

export function nssCourse(meta, bin, { actorTrees = true } = {}) {
  if (meta?.version !== 2) throw new Error(`course3d: version ${meta?.version} (the NSS ball needs v2, NSS's own triangles)`);
  const U = meta.unitsPerM, O = meta.O, o = meta.offs;
  const ix = (k, t, n) => (t === "u32" ? new Uint32Array(bin, o[k], n) : new Uint16Array(bin, o[k], n));
  const GV = new Float32Array(bin, o.V, 3 * meta.nv), GT = ix("T", meta.idx, 3 * meta.nt), GA = new Uint8Array(bin, o.A, meta.nt);
  const TV = new Float32Array(bin, o.TV, 3 * meta.ntv), TT = ix("TT", meta.tidx, 3 * meta.ntt), TA = new Uint8Array(bin, o.TA, meta.ntt);
  const kinds = meta.kinds ?? [];
  const nkv = kinds.reduce((s, k) => s + k.nv, 0), nkt = kinds.reduce((s, k) => s + k.nt, 0);
  const KV = nkv ? new Float32Array(bin, o.KV, 3 * nkv) : new Float32Array(0), KT = nkt ? new Uint16Array(bin, o.KT, 3 * nkt) : new Uint16Array(0), KA = nkt ? new Uint8Array(bin, o.KA, nkt) : new Uint8Array(0);
  const nssOf = (P) => [(P[0] - O[0]) / U, (P[1] - O[1]) / U, (P[2] - O[2]) / U];
  for (const a of [...new Set(GA), ...new Set(TA), ...new Set(KA)]) if (ATTR_OF_MODEL[a] == null) throw new Error(`course3d H${meta.hole}: model attribute ${a} has no NSS attribute`);
  if ((meta.trees ?? []).some((t) => !t.R || !kinds[t.k])) throw new Error(`course3d H${meta.hole}: an actor tree without its kind mesh and placement (a course3d of before 2026-10-25's actor meshes: rebuild it)`);

  // ---- the cups: each one's cover (the fan of green triangles about a hub on the
  // cup's bone: the field's green has a hole there) and its own triangles ----
  const cups = {};
  for (const [key, P] of Object.entries(meta.pins)) {
    const [x, y, z] = nssOf(P), bone = meta.bones?.[key];
    cups[key] = { key, k: Number(key.slice(1)), x, z, top: y, y: bone ? nssOf(bone)[1] : y - CUP.depthM, tris: [], own: 0, difficult: (meta.difficult ?? []).includes(Number(key.slice(1))) };
  }
  const cupList = Object.values(cups), coverOf = new Int8Array(meta.nt).fill(-1);
  for (let t = 0; t < meta.nt; t++) {
    const a = GA[t];
    if (a !== 6 && a !== 22 && a !== 23) continue;
    for (let c = 0; c < cupList.length; c++) {
      const q = cupList[c];
      let all = true, hub = false;
      for (let k = 0; k < 3 && all; k++) {
        const i = 3 * GT[3 * t + k], dx = GV[i] - q.x, dz = GV[i + 2] - q.z, d2 = dx * dx + dz * dz;
        all = d2 <= (a === 6 ? COVER_R_M : CUP_OWN_M) ** 2;
        if (d2 <= HUB_M * HUB_M) hub = true;
      }
      if (all && a === 6 && hub) { q.tris.push(t); coverOf[t] = c; break; }
      if (all && a !== 6) { q.own++; break; }
    }
  }
  for (const q of cupList) {
    if (q.tris.length !== COVER_TRIS) throw new Error(`course3d H${meta.hole} ${q.key}: ${q.tris.length} cover triangles, not ${COVER_TRIS}`);
    if (q.own < CUP_OWN_TRIS) throw new Error(`course3d H${meta.hole} ${q.key}: ${q.own} of the cup's own triangles (Cupside, Cup), at least ${CUP_OWN_TRIS} expected`);
  }

  // ---- the static course: the ground pack less the covers (every cup's own walls and
  // bottom in), the tree pack, the actor trees ----
  const m = soup();
  const remap = (V, T, Aa, n, skip) => {
    const map = new Int32Array(V.length / 3).fill(-1);
    for (let t = 0; t < n; t++) {
      if (skip && skip(t)) continue;
      const ids = [0, 1, 2].map((k) => { const i = T[3 * t + k]; if (map[i] < 0) map[i] = m.vert(V[3 * i], V[3 * i + 1], V[3 * i + 2]); return map[i]; });
      m.plain(ids[0], ids[1], ids[2], ATTR_OF_MODEL[Aa[t]]);
    }
  };
  remap(GV, GT, GA, meta.nt, (t) => coverOf[t] >= 0);
  const nGround = m.a.length;
  remap(TV, TT, TA, meta.ntt, null);
  const nBaked = m.a.length - nGround;
  const trees = [];
  if (actorTrees) {
    for (const t of meta.trees ?? []) {
      const kd = kinds[t.k], tri0 = m.a.length;
      const W = placeActorTree(KV.subarray(3 * kd.v0, 3 * (kd.v0 + kd.nv)), t.S, t.R, t.T);
      const base = m.v.length / 3;
      for (let i = 0; i < W.length; i++) m.v.push(W[i]);
      for (let j = kd.t0; j < kd.t0 + kd.nt; j++) m.plain(base + KT[3 * j] - kd.v0, base + KT[3 * j + 1] - kd.v0, base + KT[3 * j + 2] - kd.v0, ATTR_OF_MODEL[KA[j]]);
      trees.push({ id: t.id, kind: t.kind, nss: t.nss ?? null, wsr: t.wsr ?? null, x: t.T[0], y: t.T[1], z: t.T[2], tri0, tri1: m.a.length });
    }
  }
  const nActor = m.a.length - nGround - nBaked;
  const verts = Float64Array.from(m.v), tris = Uint32Array.from(m.t), attr = Uint8Array.from(m.a);
  const base = culledGround(S.meshGround({ verts, tris, attr }, { cell: 4 }), verts, tris, attr.length);

  // ---- the top ground: a grid over the solid ground and every cover, and the water ----
  const TOP_CELL = 4;
  const gl = [];
  for (let t = 0; t < nGround; t++) if (GROUND[attr[t]] || attr[t] === A.water) gl.push(t);
  const cover9 = [];
  for (const q of cupList) for (const t of q.tris) { const p = []; for (let k = 0; k < 3; k++) { const i = 3 * GT[3 * t + k]; p.push(GV[i], GV[i + 1], GV[i + 2]); } cover9.push(p); }
  const nTop = gl.length + cover9.length, T9 = new Float64Array(9 * nTop), TAt = new Uint8Array(nTop);
  gl.forEach((t, n) => { for (let k = 0; k < 3; k++) { const i = 3 * tris[3 * t + k]; T9[9 * n + 3 * k] = verts[i]; T9[9 * n + 3 * k + 1] = verts[i + 1]; T9[9 * n + 3 * k + 2] = verts[i + 2]; } TAt[n] = attr[t]; });
  cover9.forEach((p, n) => { T9.set(p, 9 * (gl.length + n)); TAt[gl.length + n] = A.green; });
  let gx0 = Infinity, gz0 = Infinity, gx1 = -Infinity, gz1 = -Infinity;
  for (let n = 0; n < nTop; n++) for (let k = 0; k < 3; k++) { const x = T9[9 * n + 3 * k], z = T9[9 * n + 3 * k + 2]; if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; if (z < gz0) gz0 = z; if (z > gz1) gz1 = z; }
  const gw = Math.max(1, Math.ceil((gx1 - gx0) / TOP_CELL) + 1), gh = Math.max(1, Math.ceil((gz1 - gz0) / TOP_CELL) + 1);
  const cnt = new Uint32Array(gw * gh + 1), cellOf = (n) => {
    const xs = [T9[9 * n], T9[9 * n + 3], T9[9 * n + 6]], zs = [T9[9 * n + 2], T9[9 * n + 5], T9[9 * n + 8]];
    return [Math.floor((Math.min(...xs) - gx0) / TOP_CELL), Math.floor((Math.max(...xs) - gx0) / TOP_CELL), Math.floor((Math.min(...zs) - gz0) / TOP_CELL), Math.floor((Math.max(...zs) - gz0) / TOP_CELL)];
  };
  for (let n = 0; n < nTop; n++) { const [i0, i1, j0, j1] = cellOf(n); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cnt[j * gw + i + 1]++; }
  for (let k = 1; k <= gw * gh; k++) cnt[k] += cnt[k - 1];
  const items = new Uint32Array(cnt[gw * gh]), fill = cnt.slice(0, gw * gh);
  for (let n = 0; n < nTop; n++) { const [i0, i1, j0, j1] = cellOf(n); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) items[fill[j * gw + i]++] = n; }
  function topGround(x, z) {
    const i = Math.floor((x - gx0) / TOP_CELL), j = Math.floor((z - gz0) / TOP_CELL);
    if (i < 0 || j < 0 || i >= gw || j >= gh) return null;
    let best = null, wet = null;
    for (let p = cnt[j * gw + i]; p < cnt[j * gw + i + 1]; p++) {
      const n = items[p], b = 9 * n;
      const ax = T9[b], az = T9[b + 2], bx_ = T9[b + 3], bz = T9[b + 5], cx = T9[b + 6], cz = T9[b + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx_) * (az - cz);
      if (!d) continue;
      const l0 = ((bz - cz) * (x - cx) + (cx - bx_) * (z - cz)) / d, l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l2 = 1 - l0 - l1;
      if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
      const y = l0 * T9[b + 1] + l1 * T9[b + 4] + l2 * T9[b + 7];
      if (TAt[n] === A.water) { if (wet == null || y > wet) wet = y; continue; }
      if (!best || y > best.y) best = { y, n };
    }
    if (!best) return null;
    const b = 9 * best.n;
    const ux = T9[b + 3] - T9[b], uy = T9[b + 4] - T9[b + 1], uz = T9[b + 5] - T9[b + 2], wx = T9[b + 6] - T9[b], wy = T9[b + 7] - T9[b + 1], wz = T9[b + 8] - T9[b + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return { y: best.y, attr: TAt[best.n], ny: ny / l, n: [nx / l, ny / l, nz / l], wet: wet != null && wet > best.y ? wet : null };
  }

  // ---- the cup in play (its cover out, the other five in) and the platform ----
  const cupGrounds = new Map(), grounds = new Map();
  function cupGround(key) {
    if (cupGrounds.has(key)) return cupGrounds.get(key);
    const c = soup();
    for (const q of cupList) {
      if (q.key === key) continue;
      for (const t of q.tris) { const ids = [0, 1, 2].map((k) => { const i = 3 * GT[3 * t + k]; return c.vert(GV[i], GV[i + 1], GV[i + 2]); }); c.plain(ids[0], ids[1], ids[2], A.green); }
    }
    const g = c.a.length ? meshOf(c, 1) : null;
    cupGrounds.set(key, g);
    return g;
  }
  const P0 = meta.platform ? nssOf(meta.platform.origin) : null;
  let deckG;
  function deckGround() {
    if (deckG !== undefined) return deckG;
    deckG = null;
    if (!P0) return deckG;
    const d = soup();
    for (const part of [PLATFORM_DECKS.low, PLATFORM_DECKS.high]) {
      const b = d.v.length / 3;
      for (let i = 0; i < part.v.length; i += 3) d.vert(...platformToWorld(P0, meta.platform.yawDeg, [part.v[i] / 512, part.v[i + 1] / 512, part.v[i + 2] / 512]));
      for (let i = 0; i < part.t.length; i += 3) d.plain(b + part.t[i], b + part.t[i + 1], b + part.t[i + 2], A.object);
    }
    deckG = meshOf(d, 2);
    return deckG;
  }
  // the ground a stroke flies over: the course, the cup in play (cupKey; none: all
  // six closed) and, from the platform, its decks
  function ground({ cupKey = null, platform = false } = {}) {
    const key = `${cupKey}|${platform ? 1 : 0}`;
    if (!grounds.has(key)) grounds.set(key, joinGrounds([base, cupGround(cupKey), platform ? deckGround() : null].filter(Boolean)));
    return grounds.get(key);
  }
  return {
    meta, hole: meta.hole, U, O, cups, trees, platformOrigin: P0,
    nt: attr.length, nGround, nBaked, nActor, nCover: cupList.length * COVER_TRIS,
    ground, topGround, nssOf, meshOf: (p) => [U * p[0] + O[0], U * p[1] + O[1], U * p[2] + O[2]],
    // the triangles as nsssim holds them (the tests compare them with the shipped files)
    arrays: { verts, tris, attr },
  };
}
