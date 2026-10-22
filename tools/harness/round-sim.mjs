// WSR's golf ball in 3D over the course's own KCL triangles, for planning the
// strokes of a real round (tools/harness/play-round.mjs). It is src/wsrsim.js
// run()'s tick loop (Calc, the contact routine, the post-tick; the port of
// tools/research/wsr-groundsim.py, tools/research/wsr-ground-phase.md) with
// the infinite plane / line profile replaced by the KCL prisms themselves
// (captures/meshes/wsr-kcl-obj, the wszst export: one triangle per prism, its
// winding the prism's face normal), in WSR's own frame (KCL units, x east, y
// up, z south, 1/240 s ticks):
// - the sphere query: every prism whose face plane is within the ball's radius
//   (0.5 u) and whose three edge planes the centre is within that radius of
//   (KColData's sphere test without its edge / corner refinement), depth = r -
//   the plane distance, the face normal;
// - the contact routine with several prisms: per prism the push-out n * depth
//   and the impulse, the tick's push and velocity change the component-wise
//   max + min over the prisms, the ring's normal normalize(min + max) of the
//   normals, its attribute the largest of the prisms met while v.y < 0.25
//   (wsr-ground-phase.md 3.2);
// - water (7) and valley (13) prisms are not contacts: the ball's outcome is
//   that hazard; a ball that falls 100 u below the course is out of bounds.
//   The "glass" prisms (14; only hole 1's pond surface has them) are not
//   contacts either: in the 2a sweep WSR's balls sank through them into the
//   water under them;
// - the wind in the world frame (fieldManager+0x78: angle = dir * pi/4, the
//   air moving along (sin a, cos a), speed index), in the air only;
// - the backspin pull-back with its pin homing;
// - the trees (WSR's analytic shapes, tools/research/wsr-tree-collision.md),
//   tested every tick, from the game's own scenery objects when the caller
//   passes them (play-round.mjs reads them from RAM), else tools/wsr-pins.json
//   through the registration; a hit ends the flight (outcome "tree");
//   `treeMargin` grows every shape, so the planner keeps clear of them;
// - the cup: src/putt.js's capture window measured in WSR (the ball's centre
//   within cupWindow(v) of the cup centre at speed v, on the cup's level), and
//   the flagstick when the ball is not on the green (a ball reaching it is
//   drawn into the cup, wsr-ground-phase.md 6).
// The launch takes the club block's own constants when the caller passes
// them (play-round.mjs reads them from RAM): the 2a sweep's launch speeds
// show P00 of the spoon, 3i, 7i and 9i is not src/wsrsim.js's 0 (a table
// 0x80409c34 writes, wsr-club-physics.md 3), worth 1 % of speed at a quarter
// power; FITTED below reproduces all 588 of them to 0.0002 u/tick.
// Not modelled: the KCL's edge and corner refinement, the rock-wall normal
// tweak of one course, the bunker-edge lie remap.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, MESH_DIR, meshIdOf, mapToMesh } from "./lib/course.mjs";
import { parseObj } from "../lib/obj.mjs";
import { CLUBS } from "../lib/wsrsim.mjs";

export const YD = 9.144;
const P = await import(pathToFileURL(path.join(ROOT, "src/putt.js")).href);
export const cupWindow = P.cupWindow;     // yd against yd/s (WSR's, measured by the harness)
export const V_CAP = P.V_CAP;

const A_TAB = [0.3, 0.4, 0.5, 1.0, 0.7, 1.0, 0.15, 1.0, 1.0, 0.3, 0.001, 0.3, 0.3, 1.0, 0.1, 0.4, 1.0];
const B_TAB = [0.5, 0.5, 0.4, 0.001, 0.3, 0.001, 0.5, 0.001, 0.001, 0.5, 0.13, 0.5, 0.5, 0.001, 0.5, 0.5, 0.001];
export const CONTACT_MASK = 0x1de5e & ~(1 << 14);   // 1 2 3 4 6 9 10 11 12 15 16
const STOP_MASK = 0x1ce5e;
const KEEP_MASK = CONTACT_MASK | (1 << 7) | (1 << 13);
const LIFT_K = 0.0012, LIFT_DECAY = 0.9985, SIDE_K = 0.001, SIDE_DECAY = 0.999;
const GRAV = 0.002, DRAG = 0.999, BALL_R = 0.5;
const STOP_V = 0.0015, STOP_TICKS = 20, MAX_LIFE = 0x1c20;
const WIND_K = 8e-5, WIND_ALONG = 0.6;
const FLT_MIN = 1.17549435e-38;
const THICK = 8;          // u: how far below a face its prism still catches the ball
const CELL = 16;          // u: the XZ grid's cell
const TCELL = 64;         // u: the trees' grid cell

