// The putt model: Wii Sports Resort's roll on a green (decision D3), decoded
// from its main.dol (tools/research/wsr-ground-phase.md sections 4 and 6) and
// run over the green's real heights (src/terrain.js loadGreenHeights, from the
// WSR collision meshes) or, where the player edited it, the painted 9x9 slope
// grid. Pure (no React, DOM or Node API), so tools/test-putt.mjs runs it.
//
// WSR's ball on a green is a stream of micro-bounces; per tick that comes to
// a constant (Coulomb) deceleration A·vn* = 0.0002 u/tick², a linear drag
// v *= 0.999 and gravity along the bisector of the surface normal and the
// vertical, so on a slope of θ the pull down the fall line is 0.002·sin(θ/2)
// u/tick² and the normal load (and with it the friction) scales by cos(θ/2).
// The putter launches horizontally at v0 = 0.004 + 0.406·power^0.667 u/tick
// and a flat green stops it at ≈ 20.5 yd × power. Units: 1 u = 0.1 m (9.144
// u/yd), one tick = 1/240 s.
//
// What the Switch does with any of this is unmeasured, so the one Switch
// number is `greenSpeed`, the flat roll of a full-gauge putt (WSR's 20.5 yd at
// power 1.0 until logged flat putts fit it, fitGreenSpeed): it maps a solved
// putt to the gauge (gaugeBars) and nothing else. The physics stays WSR's.
//
// Frame: the putt is solved in the green box (the app's green.box, map
// fractions): ball and cup are fractions of the box (0-1, +x right, +y down,
// as GreenCanvas taps them) and the box is W x H yd (App's greenYd). A field
// gives the ground's gradient there (puttField).

// ---- WSR's constants in yd and s ----
const U_YD = 9.144, TICK_HZ = 240;
const YD_S = TICK_HZ / U_YD;                 // 1 u/tick = 26.25 yd/s
const YD_S2 = (TICK_HZ * TICK_HZ) / U_YD;    // 1 u/tick² = 6,299 yd/s²
const DEG = Math.PI / 180;
// the green (attr 6): Coulomb A = 0.15, restitution B = 0.5; the steady
// approach speed vn* = 0.999·0.002/(1 + 0.999·B) = 0.001332 u/tick, so
// A·vn* = 0.0002 u/tick² = 1.259 yd/s² (1.15 m/s²) on the flat
export const DECEL = ((0.15 * 0.999 * 0.002) / (1 + 0.999 * 0.5)) * YD_S2;
// v *= 0.999 per tick = 0.2401 per s (it acts in the air too)
export const DRAG = -Math.log(0.999) * TICK_HZ;
// gravity, 0.002 u/tick² = 12.6 yd/s²; along the bisector its pull down a
// slope of θ is G·sin(θ/2), 0.110 yd/s² per degree near 0 (a real ball's
// g·sin θ would be 0.171), 0.087 of the flat deceleration per degree
export const G = 0.002 * YD_S2;
// the putter's launch speed at WSR power p (0.05-2.5 on the green), yd/s
export const wsrPuttV0 = (p) => (0.004 + 0.406 * Math.pow(p, Math.log2(1 / 0.63))) * YD_S;

// ---- the integration ----
// 120 steps a second (WSR ticks at 240), 20 s at most; a ball under 0.05
// yd/s is at rest (WSR's creep threshold, 0.0015 u/tick for 20 ticks, is
// 0.04 yd/s) unless the slope under it passes CREEP_DEG and it keeps rolling.
// The pull beats the friction past tan(θ/2) = A·0.999/(1 + 0.999·B), 11.4° on
// a green; WSR's stop rule still rests a ball that slows to a stop up to ~15°
// (its simulator needed 15° to start a resting ball, and stops an uphill putt
// at 13-15° where this model's rolls back). 12° sits between the two; where
// exactly the Switch starts a ball rolling is unmeasured.
export const DT = 1 / 120, STEP_CAP = 2400, STOP_V = 0.05, CREEP_DEG = 12;
// the dashed line's points, every 0.1 s
const PATH_EVERY = 12;
// A step solves dv/dt = a - DRAG·v exactly for an a held over it: v' = v·E +
// a·C1, x' = x + v·C1 + a·C2 (E = e^(-DRAG·DT) = 0.999², WSR's drag over its
// two ticks). An Euler step's (1 - DRAG·DT) instead loses 0.2 % of the speed
// over a 20 yd putt's 9 s and stops it 0.03 yd short.
const DRAG_E = Math.exp(-DRAG * DT), DRAG_C1 = (1 - DRAG_E) / DRAG, DRAG_C2 = (DT - DRAG_C1) / DRAG;

