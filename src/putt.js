// The putt model: Nintendo Switch Sports' roll on a green (since 2026-10-25;
// WSR's before, decision D3), the decoded NSS 1.5.0 ball (src/nsssim.js, its
// constants tools/nss-physics.json, confirmed on 71 strokes recorded in Eden's
// RAM: tools/harness/state/eden/nss-golf-x/flights.md 5.5 and the verifiers'
// verdicts.json), run over the green's real heights (src/terrain.js
// loadGreenHeights, ray casts on NSS's collision) or, where the player edited
// it, the painted 9x9 slope grid. Pure (no React, DOM or Node API), so
// tools/test-putt.mjs runs it.
//
// NSS's putt is its roll mode (mode 2 from the first tick), one 1/240 s tick:
//   1. the move, then the contact with the green under the ball: the ball is
//      pushed out of the plane along its normal and the velocity's part into
//      it removed (no bounce in the roll);
//   2. air drag, v -= 0.0025 / 4 v (0.150 /s);
//   3. friction, |v| -= 1.3 FrictionRatioCurve(|v|) dt (1.3 m/s^2 up to 5 m/s,
//      easing to half from 10 m/s), only while touching;
//   4. the stop count: the horizontal speed at or under 0.005 m/s for 10
//      frames is a rest;
//   5. gravity, 6 m/s^2 while touching the green (10 off it), straight down:
//      the next tick's slide turns it into 6 sin(theta) down the fall line
//      (about 0.115 yd/s^2 a degree), except that a ball at or under 0.5 m/s
//      more than 1 m from the cup takes it along the normal, where the slide
//      removes all of it: a slow putt feels no slope farther than 1 m from the
//      cup; within 0.3 m of the cup and over 0.5 m/s it is 6 + 8
//      Hermite((0.5,1),(1,0))(d / 0.3) (AddGravityHole).
// The putter launches at its table's speed along the aim pitched up 1.14
// degrees (LoftDeg), so on a flat green the ball leaves the surface for a few
// ticks (no friction, gravity 10) before the slide takes the climb out; uphill
// past 1.14 degrees it is pressed into the green at once. This model runs
// that tick in doubles on the slope field (the plane under the ball from its
// gradient, the ball's height above it while it hops), and agrees with
// src/nsssim.js's float32 engine over the same planes within 0.05 yd
// (tools/test-putt.mjs a, b).
//
// The cup: NSS's is collision (a 0.193 m rim on the green, a bevel to the 0.15
// m wall, 0.31 m deep) with AddGravityHole above it; how far off its centre a
// putt can pass and still drop, against its speed there, is CUP_WINDOW,
// measured on src/nsssim.js's analytic NSS cup by tools/build-nss-shape.mjs
// (src/nssShape.js) and checked against the putts Eden recorded (17 holed at
// 1.1-2.5 m/s, h08s6's lip-out at 2.9 m/s 0.125 m off; tools/test-putt.mjs c).
//
// The Switch number is still `greenSpeed`, the flat roll of a full-gauge putt
// (NSS's own 20.13 yd at putter power 1.0 until logged flat putts fit it,
// fitGreenSpeed): it maps a solved putt to the gauge (gaugeBars) and nothing
// else. The physics is NSS's.
//
// Frame: the putt is solved in the green box (the app's green.box, map
// fractions): ball and cup are fractions of the box (0-1, +x right, +y down,
// as GreenCanvas taps them) and the box is W x H yd (App's greenYd). A field
// gives the ground's gradient there (puttField). The tick runs in metres.
import { PHYSICS, curveAt } from "./nsssim.js";
import { PUTT_ROLL_YD, CUP_WINDOW as CUP_TABLE } from "./nssShape.js";

