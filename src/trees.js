// A shot's flight checked against the course's trees: Nintendo Switch Sports'
// own tree collision against the rec's flight path, so the solver can tell
// whether a shot passes over a canopy, under the branches, through a canopy
// (and how much of its speed that costs) or into a trunk (src/model.js
// solve). Pure (no React, DOM or Node API).
//
// The trees are NSS's (since 2026-10-25; WSR's PMP trees before): the dump's
// tree decode (tools/harness/state/eden/nss-golf-x/trees.json, trees.md, and
// the tree verifier's corrections) exported by tools/nss-trees-export.mjs into
// tools/nss-trees.json, which tools/build-derived.mjs ships as derived.json
// `trees` (ids t<hole>-<k>, the order of nss-trees.json). Each tree carries
// `col`, its collision as primitives in yd about its placement (x, y on the
// map, z = height above the hole's datum, NSS y 0 = public/terrain's datum),
// e = east, s = south (map y), u = up:
//   col.t  the trunk: polylines of tapered capsules, flat [e, s, u, r, ...] per
//          node (the stem from trees.json's 2 m stemSegments and, where it
//          forks, the limbs above the fork; simplified so they still hold
//          every decoded piece). Solid: GolfTree (attribute 15 Tree), the
//          mode-1 bounce with ReflectionH 0.4, ReflectionV 0.1 keeps 40 % of
//          the speed along the bark and returns 10 % of the normal speed, so
//          the ball drops at the tree and the shot ends there.
//   col.c  the canopy parts:
//          { type: "spheroid", c: [e, s, u], rh, rv }  a closed Leaf volume
//            (the TreeLeafNN spheres, the H08 primitives, the 6-sphere
//            satellite crowns, the actor broadleaves' blob fitted)
//          { type: "cone", c: [e, s], u0, u1, r0 }  a closed Leaf volume,
//            base radius r0 at u0, apex at u1 (the conifers)
//          { type: "bands", c: [e, s], u0, du, r: [...], mat, cover }  open
//            sheets (palm fronds; the actor conifers' branch sheets), band i
//            from u0 + i du to u0 + (i + 1) du of radius r[i] about c; mat
//            "palm_leaf" (GolfPalmLeaf) or "leaf" (H04's GolfLeaf fronds);
//            cover = the share of the footprint the sheets cover
// How NSS's ball meets a canopy (the NSO, 0xd38ec4 .. 0xd41c20; GolfBallMove-
// Param's Attr*; trees.md "How the ball meets a tree"): both leaf materials
// are pass-through, a canopy never stops or bounces the ball; it damps it.
//   Leaf: entering a closed volume sets a counter and a 0.5 s timer (at zero
//     it clears the counter); while it is set every 1/240 s tick takes
//     F / 4 = 0.03 / 4 of the horizontal speed and of a rising vertical speed
//     (a falling ball falls freely), so each tick inside keeps 0.9925 of them
//     (0.970 a 1/60 s frame, 0.164 a second) for at most 120 ticks after an
//     entry (0.405 at the most; entering another part of the same crown, a
//     satellite sphere, sets the timer again).
//   PalmLeaf: no volume; each tick the ball touches a sheet takes F = 0.08
//     (keeps 0.92). A crossing touches a sheet for about 2 r_ball / (speed per
//     tick) ticks, one at speed. Open sheets leave gaps: about half the lines
//     through the envelope meet none (cover). Leaf-material open sheets (H04's
//     fronds) are counted the same way (how the counter treats an open,
//     double-sided sheet is inferred, not decoded).
// The ball is a 0.056 m sphere (every primitive here grows by it).
// For the 2D check a canopy pass is therefore a speed loss, not the end of the
// shot: the samples inside a part give the ticks inside (the path's own time,
// ctx.dt per point), so the speed kept, and from that an estimate of how much
// shorter the shot finishes (`lossYd`: the air still to fly at the kept
// horizontal speed, the remaining flight time cut by a rising ball's damped
// climb, and the roll at the square of the kept speed). A pass that costs less
// than CLIP_YD is a graze; one that costs more makes the result "canopy" with
// the estimate (the solver's TREE badge: the ball comes up short of the rec's
// stop). After the kept speed falls below ON_PATH the rest of the path is no
// longer the ball's, so later trees are not checked.
//
// These are NSS's shapes, flown on whatever path the solver gives
// (src/model.js flightOf: WSR's flight until NSS's ball model lands there).
// The shapes are fits of the collision meshes (trees.md "Line check" and the
// tree verifier's: 99 % of random lines agree for the baked spheres and cones,
// 96 % for the actor broadleaves' blob; the stem segments and limbs the trunk
// polylines hold miss no line the trunk triangles stop and stop 7 % of those
// that pass, a little more after the simplification's 0.1-0.15 m; the sheet
// envelopes are "may touch"). Not in the set (tools/nss-trees-export.mjs):
// the 36 trees NSS gives no collision, H21's TreeLeaf21 crowns (placed only
// by the scenery scene GolfDesign_GolfCourse21Hub, so absent in play: those
// 28 off-course trees keep their trunks), the bushes and the leaf sheets on
// the ground.
//
// A tree without `col` (a derived.json from before the NSS export, or a
// merge that does not carry col) and a player's own marker are checked as
// the family's template (TREE_SHAPES, NSS's median on-course tree per unit of
// scale) at the marker's size / sy.

