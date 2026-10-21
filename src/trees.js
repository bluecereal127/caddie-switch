// A shot's flight checked against the course's trees: WSR's own tree
// collision shapes against the rec's flight path, so the solver can tell
// whether a shot passes over a canopy, under the branches, through the canopy
// or into a trunk (src/model.js solve). Pure (no React, DOM or Node API).
//
// The shapes are Wii Sports Resort's (tools/research/wsr-tree-collision.md and
// wsr-tree-shapes.json, decoded from main.dol on 2026-10-18: the constants
// 0x803f3ac8 writes, the tests 0x803f3630 / 0x803f34f8 / 0x803f3194 and the
// responses in 0x804138a0). Per PMP kind, in KCL units (0.1 m, 9.144 u/yd) at
// placement scale 1: radii scale with the tree's x scale (`size` = sx),
// heights with its y scale (`sy`), from the tree's base (`z`, the PMP
// object's own height, where WSR stands the shapes; build-derived ships it on
// the hole's datum). The ball (radius 0.5 u) is tested at its centre against
// the trunk capsule and the canopy sphere grown by that radius (not the cone,
// whose test ignores it). Every physics tick (1/240 s) WSR tests the ball
// against every tree: a trunk hit bounces it back (the normal speed reversed
// and halved, the tangential capped, the spin zeroed), so the shot ends at
// the tree; inside a canopy it keeps 0.98 of its speed a tick (palm fronds
// 0.94), so a ball that enters at speed drops out nearly dead under the tree
// (40 ticks across a 10 m canopy keep 0.45 of it). Either way the shot is
// lost, and the check needs no more than where the flight first meets one.
//   broadleaf (kind 2): trunk a vertical capsule of radius 6 sx up to 60 sy
//     with a rounded cap; canopy a sphere of radius 48 sx centred 100 sy up
//   conifer (kind 3): trunk a capsule of radius 4.4 sx to 70 sy; canopy a
//     cone, its base 40 sy up with radius 30 sx, its apex 170 sy up
//   palm (kind 6): WSR tests its own collision mesh (WS2_glf_tree3.kcl): a
//     trunk to 132 sy leaning 20 u along the tree's yaw and fronds 76 ... 170 sy
//     up, reaching about 70 sx from it. The yaw is not shipped, so a palm is a
//     vertical trunk capsule of radius 7 sx to 132 sy (the mesh's 6.7 at the
//     base, unleaned) and a frond slab from 76 sy to 170 sy up of radius 70 sx
//     centred on the trunk (the mesh's fronds are narrower above 140 sy, 44 sx
//     and less, and sit 15 sz off the trunk along the yaw): an approximation
// These are WSR's; Nintendo Switch Sports is another engine and may differ
// (its "Hit a Tree!" toast has no WSR counterpart). Against the canopy the
// minimap paints (build-derived: 68 sx across, its centre 54 sx NORTH of the
// trunk) the broadleaf's sphere is narrower, 0.72 of the painted radius at
// the median of the 327 on-course broadleaves (p10 0.67, max 0.95), but it
// is centred on the trunk, so its footprint runs out past the painted
// crown's southern edge on every one of them (median 50 u) and leaves the
// crown's northern half along the trunk's axis clear (0.54 of its extent at
// the median): a line through a drawn crown's northern edge can be clear,
// one along its southern edge is not, if the Switch kept the sphere. The
// research doc's "outer half untouched" is against the 3D model's larger
// drawn crown (~90-96 u at scale 1), not the map's.
import { YD } from "./wsrsim.js";

export const TREE_SHAPES = {
  2: { name: "broadleaf", trunk: { r: 6, top: 60 }, canopy: { type: "sphere", cy: 100, r: 48 } },
  3: { name: "conifer", trunk: { r: 4.4, top: 70 }, canopy: { type: "cone", y0: 40, r0: 30, y1: 170 } },
  6: { name: "palm", trunk: { r: 7, top: 132 }, canopy: { type: "slab", y0: 76, y1: 170, r: 70 } },
};
const BALL_R = 0.5;   // the ball's collision radius, u
// A player's own tree marker carries no kind or scale: a median broadleaf
// (the PMP's broadleaf x scales run 0.7-3.0, median 1.7), standing on the
// ground under the marker
export const OWN_TREE = { kind: 2, sx: 1.7, sy: 1.7 };
// the path's sample step and the corridor, yd: trees whose canopy footprint
// comes within NEAR of the path are the candidates (the nearest of them is
// reported when the path crosses no footprint)
const STEP = 0.5, NEAR = 3;
// the app's hole-map frame (map px): positions are fractions of it
const MAP_W = 250, MAP_H = 304;