// ---- NSS's constants ----
const M = 0.9144;                                    // m per yd
const GP = PHYSICS.ground, AP = PHYSICS.air;
export const TICK_HZ = PHYSICS.tick.substeps / PHYSICS.tick.frameS;
const DTM = PHYSICS.tick.dt;                         // the tick, s (the game's 0.016666668 / 4)
const DRAG_TICK = AP.airFriction / PHYSICS.tick.substeps;
const FR_GREEN = PHYSICS.attrs[6].friction;          // AttrGreen.Friction, m/s^2
const G_GREEN = GP.gravityPutter, G_AIR = AP.gravity;
const STOP_VEL = GP.stopVelLen, STOP_TICKS = GP.stopVelFrame * PHYSICS.tick.substeps;
const SLOW_V = GP.velLenForStopGravity, SLOW_DIST = GP.stopGravityDisableDist;
const HOLE_G = GP.addGravityHole, HOLE_D = GP.addGravityHoleDist, HOLE_CURVE = GP.addGravityHoleCurve;
const SMALL_D = GP.smallMoveForceStopDistance, SMALL_TICKS = GP.smallMoveForceStopFrame * PHYSICS.tick.substeps;
const RATIO = GP.frictionRatioCurve;
const LOFT = (PHYSICS.clubs.PT.loftDeg * Math.PI) / 180;
const DEG = Math.PI / 180;
// the friction ratio: 1 up to its second point (5 m/s), then the Hermite
const RATIO_FLAT = RATIO.points[1][0];
const ratioAt = (v) => (v <= RATIO_FLAT ? 1 : curveAt(RATIO, v));
// the cup's pull, AddGravityHole x its curve at d / AddGravityHoleDist: the
// file's two-point Hermite (0.5, 1, 0) (1, 0, 0) inline (curveAt otherwise)
const HC = HOLE_CURVE.points, HOLE_PLAIN = HOLE_CURVE.type === "Hermit2D" && HC.length === 2 && !HC[0][2] && !HC[1][2];
const holePull = (t) => {
  if (!HOLE_PLAIN) return HOLE_G * curveAt(HOLE_CURVE, t);
  if (t <= HC[0][0]) return HOLE_G * HC[0][1];
  if (t >= HC[1][0]) return HOLE_G * HC[1][1];
  const u = (t - HC[0][0]) / (HC[1][0] - HC[0][0]), u2 = u * u, u3 = u2 * u;
  return HOLE_G * ((2 * u3 - 3 * u2 + 1) * HC[0][1] + (3 * u2 - 2 * u3) * HC[1][1]);
};
// in yd and s, for the readers: the green's friction below 5 m/s (1.42 yd/s^2),
// the drag rate (0.150 /s) and the green's gravity (6.56 yd/s^2; its pull down
// a slope of theta is G sin theta)
export const DECEL = FR_GREEN / M;
export const DRAG = -Math.log(1 - DRAG_TICK) * TICK_HZ;
export const G = G_GREEN / M;
// a putt is a tick loop of at most ForceStopFrame frames (21.7 s); a ball under
// STOP_V (yd/s) horizontally for StopVelFrame frames is at rest
export const DT = DTM, STEP_CAP = GP.forceStopFrame * PHYSICS.tick.substeps, STOP_V = STOP_VEL / M;
// the dashed line's points, every 0.1 s
const PATH_EVERY = 24;
// the putter: power 0 .. PowerOverMaxPT (1.5) and its launch speed, the table's
// (GolfShotVelTable PT, read at (int)(100 power)) linear between its whole
// percents, yd/s (the game flies the lower one: a percent is 0.2 yd of flat roll,
// so a swing between two rolls up to 0.2 yd short of this)
export const PUTT_POWER_MAX = PHYSICS.launch.powerOverMaxPT;
const PT_SPEEDS = PHYSICS.launchTable.PT;
export function puttV0(p) {
  const x = Math.max(0, Math.min(PT_SPEEDS.length, p * 100));
  const i = Math.floor(x), f = x - i;
  const a = i === 0 ? 0 : PT_SPEEDS[i - 1], b = i >= PT_SPEEDS.length ? PT_SPEEDS[PT_SPEEDS.length - 1] : PT_SPEEDS[i];
  return (a + (b - a) * f) / M;
}
// its inverse (the table rises), power for a launch speed in yd/s
export function puttPowerOfV0(v) {
  const s = v * M;
  if (!(s > 0)) return 0;
  if (s <= PT_SPEEDS[0]) return (s / PT_SPEEDS[0]) * 0.01;
  for (let i = 1; i < PT_SPEEDS.length; i++) if (s <= PT_SPEEDS[i]) return (i + (s - PT_SPEEDS[i - 1]) / (PT_SPEEDS[i] - PT_SPEEDS[i - 1])) / 100;
  return PT_SPEEDS.length / 100;
}