// m per yd; the ball's radius in yd
export const M_PER_YD = 0.9144;
export const BALL_R = 0.056 / M_PER_YD;
// NSS's tick, the leaf damping and its timer, the palm-leaf damping
export const TICK_HZ = 240;
export const LEAF_KEEP = 1 - 0.03 / 4, LEAF_MAX_TICKS = 120;
export const PALM_KEEP = 1 - 0.08;
// a pass costing less than CLIP_YD (yd of the finish) is a graze; past a kept
// speed of ON_PATH the ball is no longer on the path
export const CLIP_YD = 1, ON_PATH = 0.75;
const G = 10 / M_PER_YD;    // NSS's gravity, yd/s^2 (for the time a damped climb takes off)
const DT = 1 / 60;          // src/wsrsim.js run()'s path: one point a 60 Hz frame

// The family templates, metres per unit of the tree's scale (radii x sx,
// heights x sy, from its base): the medians of NSS's on-course trees (all of
// them actor trees, Object_Obj_Glf_<kind>, the kind mesh placed by its bone;
// tools/test-trees.mjs checks them against tools/nss-trees.json).
//   broadleaf (HardWood A-D): trunk r 0.85 to 8.0 (the stem's median band;
//     the limbs are not in the template), the leaf blob as a spheroid of
//     radius 7.4 / 6.3 centred 9.4 up
//   conifer (ConiferTree A-D): trunk r 0.42 tapering to 0.05 at 14.1; the
//     leaf core cone r 2.87 at 4.49 to its apex at 18.97; the branch sheets
//     (palm leaf) from 3.87 to 19.64 up in four bands, 5.70 / 4.86 / 3.67 /
//     1.84 about the trunk (each quarter's widest), 52 % covered
//   palm (PalmTree A/B): trunk r 0.82 to 12.76 (unleaned; NSS's lean 6 deg),
//     the fronds (palm leaf) from 7.87 to 17.04 up in four bands, 6.74 / 8.73
//     / 8.55 / 5.59 about the trunk (each quarter's widest; their own centre
//     stands 0.75 off it), 55 % covered
export const TREE_SHAPES = {
  2: { name: "broadleaf", trunk: { r0: 0.85, r1: 0.85, top: 8.0 },
    canopy: [{ type: "spheroid", cy: 9.4, rh: 7.42, rv: 6.34 }] },
  3: { name: "conifer", trunk: { r0: 0.42, r1: 0.05, top: 14.06 },
    canopy: [{ type: "cone", y0: 4.49, y1: 18.97, r0: 2.87 },
      { type: "bands", y0: 3.87, y1: 19.64, r: [5.7, 4.86, 3.67, 1.84], mat: "palm_leaf", cover: 0.52 }] },
  6: { name: "palm", trunk: { r0: 0.82, r1: 0.82, top: 12.76 },
    canopy: [{ type: "bands", y0: 7.87, y1: 17.04, r: [6.74, 8.73, 8.55, 5.59], mat: "palm_leaf", cover: 0.55 }] },
};
// A player's own tree marker carries no kind or scale: a median on-course
// broadleaf (NSS's actor HardWoods run 0.8-2.6 in x scale, median 1.46),
// standing on the ground under the marker
export const OWN_TREE = { kind: 2, sx: 1.46, sy: 1.46 };
// the path's sample step and the corridor, yd: trees whose footprint comes
// within NEAR of the path are the candidates (the nearest of them is reported
// when the path crosses no footprint)
const STEP = 0.5, NEAR = 3;
// the app's hole-map frame (map px): positions are fractions of it
const MAP_W = 250, MAP_H = 304;