// The trees in the shot line's frame: s = yd along the line from the ball,
// l = yd to its right, z = the base's height above the ground under the ball,
// yd; with the marker's id, kind, sx, sy and own (a player's marker).
//   markers   the hole's markers (holesMeta[n].markers): the pipeline's trees
//             (auto, with kind, size, sy, z) and the player's own (no auto)
//   ball      the ball, map fractions; bearing = the line's, degrees from N
//   scale     yd per map px; groundAt(x, y) = the ground's height on the
//             hole's datum at map fractions (src/terrain.js heightAt), null
//             where the terrain has none
// Skipped: an auto marker without a kind or scale (the v13 hand-placed
// seeds an old install keeps until derived.json's trees reach it). The
// off-course trees (`off`) are kept: WSR collides with every tree it
// places, and 61 of the 814 reach over course ground with their collision
// canopy (the tap rule and the Guide's count skip them, a different
// question). None of them stops a full-power flight from a tee to its
// most-seen pin (H7's default line passes under t7-25 by 12.4 yd), but
// other lines from the same tees that land on course fly through one: H13
// at 341 deg, the driver at 1.5 bars into t13-21's canopy at 84 yd; H15 at
// 13 deg through t15-36; H16 at 6 deg through t16-2; H19 at 269 deg through
// t19-27 (the R-B3 review's scan). A player's marker is OWN_TREE on the
// ground under it. Heights: heightAt is
// within 0.02 yd of the mesh at the median point but reads part way down
// within a sample (2 map px) of a cliff or a bank down to water (the 99th
// percentile 2.4 yd, the worst 20 yd at H7's cliffs), so a ball right at
// such an edge starts a little low against every tree (and a player's
// marker there stands a little low). A tree's own z is used as shipped,
// never the ground under its trunk: WSR stands the shapes on the PMP height,
// which on 16 of the 458 on-course trees is over a yard off the terrain's
// height there through heightAt (13 below it, 3 above; 4.5 yd below on H7).
// -> null when the ball's spot has no height.
export function treesAlong(markers, { ball, bearing, scale, groundAt }) {
  if (!ball || !(scale > 0) || bearing == null) return null;
  const h0 = groundAt(ball.x, ball.y);
  if (h0 == null) return null;
  const th = (bearing * Math.PI) / 180, sn = Math.sin(th), cs = Math.cos(th);
  const out = [];
  for (const m of markers ?? []) {
    let t;
    if (m.auto) {
      if (!TREE_SHAPES[m.kind] || !(m.size > 0)) continue;
      t = { kind: m.kind, sx: m.size, sy: m.sy > 0 ? m.sy : m.size, z: Number.isFinite(m.z) ? m.z : groundAt(m.x, m.y), own: false };
    } else t = { ...OWN_TREE, z: groundAt(m.x, m.y), own: true };
    // east and south of the ball, yd; the line runs (sin, -cos), its right (cos, sin)
    const ex = (m.x - ball.x) * MAP_W * scale, sy = (m.y - ball.y) * MAP_H * scale;
    out.push({ id: m.id, ...t, z: (t.z ?? h0) - h0, s: ex * sn - sy * cs, l: ex * cs + sy * sn });
  }
  return out;
}

