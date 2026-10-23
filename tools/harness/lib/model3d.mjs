// WSR's golf ball in 3D over the course's own KCL prisms, for planning the
// strokes of a natural round (round-planner.mjs): predict() flies one stroke
// from where the ball lies, the way the game will, and says where it comes
// to rest, on what, and whether it met water, a valley, out of bounds, a tree
// or the flagstick on the way. It began as a copy of round-sim.mjs (src/
// wsrsim.js run()'s tick, the port of tools/research/wsr-groundsim.py, taken
// from a line profile onto the KCL itself) and fixes what round-eval.mjs and
// WSR's own traced flights showed (state/raw/*.json; main.dol read where a
// decode was missing or wrong):
// - the first tick has no lift: the lift scales with ball+0x94, the speed the
//   post-tick left, 0 for a ball at rest (round-sim.mjs and src/wsrsim.js
//   start it at |v0|: their flights ran 0.03-0.07 yd high at the apex and up to
//   1.1 u high by the landing; the hand-off velocities of seven traced WSR
//   shots now agree to 2e-6 u/tick);
// - the wind's height ramp counts from the ball's own height at address, not
//   from the ground under it (four traced flights in a 4 mph headwind: from
//   the ground they drifted 0.2 u off by the landing, from the ball 0.005);
// - the lie yaw: from rough or a bunker WSR launches 2.000 deg to the RIGHT of
//   the aim when the swing has no curve, as the harness's has none
//   (wsr-swing-redzone-spin.md 4.1: yaw = sign(curve)(lo + ...), lo = 2 deg
//   for both lies); every logged rough shot rested 1.6-3.7 deg right of a
//   straight flight, 0.0-0.3 yd with the yaw;
// - the trees respond as WSR's 0x804138a0 does instead of ending the flight:
//   a trunk (code 1) bounces the ball through the object response 0x80413648
//   (pushed out, the normal flattened, its component reversed x 0.5, the
//   tangential capped at 0.5 vn, lift, side spin and backspin zeroed); a
//   canopy (codes 2, 3) multiplies the velocity by 0.98 every tick the ball is
//   inside it, palm fronds (4) by 0.94, a slow ball (|v| <= 0.8 u/tick) only on
//   ticks whose lifetime mod 60 < 12; one response a tick, the dispatcher's
//   first trunk or else its last canopy (wsr-tree-collision.md 1). The trees
//   are the PMP's own objects (position, both scales, the palms' rotation)
//   read from the course archive, else tools/wsr-pins.json through the
//   registration (0.2-0.3 u off); the palm is WSR's own collision mesh
//   (WS2_glf_tree3.kcl from common.carc) queried in the tree's frame as
//   0x803f3194 does, else an approximate trunk and frond slab;
// - the flagstick (0x80413350, read from main.dol): the tick's path swept in
//   quarter-steps against the pole, a capsule of 0.6 u round the pin's axis 30
//   u either side of its base, and the ball bounced off it through 0x80413648
//   with the normal component reversed x 0.7 and the tangential capped at
//   e vn, e = clamp(0.299 sgnpow(1 - 2 vn) + 0.001, 0.001, 0.3) (round-sim.mjs
//   holed every ball that reached it; rounds 1 and 6 rolled into the pin and
//   finished 2.0 and 3.6 yd short); no capture until the ball has left the
//   cup's rim after a pole hit; a ball at rest inside the rim is holed. The
//   pin's box test 0x80413020 (90 % of the tangential speed killed, the ball
//   dragged onto the pole) is not modelled: its frame is the pin object's,
//   which two rolling balls that reached the pole never met, so it belongs to
//   the flag up the pole;
// - the course is the KCL file itself (WS2_glf_course_<id>.kcl from the
//   extracted disc, else the wszst OBJ export): its stored float32 normals,
//   edge normals and heights and its prism thickness (5 u in every course
//   file, where round-sim.mjs took 8), KColData's sphere test with its edge
//   and corner cases; on the course named "fcJP19" (hole 20) a rock wall's
//   normal with y under sin 63 deg has y x 0.25, renormalised (0x80412508);
// - the club blocks are WSR's own (P00 read from RAM: driver 0.02, spoon
//   0.01834, 3i 0.02258, 5i 0.02, 7i 0.01676, 9i 0.01286, wedge 0.01);
// - out of bounds as the contact routine flags it: the dead floor (attr 5) the
//   first surface under the ball, or the ball 100 u below the course; a rest on
//   outer ground (attr 4) counts as out of bounds; water and valley prisms
//   touched end the stroke (the game drops the ball: drop = ball+0xd0, the last
//   ground under the ball that was not water or a wall);
// - a water triangle lying level inside a green or fringe (H4, H8, H19) is
//   green (lib/kclputt.mjs: WSR's ball rolls over them).
// Not modelled: the KCL's octree (every prism near the ball is tested, as the
// octree's leaves hold them), the cup's own geometry (src/putt.js's measured
// capture window on the path stands in), spin a real swing would give (the
// harness's swing gives none), float32 arithmetic. Where a stroke's outcome
// forks (a ball that just clears or just catches a bunker lip, a bank, a
// canopy's edge) a 0.002 change of power or a few hundredths of a degree pick
// the branch; predictSpread() flies the neighbours so a planner can prefer
// strokes whose rest does not depend on them.
//
//   predict({ hole, ball, heading, club, power, lie, wind, pin })
//     -> { carry, rest: [x, z], restY, restLie, along, lateral, hazard, hazardName,
//          holed, tree, flag, drop, outcome, ticks, ms, toPin }
//   predictSpread(args, { dPower, dHeadingDeg }) -> predict()'s answer plus
//     { spread (yd: the farthest neighbour's rest from it), neighbours }
// positions in KCL units (x east, y up, z south), distances in yd.
// the physics only (no Node): round-model.mjs adds the loaders that read the
// disc (the KCL, the PMP trees, the palm) and re-exports all of this; the
// browser (src/live3d.worker.js) registers courses built from public/course3d
import * as P from "../../../src/putt.js";

export const YD = 9.144;
const cupWindow = P.cupWindow, V_CAP = P.V_CAP;