export const ATTR_NAME = { 0: "none", 1: "fairway", 2: "rough", 3: "bunker", 4: "ob", 5: "ob2", 6: "green", 7: "water", 8: "wood",
  9: "fringe", 10: "cupside", 11: "cup", 12: "wall", 13: "valley", 14: "glass", 15: "tee", 16: "sandob" };

// the launch constants (club block +0x00 P00, +0x04 P04, +0x10 angle, +0x14
// lift, +0x38 P38); FITTED from the 2a sweep where src/wsrsim.js differs
export const FITTED = {
  spoon: { p00: 0.0135 }, "3iron": { p00: 0.023 }, "7iron": { p00: 0.0145 }, "9iron": { p00: 0.013 },
};
export function clubBlock(club, over = null) {
  const c = CLUBS[club];
  return { p00: c.p00, p04: c.p04, angle: c.angle, lift: c.lift, p38: c.p38, type: c.type, ...(FITTED[club] ?? {}), ...(over ?? {}) };
}
export function launchOf(blk, q) {
  const s = q > 0 ? Math.pow(q, Math.log2(1.0 / blk.p38)) : 0;
  const speed = blk.p00 + s * (blk.p04 - blk.p00);
  const th = (blk.angle * Math.PI) / 180;
  return { h: Math.cos(th) * speed, v: Math.sin(th) * speed, lift: blk.lift * s, speed };
}

// ---- the course ----
const courses = new Map();
const WSR_PINS = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/wsr-pins.json"), "utf8"));
export const TREE_SHAPE = {
  2: { trunkR: 6, trunkH: 60, type: "sphere", cy: 100, r: 48 },
  3: { trunkR: 4.4, trunkH: 70, type: "cone", y0: 40, r0: 30, y1: 170 },
  6: { trunkR: 7, trunkH: 132, type: "slab", y0: 76, y1: 170, r: 70 },
};

// trees: [{ x, z, base, sx, sy, kind, id?, lie? }] in KCL units
export function setTrees(c, trees) {
  c.trees = [];
  for (const tr of trees) {
    const S = TREE_SHAPE[tr.kind];
    if (!S) continue;
    const reach = Math.max(S.trunkR, S.r ?? S.r0) * tr.sx + 1;
    const top = tr.base + Math.max(S.trunkH, S.type === "sphere" ? S.cy + S.r : S.y1) * Math.max(tr.sx, tr.sy) + 2;
    c.trees.push({ ...tr, S, reach, top, low: tr.base - S.trunkH * tr.sy - 2, id: tr.id ?? `t${c.hole}-${c.trees.length}` });
  }
  c.treeGrid = new Map();
  for (const t of c.trees) {
    const R = t.reach + 12;
    for (let gx = Math.floor((t.x - R) / TCELL); gx <= Math.floor((t.x + R) / TCELL); gx++)
      for (let gz = Math.floor((t.z - R) / TCELL); gz <= Math.floor((t.z + R) / TCELL); gz++) {
        const k = gx * 100003 + gz;
        let a = c.treeGrid.get(k);
        if (!a) c.treeGrid.set(k, (a = []));
        a.push(t);
      }
  }
}
export function treesFromFile(hole) {
  return (WSR_PINS.holes[hole].trees ?? []).map((tr, k) => {
    const [X, Z] = mapToMesh(hole, tr.x, tr.y);
    return { x: X, z: Z, base: tr.meshY, sx: tr.size, sy: tr.sy ?? tr.size, kind: tr.kind, lie: tr.lie, id: `t${hole}-${k}` };
  });
}