// One tree's shape in yd: the trunk capsule (radius trunkR, the ball's
// included, from -trunkTop to +trunkTop about the base: WSR's capsule runs
// as far below its base as above, which only matters for a tree standing
// above the ground), the canopy and its footprint's radius `foot`.
function shapeOf(t) {
  const S = TREE_SHAPES[t.kind], c = S.canopy, g = { trunkR: (S.trunk.r * t.sx + BALL_R) / YD, trunkTop: (S.trunk.top * t.sy) / YD, type: c.type };
  if (c.type === "sphere") { g.cy = (c.cy * t.sy) / YD; g.foot = (c.r * t.sx + BALL_R) / YD; }
  else if (c.type === "cone") { g.y0 = (c.y0 * t.sy) / YD; g.y1 = (c.y1 * t.sy) / YD; g.foot = (c.r0 * t.sx) / YD; }
  else { g.y0 = (c.y0 * t.sy) / YD; g.y1 = (c.y1 * t.sy) / YD; g.foot = (c.r * t.sx) / YD; }
  return g;
}
// the canopy's lower and upper surface at horizontal distance d < foot from
// the trunk, yd above the base (the cone's upper one is its slant)
function band(g, d) {
  if (g.type === "sphere") { const w = Math.sqrt(g.foot * g.foot - d * d); return [g.cy - w, g.cy + w]; }
  if (g.type === "cone") return [g.y0, g.y1 - ((g.y1 - g.y0) * d) / g.foot];
  return [g.y0, g.y1];
}

// The path's samples, flat as s, l, y: every STEP yd from the ball to the
// carry (the last one at the carry itself), then every STEP yd on through the
// first BOUNCE_YD of the bounce, or to the furthest point the ball reaches if
// that is nearer (y = the ball centre's rise above where it sat at launch,
// interpolated between the run's frames, which are 1-1.5 yd apart at a full
// driver's launch; l = the aim's lateral offset in the air, the line itself
// after the carry). WSR checks the trees on every tick, the bounce's and the
// roll's too: in the Dolphin harness (tools/harness/REPORT.md section 4) hole
// 7's full 3-iron straight at t7-18 lands 1.9 yd short of the trunk's capsule
// and bounces into it, and the full 5-iron at t7-23 2.7 yd past its carry.
// The roll is not checked further: on a level-across line the port's roll
// leaves the ball where WSR's would be along the line but not across it, and
// a trunk is 1.3-1.5 yd wide; WSR's rolling ball passed 1.8-2.7 yd from three
// trunks the line ran into 16-29 yd past the carry, and stopped short of two
// on the outer ground the port rolls as fairway.
const BOUNCE_YD = 5;
function samplesOf(path, k, carry, aim) {
  const out = [];
  if (!(carry > 0) || !path || path.length < 2) return [0, 0, 0];
  let xEnd = 0;
  for (const p of path) if (p[0] > xEnd) xEnd = p[0];
  const end = Math.min(Math.max(carry, xEnd * k), carry + BOUNCE_YD);
  let i = 1;
  for (let s = 0; ; s = s < carry ? Math.min(carry, s + STEP) : Math.min(end, s + STEP)) {
    const x = s / k;
    while (i < path.length - 1 && path[i][0] < x) i++;
    const a = path[i - 1], b = path[i], f = b[0] > a[0] ? Math.min(1, Math.max(0, (x - a[0]) / (b[0] - a[0]))) : 1;
    const u = Math.min(1, s / carry);
    out.push(s, aim * u * (1 - u), a[1] + f * (b[1] - a[1]));
    if (s >= end) break;
  }
  return out;
}