// A template's col (yd about the base) for a family at x scale sx, y scale sy
export function templateCol(kind, sx, sy) {
  const S = TREE_SHAPES[kind];
  if (!S) return null;
  const Y = (v) => v / M_PER_YD;
  const t = [[0, 0, 0, Y(S.trunk.r0 * sx), 0, 0, Y(S.trunk.top * sy), Y(S.trunk.r1 * sx)]];
  const c = S.canopy.map((p) => p.type === "spheroid" ? { type: "spheroid", c: [0, 0, Y(p.cy * sy)], rh: Y(p.rh * sx), rv: Y(p.rv * sy) }
    : p.type === "cone" ? { type: "cone", c: [0, 0], u0: Y(p.y0 * sy), u1: Y(p.y1 * sy), r0: Y(p.r0 * sx) }
    : { type: "bands", c: [0, 0], u0: Y(p.y0 * sy), du: Y(((p.y1 - p.y0) * sy) / p.r.length), r: p.r.map((r) => Y(r * sx)), mat: p.mat, cover: p.cover });
  return { t, c };
}

// A col on the line's frame (s along, l right of the line, both yd from the
// tree's placement; u from its z), every part grown by the ball's radius:
//   caps   Float64Array, 8 a capsule: s0, l0, u0, R0, s1, l1, u1, R1
//   tR, tLo, tHi   the trunk's horizontal reach about the placement and its
//          vertical extent (a cylinder holding every capsule)
//   parts  the canopy parts { type, s, l, foot (horizontal radius), ... }
//   reach  the whole tree's horizontal reach about the placement
const SPH = 1, CONE = 2, BANDS = 3;
function lineGeom(col, sn, cs) {
  const rot = (e, so) => [e * sn - so * cs, e * cs + so * sn];
  const caps = [];
  let tR = 0, tLo = Infinity, tHi = -Infinity;
  for (const pl of col?.t ?? []) {
    const n = Math.floor(pl.length / 4);
    for (let i = 0; i < Math.max(1, n - 1); i++) {
      const a = 4 * i, b = n > 1 ? 4 * (i + 1) : a;
      const [s0, l0] = rot(pl[a], pl[a + 1]), [s1, l1] = rot(pl[b], pl[b + 1]);
      const R0 = pl[a + 3] + BALL_R, R1 = pl[b + 3] + BALL_R;
      caps.push(s0, l0, pl[a + 2], R0, s1, l1, pl[b + 2], R1);
      tR = Math.max(tR, Math.sqrt(s0 * s0 + l0 * l0) + R0, Math.sqrt(s1 * s1 + l1 * l1) + R1);
      tLo = Math.min(tLo, pl[a + 2] - R0, pl[b + 2] - R1); tHi = Math.max(tHi, pl[a + 2] + R0, pl[b + 2] + R1);
    }
  }
  const parts = [];
  let reach = tR;
  for (const c of col?.c ?? []) {
    const [s, l] = rot(c.c[0], c.c[1]);
    let p;
    if (c.type === "spheroid") p = { type: SPH, s, l, u: c.c[2], rh: c.rh + BALL_R, rv: c.rv + BALL_R, foot: c.rh + BALL_R };
    else if (c.type === "cone") p = { type: CONE, s, l, u0: c.u0 - BALL_R, u1: c.u1 + BALL_R, r0: c.r0 + BALL_R, foot: c.r0 + BALL_R };
    else if (c.type === "bands" && c.r?.length) {
      const r = c.r.map((v) => v + BALL_R);
      p = { type: BANDS, s, l, u0: c.u0, du: c.du, r, foot: Math.max(...r), sheets: true, mat: c.mat === "leaf" ? "leaf" : "palm_leaf", cover: c.cover };
    } else continue;
    parts.push(p);
    reach = Math.max(reach, Math.sqrt(s * s + l * l) + p.foot);
  }
  return { caps: Float64Array.from(caps), tR, tLo, tHi, parts, reach };
}