// ---- the tick ----
// One putt in metres: from (x, y) along the unit (ux, uy) launched at v0 m/s,
// on grad(x yd, y yd, out) (rise per yd = per m), the cup at (cx, cy) or null.
// Every tick calls step(px, py, x, y, sp0, sp1) with the move's segment and the
// horizontal speed at its ends; a true return ends the putt. -> { x, y, sp, ticks,
// rest }.
const gr = new Float64Array(2);
function roll(grad, x, y, ux, uy, v0, cx, cy, step) {
  let vx = v0 * Math.cos(LOFT) * ux, vy = v0 * Math.cos(LOFT) * uy, vz = v0 * Math.sin(LOFT);
  // the ball's height above its rest height over the plane, m (while it hops),
  // and the last contact's normal (up before the first, as the game's M+0x78)
  let zr = 0, nx = 0, ny = 0, nz = 1;
  let stopT = 0, smallT = 0, ax = x, ay = y, ticks = 0, rest = false;
  let sp = Math.sqrt(vx * vx + vy * vy);
  const far = cx == null;
  while (ticks < STEP_CAP) {
    ticks++;
    const px = x, py = y, sp0 = sp;
    // 1. the move, then the plane under the ball
    x += vx * DTM; y += vy * DTM;
    grad(x / M, y / M, gr);
    const gx = gr[0], gy = gr[1], inv = 1 / Math.sqrt(1 + gx * gx + gy * gy);
    zr += (vz - (gx * vx + gy * vy)) * DTM;
    const mx = -gx * inv, my = -gy * inv, mz = inv;
    const vn = vx * mx + vy * my + vz * mz;
    let touch = false;
    if (zr <= 0 && vn < 0) {
      // pushed out along the normal (the horizontal shift that leaves) and slid
      const pen = -zr * mz;
      x += pen * mx; y += pen * my; zr = 0;
      vx -= vn * mx; vy -= vn * my; vz -= vn * mz;
      nx = mx; ny = my; nz = mz; touch = true;
    }
    // 2. drag, 3. friction (touching), 4. the stop count
    let s2 = vx * vx + vy * vy + vz * vz;
    if (s2 > STOP_VEL * STOP_VEL) { const k = 1 - DRAG_TICK; vx *= k; vy *= k; vz *= k; s2 *= k * k; }
    const s = Math.sqrt(s2);
    if (touch && s > 0) {
      const d = FR_GREEN * ratioAt(s) * DTM;
      if (d >= s) { vx = 0; vy = 0; vz = 0; } else { const k = 1 - d / s; vx *= k; vy *= k; vz *= k; }
    }
    const h2 = vx * vx + vy * vy;
    if (h2 <= STOP_VEL * STOP_VEL) stopT++; else stopT = 0;
    if ((x - ax) * (x - ax) + (y - ay) * (y - ay) <= SMALL_D * SMALL_D) smallT++; else { smallT = 0; ax = x; ay = y; }
    // 5. gravity: along the normal for a slow ball far from the cup, else down
    // (with the cup's pull close to it)
    let g = touch ? G_GREEN : G_AIR;
    const dc = far ? Infinity : Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
    if (s <= SLOW_V && nz >= 0.5 && dc > SLOW_DIST) { const k = g * DTM; vx -= nx * k; vy -= ny * k; vz -= nz * k; }
    else { if (dc < HOLE_D && s > SLOW_V) g += holePull(dc / HOLE_D); vz -= g * DTM; }
    sp = Math.sqrt(vx * vx + vy * vy);
    if (step && step(px, py, x, y, sp0, sp, ticks)) return { x, y, sp, ticks, rest: false, ended: true };
    if (stopT >= STOP_TICKS || smallT >= SMALL_TICKS) { rest = true; break; }
  }
  return { x, y, sp, ticks, rest, ended: false };
}
const FLAT_GRAD = (x, y, o) => { o[0] = 0; o[1] = 0; };

// ---- the flat green ----
// The roll of a putt launched at v yd/s on a flat green (the putter's 1.14
// degree hop included), yd: this model's own, tabled every 0.02 m/s up to 16 m/s
// (past PowerOverMaxPT's 10.5) once, linear between (the stop is smooth in v;
// tools/test-putt.mjs d holds the table to a direct run within 0.002 yd).
const FLAT_STEP = 0.02, FLAT_N = 801;
let flatTable = null;
function flatRows() {
  if (flatTable) return flatTable;
  flatTable = new Float64Array(FLAT_N);
  for (let k = 1; k < FLAT_N; k++) {
    const r = roll(FLAT_GRAD, 0, 0, 0, -1, k * FLAT_STEP, null, null, null);
    flatTable[k] = Math.sqrt(r.x * r.x + r.y * r.y) / M;
  }
  // the hop's ticks are whole: a lower speed can roll a hair further; keep it rising
  for (let k = 1; k < FLAT_N; k++) if (flatTable[k] < flatTable[k - 1]) flatTable[k] = flatTable[k - 1];
  return flatTable;
}
export function flatStop(v) {
  if (!(v > 0)) return 0;
  const t = flatRows(), u = (v * M) / FLAT_STEP;
  if (u >= FLAT_N - 1) return t[FLAT_N - 1] + (t[FLAT_N - 1] - t[FLAT_N - 2]) * (u - (FLAT_N - 1));
  const i = Math.floor(u), f = u - i;
  return t[i] + (t[i + 1] - t[i]) * f;
}
// its inverse, the launch speed (yd/s) that rolls D yd on a flat green
export function vFlat(D) {
  if (!(D > 0)) return 0;
  const t = flatRows();
  if (D >= t[FLAT_N - 1]) return (((FLAT_N - 1) + (D - t[FLAT_N - 1]) / (t[FLAT_N - 1] - t[FLAT_N - 2])) * FLAT_STEP) / M;
  let lo = 0, hi = FLAT_N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] < D) lo = m; else hi = m; }
  const f = t[hi] > t[lo] ? (D - t[lo]) / (t[hi] - t[lo]) : 0;
  return ((lo + f) * FLAT_STEP) / M;
}