const A_TAB = [0.3, 0.4, 0.5, 1.0, 0.7, 1.0, 0.15, 1.0, 1.0, 0.3, 0.001, 0.3, 0.3, 1.0, 0.1, 0.4, 1.0];
const B_TAB = [0.5, 0.5, 0.4, 0.001, 0.3, 0.001, 0.5, 0.001, 0.001, 0.5, 0.13, 0.5, 0.5, 0.001, 0.5, 0.5, 0.001];
// the contact routine's mask 0x1de5e without 14 ("glass": hole 1's pond
// surface, which WSR's balls sank through in the 2a sweep)
const CONTACT_MASK = 0x1de5e & ~(1 << 14);
const STOP_MASK = 0x1ce5e;
const HAZ_MASK = (1 << 7) | (1 << 13);
const LIFT_K = 0.0012, LIFT_DECAY = 0.9985, SIDE_K = 0.001, SIDE_DECAY = 0.999;
const GRAV = 0.002, DRAG = 0.999, BALL_R = 0.5;
const STOP_V = 0.0015, STOP_TICKS = 20, MAX_LIFE = 0x1c20;
const WIND_K = 8e-5, WIND_ALONG = 0.6;
const FLT_MIN = 1.17549435e-38;
export const CELL = 16;   // u: the prisms' XZ grid (each prism in every cell its box + 1 u meets)
const TCELL = 64;         // u: the trees' grid
export const LIE_YAW_DEG = 2;   // rough and bunker, a swing without curve

export const ATTR_NAME = { 0: "none", 1: "fairway", 2: "rough", 3: "bunker", 4: "ob", 5: "ob2", 6: "green", 7: "water", 8: "wood",
  9: "fringe", 10: "green", 11: "green", 12: "wall", 13: "valley", 14: "glass", 15: "tee", 16: "bunker" };
export const HAZARD_NAME = { 0: null, 1: "water", 2: "ob", 3: "valley" };

// the club blocks as WSR holds them in RAM (clubManager +0xc + 4k -> +0x18;
// read on hole 1 of round 1, state/round18-test-objs.json): P00 / P04 launch
// speed at power 0 / 1 (u/tick), P10 launch angle (deg), P14 lift, P38 the
// speed curve's half-power point, type 0 wood / 1 iron / 2 wedge
const f = Math.fround;
export const BLOCKS = {
  driver: { type: 0, p00: f(0.02), p04: f(3.39), angle: 10, lift: f(0.65), p38: f(0.71) },
  spoon: { type: 0, p00: f(0.01834), p04: f(3.13), angle: 11, lift: f(0.7), p38: f(0.708) },
  "3iron": { type: 1, p00: f(0.02258), p04: f(2.79), angle: 19, lift: 0.5, p38: f(0.67) },
  "5iron": { type: 1, p00: f(0.02), p04: f(2.45), angle: 23, lift: 0.5, p38: f(0.66) },
  "7iron": { type: 1, p00: f(0.01676), p04: f(2.13), angle: 24, lift: 0.5, p38: f(0.665) },
  "9iron": { type: 1, p00: f(0.01286), p04: f(1.78), angle: 30, lift: 0.5, p38: f(0.66) },
  wedge: { type: 2, p00: f(0.01), p04: f(1.28), angle: 43, lift: 0, p38: f(0.64) },
  putter: { type: 3, p00: f(0.004), p04: f(0.41), angle: 0, lift: 0, p38: f(0.63) },
};
export const CLUB_NAMES = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge", "putter"];
export function launchOf(blk, q) {
  const s = q > 0 ? Math.pow(q, Math.log2(1.0 / blk.p38)) : 0;
  const speed = blk.p00 + s * (blk.p04 - blk.p00);
  const th = (blk.angle * Math.PI) / 180;
  return { h: Math.cos(th) * speed, v: Math.sin(th) * speed, lift: blk.lift * s, speed };
}

// ---- KCL ----
// header: +0 vertex data, +4 normal data, +8 prism data (- 0x10: prisms are
// 1-based), +0xc octree, +0x10 prism thickness; a prism is 0x10 bytes:
// height, then u16 vertex, face normal, three edge normals, flag (type = flag & 0x1f)
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// the prism's triangle (wiki.tockdom.com KCL): v1 = p, v2 = p + cb h / (cb . e3), v3 = p + ca h / (ca . e3)
export function prismTri(q) {
  const ca = cross(q.e1, q.fn), cb = cross(q.e2, q.fn);
  const kb = q.h / dot(cb, q.e3), ka = q.h / dot(ca, q.e3);
  return [q.p[0], q.p[1], q.p[2], q.p[0] + cb[0] * kb, q.p[1] + cb[1] * kb, q.p[2] + cb[2] * kb, q.p[0] + ca[0] * ka, q.p[1] + ca[1] * ka, q.p[2] + ca[2] * ka];
}

// the embedded water of a green: water triangles sharing two vertices with
// the green or fringe at their height (lib/kclputt.mjs embeddedWater)
function embeddedWater(prisms) {
  const gv = new Map(), s = new Set();
  for (const q of prisms) if (q.attr === 6 || q.attr === 9) for (let k = 0; k < 3; k++) gv.set(`${q.tri[3 * k].toFixed(1)},${q.tri[3 * k + 2].toFixed(1)}`, q.tri[3 * k + 1]);
  prisms.forEach((q, i) => {
    if (q.attr !== 7) return;
    let shared = 0;
    for (let k = 0; k < 3; k++) { const v = gv.get(`${q.tri[3 * k].toFixed(1)},${q.tri[3 * k + 2].toFixed(1)}`); if (v != null && Math.abs(v - q.tri[3 * k + 1]) < 1.5) shared++; }
    if (shared >= 2) s.add(i);
  });
  return s;
}