export function loadCourse(hole) {
  if (courses.has(hole)) return courses.get(hole);
  const file = path.join(MESH_DIR, `WS2_glf_course_${meshIdOf(hole)}.kcl.obj`);
  const o = parseObj(file);
  const nt0 = o.tris.length / 3;
  const keep = [];
  for (let t = 0; t < nt0; t++) {
    const ty = o.groups[o.triGroup[t]].type ?? 0;
    if ((1 << ty) & KEEP_MASK) keep.push(t);
  }
  const nt = keep.length;
  // per prism: v0 v1 v2 (9), n (3), e0 e1 e2 (9): the edge planes' outward normals
  const V = new Float64Array(nt * 9), N = new Float64Array(nt * 3), E = new Float64Array(nt * 9), attr = new Uint8Array(nt);
  let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < nt; i++) {
    const t = keep[i];
    attr[i] = o.groups[o.triGroup[t]].type;
    for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) V[9 * i + 3 * k + c] = o.verts[3 * o.tris[3 * t + k] + c];
    const ax = V[9 * i], ay = V[9 * i + 1], az = V[9 * i + 2];
    const ux = V[9 * i + 3] - ax, uy = V[9 * i + 4] - ay, uz = V[9 * i + 5] - az;
    const wx = V[9 * i + 6] - ax, wy = V[9 * i + 7] - ay, wz = V[9 * i + 8] - az;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const m = Math.hypot(nx, ny, nz) || 1;
    nx /= m; ny /= m; nz /= m;
    N[3 * i] = nx; N[3 * i + 1] = ny; N[3 * i + 2] = nz;
    // edge k runs v_k -> v_{k+1}; its outward in-plane normal, the opposite
    // vertex on its inside
    for (let k = 0; k < 3; k++) {
      const a = 9 * i + 3 * k, b = 9 * i + 3 * ((k + 1) % 3);
      const ex = V[b] - V[a], ey = V[b + 1] - V[a + 1], ez = V[b + 2] - V[a + 2];
      let qx = ey * nz - ez * ny, qy = ez * nx - ex * nz, qz = ex * ny - ey * nx;
      const qm = Math.hypot(qx, qy, qz) || 1;
      qx /= qm; qy /= qm; qz /= qm;
      const c = 9 * i + 3 * ((k + 2) % 3);
      if ((V[c] - V[a]) * qx + (V[c + 1] - V[a + 1]) * qy + (V[c + 2] - V[a + 2]) * qz > 0) { qx = -qx; qy = -qy; qz = -qz; }
      E[9 * i + 3 * k] = qx; E[9 * i + 3 * k + 1] = qy; E[9 * i + 3 * k + 2] = qz;
    }
    for (let k = 0; k < 3; k++) {
      const x = V[9 * i + 3 * k], y = V[9 * i + 3 * k + 1], z = V[9 * i + 3 * k + 2];
      if (attr[i] !== 5) minY = Math.min(minY, y);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  // a dense XZ grid in CSR form
  const gx0 = Math.floor(minX / CELL) - 1, gz0 = Math.floor(minZ / CELL) - 1;
  const gw = Math.floor(maxX / CELL) + 2 - gx0, gh = Math.floor(maxZ / CELL) + 2 - gz0;
  const counts = new Int32Array(gw * gh + 1);
  const spans = [];
  for (let i = 0; i < nt; i++) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) { const x = V[9 * i + 3 * k], z = V[9 * i + 3 * k + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const a0 = Math.floor((x0 - 1) / CELL) - gx0, a1 = Math.floor((x1 + 1) / CELL) - gx0, b0 = Math.floor((z0 - 1) / CELL) - gz0, b1 = Math.floor((z1 + 1) / CELL) - gz0;
    spans.push([a0, a1, b0, b1]);
    for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) counts[b * gw + a + 1]++;
  }
  for (let k = 1; k <= gw * gh; k++) counts[k] += counts[k - 1];
  const cells = new Int32Array(counts[gw * gh]);
  const fill = counts.slice();
  for (let i = 0; i < nt; i++) {
    const [a0, a1, b0, b1] = spans[i];
    for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) cells[fill[b * gw + a]++] = i;
  }
  const c = { hole, nt, V, N, E, attr, start: counts, cells, gx0, gz0, gw, gh, minY, bounds: { minX, maxX, minZ, maxZ }, stamp: new Uint32Array(nt), stampN: 1 };
  setTrees(c, treesFromFile(hole));
  courses.set(hole, c);
  return c;
}