// ---- the cup ----
// CUP_WINDOW: [speed yd/s, half-width yd], linear between its points: a putt
// whose path passes within cupWindow(its speed there) of the cup's centre
// drops (tools/build-nss-shape.mjs, src/nssShape.js: NSS's cup in src/nsssim.js
// on a level green; 0.215 yd up to 1.75 yd/s, under 0.18 past 2.2, 0.104 at 3.5,
// none from 5.36). A ball at rest within CUP_R of the centre is in.
export const CUP_WINDOW = CUP_TABLE;
// the table's speeds are 0.1 m/s apart (rounded to 0.1 mm/s in yd/s): a direct
// index, then the neighbour if the rounding put v past it
const CW_DV = CUP_WINDOW[1][0] - CUP_WINDOW[0][0], CW_N = CUP_WINDOW.length;
export function cupWindow(v) {
  if (!(v > 0)) return CUP_WINDOW[0][1];
  let i = Math.floor(v / CW_DV) + 1;
  if (i >= CW_N) return 0;
  while (i > 1 && v <= CUP_WINDOW[i - 1][0]) i--;
  while (i < CW_N - 1 && v > CUP_WINDOW[i][0]) i++;
  if (v > CUP_WINDOW[i][0]) return 0;
  const [v0, w0] = CUP_WINDOW[i - 1], [v1, w1] = CUP_WINDOW[i];
  return w0 + ((w1 - w0) * (v - v0)) / (v1 - v0);
}
// the widest the window gets (a ball dying on the cup) and the speed past
// which nothing drops
export const CUP_R = CUP_WINDOW[0][1];
export const V_CAP = CUP_WINDOW[CUP_WINDOW.length - 1][0];

// ---- the ground: slope fields ----
// A field is { W, H, src, grad(x, y, out) }: out[0], out[1] = the ground's
// rise per yd along +x and +y (map right, map down) at (x, y) yd from the green
// box's top-left corner (the uphill gradient ∇h).