// ---- the course: prisms in flat arrays and an XZ grid ----
const courses = new Map();
const KEEP_MASK = CONTACT_MASK | HAZ_MASK | (1 << 5) | (1 << 14);
export function packPrisms(prisms, thick) {
  const keep = prisms.filter((q) => ((1 << q.attr) & KEEP_MASK) && [q.h, ...q.p, ...q.fn, ...q.e1, ...q.e2, ...q.e3].every(Number.isFinite));
  const n = keep.length;
  const PV = new Float64Array(3 * n), FN = new Float64Array(3 * n), E1 = new Float64Array(3 * n), E2 = new Float64Array(3 * n), E3 = new Float64Array(3 * n);
  const H = new Float64Array(n), TRI = new Float64Array(9 * n), attr = new Uint8Array(n);
  for (const q of keep) q.tri ??= prismTri(q);
  const emb = embeddedWater(keep);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
  keep.forEach((q, i) => {
    for (let c = 0; c < 3; c++) { PV[3 * i + c] = q.p[c]; FN[3 * i + c] = q.fn[c]; E1[3 * i + c] = q.e1[c]; E2[3 * i + c] = q.e2[c]; E3[3 * i + c] = q.e3[c]; }
    for (let c = 0; c < 9; c++) TRI[9 * i + c] = q.tri[c];
    H[i] = q.h;
    attr[i] = emb.has(i) ? 6 : q.attr;
    for (let k = 0; k < 3; k++) {
      const x = q.tri[3 * k], y = q.tri[3 * k + 1], z = q.tri[3 * k + 2];
      if (q.attr !== 5) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); minY = Math.min(minY, y); }
    }
  });
  // the grid spans the course (the dead floor reaches far past it; past the
  // grid only the floor is under a ball)
  const gx0 = Math.floor(minX / CELL) - 2, gz0 = Math.floor(minZ / CELL) - 2;
  const gw = Math.floor(maxX / CELL) + 3 - gx0, gh = Math.floor(maxZ / CELL) + 3 - gz0;
  const counts = new Int32Array(gw * gh + 1), spans = new Int32Array(4 * n);
  for (let i = 0; i < n; i++) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) { const x = TRI[9 * i + 3 * k], z = TRI[9 * i + 3 * k + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const a0 = Math.max(0, Math.floor((x0 - 1) / CELL) - gx0), a1 = Math.min(gw - 1, Math.floor((x1 + 1) / CELL) - gx0);
    const b0 = Math.max(0, Math.floor((z0 - 1) / CELL) - gz0), b1 = Math.min(gh - 1, Math.floor((z1 + 1) / CELL) - gz0);
    spans[4 * i] = a0; spans[4 * i + 1] = a1; spans[4 * i + 2] = b0; spans[4 * i + 3] = b1;
    for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) counts[b * gw + a + 1]++;
  }
  for (let k = 1; k <= gw * gh; k++) counts[k] += counts[k - 1];
  const cells = new Int32Array(counts[gw * gh]), fill = counts.slice();
  for (let i = 0; i < n; i++) for (let a = spans[4 * i]; a <= spans[4 * i + 1]; a++) for (let b = spans[4 * i + 2]; b <= spans[4 * i + 3]; b++) cells[fill[b * gw + a]++] = i;
  return { n, PV, FN, E1, E2, E3, H, TRI, attr, thick, start: counts, cells, gx0, gz0, gw, gh, minY, bounds: { minX, maxX, minZ, maxZ } };
}

// ---- the trees ----
// WSR's analytic shapes (wsr-tree-collision.md 1), KCL units at scale 1:
// radii x sx, heights x sy; reject = the dispatcher's horizontal gate (+0x10)
export const TREE_SHAPE = {
  2: { reject: 48, trunkR: 6, trunkH: 60, cy: 100, r: 48 },               // broadleaf: capsule, sphere
  3: { reject: 30, trunkR: 4.4, trunkH: 70, y0: 40, r0: 30, hc: 130 },     // conifer: capsule, cone
  6: { reject: 80, broadR: 15, broadH: 80, broadCy: 120, broadSr: 80, trunkR: 7, trunkH: 132, y0: 76, y1: 170, r: 70 },   // palm
};

function treeGrid(trees) {
  const g = new Map();
  for (const t of trees) {
    const S = TREE_SHAPE[t.kind];
    t.S = S;
    const R = S.reject * t.sx + 2;
    t.R = R;
    for (let gx = Math.floor((t.x - R) / TCELL); gx <= Math.floor((t.x + R) / TCELL); gx++)
      for (let gz = Math.floor((t.z - R) / TCELL); gz <= Math.floor((t.z + R) / TCELL); gz++) {
        const k = gx * 100003 + gz;
        let a = g.get(k);
        if (!a) g.set(k, (a = []));
        a.push(t);
      }
  }
  return g;
}

// a few holes stay loaded (8-20 MB each); the oldest goes first. A course
// comes from the loader the environment sets (round-model.mjs: the disc's KCL
// or the OBJ rips) or is registered whole (the browser's, from public/course3d)
const KEEP_COURSES = 3;
let LOADER = null;
export function setCourseLoader(fn) { LOADER = fn; }
export function registerCourse(hole, c) {
  courses.delete(hole);
  while (courses.size >= KEEP_COURSES) courses.delete(courses.keys().next().value);
  courses.set(hole, c);
  return c;
}
export function loadCourse(hole) {
  if (courses.has(hole)) { const c = courses.get(hole); courses.delete(hole); courses.set(hole, c); return c; }
  if (!LOADER) throw new Error(`no course for hole ${hole}: none registered, no loader set`);
  return registerCourse(hole, LOADER(hole));
}
// a course from its prisms as the KCL holds them ({ h, p, fn, e1, e2, e3, attr }),
// the hole's trees and the palm's mesh (false when the hole has no palm)
export function packCourse(prisms, thick, { hole, id, src = null, trees = [], palm = false }) {
  const c = packPrisms(prisms, thick);
  c.hole = hole; c.src = src;
  // the contact routine's normal (0x80412508-0x8041254c): on the course named
  // "fcJP19" (hole 20) a rock wall (12) whose normal's y is under sin 63 deg
  // (nw4r's SinFIdx(44.8)) has it x 0.25, renormalised; the face normal everywhere else
  c.CN = Float64Array.from(c.FN);
  if (id === "fcJP19") for (let i = 0; i < c.n; i++) {
    if (c.attr[i] !== 12 || !(c.FN[3 * i + 1] < Math.sin((63 * Math.PI) / 180))) continue;
    const x = c.FN[3 * i], y = c.FN[3 * i + 1] * 0.25, z = c.FN[3 * i + 2], m = Math.hypot(x, y, z);
    c.CN[3 * i] = x / m; c.CN[3 * i + 1] = y / m; c.CN[3 * i + 2] = z / m;
  }
  c.trees = trees;
  c.treeGrid = treeGrid(c.trees);
  c.palm = palm;
  return c;
}
export function dropCourse(hole) { courses.delete(hole); }