// The trees in the shot line's frame: s = yd along the line from the ball,
// l = yd to its right, z = the placement's height above the ground under the
// ball, yd; with the marker's id, kind, sx, sy, own (a player's marker) and
// g, its collision on the line's frame (lineGeom).
//   markers   the hole's markers (holesMeta[n].markers): the pipeline's trees
//             (auto, with kind, size, sy, z and col) and the player's own (no
//             auto)
//   ball      the ball, map fractions; bearing = the line's, degrees from N
//   scale     yd per map px; groundAt(x, y) = the ground's height on the
//             hole's datum at map fractions (src/terrain.js heightAt), null
//             where the terrain has none
// Skipped: an auto marker without a kind or scale (the v13 hand-placed seeds
// an old install keeps until derived.json's trees reach it). The off-course
// trees (`off`) are kept: NSS collides with every tree it places (the tap
// rule and the Guide's count skip them, a different question). A tree's z is
// its placement's height as shipped (the bone; NSS sinks most trunks into the
// ground, by 0.97 m at the median, and the capsules start where the trunk
// does), never the ground under it. A player's marker is OWN_TREE on the
// ground under it. Heights (src/terrain.js, NSS's collision): heightAt reads
// part way down within a sample (2 map px) of a cliff or a bank down to
// water, so a ball right at such an edge starts a little low against every
// tree. -> null when the ball's spot has no height.
export function treesAlong(markers, { ball, bearing, scale, groundAt }) {
  if (!ball || !(scale > 0) || bearing == null) return null;
  const h0 = groundAt(ball.x, ball.y);
  if (h0 == null) return null;
  const th = (bearing * Math.PI) / 180, sn = Math.sin(th), cs = Math.cos(th);
  const out = [];
  for (const m of markers ?? []) {
    let t, col;
    if (m.auto) {
      if (!TREE_SHAPES[m.kind] || !(m.size > 0)) continue;
      t = { kind: m.kind, sx: m.size, sy: m.sy > 0 ? m.sy : m.size, z: Number.isFinite(m.z) ? m.z : groundAt(m.x, m.y), own: false };
      col = m.col && (Array.isArray(m.col.t) || Array.isArray(m.col.c)) ? m.col : templateCol(t.kind, t.sx, t.sy);
    } else {
      t = { ...OWN_TREE, z: groundAt(m.x, m.y), own: true };
      col = templateCol(OWN_TREE.kind, OWN_TREE.sx, OWN_TREE.sy);
    }
    // east and south of the ball, yd; the line runs (sin, -cos), its right (cos, sin)
    const ex = (m.x - ball.x) * MAP_W * scale, so = (m.y - ball.y) * MAP_H * scale;
    out.push({ id: m.id, ...t, z: (t.z ?? h0) - h0, s: ex * sn - so * cs, l: ex * cs + so * sn, g: lineGeom(col, sn, cs) });
  }
  return out;
}
// a tree given without g (a synthetic one: id, kind, sx, sy, z, s, l) is its
// family's template
const tmplCache = new WeakMap();
function geomOf(t) {
  if (t.g) return t.g;
  if (!tmplCache.has(t)) tmplCache.set(t, TREE_SHAPES[t.kind] ? lineGeom(templateCol(t.kind, t.sx, t.sy > 0 ? t.sy : t.sx), 0, 1) : null);
  return tmplCache.get(t);
}

// The path's samples, 6 numbers each: s, l, y, t, vh, vy (yd along the line,
// yd right of it, the ball's rise above where it sat at launch, s since
// launch, horizontal and vertical speed in yd/s); every STEP yd from the ball
// to the carry (the last at the carry itself), then on through the first
// BOUNCE_YD of the bounce, or to the furthest point the ball reaches if that
// is nearer. y, t and the speeds are interpolated between the run's points
// (dt apart); l = the aim's lateral offset in the air, the line itself after
// the carry. The bounce is checked because the ball meets trees on every
// tick (in WSR's Dolphin harness hole 7's full 3-iron bounced into t7-18's
// trunk 1.9 yd past its carry); the roll beyond is not, the port's roll being
// level across the line. -> { P, n, rest (yd: where the path ends), yLand (y
// at the carry) }
const BOUNCE_YD = 5;
function samplesOf(path, k, carry, aim, dt) {
  if (!(carry > 0) || !path || path.length < 2) return { P: new Float64Array(6), n: 1, rest: 0, yLand: 0 };
  let xEnd = 0;
  for (const p of path) if (p[0] > xEnd) xEnd = p[0];
  const rest = Math.max(carry, xEnd * k), end = Math.min(rest, carry + BOUNCE_YD);
  const out = [];
  let i = 1, yLand = 0;
  for (let s = 0; ; s = s < carry ? Math.min(carry, s + STEP) : Math.min(end, s + STEP)) {
    const x = s / k;
    while (i < path.length - 1 && path[i][0] < x) i++;
    const a = path[i - 1], b = path[i], f = b[0] > a[0] ? Math.min(1, Math.max(0, (x - a[0]) / (b[0] - a[0]))) : 1;
    const u = Math.min(1, s / carry), y = a[1] + f * (b[1] - a[1]);
    if (s === carry) yLand = y;
    out.push(s, aim * u * (1 - u), y, (i - 1 + f) * dt, ((b[0] - a[0]) * k) / dt, (b[1] - a[1]) / dt);
    if (s >= end) break;
  }
  return { P: Float64Array.from(out), n: out.length / 6, rest, yLand };
}