// the prisms touching a sphere at (x, y, z), radius r -> hits[] of { i, depth, attr }
function query(c, x, y, z, r, out) {
  let n = 0;
  const ga0 = Math.floor((x - r) / CELL) - c.gx0, ga1 = Math.floor((x + r) / CELL) - c.gx0;
  const gb0 = Math.floor((z - r) / CELL) - c.gz0, gb1 = Math.floor((z + r) / CELL) - c.gz0;
  const multi = ga0 !== ga1 || gb0 !== gb1;
  let s = 0;
  if (multi) { s = ++c.stampN; if (s > 0xfffffff0) { c.stamp.fill(0); c.stampN = s = 1; } }
  const V = c.V, N = c.N, E = c.E;
  for (let ga = ga0; ga <= ga1; ga++) for (let gb = gb0; gb <= gb1; gb++) {
    if (ga < 0 || gb < 0 || ga >= c.gw || gb >= c.gh) continue;
    const k = gb * c.gw + ga;
    for (let j = c.start[k], j1 = c.start[k + 1]; j < j1; j++) {
      const i = c.cells[j];
      if (multi) { if (c.stamp[i] === s) continue; c.stamp[i] = s; }
      const o = 9 * i, on = 3 * i;
      const pd = (x - V[o]) * N[on] + (y - V[o + 1]) * N[on + 1] + (z - V[o + 2]) * N[on + 2];
      if (pd >= r) continue;
      let depth = r - pd;
      if (depth >= THICK) continue;
      const e0 = (x - V[o]) * E[o] + (y - V[o + 1]) * E[o + 1] + (z - V[o + 2]) * E[o + 2];
      if (e0 >= r) continue;
      const e1 = (x - V[o + 3]) * E[o + 3] + (y - V[o + 4]) * E[o + 4] + (z - V[o + 5]) * E[o + 5];
      if (e1 >= r) continue;
      const e2 = (x - V[o + 6]) * E[o + 6] + (y - V[o + 7]) * E[o + 7] + (z - V[o + 8]) * E[o + 8];
      if (e2 >= r) continue;
      if (e0 > 0 || e1 > 0 || e2 > 0) {
        // outside an edge (or two): KColData's edge / corner path, the
        // in-plane distance to the edge (corner) d, the depth along the face
        // normal there sqrt(r^2 - d^2) - pd
        let ea, eb, ka, kb;
        if (e0 >= e1 && e0 >= e2) { ea = e0; ka = 0; if (e1 >= e2) { eb = e1; kb = 1; } else { eb = e2; kb = 2; } }
        else if (e1 >= e0 && e1 >= e2) { ea = e1; ka = 1; if (e0 >= e2) { eb = e0; kb = 0; } else { eb = e2; kb = 2; } }
        else { ea = e2; ka = 2; if (e0 >= e1) { eb = e0; kb = 0; } else { eb = e1; kb = 1; } }
        const cs = E[o + 3 * ka] * E[o + 3 * kb] + E[o + 3 * ka + 1] * E[o + 3 * kb + 1] + E[o + 3 * ka + 2] * E[o + 3 * kb + 2];
        let d2;
        if (eb <= 0 || cs * ea > eb) d2 = ea * ea;
        else d2 = (ea * ea + eb * eb - 2 * ea * eb * cs) / Math.max(1e-9, 1 - cs * cs);
        const sq = r * r - d2;
        if (sq <= 0) continue;
        depth = Math.sqrt(sq) - pd;
        if (depth <= 0) continue;
      }
      if (n < out.length) { out[n].i = i; out[n].depth = depth; out[n].attr = c.attr[i]; n++; }
    }
  }
  return n;
}