// ---- KColData's sphere test (MKWii's KColData::checkSphereCollision) ----
// the prism i of pack k against a sphere at (x, y, z) radius r: the depth of
// the push-out along the face normal, or 0
function prismDepth(k, i, x, y, z, r) {
  const o = 3 * i, PV = k.PV;
  const rx = x - PV[o], ry = y - PV[o + 1], rz = z - PV[o + 2];
  const E1 = k.E1, E2 = k.E2, E3 = k.E3, FN = k.FN;
  const dca = rx * E1[o] + ry * E1[o + 1] + rz * E1[o + 2];
  if (dca >= r) return 0;
  const dab = rx * E2[o] + ry * E2[o + 1] + rz * E2[o + 2];
  if (dab >= r) return 0;
  const dbc = rx * E3[o] + ry * E3[o + 1] + rz * E3[o + 2] - k.H[i];
  if (dbc >= r) return 0;
  const pd = rx * FN[o] + ry * FN[o + 1] + rz * FN[o + 2];
  const din = r - pd;
  if (din <= 0 || din >= k.thick) return 0;
  if (dab <= 0 && dbc <= 0 && dca <= 0) return din;
  // outside an edge: the edge furthest out and the next one
  let ed, od, ea, eb;
  if (dab >= dca && dab > dbc) { ed = dab; ea = E2; if (dca >= dbc) { od = dca; eb = E1; } else { od = dbc; eb = E3; } }
  else if (dbc >= dca) { ed = dbc; ea = E3; if (dab >= dca) { od = dab; eb = E2; } else { od = dca; eb = E1; } }
  else { ed = dca; ea = E1; if (dbc >= dab) { od = dbc; eb = E3; } else { od = dab; eb = E2; } }
  const cs = ea[o] * eb[o] + ea[o + 1] * eb[o + 1] + ea[o + 2] * eb[o + 2];
  let sq;
  if (cs * ed > od) sq = r * r - ed * ed;
  else sq = r * r - (ed * ed + od * od - 2 * ed * od * cs) / (1 - cs * cs);
  if (sq < pd * pd || sq < 0) return 0;
  const d = Math.sqrt(sq) - pd;
  return d > 0 ? d : 0;
}

// the prisms touching the ball (r 0.5): one grid cell holds them all
const HITS_I = new Int32Array(32), HITS_D = new Float64Array(32);
function query(c, x, y, z) {
  const ga = Math.floor(x / CELL) - c.gx0, gb = Math.floor(z / CELL) - c.gz0;
  if (ga < 0 || gb < 0 || ga >= c.gw || gb >= c.gh) return 0;
  const cell = gb * c.gw + ga;
  let n = 0;
  for (let j = c.start[cell], j1 = c.start[cell + 1]; j < j1; j++) {
    const i = c.cells[j];
    const d = prismDepth(c, i, x, y, z, BALL_R);
    if (d > 0 && n < 32) { HITS_I[n] = i; HITS_D[n] = d; n++; }
  }
  return n;
}
// any prism with an attribute in mask within r of (x, y, z) (several cells; r up to CELL)
function anyWithin(c, x, y, z, r, mask) {
  const a0 = Math.floor((x - r) / CELL) - c.gx0, a1 = Math.floor((x + r) / CELL) - c.gx0, b0 = Math.floor((z - r) / CELL) - c.gz0, b1 = Math.floor((z + r) / CELL) - c.gz0;
  let found = 0;
  for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) {
    if (a < 0 || b < 0 || a >= c.gw || b >= c.gh) continue;
    const cell = b * c.gw + a;
    for (let j = c.start[cell], j1 = c.start[cell + 1]; j < j1; j++) {
      const i = c.cells[j];
      if (!((1 << c.attr[i]) & mask)) continue;
      if (prismDepth(c, i, x, y, z, r) > 0) { if (c.attr[i] === 1) return 1; found = c.attr[i]; }
    }
  }
  return found;
}

// the highest surface under (x, z) below yMax with an attribute in mask
// (default: the contacts, water, valley and the dead floor): { y, attr, i } or null
export function groundAt(c, x, z, { yMax = Infinity, mask = KEEP_MASK } = {}) {
  const ga = Math.floor(x / CELL) - c.gx0, gb = Math.floor(z / CELL) - c.gz0;
  if (ga < 0 || gb < 0 || ga >= c.gw || gb >= c.gh) return null;
  const cell = gb * c.gw + ga;
  let best = null;
  for (let j = c.start[cell], j1 = c.start[cell + 1]; j < j1; j++) {
    const i = c.cells[j], o = 9 * i, T = c.TRI;
    if (!((1 << c.attr[i]) & mask)) continue;
    if (c.FN[3 * i + 1] < 1e-6) continue;
    const ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-5 || l2 < -1e-5 || l3 < -1e-5) continue;
    const y = l1 * T[o + 1] + l2 * T[o + 4] + l3 * T[o + 7];
    if (y > yMax) continue;
    if (!best || y > best.y) best = { y, attr: c.attr[i], i };
  }
  return best;
}