// the closest approach of segments p0-p1 and q0-q1 (3D): the distance and
// the parameters along each (Ericson, Real-Time Collision Detection 5.1.9)
function segSeg(p0, p1, q0, q1) {
  const d1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], d2 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
  const r = [p0[0] - q0[0], p0[1] - q0[1], p0[2] - q0[2]];
  const a = d1[0] * d1[0] + d1[1] * d1[1] + d1[2] * d1[2], e = d2[0] * d2[0] + d2[1] * d2[1] + d2[2] * d2[2];
  const f = d2[0] * r[0] + d2[1] * r[1] + d2[2] * r[2];
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
  else if (a <= 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1[0] * r[0] + d1[1] * r[1] + d1[2] * r[2];
    if (e <= 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2], den = a * e - b * b;
      s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const dx = p0[0] + d1[0] * s - q0[0] - d2[0] * t, dy = p0[1] + d1[1] * s - q0[1] - d2[1] * t, dz = p0[2] + d1[2] * s - q0[2] - d2[2] * t;
  return { d: Math.sqrt(dx * dx + dy * dy + dz * dz), s, t };
}

// a point's gap to a tapered capsule q0-q1 (radius r0 .. r1), < 0 inside
function capGap(p, q0, q1, r0, r1) {
  const ex = q1[0] - q0[0], ey = q1[1] - q0[1], ez = q1[2] - q0[2], L2 = ex * ex + ey * ey + ez * ez;
  const t = L2 > 0 ? Math.min(1, Math.max(0, ((p[0] - q0[0]) * ex + (p[1] - q0[1]) * ey + (p[2] - q0[2]) * ez) / L2)) : 0;
  const dx = p[0] - q0[0] - t * ex, dy = p[1] - q0[1] - t * ey, dz = p[2] - q0[2] - t * ez;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r0 + t * (r1 - r0));
}

// a part's lower and upper surface at horizontal distance d from its centre
// (null outside its footprint); for bands the envelope's lowest and highest
// band wider than d
function bandOf(p, d) {
  if (d >= p.foot) return null;
  if (p.type === SPH) { const w = p.rv * Math.sqrt(1 - (d * d) / (p.rh * p.rh)); return [p.u - w, p.u + w]; }
  if (p.type === CONE) return [p.u0, p.u0 + (p.u1 - p.u0) * (1 - d / p.r0)];
  let lo = -1, hi = -1;
  for (let i = 0; i < p.r.length; i++) if (p.r[i] > d) { if (lo < 0) lo = i; hi = i; }
  return lo < 0 ? null : [p.u0 + lo * p.du, p.u0 + (hi + 1) * p.du];
}
// how deep inside part p a point at horizontal distance d, height h is (> 0
// inside: the distance to the nearer of the surfaces above and below it),
// else the vertical clearance to it (<= 0) and its side
function depthIn(p, d, h) {
  const b = bandOf(p, d);
  if (!b) return null;
  const [lo, hi] = b;
  if (p.type !== BANDS) {
    if (h > lo && h < hi) return { depth: Math.min(h - lo, hi - h) };
    return { depth: -(h >= hi ? h - hi : lo - h), side: h >= hi ? "over" : "under" };
  }
  // bands: the run of bands wider than d around h
  const i = Math.floor((h - p.u0) / p.du);
  if (i >= 0 && i < p.r.length && p.r[i] > d) {
    let a = i, z = i;
    while (a > 0 && p.r[a - 1] > d) a--;
    while (z < p.r.length - 1 && p.r[z + 1] > d) z++;
    return { depth: Math.min(h - (p.u0 + a * p.du), p.u0 + (z + 1) * p.du - h) };
  }
  if (h >= hi) return { depth: -(h - hi), side: "over" };
  if (h <= lo) return { depth: -(lo - h), side: "under" };
  // in a gap between bands at this distance: the nearer band's side
  let below = -Infinity, above = Infinity;
  for (let j = 0; j < p.r.length; j++) if (p.r[j] > d) { const bot = p.u0 + j * p.du, top = bot + p.du; if (top <= h) below = Math.max(below, top); if (bot >= h) above = Math.min(above, bot); }
  return h - below <= above - h ? { depth: -(h - below), side: "over" } : { depth: -(above - h), side: "under" };
}