// The green heights (src/terrain.js parseGreenHeights: a stepYd grid over
// tools/nss-truth.json's green box plus 0.12 of it, int16 in unitYd above
// z0Yd, ray casts on NSS's collision; mask = the nodes whose ray lands on the
// green, the cups closed by their covers, so no node reads a cup's bottom
// 0.30 m down; tools/build-terrain.mjs refuses a node over an open cup): the
// gradient at each node in the mask by central differences over the nodes in
// it (one-sided at its edge); a node outside takes the gradient of the
// nearest node inside (breadth first), because the margins hold banks and
// drops off the green (8.5 yd down at the edge of H8's box, 2-3.5 yd on
// H3, H4, H5, H7, H9, H17 and H20; on WSR's KCL, H3's water holes 16-17 yd
// down and a 25 yd drop on H17) that would read as cliffs. The mask is read
// as shipped. On WSR's rasters (B4b) two nodes on H3 beside those holes had
// to be left out as pits (a bilinear read took in a raster px of the hole:
// one 0.58 yd under the next node, a 115 % slope); NSS's rays read the green
// there sound, and B4's belt, which dropped a masked node beside a drop of
// over 1 yd to an unmasked one, went with B4b. The steepest gradient a green
// box reads is H19's 32 %, then H21's 30 %, H3's 13 % (tools/test-putt.mjs g;
// on WSR's rasters H21's 30 % was the steepest). Cached per grid.
const gradCache = new WeakMap();
function nodeGrads(g) {
  let c = gradCache.get(g);
  if (c) return c;
  const { w, h, data, mask } = g, n = w * h, s = g.unitYd / g.stepYd;
  const gx = new Float64Array(n), gy = new Float64Array(n), got = new Uint8Array(n), queue = new Int32Array(n);
  let qn = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (!mask[k]) continue;
    const l = i > 0 && mask[k - 1], r = i < w - 1 && mask[k + 1], u = j > 0 && mask[k - w], d = j < h - 1 && mask[k + w];
    gx[k] = (l && r ? (data[k + 1] - data[k - 1]) / 2 : r ? data[k + 1] - data[k] : l ? data[k] - data[k - 1] : 0) * s;
    gy[k] = (u && d ? (data[k + w] - data[k - w]) / 2 : d ? data[k + w] - data[k] : u ? data[k] - data[k - w] : 0) * s;
    got[k] = 1; queue[qn++] = k;
  }
  for (let q = 0; q < qn; q++) {
    const k = queue[q], i = k % w;
    for (const m of [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, k - w, k + w]) {
      if (m < 0 || m >= n || got[m]) continue;
      gx[m] = gx[k]; gy[m] = gy[k]; got[m] = 1; queue[qn++] = m;
    }
  }
  c = { gx, gy };
  gradCache.set(g, c);
  return c;
}
// box = the putt's green box (map fractions), W x H yd: a putt position goes to
// the map and from there into the height grid, so a green box the player
// redrew still reads the heights where they are. Bilinear between the node
// gradients; past the grid the edge nodes'.
export function heightField(g, box, W, H) {
  const { gx, gy } = nodeGrads(g), w = g.w, h = g.h;
  const sx = (w - 1) / (g.box.x1 - g.box.x0), sy = (h - 1) / (g.box.y1 - g.box.y0);
  const au = ((box.x1 - box.x0) / W) * sx, bu = (box.x0 - g.box.x0) * sx;
  const av = ((box.y1 - box.y0) / H) * sy, bv = (box.y0 - g.box.y0) * sy;
  return {
    W, H, src: "heights",
    grad(x, y, out) {
      const u = Math.min(w - 1, Math.max(0, au * x + bu)), v = Math.min(h - 1, Math.max(0, av * y + bv));
      const i = Math.min(w - 2, Math.floor(u)), j = Math.min(h - 2, Math.floor(v)), fx = u - i, fy = v - j, k = j * w + i;
      out[0] = (gx[k] * (1 - fx) + gx[k + 1] * fx) * (1 - fy) + (gx[k + w] * (1 - fx) + gx[k + w + 1] * fx) * fy;
      out[1] = (gy[k] * (1 - fx) + gy[k + 1] * fx) * (1 - fy) + (gy[k + w] * (1 - fx) + gy[k + w + 1] * fx) * fy;
    },
  };
}

// The painted grid (green.grid: 9x9 downhill [dx, dy], +x right, +y down, of
// level 1, 2 or 3, as the paint UI and tools/build-derived.mjs quantizeGrid
// write it) in absolute slope: a level is a band of the cell's slope against
// the green's steepest cell (quantizeGrid: under 0.45, 0.45-0.75, 0.75 up),
// read as the band's mean over the 1,314 non-empty cells of the 21 WSR greens
// (tools/wsr-truth.json grid: 0.304 / 0.595 / 0.856; NSS's greens,
// tools/nss-truth.json, give the same bands within 0.002), times the green's
// steepest slope slopeMaxPct (derived.json, from the truth file
// tools/build-derived.mjs reads, nss-truth.json once the geometry is NSS's;
// without one the median of the 21, 11.4 %, 11.3 on NSS's); θ = atan(pct / 100) down the painted
// direction. Constant over each cell, as the old model read it.
const LEVEL_FRAC = [0, 0.304, 0.595, 0.856];
export const SLOPE_MAX_PCT_DEFAULT = 11.4;
const levelFrac = (m) => {
  const t = Math.min(3, Math.max(0, m)), i = Math.min(2, Math.floor(t));
  return LEVEL_FRAC[i] + (LEVEL_FRAC[i + 1] - LEVEL_FRAC[i]) * (t - i);
};
export function gridField(grid, W, H, slopeMaxPct = SLOPE_MAX_PCT_DEFAULT) {
  const N = grid?.length || 0;
  const cells = (grid ?? []).map((row) => row.map(([dx, dy]) => {
    const m = Math.hypot(dx, dy);
    if (!(m > 0)) return [0, 0];
    const rise = (levelFrac(m) * slopeMaxPct) / 100 / m;   // downhill [dx, dy] -> uphill gradient
    return [-dx * rise, -dy * rise];
  }));
  return {
    W, H, src: "grid",
    grad(x, y, out) {
      if (!N) { out[0] = 0; out[1] = 0; return; }
      const i = Math.min(N - 1, Math.max(0, Math.floor((x / W) * N))), j = Math.min(N - 1, Math.max(0, Math.floor((y / H) * N)));
      const c = cells[j]?.[i] ?? [0, 0];
      out[0] = c[0]; out[1] = c[1];
    },
  };
}