// ---- the tree check (0x804138a0 after Calc): the dispatcher's first trunk, else its last canopy ----
const TH = { code: 0, nx: 0, ny: 0, nz: 0, depth: 0, tree: null };
// capsule (0x803f2340): xz distance d, height dy over the base, radius R, half-height Hh
function capsule(dx, dy, dz, R, Hh) {
  const rr = BALL_R + R, d2 = dx * dx + dz * dz;
  if (d2 > rr * rr) return false;
  if (Math.abs(dy) <= Hh) {
    const d = Math.sqrt(d2);
    if (d > 1e-9) { TH.nx = dx / d; TH.ny = 0; TH.nz = dz / d; } else { TH.nx = 1; TH.ny = 0; TH.nz = 0; }
    TH.depth = rr - d;
    return true;
  }
  const ey = dy > 0 ? dy - Hh : dy + Hh, L = Math.sqrt(d2 + ey * ey);
  if (L > rr) return false;
  if (L > 1e-9) { TH.nx = dx / L; TH.ny = ey / L; TH.nz = dz / L; } else { TH.nx = 0; TH.ny = 1; TH.nz = 0; }
  TH.depth = rr - L;
  return true;
}
// the palm (0x803f3194): the broad phase, then its own mesh in the tree's frame
function palmCode(c, t, dx, dy, dz) {
  const S = t.S;
  const broad = capsule(dx, dy, dz, S.broadR * t.sx, S.broadH * t.sy) || (dx * dx + (dy - S.broadCy * t.sy) ** 2 + dz * dz <= (BALL_R + S.broadSr * t.sx) ** 2);
  if (!broad) return 0;
  const K = c.palm;
  if (!K || !t.M) {
    if (capsule(dx, dy, dz, S.trunkR * t.sx, S.trunkH * t.sy)) return 1;
    if (dy >= S.y0 * t.sy && dy <= S.y1 * t.sy && dx * dx + dz * dz <= (S.r * t.sx) ** 2) return 4;
    return 0;
  }
  // local = M (ball - pos) / scale (M is symmetric and orthogonal in the PMP)
  const M = t.M;
  const lx = (M[0] * dx + M[1] * dy + M[2] * dz) / t.sx, ly = (M[3] * dx + M[4] * dy + M[5] * dz) / t.sy, lz = (M[6] * dx + M[7] * dy + M[8] * dz) / t.sz;
  const r = BALL_R / Math.hypot(t.sx, t.sy, t.sz);
  let best = 0, bi = -1;
  for (let i = 0; i < K.n; i++) {
    const d = prismDepth(K, i, lx, ly, lz, r);
    if (d <= 0) continue;
    if (K.attr[i] === 0x12) return 4;
    if (d > best) { best = d; bi = i; }
  }
  if (bi < 0) return 0;
  // the trunk's normal rotated back into the world, the depth x |scale|
  const n0 = K.FN[3 * bi], n1 = K.FN[3 * bi + 1], n2 = K.FN[3 * bi + 2];
  const wx = M[0] * n0 + M[3] * n1 + M[6] * n2, wy = M[1] * n0 + M[4] * n1 + M[7] * n2, wz = M[2] * n0 + M[5] * n1 + M[8] * n2;
  const L = Math.hypot(wx, wy, wz) || 1;
  TH.nx = wx / L; TH.ny = wy / L; TH.nz = wz / L; TH.depth = best * Math.hypot(t.sx, t.sy, t.sz);
  return 1;
}
function treeCheck(c, px, py, pz) {
  TH.code = 0; TH.tree = null;
  const a = c.treeGrid.get(Math.floor(px / TCELL) * 100003 + Math.floor(pz / TCELL));
  if (!a) return 0;
  let code = 0, tree = null, nx = 0, ny = 0, nz = 0, depth = 0;
  for (let j = 0; j < a.length; j++) {
    const t = a[j], S = t.S;
    const dx = px - t.x, dz = pz - t.z;
    const lim = S.reject * t.sx + BALL_R;
    if (dx * dx + dz * dz > lim * lim) continue;
    const dy = py - t.base;
    let k = 0;
    if (t.kind === 2) {
      // the 6 sx + 3 gate: inside it only the trunk is tested
      if (capsule(dx, dy, dz, S.trunkR * t.sx + 3, S.trunkH * t.sy)) k = capsule(dx, dy, dz, S.trunkR * t.sx, S.trunkH * t.sy) ? 1 : 0;
      else { const ey = dy - S.cy * t.sy, R = S.r * t.sx + BALL_R; if (dx * dx + ey * ey + dz * dz <= R * R) k = 2; }
    } else if (t.kind === 3) {
      if (capsule(dx, dy, dz, S.trunkR * t.sx, S.trunkH * t.sy)) k = 1;
      else { const h = dy - S.y0 * t.sy, Hc = S.hc * t.sy; if (h >= 0 && h <= Hc) { const rr = S.r0 * t.sx * (1 - h / Hc); if (dx * dx + dz * dz <= rr * rr) k = 3; } }
    } else if (t.kind === 6) k = palmCode(c, t, dx, dy, dz);
    if (k) {
      code = k; tree = t;
      if (k === 1) { nx = TH.nx; ny = TH.ny; nz = TH.nz; depth = TH.depth; break; }
    }
  }
  TH.code = code; TH.tree = tree; TH.nx = nx; TH.ny = ny; TH.nz = nz; TH.depth = depth;
  return code;
}

// the flagstick's pole (0x803ffe30 -> 0x803f2340): 0.1 u + the ball's 0.5,
// a cylinder 30 u either side of the pin's base with spherical caps
const POLE = { nx: 0, ny: 0, nz: 0, depth: 0 };
function pole(pin, x, y, z) {
  const dx = x - pin[0], dz = z - pin[2], d2 = dx * dx + dz * dz;
  if (d2 > 0.36) return false;
  const dy = y - pin[1];
  if (dy * dy < 900) {
    const d = Math.sqrt(d2);
    if (d > 1e-9) { POLE.nx = dx / d; POLE.nz = dz / d; } else { POLE.nx = 1; POLE.nz = 0; }
    POLE.ny = 0; POLE.depth = 0.6 - d;
    return true;
  }
  const ey = dy > 0 ? dy - 30 : dy + 30, L = Math.sqrt(d2 + ey * ey);
  if (L > 0.6) return false;
  if (L > 1e-9) { POLE.nx = dx / L; POLE.ny = ey / L; POLE.nz = dz / L; } else { POLE.nx = 0; POLE.ny = 1; POLE.nz = 0; }
  POLE.depth = 0.6 - L;
  return true;
}

function unitInto(u, a0, a1, a2) {
  const m = Math.sqrt(a0 * a0 + a1 * a1 + a2 * a2);
  if (m > FLT_MIN) { u[0] = a0 / m; u[1] = a1 / m; u[2] = a2 / m; } else { u[0] = 0; u[1] = 0; u[2] = 0; }
}

// The wind as WSR's field holds it: { angle (rad, dir * pi/4) or dir, speedIdx }
export const windVec = (w) => {
  if (!w || !(w.speedIdx > 0)) return null;
  const a = w.angle ?? (w.dir * Math.PI) / 4;
  return { x: Math.sin(a), z: Math.cos(a), mag0: 15.0 * Math.pow(w.speedIdx / 15.0, Math.log2(1 / 0.6)) };
};
export const lieYaw = (lie) => (lie === 2 || lie === 3 || lie === 16 ? (-LIE_YAW_DEG * Math.PI) / 180 : 0);

/**
 * fly({ course, pos, heading, club, q, blk, wind, back, side, spinStart, yaw, pin, flagIn,
 *       groundY, maxTicks, trace, trees, lieAttr, treeResponse })
 *   pos      the ball centre [x, y, z] at address (KCL units)
 *   heading  the aim (player+0x80: the launch goes along (sin h, cos h)) and yaw added to it
 *            (lieYaw(lie): -2 deg from rough or a bunker)
 *   q        launch power (swing+0x98); blk the club block (BLOCKS[club])
 *   wind     { angle | dir, speedIdx } as fieldManager+0x78 holds it
 *   pin      [x, y, z] the pin: the pull-back's homing, the flagstick, the cup
 *   flagIn   the flagstick is in (the ball is not on the green)
 * -> { rest, carry, apexY, ticks, outcome: rest | water | valley | ob | holed | timeout | ticks,
 *      hazard (0, 1 water, 2 ob, 3 valley), restAttr, restLie, tree (the first met), trees,
 *      drop, path, cupPass, bounces }
 */