// One pass's damping from its samples (indices into P, in order), up to
// sLimit along the path: the horizontal and vertical speed kept and the ticks
const sampleDt = (P, n, j) => (n < 2 ? 0 : j <= 0 ? P[6 + 3] - P[3] : j >= n - 1 ? P[6 * j + 3] - P[6 * (j - 1) + 3] : (P[6 * (j + 1) + 3] - P[6 * (j - 1) + 3]) / 2);
function keepOf(pass, P, n, sLimit = Infinity) {
  if (pass.sheets) {
    const j = pass.js[0];
    const v = Math.sqrt(P[6 * j + 4] ** 2 + P[6 * j + 5] ** 2) * M_PER_YD;   // m/s
    const ticks = Math.max(1, Math.ceil((2 * 0.056 * TICK_HZ) / Math.max(v, 1e-6)));
    const kp = Math.pow(PALM_KEEP, ticks);
    return { kh: kp, kv: P[6 * j + 5] > 0 ? kp : 1, ticks };
  }
  // each entry into a part (one the last sample was not in) sets the 0.5 s timer again
  let ticks = 0, up = 0, timer = 0, prev = 0;
  for (let i = 0; i < pass.js.length; i++) {
    const j = pass.js[i], m = pass.masks[i];
    if (P[6 * j] > sLimit) break;
    if (m & ~prev) timer = LEAF_MAX_TICKS;
    prev = m;
    const dtk = Math.min(timer, sampleDt(P, n, j) * TICK_HZ);
    timer -= dtk; ticks += dtk;
    if (P[6 * j + 5] > 0) up += dtk;
  }
  return { kh: Math.pow(LEAF_KEEP, ticks), kv: Math.pow(LEAF_KEEP, up), ticks };
}
// how much shorter a pass leaves the shot, yd: the air still to fly at the
// kept horizontal speed (and, for a rising ball, over the shorter flight its
// damped climb leaves: ballistic times, drag and lift aside), the roll at the
// square of the kept speed
function lossOf(pass, P, kk, carry, rest, yLand) {
  const j = pass.js[pass.js.length - 1], sx = P[6 * j], vy = P[6 * j + 5];
  const air = Math.max(0, carry - sx), roll = Math.max(0, rest - Math.max(carry, sx));
  let ratio = 1;
  if (vy > 0 && air > 0) {
    const h = P[6 * j + 2] - yLand, tf = (v) => { const q = v * v + 2 * G * h; return q > 0 ? (v + Math.sqrt(q)) / G : null; };
    const t0 = tf(vy), t1 = tf(vy * kk.kv);
    if (t0 > 0 && t1 != null) ratio = Math.min(1, t1 / t0);
  }
  return air * (1 - kk.kh * ratio) + roll * (1 - kk.kh * kk.kh);
}