// The putt's field for a hole: the mesh heights when they loaded and the
// player has not edited the painted grid (green.gridEdited, set by the paint
// UI and cleared by "use mesh heights"), else the painted grid. src: "heights",
// "edited" (the player's grid) or "grid" (no heights for the hole yet: the
// shipped grid stands in).
export function puttField({ green, heights = null, W, H, slopeMaxPct = null }) {
  if (heights && green?.box && !green.gridEdited) return heightField(heights, green.box, W, H);
  const f = gridField(green?.grid, W, H, slopeMaxPct ?? green?.slopeMaxPct ?? SLOPE_MAX_PCT_DEFAULT);
  return { ...f, src: green?.gridEdited ? "edited" : "grid" };
}


// ---- the sim ----
// One putt: from ball toward cup (fractions of the box) turned angDeg
// clockwise, launched at pw x the speed that rolls to the cup on a flat green.
// NSS's tick (roll above) on the field's slopes. Holed when a tick's segment
// comes within cupWindow(the ball's horizontal speed there) of the cup, or
// when the ball comes to rest within CUP_R of it.
// -> { holed, best, margin, pass, endSp, path (box fractions, every 0.1 s;
// null with trace false), D (ball to cup, yd), v0 (the launch speed the gauge
// sets, yd/s), Dflat (its flat roll), stop (box fractions), t (s) }. best is
// the closest the ball comes to the cup while slow enough to drop (< V_CAP;
// the stop distance of a putt that dies short), margin the closest it comes
// to the window's edge (best less the window at its speed there; < 0 holed),
// pass the closest at any speed: a putt that runs over the cup at 6 yd/s
// passes at 0 but is no near miss, it stops 6 yd past.
export function simPutt(field, ball, cup, angDeg, pw, { trace = true } = {}) {
  const { W, H } = field;
  const D = Math.hypot((cup.x - ball.x) * W, (cup.y - ball.y) * H);
  const th = Math.atan2((cup.x - ball.x) * W, -((cup.y - ball.y) * H)) + angDeg * DEG;
  const ux = Math.sin(th), uy = -Math.cos(th);
  const v0 = pw * vFlat(D);
  const x0 = ball.x * W * M, y0 = ball.y * H * M, cx = cup.x * W * M, cy = cup.y * H * M;
  const path = trace ? [[ball.x, ball.y]] : null;
  const V_CAP_M = V_CAP * M, WM = W * M, HM = H * M;
  let holed = false, best = v0 < V_CAP ? D : Infinity, margin = v0 < V_CAP ? D - cupWindow(v0) : Infinity, pass = D;
  const r = roll(field.grad, x0, y0, ux, uy, v0 * M, cx, cy, (px, py, x, y, sp0, sp1, tick) => {
    if (trace && tick % PATH_EVERY === 0) path.push([x / WM, y / HM]);
    // the segment's closest approach to the cup (yd), and the speed there; the
    // window is read only where it could matter (within CUP_R of a new best margin)
    const dx = x - px, dy = y - py, L2 = dx * dx + dy * dy;
    const f = L2 > 0 ? Math.min(1, Math.max(0, ((cx - px) * dx + (cy - py) * dy) / L2)) : 0;
    const ex = px + f * dx - cx, ey = py + f * dy - cy, dc = Math.sqrt(ex * ex + ey * ey) / M;
    if (dc < pass) pass = dc;
    const spc = sp0 + f * (sp1 - sp0);
    if (spc < V_CAP_M) {
      if (dc < best) best = dc;
      if (dc - CUP_R < margin) {
        const m = dc - cupWindow(spc / M);
        if (m < margin) margin = m;
        if (m <= 0) { holed = true; return true; }
      }
    }
    return false;
  });
  let x = r.x, y = r.y, sp = r.sp;
  if (!holed && r.rest) {
    const dr = Math.hypot(x - cx, y - cy) / M;
    if (dr - CUP_R < margin) margin = dr - CUP_R;
    if (dr <= CUP_R) holed = true;
  }
  if (holed) { x = cx; y = cy; sp = 0; }
  if (trace) path.push([x / WM, y / HM]);
  // a ball still rolling at the cap (running down a slope within 1 m of the cup)
  if (!(best < Infinity)) best = Math.hypot(x - cx, y - cy) / M;
  if (!(margin < Infinity)) margin = best - CUP_R;
  return { holed, best, margin, pass, endSp: sp / M, path, D, v0, Dflat: flatStop(v0), stop: [x / WM, y / HM], t: r.ticks * DTM };
}