// treeCheck(path, trees, ctx) -> { kind, at, tree, margin }
//   path   src/wsrsim.js run()'s path ([x, y, z] in WSR's yd every frame:
//          x along the shot, y the rise above the launch spot), the profile
//          run's over the terrain or the flat one, launch to rest
//   trees  treesAlong's list (s, l, z on the line's frame)
//   ctx    { k, carry, aim, ballZ }: k = the Switch's yd per WSR yd along
//          the shot (src/model.js scales the flight so it lands at the rec's
//          carry; the heights stay WSR's, so the check is WSR-shaped until
//          logged shots calibrate the trajectories), carry = the rec's (yd;
//          in the BOUNCE_YD past it only a hit counts: over, under and clear
//          are the flight's), aim = the rec's aim offset (yd, + right),
//          ballZ = the ball's height at launch above the ground under the
//          ball (its lift)
// The horizontal path is the line with the lateral offset
// lat(s) = aim (s / carry)(1 - s / carry): the ball leaves toward the aim
// point and the crosswind brings it back to the line at the carry. Per tree,
// with d the horizontal distance from the trunk and h the ball centre's
// height above the base at each sample: a trunk hit inside the capsule, a
// canopy hit inside the canopy, else over or under it where d < foot.
//   kind   "trunk" / "canopy": the first obstruction along the path (a
//          ball dead in a canopy never reaches the next tree); else "over" /
//          "under" for the tree the path crosses the footprint of with the
//          least clearance; else "clear"
//   at     yd along the path: the first sample inside (a hit), the closest
//          call (over / under), the nearest approach (clear)
//   tree   the tree's id; null when no tree comes within NEAR of the path
//   margin yd: over / under, the least vertical clearance to the canopy (its
//          slant on a cone); canopy, the most negative (minus the depth to
//          the nearer of the canopy's lower and upper surface at the deepest
//          sample); trunk, the ball's height against the trunk's top (with
//          its cap) where it hits, negative; clear, the horizontal gap from
//          the path to that tree's footprint (null with no tree within NEAR)
// A path that crosses a footprint above the canopy at one sample and below
// it at the next without a sample inside (only at the footprint's very edge,
// where the canopy is thinner than the 0.5 yd step's rise) clips it for a
// tick or two at most, which WSR's damping leaves at full speed: it counts
// as the side with the smaller clearance.
export function treeCheck(path, trees, { k = 1, carry = 0, aim = 0, ballZ = 0 } = {}) {
  const P = samplesOf(path, k, carry, aim), n = P.length / 3, sEnd = P[3 * (n - 1)];
  const latMax = Math.abs(aim) / 4, lift = ballZ + BALL_R / YD;
  let hit = null, close = null, near = null;
  for (const t of trees ?? []) {
    if (!TREE_SHAPES[t.kind]) continue;
    const g = shapeOf(t), reach = g.foot + NEAR;
    if (t.s < -reach || t.s > sEnd + reach || Math.abs(t.l) > latMax + reach) continue;
    // the samples from the first at or past t.s - reach to the first past
    // t.s + reach (s rises along them; STEP apart, but for the carry's own)
    let j0 = 0, hiJ = n;
    while (j0 < hiJ) { const m = (j0 + hiJ) >> 1; if (P[3 * m] < t.s - reach) j0 = m + 1; else hiJ = m; }
    let mine = null, clear = Infinity, clearAt = null, side = null, gap = Infinity, gapAt = null, rollDeep = 0;
    for (let j = j0; j < n; j++) {
      const s = P[3 * j], d = Math.hypot(s - t.s, P[3 * j + 1] - t.l), h = lift + P[3 * j + 2] - t.z;
      const hc = Math.max(-g.trunkTop, Math.min(g.trunkTop, h));
      if (d * d + (h - hc) * (h - hc) < g.trunkR * g.trunkR) {
        if (!mine) mine = { kind: "trunk", at: s, margin: h - (g.trunkTop + Math.sqrt(g.trunkR * g.trunkR - d * d)) };
        break;
      }
      const air = s <= carry;
      if (air && d - g.foot < gap) { gap = d - g.foot; gapAt = s; }
      if (d < g.foot) {
        const [lo, hi] = band(g, d);
        const c = h > lo && h < hi ? -Math.min(h - lo, hi - h) : h >= hi ? h - hi : lo - h;
        if (c < 0 && !mine) mine = { kind: "canopy", at: s, margin: c };
        if (air && c < clear) { clear = c; clearAt = s; side = c < 0 ? "canopy" : h >= hi ? "over" : "under"; }
        if (!air && c < rollDeep) rollDeep = c;
      }
      if (s > t.s + reach) break;
    }
    if (mine) {
      if (mine.kind === "canopy") mine.margin = mine.at <= carry ? clear : rollDeep;
      if (!hit || mine.at < hit.at) hit = { ...mine, tree: t.id };
    } else if (side) {
      if (!close || clear < close.margin) close = { kind: side, at: clearAt, tree: t.id, margin: clear };
    } else if (gap <= NEAR && (!near || gap < near.margin)) near = { kind: "clear", at: gapAt, tree: t.id, margin: gap };
  }
  return hit ?? close ?? near ?? { kind: "clear", at: null, tree: null, margin: null };
}