export function fly(o) {
  const c = o.course;
  const blk = o.blk ?? BLOCKS[o.club];
  const L = launchOf(blk, o.q);
  const h = o.heading + (o.yaw ?? 0);
  const ax = Math.sin(h), az = Math.cos(h);
  let px = o.pos[0], py = o.pos[1], pz = o.pos[2];
  let vx = L.h * ax, vy = L.v, vz = L.h * az;
  // the wind's height ramp counts from the ball's own height at address
  // (four traced WSR flights in a headwind: f = 0.0971 + 0.003 dh over the
  // ground under the ball, i.e. dh from 0.97 u up, where the tee ball sat 0.95 u
  // over the ground; src/wsrsim.js counts from the ground, 0.5 u below its ball)
  const g0 = o.groundY ?? py;
  // o.state0 = { life, vel, lift, vprev } continues a flight from a known state
  // (a traced hand-off: tools/harness/state/raw/*.json), the ball in the air
  const S0 = o.state0 ?? null;
  if (S0) { [vx, vy, vz] = S0.vel; }
  const W = windVec(o.wind);
  const pin = o.pin ?? null, cup = o.cup ?? pin;
  const lieBunker = o.lieAttr === 3 || o.lieAttr === 16;
  let cx = vx, cz = vz;
  let s98 = S0 ? S0.lift : L.lift, s9c = o.side ?? 0, bs = o.back ?? 0;
  const spinStart = o.spinStart ?? 0;
  const ctype = blk.type;
  let lifetime = S0 ? S0.life : 0;
  const ringA = [0, 0, 0, 0], ringN = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  let ringI = 0;
  let nx = 0, ny = 1, nz = 0, attrMax = 0, attrGround = 0;
  let steerInit = false, Px = 0, Py = 0, Pz = 0;
  let landed = false, stopCount = 0, active = true, outcome = null, hazard = 0;
  // the lift reads the speed the post-tick left in ball+0x94: 0 for a ball at
  // rest, so the first tick has no lift (the hand-off states of seven traced
  // WSR shots agree to 2e-6 u/tick this way, against 0.0007-0.0026 in v.y
  // with |v0| as src/wsrsim.js and round-sim.mjs start it)
  let vprev = S0 ? S0.vprev ?? Math.sqrt(vx * vx + vy * vy + vz * vz) : o.vprev0 ?? 0;
  let qx = px, qy = py, qz = pz;
  let carry = null, apexY = py;
  const u = new Float64Array(3);
  const path = o.trace ? [[px, py, pz, 0]] : null;
  let cupPass = null, bounces = 0, prevAir = true;
  let firstTree = null;
  const treesMet = o.trace ? [] : null;
  let drop = null;
  const maxTicks = o.maxTicks ?? 9000;
  const checkTrees = o.trees !== false && c.trees.length > 0;
  const cupY = cup ? cup[1] + BALL_R : 0;
  let flagHit = null, cupAfterFlag = false;
  // 0x80413648(ball, n, 1, depth, R, C): pushed out along n by depth, n
  // flattened (y = 0), the normal component reversed x R when approaching, the
  // tangential capped at C vn, lift, side spin and backspin zeroed
  const objectResponse = (n, depth, R, C) => {
    px += n[0] * depth; py += n[1] * depth; pz += n[2] * depth;
    let fx = n[0], fz = n[2];
    const fl = Math.hypot(fx, fz);
    if (fl > 1e-9) { fx /= fl; fz /= fl; } else { fx = 0; fz = 0; }
    const vdn = vx * fx + vz * fz, vn = -vdn;
    let nx0 = fx * vdn, nz0 = fz * vdn;
    let tx = vx - nx0, ty = vy, tz = vz - nz0;
    if (vn > 0) { nx0 *= -R; nz0 *= -R; }
    const cap = vn * C, tm = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (cap < tm) { const sc = cap / tm; tx *= sc; ty *= sc; tz *= sc; }
    vx = tx + nx0; vy = ty; vz = tz + nz0;
    s98 = 0; s9c = 0; bs = 0;
  };
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
      // 2. side spin
      if (s9c !== 0) {
        unitInto(u, vz, 0, -vx);
        k = vprev * SIDE_K * s9c;
        vx += u[0] * k; vy += u[1] * k; vz += u[2] * k;
        s9c *= SIDE_DECAY;
      }
      // 3. the backspin pull-back, on the ground
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
      const fr = Math.min(Math.max(0.1 + (0.9 * dh) / 300.0, 0.1), 1.0);
      const W0 = W.x * W.mag0 * fr, W2 = W.z * W.mag0 * fr;
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
    const ox = px, oy = py, oz = pz;
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
      const code = treeCheck(c, px, py, pz);
      if (code) {
        const t = TH.tree;
        if (!firstTree) firstTree = { id: t.id, kind: t.kind, code, at: [px, py, pz], tick: lifetime };
        if (treesMet && (!treesMet.length || treesMet[treesMet.length - 1].id !== t.id || treesMet[treesMet.length - 1].code !== code)) treesMet.push({ id: t.id, code, tick: lifetime });
        // a trunk: 0x80413648(ball, n, 1, depth, 0.5, 0.5); a canopy: v x 0.98
        // (palm fronds 0.94) a tick inside it, a slow ball (|v| <= 0.8 u/tick)
        // only on ticks whose lifetime mod 60 < 12 (the counter is the ball's
        // tick, not its frame: the 2c tree runs' 49 canopy shots rest within
        // 0.8 yd of WSR's this way, against 4.6 yd median with frames)
        if (code === 1) objectResponse([TH.nx, TH.ny, TH.nz], TH.depth, 0.5, 0.5);
        else {
          const vm = Math.sqrt(vx * vx + vy * vy + vz * vz);
          if (vm > 0.8 || lifetime % 60 < 12) { const d = code === 4 ? 0.94 : 0.98; vx *= d; vy *= d; vz *= d; }
        }
      }
    }
    // the flagstick (0x80413350, only for a stroke not played from the green):
    // the tick's path from pos64 (ball+0x64, the last tick's position before its
    // contacts) to here in four quarter-steps, the first that meets the pole
    // (0x803f2340: a capsule of 0.1 + 0.5 u round the pin's axis, 30 u either
    // side of its base) refined in sixteenths from the quarter before; there the
    // ball bounces through 0x80413648 (pushed out, the normal flattened, its
    // component reversed x 0.7, the tangential capped at e vn, the spins zeroed),
    // e = clamp(0.299 sgnpow(1 - 2 vn) + 0.001, 0.001, 0.3) with sgnpow(x) =
    // sign(x) |x|^log2(1/0.3) (0x803ef330). A rolling ball that reaches the pole
    // comes back off it at 0.7 of its speed: round 1's hole 10 and round 6's
    // hole 16 approaches finished 2.0 and 3.6 yd short of a pin they rolled into.
    // The pin's other test, 0x80413020 (a box in the pin object's frame that
    // kills 90 % of the tangential speed), is not modelled: its frame is the
    // flag's, which those two rolling balls never met
    if (o.flagIn && pin && active) {
      const sx0 = qx, sy0 = qy, sz0 = qz, ddx = (px - sx0) / 4, ddy = (py - sy0) / 4, ddz = (pz - sz0) / 4;
      let hit = false;
      for (let k = 1; k <= 4 && !hit; k++) {
        if (!pole(pin, sx0 + ddx * k, sy0 + ddy * k, sz0 + ddz * k)) continue;
        hit = true;
        let hx = sx0 + ddx * k, hy = sy0 + ddy * k, hz = sz0 + ddz * k, hn = [POLE.nx, POLE.ny, POLE.nz, POLE.depth];
        for (let j = 1; j <= 4; j++) {
          const x2 = sx0 + ddx * (k - 1) + (ddx / 4) * j, y2 = sy0 + ddy * (k - 1) + (ddy / 4) * j, z2 = sz0 + ddz * (k - 1) + (ddz / 4) * j;
          if (pole(pin, x2, y2, z2)) { hx = x2; hy = y2; hz = z2; hn = [POLE.nx, POLE.ny, POLE.nz, POLE.depth]; break; }
        }
        px = hx; py = hy; pz = hz;
        const vn = -(vx * hn[0] + vy * hn[1] + vz * hn[2]);
        const xx = 1 - 2 * vn, ax = Math.abs(xx);
        const sp = ax < 0.001 ? 0 : Math.sign(xx) * Math.pow(ax, Math.log2(1 / 0.3));
        const e = Math.min(Math.max(0.299 * sp + 0.001, 0.001), 0.3);
        objectResponse(hn, hn[3], 0.7, e);
        flagHit = { tick: lifetime, vn, e };
        cupAfterFlag = true;
      }
    }
    // ---- the contact routine ----
    if (active) {
      qx = px; qy = py; qz = pz;
      const nh = query(c, px, py, pz);
      let attrTick = 0, count = 0, hz = 0;
      let nMin0 = 0, nMin1 = 0, nMin2 = 0, nMax0 = 0, nMax1 = 0, nMax2 = 0;
      let pMin0 = 0, pMin1 = 0, pMin2 = 0, pMax0 = 0, pMax1 = 0, pMax2 = 0;
      let dMin0 = 0, dMin1 = 0, dMin2 = 0, dMax0 = 0, dMax1 = 0, dMax2 = 0;
      const vx0 = vx, vz0 = vz;
      for (let j = 0; j < nh; j++) {
        const i = HITS_I[j], at = c.attr[i];
        if (at === 7 || at === 13) { hz = at; continue; }
        if (!((1 << at) & CONTACT_MASK)) continue;
        const depth = HITS_D[j];
        const n0 = c.CN[3 * i], n1 = c.CN[3 * i + 1], n2 = c.CN[3 * i + 2];
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
          const fb = 1.0 - 0.6 * Math.pow(Math.min(Math.max(bs, 0.0), 1.0), Math.log2(1 / 0.6));
          B *= fb;
          if (steerInit) bs *= fb;
        }
        const dv0 = -(1.0 + B) * n0 * vdn - tc0, dv2 = -(1.0 + B) * n2 * vdn - tc2;
        let dv1 = -(1.0 + B) * n1 * vdn - tc1;
        if (at === 10) dv1 = Math.min(dv1, 0.1);
        if (dv0 > dMax0) dMax0 = dv0; else if (dv0 < dMin0) dMin0 = dv0;
        if (dv1 > dMax1) dMax1 = dv1; else if (dv1 < dMin1) dMin1 = dv1;
        if (dv2 > dMax2) dMax2 = dv2; else if (dv2 < dMin2) dMin2 = dv2;
        s98 = 0; s9c = 0;
      }
      if (hz) {
        hazard = hz === 7 ? 1 : 3; outcome = hz === 7 ? "water" : "valley"; active = false;
        if (path) path.push([px, py, pz, lifetime]);
        break;
      }
      if (count > 0) { cx = vx0; cz = vz0; }
      px += pMin0 + pMax0; py += pMin1 + pMax1; pz += pMin2 + pMax2;
      vx += dMin0 + dMax0; vy += dMin1 + dMax1; vz += dMin2 + dMax2;
      if (count > 0) {
        landed = true;
        if (carry == null && lifetime >= 8) carry = [px, py, pz];
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
      if (py < c.minY - 100) { outcome = "ob"; hazard = 2; active = false; }
      // the raycast under the ball: the dead floor under it is out of bounds;
      // the drop spot is the last ground under it that is not water or a wall
      if (active && (lifetime & 3) === 0) {
        const g = groundAt(c, px, pz, { yMax: py + BALL_R });
        if (g && g.attr === 5) { outcome = "ob"; hazard = 2; active = false; }
        else if (g && g.attr !== 7 && g.attr !== 12 && g.attr !== 13) drop = [px, g.y + BALL_R, pz];
      }
    }
    const ia = lifetime < 8 || attrMax === 0;
    if (carry && !ia && prevAir) bounces++;
    prevAir = ia;
    if (carry == null && py > apexY) apexY = py;
    // the cup: the closest approach of the centre on the cup's level
    if (cup && active) {
      const dx = px - cup[0], dz = pz - cup[2];
      if (dx > -30 && dx < 30 && dz > -30 && dz < 30 && py - cupY < 2 && py - cupY > -2) {
        const v = (Math.sqrt(vx * vx + vz * vz) * 240) / YD;
        let d = Math.sqrt(dx * dx + dz * dz) / YD;
        const sx = px - ox, sz = pz - oz, L2 = sx * sx + sz * sz;
        if (L2 > 0) {
          const fr = Math.min(1, Math.max(0, ((cup[0] - ox) * sx + (cup[2] - oz) * sz) / L2));
          const ex = ox + fr * sx - cup[0], ez = oz + fr * sz - cup[2];
          d = Math.min(d, Math.sqrt(ex * ex + ez * ez) / YD);
        }
        // after a pole hit the ball is inside the cup's 1.5 u rim already and
        // lips out unless it comes back: no capture until it has left 2 u
        if (cupAfterFlag && Math.sqrt(dx * dx + dz * dz) > 2.0) cupAfterFlag = false;
        // h: the centre's height above the cup level (u), vy its vertical speed (yd/s)
        if (!cupPass || d < cupPass.d) cupPass = { d, v, tick: lifetime, h: py - cupY, vy: (vy * 240) / YD };
        if (!cupAfterFlag && o.holeOut !== false && d <= cupWindow(v) && v < V_CAP) { outcome = "holed"; active = false; cupPass = { d, v, tick: lifetime, h: py - cupY, vy: (vy * 240) / YD }; }
      }
    }
    if (path && (lifetime % (o.traceEvery ?? 4) === 0 || !active)) path.push([px, py, pz, lifetime]);
  }
  if (active) outcome = "ticks";
  if (outcome === "rest" && cup && o.holeOut !== false && Math.hypot(px - cup[0], pz - cup[2]) < 1.5 && Math.abs(py - cupY) < 2) outcome = "holed";
  let restAttr = attrMax;
  if (!restAttr || outcome !== "rest") { const g = groundAt(c, px, pz, { yMax: py + 2 }); restAttr = g ? g.attr : 0; }
  // 0x80400a88: a bunker within 2 u of fairway or rough lies on that
  if (outcome === "rest" && (restAttr === 3 || restAttr === 16)) { const a = anyWithin(c, px, py, pz, 2.0, (1 << 1) | (1 << 2)); if (a) restAttr = a; }
  if (outcome === "rest" && restAttr === 4) hazard = 2;
  return {
    rest: [px, py, pz], carry: carry ?? [px, py, pz], apexY, ticks: lifetime, outcome, hazard, restAttr, restLie: ATTR_NAME[restAttr] ?? String(restAttr),
    tree: firstTree, trees: treesMet, drop: hazard ? drop : null, path, cupPass, flagHit, bounces, groundY: g0,
  };
}