// The read, in two parts. First a holing line: the angle scan ±35° (5°), then
// ±4° (1°) round the best, then ±1° (0.25°) round that; the power scan
// 0.7-1.55 (0.085), then ±0.08 (0.02), then ±0.04 (0.01), relative to the
// flat-green speed for the distance; a holed putt scores below any miss and
// the softer the better, a miss by its margin to the cup's window (the
// closest it comes to holing at its speed there: a soft near miss steers the
// finer stages toward the line that drops, a putt racing over the cup is no
// near miss). The 0.25° stage is there because 1° of aim is 0.35-0.52 yd
// across at 20-30 yd, about the cup's window.
//
// Then, for a holing line, the one that forgives the strength most: the
// player sets the aim to the line but swings the strength by feel, so of the
// aims round it (0.1° steps out to where nothing holes, then 0.025° round the
// best) the read takes the one whose holing strengths span the widest range
// of putter power (the gauge fills linearly in it, 0 .. PowerOverMaxPT), and
// the middle of that range. -> { c, a (aim, deg right of the cup), p (the
// launch as a fraction of the flat-green speed for the distance), r (that
// putt, traced), range: { lo, hi } (the holing launches at that aim, as p),
// power: { lo, hi, mid } (the same in putter power) and Dflat: { lo, hi }
// (their flat rolls, for the gauge) } for a holing line; a lag line has no
// range.
export function solvePutt(field, ball, cup) {
  const cost = (r, pw) => (r.holed ? -2 + pw * 0.1 : r.margin + Math.max(0, r.margin) * 0.3);
  let best = null;
  // the putter's top launch (PowerOverMaxPT) as a fraction of the flat speed for
  // the distance: a scan point past it plays at it
  const vD0 = vFlat(Math.hypot((cup.x - ball.x) * field.W, (cup.y - ball.y) * field.H)), pTop = vD0 > 0 ? puttV0(PUTT_POWER_MAX) / vD0 : Infinity;
  const tryOne = (a, p) => {
    if (p > pTop) p = pTop;
    const r = simPutt(field, ball, cup, a, p, { trace: false });
    const c = cost(r, p);
    if (!best || c < best.c) best = { c, a, p, r };
  };
  for (let a = -35; a <= 35; a += 5) for (let p = 0.7; p <= 1.55; p += 0.085) tryOne(a, p);
  const { a: a0, p: p0 } = best;
  for (let a = a0 - 4; a <= a0 + 4; a += 1) for (let p = Math.max(0.5, p0 - 0.08); p <= p0 + 0.08; p += 0.02) tryOne(a, p);
  const { a: a1, p: p1 } = best;
  for (let a = a1 - 1; a <= a1 + 1 + 1e-9; a += 0.25) for (let p = Math.max(0.5, p1 - 0.04); p <= p1 + 0.04 + 1e-9; p += 0.01) tryOne(a, p);
  const vD = vFlat(best.r.D);
  if (best.r.holed && vD > 0) {
    // the holing strengths at aim a, as putter power: the run through a holed
    // seed, each edge found in 0.02 steps (out from the seed, or from the
    // neighbouring aim's edge g: out while it holes, in while it does not) and
    // bisected to 0.001
    const pwOf = (q) => puttV0(q) / vD;
    const holes = (a, q) => simPutt(field, ball, cup, a, pwOf(q), { trace: false }).holed;
    const inRange = (q) => q > 0.001 && q < PUTT_POWER_MAX;
    const edge = (a, qIn, dir, g) => {
      let qOut;
      if (g != null && (g - qIn) * dir > 0.02 && inRange(g)) {
        if (holes(a, g)) { qIn = g; qOut = g + 0.02 * dir; }
        else {
          qOut = g;
          for (let q = g - 0.02 * dir; (q - qIn) * dir > 0; q -= 0.02 * dir) { if (holes(a, q)) { qIn = q; break; } qOut = q; }
        }
      } else qOut = qIn + 0.02 * dir;
      while (inRange(qOut) && holes(a, qOut)) { qIn = qOut; qOut += 0.02 * dir; }
      if (!inRange(qOut)) return qIn;
      for (let k = 0; k < 5 || Math.abs(qOut - qIn) > 0.0007; k++) { const m = (qIn + qOut) / 2; if (holes(a, m)) qIn = m; else qOut = m; }
      return qIn;
    };
    const runAt = (a, seeds, prev = null) => {
      const q = seeds.find((s) => s > 0 && holes(a, s));
      if (q == null) return null;
      const lo = edge(a, q, -1, prev?.lo), hi = edge(a, q, 1, prev?.hi);
      return { a, lo, hi, w: hi - lo, mid: (lo + hi) / 2 };
    };
    const q1 = puttPowerOfV0(best.p * vD);
    const seedsAt = (prev) => (prev ? [prev.mid, prev.lo + 0.25 * prev.w, prev.hi - 0.25 * prev.w, q1] : [q1]);
    let top = runAt(best.a, [q1]);
    // out to either side in 0.1° steps while some strength still holes
    for (const dir of top ? [-1, 1] : []) {
      let prev = top;
      for (let k = 1; k <= 40 && prev; k++) {
        const run = runAt(best.a + dir * 0.1 * k, seedsAt(prev), prev);
        if (run && (run.w > top.w || (run.w === top.w && run.mid < top.mid))) top = run;
        prev = run;
      }
    }
    // then 0.025° round the widest
    if (top) {
      const a2 = top.a;
      for (let k = -3; k <= 3; k++) {
        if (k === 0) continue;
        const run = runAt(a2 + 0.025 * k, seedsAt(top), top);
        if (run && run.w > top.w) top = run;
      }
      const pw = pwOf(top.mid);
      best = { c: best.c, a: top.a, p: pw, r: null, range: { lo: pwOf(top.lo), hi: pwOf(top.hi) }, power: { lo: top.lo, hi: top.hi, mid: top.mid },
        // the range's ends as flat rolls, which gaugeBars turns into bars at the Switch's greenSpeed
        Dflat: { lo: flatStop(puttV0(top.lo)), hi: flatStop(puttV0(top.hi)) } };
    }
  }
  best.r = simPutt(field, ball, cup, best.a, best.p);
  return best;
}