// the highest surface under (x, z) (any attr kept, or those in mask) below yMax:
// { y, attr, n, i } or null
export function groundAt(c, x, z, { yMax = Infinity, mask = KEEP_MASK } = {}) {
  const ga = Math.floor(x / CELL) - c.gx0, gb = Math.floor(z / CELL) - c.gz0;
  if (ga < 0 || gb < 0 || ga >= c.gw || gb >= c.gh) return null;
  const k = gb * c.gw + ga;
  let best = null;
  for (let j = c.start[k], j1 = c.start[k + 1]; j < j1; j++) {
    const i = c.cells[j], o = 9 * i;
    if (!((1 << c.attr[i]) & mask)) continue;
    if (c.N[3 * i + 1] < 1e-6) continue;
    const ax = c.V[o], az = c.V[o + 2], bx = c.V[o + 3], bz = c.V[o + 5], cx = c.V[o + 6], cz = c.V[o + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const y = l1 * c.V[o + 1] + l2 * c.V[o + 4] + l3 * c.V[o + 7];
    if (y > yMax) continue;
    if (!best || y > best.y) best = { y, attr: c.attr[i], i, n: [c.N[3 * i], c.N[3 * i + 1], c.N[3 * i + 2]] };
  }
  return best;
}

// the tree a point is inside (code 1 trunk, 2-4 canopy), each shape grown by m u, or null
function treeAt(c, x, y, z, m) {
  const a = c.treeGrid.get(Math.floor(x / TCELL) * 100003 + Math.floor(z / TCELL));
  if (!a) return null;
  for (let j = 0; j < a.length; j++) {
    const t = a[j];
    const dx = x - t.x, dz = z - t.z;
    const lim = t.reach + m;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    if (y > t.top + m || y < t.low - m) continue;
    const d = Math.sqrt(dx * dx + dz * dz), S = t.S, dy = y - t.base;
    const tr = S.trunkR * t.sx + BALL_R + m, th = S.trunkH * t.sy;
    if (Math.abs(dy) <= th ? d < tr : Math.hypot(d, Math.abs(dy) - th) < tr) return { tree: t, code: 1 };
    if (S.type === "sphere") {
      const ey = dy - S.cy * t.sy, R = S.r * t.sx + BALL_R + m;
      if (d * d + ey * ey < R * R) return { tree: t, code: 2 };
    } else if (S.type === "cone") {
      const y0 = S.y0 * t.sy, y1 = S.y1 * t.sy;
      if (dy >= y0 - m && dy <= y1 + m && d < (S.r0 * t.sx * Math.min(1, (y1 - dy) / (y1 - y0))) + m) return { tree: t, code: 3 };
    } else if (dy >= S.y0 * t.sy - m && dy <= S.y1 * t.sy + m && d < S.r * t.sx + m) return { tree: t, code: 4 };
  }
  return null;
}

function unitInto(u, a0, a1, a2) {
  const m = Math.sqrt(a0 * a0 + a1 * a1 + a2 * a2);
  if (m > FLT_MIN) { u[0] = a0 / m; u[1] = a1 / m; u[2] = a2 / m; } else { u[0] = 0; u[1] = 0; u[2] = 0; }
}

// The wind as WSR's field holds it: { angle (rad, dir * pi/4), speedIdx }
export const windVec = (w) => (w && w.speedIdx > 0 ? { x: Math.sin(w.angle), z: Math.cos(w.angle), mag0: 15.0 * Math.pow(w.speedIdx / 15.0, Math.log2(1 / 0.6)) } : null);

const HITS = Array.from({ length: 24 }, () => ({ i: 0, depth: 0, attr: 0 }));

/**
 * fly({ course, pos, heading, club, q, blk, wind, back, side, spinStart, yaw, pin, cup, flagIn,
 *       groundY, maxTicks, trace, trees, treeMargin, holeOut, lieAttr })
 *   pos      the ball centre [x, y, z] (KCL units, as the game has it at address)
 *   heading  the aim (player+0x80: the launch goes along (sin h, cos h)); yaw is added
 *            (the rough / bunker lie yaw, rad)
 *   q        launch power (swing+0x98); blk the club block's constants (clubBlock())
 *   wind     { angle, speedIdx } as fieldManager+0x78 holds it
 *   pin      [x, y, z] the pin (homing, the flagstick); cup [x, y, z] the cup centre
 *   flagIn   the flagstick is in (the ball not on the green)
 *   groundY  the ground the player stands on (the wind's height ramp); default: under pos
 * -> { rest, carry (first contact point), apexY, ticks, outcome: rest | water | valley | ob |
 *      tree | holed | timeout | ticks, restAttr, restLie, touched (attrs met), path (every 4
 *      ticks, trace), cupPass { d, v, tick } (the closest approach to the cup), tree }
 */
export function fly(o) {
  const c = o.course;
  const blk = o.blk ?? clubBlock(o.club);
  const L = launchOf(blk, o.q);
  const h = o.heading + (o.yaw ?? 0);
  const ax = Math.sin(h), az = Math.cos(h);
  let px = o.pos[0], py = o.pos[1], pz = o.pos[2];
  let vx = L.h * ax, vy = L.v, vz = L.h * az;
  const g0 = o.groundY ?? (groundAt(c, px, pz, { yMax: py + 5, mask: CONTACT_MASK })?.y ?? py - BALL_R);
  const W = windVec(o.wind);
  const pin = o.pin ?? null, cup = o.cup ?? pin;
  const lieBunker = o.lieAttr === 3 || o.lieAttr === 16;
  let cx = vx, cz = vz;
  let s98 = L.lift, s9c = o.side ?? 0, bs = o.back ?? 0;
  const spinStart = o.spinStart ?? 0;
  const ctype = blk.type;
  let lifetime = 0;
  const ringA = [0, 0, 0, 0], ringN = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  let ringI = 0;
  let nx = 0, ny = 1, nz = 0, attrMax = 0, attrGround = 0;
  let steerInit = false, Px = 0, Py = 0, Pz = 0;
  let landed = false, stopCount = 0, active = true, outcome = null;
  let vprev = Math.sqrt(vx * vx + vy * vy + vz * vz);
  let qx = px, qy = py, qz = pz;
  let carry = null, apexY = py, firstTick = null;
  const u = new Float64Array(3);
  const hits = HITS;
  const path = o.trace ? [[px, py, pz, 0]] : null;
  let touchedMask = 0;
  let cupPass = null, treeHit = null, bounces = 0, prevAir = true;
  const maxTicks = o.maxTicks ?? 9000;
  const checkTrees = o.trees !== false && c.trees.length > 0;
  const tm = o.treeMargin ?? 0;
  const cupY = cup ? cup[1] + BALL_R : 0;
  while (active && lifetime < maxTicks) {
    lifetime += 1;
    const frame = lifetime >> 2;
    const air = lifetime < 8 || attrMax === 0;
    // 1. lift
    unitInto(u, -vx * vy, vx * vx + vz * vz, -vy * vz);
    let k = vprev * LIFT_K * s98;
    vx += u[0] * k; vy += u[1] * k; vz += u[2] * k;
    s98 *= LIFT_DECAY;
    if (lifetime > spinStart) {
      if (s9c !== 0) {
        unitInto(u, vz, 0, -vx);
        k = vprev * SIDE_K * s9c;
        vx += u[0] * k; vy += u[1] * k; vz += u[2] * k;
        s9c *= SIDE_DECAY;
      }
      if (!air) {
        if (!steerInit && frame > 30) {
          steerInit = true;
          unitInto(u, cx, 0, cz);
          const f29 = Math.min(bs, 0.9);
          const pw = Math.abs(f29) >= 0.001 ? Math.pow(Math.abs(f29), 1.4427 * -Math.log(0.655)) : 0;
          Px = u[0] * (-0.06 * pw); Py = u[1] * (-0.06 * pw); Pz = u[2] * (-0.06 * pw);
        }
        if (Px !== 0 || Py !== 0 || Pz !== 0) {
          const pn = Px * nx + Py * ny + Pz * nz;
          const r0 = Px - nx * pn, r1 = Py - ny * pn, r2 = Pz - nz * pn;
          const m = Math.sqrt(r0 * r0 + r1 * r1 + r2 * r2);
          if (m < FLT_MIN) { Px = 0; Py = 0; Pz = 0; }
          else { const s = Math.sqrt(Px * Px + Py * Py + Pz * Pz) / m; Px = r0 * s; Py = r1 * s; Pz = r2 * s; }
          const a = A_TAB[attrGround];
          const w = 0.7 + 0.19 * (1.0 - Math.min(Math.max(a, 0.15), 1.0)) / 0.85;
          Px *= w; Py *= w; Pz *= w;
          let hh = 1.0;
          if (pin && !lieBunker) {
            const tx = pin[0] - px, tz = pin[2] - pz;
            const cosA = (Px * tx + Pz * tz) / (Math.hypot(Px, Pz) * Math.hypot(tx, tz) || 1);
            const phi = (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;
            hh = 1.3 - (0.3 * (Math.min(Math.max(phi, 5), 30) - 5)) / 25;
          }
          vx += Px * hh; vy += Py * hh; vz += Pz * hh;
        }
      }
    }
    // 4. wind, in the air
    if (W && air) {
      const dh = py - g0;
      const f = Math.min(Math.max(0.1 + 0.9 * dh / 300.0, 0.1), 1.0);
      const W0 = W.x * W.mag0 * f, W2 = W.z * W.mag0 * f;
      unitInto(u, vx, 0, vz);
      const along = W0 * u[0] + W2 * u[2];
      const a740 = u[0] * along, a742 = u[2] * along;
      vx += WIND_K * (WIND_ALONG * a740 + (W0 - a740));
      vz += WIND_K * (WIND_ALONG * a742 + (W2 - a742));
    }
    // 5. gravity along -normalize(0.5 n + 0.5 y)
    unitInto(u, 0.5 * nx, 0.5 * ny + 0.5, 0.5 * nz);
    if (u[0] === 0 && u[1] === 0 && u[2] === 0) { u[0] = 0; u[1] = 1; u[2] = 0; }
    vx -= GRAV * u[0]; vy -= GRAV * u[1]; vz -= GRAV * u[2];
    // 6. integrate, drag
    const ox = px, oz = pz;
    px += vx; py += vy; pz += vz;
    vx *= DRAG; vy *= DRAG; vz *= DRAG;
    if (!air) {
      const d0 = px - qx, d1 = py - qy, d2 = pz - qz;
      if (d0 * d0 + d1 * d1 + d2 * d2 < STOP_V * STOP_V) stopCount += 1; else stopCount = 0;
      if (stopCount > STOP_TICKS) {
        if ((1 << attrMax) & STOP_MASK) { vx = 0; vy = 0; vz = 0; active = false; outcome = "rest"; }
        else { unitInto(u, nx, 0, nz); vx = u[0] * 0.02; vy = 0; vz = u[2] * 0.02; stopCount = 0; }
      }
    }
    if (active && lifetime > MAX_LIFE) { vx = 0; vy = 0; vz = 0; active = false; outcome = "timeout"; }
    // the trees (0x804138a0, after Calc)
    if (checkTrees && active) {
      const th = treeAt(c, px, py, pz, tm);
      if (th) { treeHit = { id: th.tree.id, code: th.code, kind: th.tree.kind, at: [px, py, pz], tick: lifetime, lie: th.tree.lie }; outcome = "tree"; active = false; break; }
    }
    // the flagstick (the ball off the green): a capsule of 0.1 + 0.5 u round the pin's axis
    if (o.flagIn && pin && active) {
      const fx = px - pin[0], fz = pz - pin[2];
      if (fx * fx + fz * fz < 0.36 && py > pin[1] - 1 && py < pin[1] + 60) { outcome = "holed"; active = false; cupPass = { d: Math.sqrt(fx * fx + fz * fz) / YD, v: 0, tick: lifetime, flag: true }; break; }
    }
    // ---- the contact routine ----
    if (active) {
      qx = px; qy = py; qz = pz;
      const nh = query(c, px, py, pz, BALL_R, hits);
      let attrTick = 0, count = 0, hazard = 0;
      let nMin0 = 0, nMin1 = 0, nMin2 = 0, nMax0 = 0, nMax1 = 0, nMax2 = 0;
      let pMin0 = 0, pMin1 = 0, pMin2 = 0, pMax0 = 0, pMax1 = 0, pMax2 = 0;
      let dMin0 = 0, dMin1 = 0, dMin2 = 0, dMax0 = 0, dMax1 = 0, dMax2 = 0;
      const vx0 = vx, vz0 = vz;
      for (let j = 0; j < nh; j++) {
        const at = hits[j].attr;
        if (at === 7 || at === 13) { hazard = at; continue; }
        if (!((1 << at) & CONTACT_MASK)) continue;
        const i = hits[j].i, depth = hits[j].depth;
        const n0 = c.N[3 * i], n1 = c.N[3 * i + 1], n2 = c.N[3 * i + 2];
        count++;
        if (vy < 0.25 && at > attrTick) attrTick = at;
        if (n0 > nMax0) nMax0 = n0; else if (n0 < nMin0) nMin0 = n0;
        if (n1 > nMax1) nMax1 = n1; else if (n1 < nMin1) nMin1 = n1;
        if (n2 > nMax2) nMax2 = n2; else if (n2 < nMin2) nMin2 = n2;
        const pn0 = n0 * depth, pn1 = n1 * depth, pn2 = n2 * depth;
        if (pn0 > pMax0) pMax0 = pn0; else if (pn0 < pMin0) pMin0 = pn0;
        if (pn1 > pMax1) pMax1 = pn1; else if (pn1 < pMin1) pMin1 = pn1;
        if (pn2 > pMax2) pMax2 = pn2; else if (pn2 < pMin2) pMin2 = pn2;
        const vdn = vx * n0 + vy * n1 + vz * n2, vn = -vdn;
        if (vn < 0) continue;
        let A = A_TAB[at], B = B_TAB[at];
        if (!landed && ctype === 1 && (at === 6 || at === 9)) { A = 0.48; B = 0.5; }
        const t0 = vx - n0 * vdn, t1 = vy - n1 * vdn, t2 = vz - n2 * vdn;
        const cap = vn * A, tmag = Math.sqrt(t0 * t0 + t1 * t1 + t2 * t2);
        let tc0 = t0, tc1 = t1, tc2 = t2;
        if (tmag > cap) { tc0 = t0 * (cap / tmag); tc1 = t1 * (cap / tmag); tc2 = t2 * (cap / tmag); }
        if (air && bs > 0) {
          const f = 1.0 - 0.6 * Math.pow(Math.min(Math.max(bs, 0.0), 1.0), Math.log2(1 / 0.6));
          B *= f;
          if (steerInit) bs *= f;
        }
        const dv0 = -(1.0 + B) * n0 * vdn - tc0, dv2 = -(1.0 + B) * n2 * vdn - tc2;
        let dv1 = -(1.0 + B) * n1 * vdn - tc1;
        if (at === 10) dv1 = Math.min(dv1, 0.1);
        if (dv0 > dMax0) dMax0 = dv0; else if (dv0 < dMin0) dMin0 = dv0;
        if (dv1 > dMax1) dMax1 = dv1; else if (dv1 < dMin1) dMin1 = dv1;
        if (dv2 > dMax2) dMax2 = dv2; else if (dv2 < dMin2) dMin2 = dv2;
        s98 = 0; s9c = 0;
        touchedMask |= 1 << at;
      }
      if (hazard) {
        outcome = hazard === 7 ? "water" : "valley";
        active = false;
        if (path) path.push([px, py, pz, lifetime]);
        break;
      }
      if (count > 0) { cx = vx0; cz = vz0; }
      px += pMin0 + pMax0; py += pMin1 + pMax1; pz += pMin2 + pMax2;
      vx += dMin0 + dMax0; vy += dMin1 + dMax1; vz += dMin2 + dMax2;
      if (count > 0) {
        landed = true;
        if (carry == null && lifetime >= 8) { carry = [px, py, pz]; firstTick = lifetime; }
      }
      const r = 3 * ringI;
      ringA[ringI] = attrTick;
      if (count > 0) {
        unitInto(u, nMin0 + nMax0, nMin1 + nMax1, nMin2 + nMax2);
        ringN[r] = u[0]; ringN[r + 1] = u[1]; ringN[r + 2] = u[2];
      } else { ringN[r] = 0; ringN[r + 1] = 1; ringN[r + 2] = 0; }
      ringI = (ringI + 1) & 3;
      vprev = Math.sqrt(vx * vx + vy * vy + vz * vz);
      attrMax = Math.max(ringA[0], ringA[1], ringA[2], ringA[3]);
      const s0 = ringN[0] + ringN[3] + ringN[6] + ringN[9], s1 = ringN[1] + ringN[4] + ringN[7] + ringN[10], s2 = ringN[2] + ringN[5] + ringN[8] + ringN[11];
      if (s0 * s0 + s1 * s1 + s2 * s2 > 1e-18) { unitInto(u, s0, s1, s2); nx = u[0]; ny = u[1]; nz = u[2]; } else { nx = 0; ny = 1; nz = 0; }
      if (!(lifetime < 8 || attrMax === 0)) attrGround = attrMax;
      if (py < c.minY - 100) { outcome = "ob"; active = false; }
    }
    const ia = lifetime < 8 || attrMax === 0;
    if (carry && !ia && prevAir) bounces++;
    prevAir = ia;
    if (carry == null && py > apexY) apexY = py;
    // the cup: the closest approach of the centre on the cup's level
    if (cup) {
      const dx = px - cup[0], dz = pz - cup[2];
      if (dx > -30 && dx < 30 && dz > -30 && dz < 30 && py - cupY < 2 && py - cupY > -2) {
        const v = (Math.sqrt(vx * vx + vz * vz) * 240) / YD;
        let d = Math.sqrt(dx * dx + dz * dz) / YD;
        const sx = px - ox, sz = pz - oz, L2 = sx * sx + sz * sz;
        if (L2 > 0) {
          const f = Math.min(1, Math.max(0, ((cup[0] - ox) * sx + (cup[2] - oz) * sz) / L2));
          const ex = ox + f * sx - cup[0], ez = oz + f * sz - cup[2];
          d = Math.min(d, Math.sqrt(ex * ex + ez * ez) / YD);
        }
        if (!cupPass || d < cupPass.d) cupPass = { d, v, tick: lifetime };
        if (o.holeOut !== false && d <= cupWindow(v) && v < V_CAP) { outcome = "holed"; active = false; cupPass = { d, v, tick: lifetime }; }
      }
    }
    if (path && (lifetime % 4 === 0 || !active)) path.push([px, py, pz, lifetime]);
  }
  if (active) outcome = "ticks";
  let restAttr = attrMax;
  if (!restAttr || outcome !== "rest") { const g = groundAt(c, px, pz, { yMax: py + 2, mask: CONTACT_MASK | (1 << 7) | (1 << 13) }); restAttr = g ? g.attr : 0; }
  const touched = [];
  for (let a = 0; a < 17; a++) if (touchedMask & (1 << a)) touched.push(a);
  return {
    rest: [px, py, pz], carry: carry ?? [px, py, pz], apexY, ticks: lifetime, outcome, restAttr, restLie: ATTR_NAME[restAttr] ?? String(restAttr),
    touched, path, cupPass, tree: treeHit, bounces, firstTick, groundY: g0,
  };
}

// along / across a heading from a point (yd): + across = right of the line
export function alongAcross(from, heading, p) {
  const ax = Math.sin(heading), az = Math.cos(heading);
  const dx = p[0] - from[0], dz = p[2] - from[2];
  return { along: (dx * ax + dz * az) / YD, across: (dx * -az + dz * ax) / YD };
}