// treeCheck(path, trees, ctx) -> { kind, at, tree, margin, keep, lossYd, sheets?, p?, passes }
//   path   src/wsrsim.js run()'s path ([x, y, z] in yd every dt: x along the
//          shot, y the rise above the launch spot), the profile run's over the
//          terrain or the flat one, launch to rest
//   trees  treesAlong's list (s, l, z, g on the line's frame; a tree without
//          g is its family's template at sx, sy)
//   ctx    { k, carry, aim, ballZ, dt }: k = the Switch's yd per path yd along
//          the shot (src/model.js scales the flight so it lands at the rec's
//          carry; heights unscaled), carry = the rec's (yd; in the BOUNCE_YD
//          past it only a hit or a pass counts: over, under and clear are the
//          flight's), aim = the rec's aim offset (yd, + right), ballZ = the
//          ball's height at launch above the ground under it (its lift), dt =
//          the path's seconds per point (1/60, src/wsrsim.js)
// The horizontal path is the line with the lateral offset
// lat(s) = aim (s / carry)(1 - s / carry): the ball leaves toward the aim
// point and the crosswind brings it back to the line at the carry. Every tree
// within reach is met along it: a trunk capsule against each path segment
// (the closest approach, so a thin limb between two samples is not missed),
// a canopy part at each sample (inside, or over / under where the path
// crosses its footprint).
//   kind   "trunk": the path meets a trunk or limb (the first one, unless the
//          canopy passes before it already took ON_PATH of the speed);
//          "canopy": a canopy pass whose lossYd is CLIP_YD or more (the first
//          such; the ball flies on, slower: the shot finishes short);
//          else "over" / "under" for the tree whose canopy footprint the
//          flight crosses with the least clearance (a graze, a pass costing
//          less than CLIP_YD, counts here with a negative margin: over when
//          its deepest sample is above the part's middle); else "clear"
//   at     yd along the path: the hit (where the ball first touches the
//          capsule), the pass's entry (its first sample inside), the closest call
//          (over / under), the nearest approach (clear)
//   tree   the tree's id; null when no tree comes within NEAR of the path
//   margin yd: trunk, the closest approach less the capsule's radius
//          (negative); canopy, minus the pass's greatest depth inside the part;
//          over / under, the least vertical clearance (negative for a graze);
//          clear, the horizontal gap from the path to that tree's footprint
//          (null with no tree within NEAR)
//   keep   the horizontal speed the canopy passes leave (1 with none), up to
//          the hit for a trunk; lossYd the passes' estimated shortfall, yd
//          (for a trunk, only of the passes the ball left before it)
//   sheets, p  for a "canopy" through open sheets (palm fronds, conifer
//          branch sheets): true, and the chance the line meets a sheet at all
//          (the sheets' cover); the estimate assumes one crossing
//   passes every canopy pass up to the outcome: { tree, at, out, keep,
//          lossYd, ticks, sheets? }
export function treeCheck(path, trees, { k = 1, carry = 0, aim = 0, ballZ = 0, dt = DT } = {}) {
  const { P, n, rest, yLand } = samplesOf(path, k, carry, aim, dt), sEnd = P[6 * (n - 1)];
  const latMax = Math.abs(aim) / 4, lift = ballZ + BALL_R;
  const events = [];
  let close = null, near = null;
  const a3 = [0, 0, 0], b3 = [0, 0, 0], q0 = [0, 0, 0], q1 = [0, 0, 0];
  for (const t of trees ?? []) {
    const g = geomOf(t);
    if (!g) continue;
    const reach = g.reach + NEAR;
    if (t.s < -reach || t.s > sEnd + reach || Math.abs(t.l) > latMax + reach) continue;
    // the samples from the first at or past t.s - reach (s rises along them)
    let j0 = 0, hiJ = n;
    while (j0 < hiJ) { const m = (j0 + hiJ) >> 1; if (P[6 * m] < t.s - reach) j0 = m + 1; else hiJ = m; }
    let trunk = null, clear = Infinity, clearAt = null, side = null, gap = Infinity, gapAt = null;
    const open = [null, null], passes = [];
    let pds = 0, pdl = 0, ph = 0, havePrev = false;
    for (let j = Math.max(0, j0 - 1); j < n; j++) {
      const s = P[6 * j], ds = s - t.s, dl = P[6 * j + 1] - t.l, h = lift + P[6 * j + 2] - t.z;
      const air = s <= carry, d0 = Math.sqrt(ds * ds + dl * dl);
      // the trunk: the path segment from the last sample against each capsule
      if (!trunk && g.caps.length && havePrev && j >= j0) {
        // the segment's horizontal approach to the placement, and its heights, against the trunk's cylinder
        const ex = ds - pds, el = dl - pdl, L2 = ex * ex + el * el;
        const u = L2 > 0 ? Math.min(1, Math.max(0, -(pds * ex + pdl * el) / L2)) : 0;
        const hd = Math.sqrt((pds + u * ex) ** 2 + (pdl + u * el) ** 2);
        if (hd <= g.tR && Math.min(h, ph) <= g.tHi && Math.max(h, ph) >= g.tLo) {
          a3[0] = pds; a3[1] = pdl; a3[2] = ph; b3[0] = ds; b3[1] = dl; b3[2] = h;
          const C = g.caps;
          for (let c = 0; c < C.length; c += 8) {
            q0[0] = C[c]; q0[1] = C[c + 1]; q0[2] = C[c + 2]; q1[0] = C[c + 4]; q1[1] = C[c + 5]; q1[2] = C[c + 6];
            const x = segSeg(a3, b3, q0, q1), R = C[c + 3] + x.t * (C[c + 7] - C[c + 3]);
            if (!(x.d < R)) continue;
            // where along the segment the ball first touches it (bisected from the segment's start
            // to its closest approach; the start itself when it is already inside)
            let lo = 0, hi = x.s;
            if (capGap(a3, q0, q1, C[c + 3], C[c + 7]) > 0) for (let it = 0; it < 14; it++) {
              const m = (lo + hi) / 2, pm = [a3[0] + m * (b3[0] - a3[0]), a3[1] + m * (b3[1] - a3[1]), a3[2] + m * (b3[2] - a3[2])];
              if (capGap(pm, q0, q1, C[c + 3], C[c + 7]) > 0) lo = m; else hi = m;
            } else hi = 0;
            const sHit = P[6 * (j - 1)] + hi * (s - P[6 * (j - 1)]);
            if (!trunk || sHit < trunk.at) trunk = { at: sHit, margin: x.d - R };
          }
        }
      }
      pds = ds; pdl = dl; ph = h; havePrev = true;
      if (j < j0) continue;
      if (s > t.s + reach) break;
      if (d0 > g.reach + NEAR) {
        for (const w of [0, 1]) if (open[w]) { passes.push(open[w]); open[w] = null; }
        continue;
      }
      // the canopy: inside a closed volume (0) or the sheets' envelope (1)
      const inside = [false, false], deepest = [0, 0];
      let mask = 0;
      for (let pi = 0; pi < g.parts.length; pi++) {
        const p = g.parts[pi];
        const d = Math.sqrt((ds - p.s) ** 2 + (dl - p.l) ** 2);
        if (air && d - p.foot < gap) { gap = d - p.foot; gapAt = s; }
        const q = depthIn(p, d, h);
        if (!q) continue;
        const w = p.sheets ? 1 : 0;
        if (q.depth > 0) {
          if (!w) mask |= 1 << Math.min(pi, 30);
          if (!inside[w] || q.depth > deepest[w]) deepest[w] = q.depth;
          inside[w] = true;
          if (!open[w]) open[w] = { js: [], masks: [], depth: 0, sheets: !!p.sheets, cover: p.cover };
          if (air && -q.depth < clear) {
            const b = bandOf(p, d);
            clear = -q.depth; clearAt = s; side = h >= (b[0] + b[1]) / 2 ? "over" : "under";
          }
        } else if (air && q.depth < 0 && -q.depth < clear) { clear = -q.depth; clearAt = s; side = q.side; }
      }
      // a tree with no canopy: over its trunk where the path crosses its reach
      if (!g.parts.length) {
        if (air && d0 - g.tR < gap) { gap = d0 - g.tR; gapAt = s; }
        if (air && d0 < g.tR && h >= g.tHi && h - g.tHi < clear) { clear = h - g.tHi; clearAt = s; side = "over"; }
      }
      for (const w of [0, 1]) {
        if (inside[w]) { open[w].js.push(j); open[w].masks.push(w ? 0 : mask); open[w].depth = Math.max(open[w].depth, deepest[w]); }
        else if (open[w]) { passes.push(open[w]); open[w] = null; }
      }
    }
    for (const w of [0, 1]) if (open[w]) passes.push(open[w]);
    if (trunk) events.push({ type: "trunk", at: trunk.at, tree: t.id, margin: trunk.margin });
    for (const ps of passes) {
      // a pass that the trunk of its own tree cuts short ends there
      if (trunk && P[6 * ps.js[0]] > trunk.at) continue;
      const kk = keepOf(ps, P, n), loss = lossOf(ps, P, kk, carry, rest, yLand);
      events.push({ type: "pass", at: P[6 * ps.js[0]], out: P[6 * ps.js[ps.js.length - 1]], tree: t.id, margin: -ps.depth, keep: kk.kh, ticks: kk.ticks, lossYd: loss, sheets: ps.sheets, cover: ps.cover, ps });
    }
    if (side && (!close || clear < close.margin)) close = { kind: side, at: clearAt, tree: t.id, margin: clear };
    else if (!side && gap <= NEAR && (!near || gap < near.margin)) near = { kind: "clear", at: gapAt, tree: t.id, margin: gap };
  }
  // the events in the order the ball meets them (a pass before a hit at the same spot)
  events.sort((p, q) => p.at - q.at || (p.type === q.type ? (p.tree < q.tree ? -1 : p.tree > q.tree ? 1 : 0) : p.type === "pass" ? -1 : 1));
  const used = [];
  let keep = 1, loss = 0, sig = null, hit = null;
  for (const e of events) {
    // the speed kept when the ball gets here (a pass still open here counts up to it); below
    // ON_PATH it is no longer on the path, and neither this nor anything later is reached
    let kAt = 1;
    for (const u of used) kAt *= u.out >= e.at ? keepOf(u.ps, P, n, e.at).kh : u.keep;
    if (kAt < ON_PATH) break;
    if (e.type === "trunk") { hit = { ...e, keep: kAt }; break; }
    used.push(e); keep *= e.keep; loss += e.lossYd;
    if (!sig && e.lossYd >= CLIP_YD) sig = e;
  }
  const passes = used.map((e) => ({ tree: e.tree, at: e.at, out: e.out, keep: e.keep, lossYd: e.lossYd, ticks: e.ticks, ...(e.sheets ? { sheets: true } : {}) }));
  // a trunk ends the shot at the tree: lossYd counts only the passes the ball left before it
  if (hit) return { kind: "trunk", at: hit.at, tree: hit.tree, margin: hit.margin, keep: hit.keep, lossYd: passes.filter((p) => p.out < hit.at).reduce((s, p) => s + p.lossYd, 0), passes };
  if (sig) return { kind: "canopy", at: sig.at, tree: sig.tree, margin: sig.margin, keep, lossYd: loss, ...(sig.sheets ? { sheets: true, p: sig.cover } : {}), passes };
  const base = close ?? near ?? { kind: "clear", at: null, tree: null, margin: null };
  return { ...base, keep, lossYd: loss, passes };
}