// ---- the gauge ----
// NSS's putter: power -> roll on a flat green (src/nsssim.js at each whole
// percent of GolfShotVelTable's PT row, tools/build-nss-shape.mjs
// PUTT_ROLL_YD; the table's design rule is pct / 100 x 20 yd), linear between
// the rows, to PowerOverMaxPT 1.5.
export const PUTT_POWER_TABLE = [[0, 0], ...PUTT_ROLL_YD.map((yd, k) => [(k + 1) / 100, yd])];
// The Switch number: the flat roll of a full-gauge (4-bar) putt, yd. NSS's own
// at power 1.0 until logged flat putts fit it.
export const GREEN_SPEED = PUTT_ROLL_YD[99];
const T1 = GREEN_SPEED;
export function puttRoll(p) {
  const tb = PUTT_POWER_TABLE, q = Math.max(0, p);
  for (let k = 1; k < tb.length; k++) if (q <= tb[k][0] || k === tb.length - 1) {
    const [p0, d0] = tb[k - 1], [p1, d1] = tb[k];
    return d0 + ((d1 - d0) * (q - p0)) / (p1 - p0);
  }
  return 0;
}
export function puttPower(d) {
  const tb = PUTT_POWER_TABLE, q = Math.max(0, d);
  for (let k = 1; k < tb.length; k++) if (q <= tb[k][1] || k === tb.length - 1) {
    const [p0, d0] = tb[k - 1], [p1, d1] = tb[k];
    return p0 + ((p1 - p0) * (q - d0)) / (d1 - d0);
  }
  return 0;
}
// the bars a putt of flat roll Dflat needs: 4·T⁻¹(Dflat / greenSpeed · T(1))
// (over 4 = past a full gauge: NSS's putter reads its table to power 1.5)
export const gaugeBars = (Dflat, greenSpeed = GREEN_SPEED) => 4 * puttPower((Dflat / greenSpeed) * T1);
// greenSpeed from logged putts ({ bars, rolled, flat }): the median of
// rolled / (T(bars / 4) / T(1)) over the flat rows; under 2 of them, NSS's
export function fitGreenSpeed(putts) {
  const est = (putts ?? []).filter((r) => r && r.flat !== false && r.bars > 0 && r.bars <= 4 && r.rolled > 0)
    .map((r) => (r.rolled * T1) / puttRoll(r.bars / 4)).sort((a, b) => a - b);
  if (est.length < 2) return { greenSpeed: GREEN_SPEED, n: est.length };
  const m = est.length >> 1;
  return { greenSpeed: est.length % 2 ? est[m] : (est[m - 1] + est[m]) / 2, n: est.length };
}