// along / across a heading from a point (yd): + across = right of the line
export function alongAcross(from, heading, p) {
  const ax = Math.sin(heading), az = Math.cos(heading);
  const dx = p[0] - from[0], dz = p[2] - from[2];
  return { along: (dx * ax + dz * az) / YD, across: (dx * -az + dz * ax) / YD };
}

/**
 * One stroke as the game will fly it.
 *   hole     1-21
 *   ball     [x, y, z] the ball at address (state.ball.pos)
 *   heading  the aim, player+0x80 (rad; the launch goes along (sin h, cos h))
 *   club     a name (driver ... wedge) or the club manager's index 0-7
 *   power    the launch power (swing+0x98: the swing's power after the lie's cap)
 *   lie      the lie's attribute (player+0xb0: 1 fairway, 2 rough, 3 bunker, 15 tee, ...)
 *   wind     { dir | angle, speedIdx } (state.wind)
 *   pin      [x, y, z] (state.pin), optional: the pull-back's homing, the flagstick, the cup
 *   trace    true keeps the path (every 4 ticks: [x, y, z, tick]) and every tree met
 *   traceEvery  optional, with trace: the path every n ticks instead (1 = every tick, as
 *            lib/flagcells.mjs tests the flag cloth on it); omitted, every 4 as before
 * -> { carry (yd along the heading to the first contact), carryPos, rest [x, z], restY,
 *      restLie (fairway rough bunker green fringe tee wall ob water valley, cup when holed),
 *      along, lateral (yd, + right of the heading), hazard (0, 1 water, 2 ob, 3 valley),
 *      hazardName, holed, tree ({ id, kind 2 broadleaf / 3 conifer / 6 palm, code 1 trunk /
 *      2-4 canopy, tick } of the first tree met, or null), flag ({ tick, vn, e } when the
 *      ball met the flagstick), drop (the game's drop spot after a hazard), outcome, ticks,
 *      toPin (yd), ms }
 * The first call on a hole loads its course (60-250 ms); a call is 1-15 ms after that.
 */