// The stop distance of a ball rolling at v on a flat green: dv/dt = -DECEL -
// DRAG·v integrates to D(v) = v/DRAG - (DECEL/DRAG²)·ln(1 + DRAG·v/DECEL).
// WSR's v0 at power 0.1 / 0.5 / 1.0 / 2.5 gives 1.77 / 10.20 / 20.45 / 48.09
// yd against its simulator's 1.77 / 10.21 / 20.46 / 48.12 (tools/test-putt.mjs).
export function flatStop(v) {
  return v > 0 ? v / DRAG - (DECEL / (DRAG * DRAG)) * Math.log(1 + (DRAG * v) / DECEL) : 0;
}
// its inverse, the speed that stops at exactly D yd on a flat green (bisection;
// D(v) rises with v and D(60 yd/s) is 189 yd, far past any green)
export function vFlat(D) {
  if (!(D > 0)) return 0;
  let lo = 0, hi = 60;
  while (flatStop(hi) < D) hi *= 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (flatStop(m) < D) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---- the cup ----
// WSR's cup is a pit of radius 1.5 u (0.164 yd) and depth 3 u; its simulator
// holes a ball at ~1 m/s up to 1.25 u (0.137 yd) off the centre line and misses
// at 1.5 u, so the effective capture half-width is 0.14-0.16 yd: a ball whose
// path comes within CUP_R of the centre is holed if it is slow enough there.
export const CUP_R = 0.15;
// Slow enough: WSR drops a centred putt that would have rolled on ≤ ~4.4 yd
// past the cup and lips out one that would roll ≥ ~6 yd past. With this
// physics a ball that rolls 4.4 yd more is doing vFlat(4.4) = 4.07 yd/s
// (0.155 u/tick), so that is the cap; faster balls run on and the ragged 4.4-6
// yd band counts as a miss. The decode's "4.7 yd/s at the rim" (0.18 u/tick,
// the middle of its 0.17-0.20 boundary) is the same curve further out: at
// 4.7 yd/s this physics rolls 5.6 yd more, inside that band. Without the drag
// 4.4 yd past would take only 3.33 yd/s and 4.7 yd/s would run 8.8 yd: the
// 0.24/s drag is what puts the decode's two numbers on one curve.
export const V_CAP = vFlat(4.4);

// ---- the launch ----
// WSR launches the putt horizontally, so on a slope the ball does not start
// rolling along it: downhill it leaves the surface, uphill it strikes into it,
// and it hops a few times (restitution 0.5) for about 4·v0·tanθ/g s, with the
// full vertical gravity in the air and a friction impulse at each landing.
// The net is a change of the rolling speed in proportion to v0 (every term
// scales with it). LAUNCH_HOP[k] is that change as a fraction of v0 at a slope
// of (k - 11)° along the launch (+ uphill): the launch speed at which this
// model stops a power-1.0 putt on a plane where WSR's own simulator does
// (src/wsrsim.js run), against the same on a flat green (where this model
// stops 0.013 yd short of WSR's 20.461). Across powers 0.2-2.5 the measured
// fraction moves by under 0.004 (tools/test-putt.mjs (b) checks the stops).
// Without it this model stops the power-1.0 putt 0.73 yd short of WSR's 28.21
// yd down 6° and 0.71 yd past its 15.73 up 6°. Past the table it holds the
// end value: WSR's ball does not stop down a slope over 11.4°, and up one
// over 12° this model's ball rolls back (CREEP_DEG). Across the launch the
// change is left out (the launch is level that way).
const LAUNCH_HOP_FROM = -11;
const LAUNCH_HOP = [0.0487, 0.0431, 0.0378, 0.0315, 0.0249, 0.0196, 0.0152, 0.0109, 0.0074, 0.0043, 0.0020,
  0, -0.0022, -0.0055, -0.0098, -0.0152, -0.0210, -0.0283, -0.0369, -0.0459, -0.0565, -0.0669, -0.0792, -0.0920];
// slope along the launch as rise per yd (+ uphill) -> the fraction of v0 gained
export function launchHop(rise) {
  const n = LAUNCH_HOP.length - 1;
  const t = Math.max(0, Math.min(n, Math.atan(rise) / DEG - LAUNCH_HOP_FROM));
  const i = Math.min(n - 1, Math.floor(t)), f = t - i;
  return LAUNCH_HOP[i] * (1 - f) + LAUNCH_HOP[i + 1] * f;
}

// ---- the ground: slope fields ----
// A field is { W, H, src, grad(x, y, out) }: out[0], out[1] = the ground's
// rise per yd along +x and +y (map right, map down) at (x, y) yd from the green
// box's top-left corner (the uphill gradient ∇h).

// B4's green heights (src/terrain.js parseGreenHeights: a stepYd grid over the
// WSR green box plus 0.12 of it, int16 in unitYd above z0Yd, mask = inside the
// WSR green outline): the gradient at each node inside the outline by central
// differences over the nodes inside (one-sided at its edge); a node outside
// takes the gradient of the nearest node inside (breadth first), because the
// margins hold KCL holes (water 130-160 u down round H3's green, a 25 yd drop
// at the north edge of H17's box) that would read as cliffs. A node inside
// the outline next to a drop of over PIT_YD outside it counts as outside too:
// its height was sampled bilinearly from a raster pixel in the hole. That is
// 10 nodes, all on H3, beside its 16-17 yd water holes (one reads 0.58 yd below
// its neighbours, a 115 % slope); on the other 20 greens the biggest drop from
// a node inside to one outside is 0.20 yd. Cached per grid.
const PIT_YD = 1;
const gradCache = new WeakMap();
function nodeGrads(g) {
  let c = gradCache.get(g);
  if (c) return c;
  const { w, h, data } = g, n = w * h, s = g.unitYd / g.stepYd, pit = PIT_YD / g.unitYd;
  const mask = Uint8Array.from(g.mask);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (!g.mask[k]) continue;
    for (let dj = -1; dj <= 1 && mask[k]; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj, kk = jj * w + ii;
      if (ii >= 0 && jj >= 0 && ii < w && jj < h && !g.mask[kk] && data[k] - data[kk] > pit) { mask[k] = 0; break; }
    }
  }
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
// (tools/wsr-truth.json grid: 0.304 / 0.595 / 0.856), times the green's
// steepest slope slopeMaxPct (derived.json, from wsr-truth.json; without one
// the median of the 21, 11.4 %); θ = atan(pct / 100) down the painted
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
// clockwise, launched at pw x the speed that stops at the cup on a flat green.
// The forces: the friction DECEL·cos(θ/2) against the motion (never past a
// stop), the drag DRAG·v, the pull G·sin(θ/2) down the fall line, the slope
// read at the start of each step. Holed when a step's segment comes within
// CUP_R of the cup at no more than V_CAP.
// -> { holed, best, pass, endSp, path (box fractions, every 0.1 s; null with
// trace false), D (ball to cup, yd), v0 (the launch speed the gauge sets,
// yd/s), Dflat (its flat roll), stop (box fractions), t (s) }. best is the
// closest the ball comes to the cup while slow enough to drop (≤ V_CAP; the
// stop distance of a putt that dies short), pass the closest at any speed: a
// putt that runs over the cup at 6 yd/s passes at 0 but is no near miss, it
// stops 6 yd past.
const scratch = new Float64Array(2);
export function simPutt(field, ball, cup, angDeg, pw, { trace = true } = {}) {
  const { W, H } = field, gr = scratch;
  const D = Math.hypot((cup.x - ball.x) * W, (cup.y - ball.y) * H);
  const th = Math.atan2((cup.x - ball.x) * W, -((cup.y - ball.y) * H)) + angDeg * DEG;
  const ux = Math.sin(th), uy = -Math.cos(th);
  const v0 = pw * vFlat(D);
  let x = ball.x * W, y = ball.y * H;
  const cx = cup.x * W, cy = cup.y * H;
  field.grad(x, y, gr);
  const vL = v0 * (1 + launchHop(gr[0] * ux + gr[1] * uy));
  let vx = ux * vL, vy = uy * vL, sp = vL;
  const path = trace ? [[ball.x, ball.y]] : null;
  const creep = Math.tan(CREEP_DEG * DEG);
  let holed = false, best = vL <= V_CAP ? D : Infinity, pass = D, step = 0;
  for (; step < STEP_CAP; step++) {
    field.grad(x, y, gr);
    const s = Math.hypot(gr[0], gr[1]);
    if (sp < STOP_V && s <= creep) break;
    // the pull and the friction, held over the step (the friction never more
    // than stops the ball within it)
    const half = Math.atan(s) / 2;
    let ax = 0, ay = 0;
    if (s > 0) { const k = (G * Math.sin(half)) / s; ax = -k * gr[0]; ay = -k * gr[1]; }
    if (sp > 0) { const k = Math.min(DECEL * Math.cos(half), sp / DT) / sp; ax -= k * vx; ay -= k * vy; }
    const nvx = vx * DRAG_E + ax * DRAG_C1, nvy = vy * DRAG_E + ay * DRAG_C1;
    const nx = x + vx * DRAG_C1 + ax * DRAG_C2, ny = y + vy * DRAG_C1 + ay * DRAG_C2;
    const nsp = Math.hypot(nvx, nvy);
    // the segment's closest approach to the cup, and the speed there
    const dx = nx - x, dy = ny - y, L2 = dx * dx + dy * dy;
    const f = L2 > 0 ? Math.min(1, Math.max(0, ((cx - x) * dx + (cy - y) * dy) / L2)) : 0;
    const dc = Math.hypot(x + f * dx - cx, y + f * dy - cy), spc = sp + f * (nsp - sp);
    if (dc < pass) pass = dc;
    if (spc <= V_CAP && dc < best) best = dc;
    x = nx; y = ny; vx = nvx; vy = nvy;
    if (dc <= CUP_R && spc <= V_CAP) { holed = true; x = cx; y = cy; vx = 0; vy = 0; sp = 0; step++; break; }
    sp = nsp;
    if (trace && (step + 1) % PATH_EVERY === 0) path.push([x / W, y / H]);
  }
  if (trace) path.push([x / W, y / H]);
  // a ball still fast at the 20 s cap (running away down a slope past CREEP_DEG)
  if (!(best < Infinity)) best = Math.hypot(x - cx, y - cy);
  return { holed, best, pass, endSp: sp, path, D, v0, Dflat: flatStop(v0), stop: [x / W, y / H], t: step * DT };
}

// The read: the angle scan ±35° (5°) then ±4° (1°) round the best, the power
// scan 0.7-1.55 (0.085) then ±0.08 (0.02), relative to the flat-green speed
// for the distance; a holed putt scores below any miss and the softer the
// better, a miss by its closest approach while slow enough to drop (best: a
// putt racing over the cup is no near miss). The winner is run again for its
// path.
export function solvePutt(field, ball, cup) {
  const cost = (r, pw) => (r.holed ? -2 + pw * 0.1 : r.best + Math.max(0, r.best - CUP_R) * 0.3);
  let best = null;
  const tryOne = (a, p) => {
    const r = simPutt(field, ball, cup, a, p, { trace: false });
    const c = cost(r, p);
    if (!best || c < best.c) best = { c, a, p, r };
  };
  for (let a = -35; a <= 35; a += 5) for (let p = 0.7; p <= 1.55; p += 0.085) tryOne(a, p);
  const { a: a0, p: p0 } = best;
  for (let a = a0 - 4; a <= a0 + 4; a += 1) for (let p = Math.max(0.5, p0 - 0.08); p <= p0 + 0.08; p += 0.02) tryOne(a, p);
  best.r = simPutt(field, ball, cup, best.a, best.p);
  return best;
}

// ---- the gauge ----
// WSR's putter: power -> stop on a flat green (its simulator, wsr-ground-phase.md
// section 6), linear between the rows; ≈ 20.5 yd x power, slightly concave.
export const PUTT_POWER_TABLE = [[0, 0], [0.1, 1.8], [0.2, 3.8], [0.3, 6.0], [0.4, 8.1], [0.5, 10.2], [0.6, 12.3], [0.7, 14.4],
  [0.8, 16.4], [0.9, 18.5], [1.0, 20.5], [1.25, 25.4], [1.5, 30.1], [2.0, 39.3], [2.5, 48.1]];
// The one Switch number: the flat roll of a full-gauge (4-bar) putt, yd. WSR's
// power 1.0 until logged flat putts fit it (WSR-shaped: the gauge -> distance
// curve keeps WSR's form, scaled).
export const GREEN_SPEED = 20.5;
const T1 = 20.5;
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
// the bars a putt of flat roll Dflat needs: 4·T⁻¹(Dflat / greenSpeed · 20.5)
// (over 4 = past a full gauge: WSR's putter reaches power 2.5 on the green,
// the Switch's gauge is unmeasured)
export const gaugeBars = (Dflat, greenSpeed = GREEN_SPEED) => 4 * puttPower((Dflat / greenSpeed) * T1);
// greenSpeed from logged putts ({ bars, rolled, flat }): the median of
// rolled / (T(bars / 4) / T(1)) over the flat rows; under 2 of them, WSR's
export function fitGreenSpeed(putts) {
  const est = (putts ?? []).filter((r) => r && r.flat !== false && r.bars > 0 && r.bars <= 4 && r.rolled > 0)
    .map((r) => (r.rolled * T1) / puttRoll(r.bars / 4)).sort((a, b) => a - b);
  if (est.length < 2) return { greenSpeed: GREEN_SPEED, n: est.length };
  const m = est.length >> 1;
  return { greenSpeed: est.length % 2 ? est[m] : (est[m - 1] + est[m]) / 2, n: est.length };
}