export function predict({ hole, ball, heading, club, power, lie = 1, wind = null, pin = null, trace = false, course = null, traceEvery = undefined }) {
  const t0 = performance.now();
  const c = course ?? loadCourse(hole);
  const name = typeof club === "number" ? CLUB_NAMES[club] : club;
  // from the green the flagstick is out, and the wind getter keys on the
  // player's lie: none on the green (REPORT.md 3.3, bit for bit)
  const onGreen = lie === 6 || lie === 10 || lie === 11;
  const o = fly({ course: c, pos: ball, heading, yaw: lieYaw(lie), club: name, q: power, wind: onGreen ? null : wind, pin, flagIn: !onGreen, lieAttr: lie, trace, traceEvery });
  const r = alongAcross(ball, heading, o.rest), cr = alongAcross(ball, heading, o.carry);
  const holed = o.outcome === "holed";
  return {
    carry: cr.along, carryPos: o.carry, rest: [o.rest[0], o.rest[2]], restY: o.rest[1], restLie: holed ? "cup" : o.restLie,
    along: r.along, lateral: r.across, hazard: o.hazard, hazardName: HAZARD_NAME[o.hazard], holed, tree: o.tree, trees: o.trees,
    flag: o.flagHit, drop: o.drop, outcome: o.outcome, ticks: o.ticks, path: o.path, cupPass: o.cupPass, bounces: o.bounces,
    toPin: pin ? (holed ? 0 : Math.hypot(o.rest[0] - pin[0], o.rest[2] - pin[2]) / YD) : null,
    ms: performance.now() - t0,
  };
}

/**
 * predict() and its neighbours: the same stroke at power +- dPower and heading
 * +- dHeadingDeg. The game is deterministic, but the model's rest is the game's
 * only to the 0.01-0.1 yd the arithmetic allows, and where the stroke's outcome
 * forks (a lip, a bank, a canopy's edge, the flagstick) the branch can differ;
 * there the neighbours' rests scatter by yards. spread = the farthest
 * neighbour's rest from the stroke's (yd); hazards = the neighbours with a
 * hazard; holes = the neighbours holed. Over the 443 logged strokes the game
 * did not drop, the five the model missed by more than 3 yd all had a spread over
 * 5 yd at the defaults; 52 strokes had one, 46 of them predicted within 1 yd (a
 * smooth stroke spreads 0.5-1.5 yd: 0.003 of power is ~0.9 yd of a driver).
 */
export function predictSpread(args, { dPower = 0.003, dHeadingDeg = 0.1 } = {}) {
  const t0 = performance.now();
  const base = predict(args);
  const dh = (dHeadingDeg * Math.PI) / 180;
  const neighbours = [[-dPower, 0], [dPower, 0], [0, -dh], [0, dh]].map(([dq, d]) => {
    const p = predict({ ...args, power: Math.max(0.01, args.power + dq), heading: args.heading + d });
    return { dPower: dq, dHeading: d, rest: p.rest, restLie: p.restLie, hazard: p.hazard, holed: p.holed, toPin: p.toPin, d: Math.hypot(p.rest[0] - base.rest[0], p.rest[1] - base.rest[1]) / YD };
  });
  return { ...base, spread: Math.max(...neighbours.map((n) => n.d)), hazards: neighbours.filter((n) => n.hazard).length, holes: neighbours.filter((n) => n.holed).length, neighbours, ms: performance.now() - t0 };
}
