// WSR's full shot in 3D over a hole's own KCL triangles: src/wsrsim.js's
// run() tick loop, unchanged, flown over a ground object (run({ ground }))
// that answers the contact routine's sphere query from the collision
// triangles round the ball, so cross-slopes, mounds, banks, walls and the real
// shape of a landing area act on the bounce and the roll. The 2D port
// (lib/course.mjs kclProfile + simOf) is level across its line; this is not.
//
// run()'s contact block already resolves a full 3D normal (v.n, the push-out
// n * depth, the impulse -(1 + B)(v.n)n - min(|t|, A vn) t^ in all three
// components, the ring and the smoothed normal in 3D, gravity along the
// bisector with its across part, z integrated, the stop rule's kick along
// normalize(n.x, 0, n.z)), so the physics stays run()'s; only the ground is
// new. The query follows lib/kclputt.mjs (validated on WSR's putt traces):
// one contact a tick, the deepest triangle whose interior the ball centre
// projects into, among the attributes the contact routine resolves (0x1de5e).
//
// Frame (run()'s): origin at the ball's ground under `from`, x along the
// launch line (sin L, cos L) in world (X, Z), y up, z across to the RIGHT
// (-cos L, sin L), the 2D port's handedness (lateral > 0 is right). World
// units are KCL units (0.1 m, 9.144 per yd).
//
// Hazards (tools/research/wsr-ground-phase.md 3.2): water (7) and valley
// (13) are not contacts; a ball whose sphere reaches one is in it (event 7 /
// 13, the penalty) and the shot ends there; resting on outer ground (4) is out
// of bounds, and so is falling 100 u below the course's lowest vertex. KCL
// water lying level inside a green (lib/kclputt.mjs embeddedWater) is green.

import { YD } from "./course.mjs";
import { embeddedWater } from "./kclputt.mjs";
import { run } from "../../lib/wsrsim.mjs";

const CONTACT_MASK = 0x1de5e;
const HAZ_ATTR = { 7: 1, 13: 3 };          // water -> hazard 1, valley -> 3
const BALL_R = 0.5;
const CELL = 10;                           // u, the packed grid's cell
// u: a centre's projection can leave its triangle's XZ box by |dist| n.xz, and
// in the swept case (the tick carried the centre through the face) |dist| is
// up to the tick's travel: the driver leaves at 3.39 u/tick (CLUBS p04), so
// a steep face must be listed in every cell within that reach + r of its box,
// or a fast ball whose centre crosses a cell line as it crosses the face
// tunnels through it (review 2026-10-22: PAD was 1.0)
const PAD = 4.0;
const LIE_SURF = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 15: "fairway", 16: "bunker" };
export const lieSurface = (lie) => LIE_SURF[lie] ?? "fairway";

// ---- the mesh packed for the sphere query (once per mesh) ----
const packs = new WeakMap();
export function packMesh(m) {
  let p = packs.get(m);
  if (p) return p;
  const emb = embeddedWater(m);
  const ids = [];
  let minY = Infinity;
  for (let t = 0; t < m.nt; t++) {
    for (let k = 0; k < 3; k++) minY = Math.min(minY, m.tri[9 * t + 3 * k + 1]);
    const a = emb.has(t) ? 6 : m.attr[t];
    if (((1 << a) & CONTACT_MASK) || HAZ_ATTR[a]) ids.push(t);
  }
  const n = ids.length, V = new Float64Array(9 * n), N = new Float64Array(3 * n), E = new Float64Array(9 * n), ATT = new Uint8Array(n);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, degenerate = 0;
  const SLIVER = new Uint8Array(n);
  ids.forEach((t, k) => {
    for (let j = 0; j < 9; j++) V[9 * k + j] = m.tri[9 * t + j];
    ATT[k] = emb.has(t) ? 6 : m.attr[t];
    // the face normal from the triangle's own winding (the KCL's: every
    // non-steep triangle of the meshes winds up, so walls keep the side they
    // face; lib/course.mjs's nrm flips every normal to y >= 0)
    const o = 9 * k;
    const ux = V[o + 3] - V[o], uy = V[o + 4] - V[o + 1], uz = V[o + 5] - V[o + 2];
    const vx = V[o + 6] - V[o], vy = V[o + 7] - V[o + 1], vz = V[o + 8] - V[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) { degenerate++; nx = 0; ny = 1; nz = 0; }   // a sliver: skipped below (a zero normal would pass every edge test at depth r)
    else { nx /= nl; ny /= nl; nz /= nl; }
    N[3 * k] = nx; N[3 * k + 1] = ny; N[3 * k + 2] = nz;
    if (nl < 1e-9) SLIVER[k] = 1;
    // the edges' outward in-plane normals (e x n, away from the third vertex)
    for (let e = 0; e < 3; e++) {
      const i = o + 3 * e, j = o + 3 * ((e + 1) % 3), c = o + 3 * ((e + 2) % 3);
      const ex = V[j] - V[i], ey = V[j + 1] - V[i + 1], ez = V[j + 2] - V[i + 2];
      let qx = ey * nz - ez * ny, qy = ez * nx - ex * nz, qz = ex * ny - ey * nx;
      const ql = Math.hypot(qx, qy, qz) || 1; qx /= ql; qy /= ql; qz /= ql;
      if ((V[c] - V[i]) * qx + (V[c + 1] - V[i + 1]) * qy + (V[c + 2] - V[i + 2]) * qz > 0) { qx = -qx; qy = -qy; qz = -qz; }
      E[o + 3 * e] = qx; E[o + 3 * e + 1] = qy; E[o + 3 * e + 2] = qz;
    }
    for (let v = 0; v < 3; v++) { x0 = Math.min(x0, V[o + 3 * v]); x1 = Math.max(x1, V[o + 3 * v]); z0 = Math.min(z0, V[o + 3 * v + 2]); z1 = Math.max(z1, V[o + 3 * v + 2]); }
  });
  x0 -= PAD; z0 -= PAD;
  const gw = Math.ceil((x1 + PAD - x0) / CELL) + 1, gh = Math.ceil((z1 + PAD - z0) / CELL) + 1;
  const count = new Int32Array(gw * gh + 1);
  const each = (k, f) => {
    const o = 9 * k;
    const a = Math.min(V[o], V[o + 3], V[o + 6]), b = Math.max(V[o], V[o + 3], V[o + 6]);
    const c = Math.min(V[o + 2], V[o + 5], V[o + 8]), d = Math.max(V[o + 2], V[o + 5], V[o + 8]);
    for (let gz = Math.floor((c - PAD - z0) / CELL); gz <= Math.floor((d + PAD - z0) / CELL); gz++)
      for (let gx = Math.floor((a - PAD - x0) / CELL); gx <= Math.floor((b + PAD - x0) / CELL); gx++)
        if (gx >= 0 && gz >= 0 && gx < gw && gz < gh) f(gz * gw + gx);
  };
  for (let k = 0; k < n; k++) if (!SLIVER[k]) each(k, (c) => count[c + 1]++);
  const start = new Int32Array(gw * gh + 1);
  for (let i = 0; i < gw * gh; i++) start[i + 1] = start[i] + count[i + 1];
  const fill = start.slice(0, gw * gh), cells = new Int32Array(start[gw * gh]);
  const top = new Float64Array(gw * gh).fill(-Infinity);   // the highest vertex per cell (the fast path)
  for (let k = 0; k < n; k++) {
    if (SLIVER[k]) continue;
    const yMax = Math.max(V[9 * k + 1], V[9 * k + 4], V[9 * k + 7]);
    each(k, (c) => { cells[fill[c]++] = k; if (yMax > top[c]) top[c] = yMax; });
  }
  p = { n, V, N, E, ATT, x0, z0, gw, gh, start, cells, top, minY, degenerate };
  packs.set(m, p);
  return p;
}

// the highest contact surface under world (X, Z) (water and walls reported
// too): { y, attr } or null; lastLand's raycast
function topAt(p, X, Z) {
  const gx = Math.floor((X - p.x0) / CELL), gz = Math.floor((Z - p.z0) / CELL);
  if (gx < 0 || gz < 0 || gx >= p.gw || gz >= p.gh) return null;
  const { V, ATT, start, cells } = p;
  let best = null;
  for (let s = start[gz * p.gw + gx], e = start[gz * p.gw + gx + 1]; s < e; s++) {
    const k = cells[s], o = 9 * k;
    const ax = V[o], az = V[o + 2], bx = V[o + 3], bz = V[o + 5], cx = V[o + 6], cz = V[o + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((bz - cz) * (X - cx) + (cx - bx) * (Z - cz)) / d, l2 = ((cz - az) * (X - cx) + (ax - cx) * (Z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const y = l1 * V[o + 1] + l2 * V[o + 4] + l3 * V[o + 7];
    if (!best || y > best.y) best = { y, attr: ATT[k] };
  }
  return best;
}

// The ground in the shot's line frame for run({ ground }). from = [X, Y, Z]
// world (Y the ball centre, as the harness reads it; a tee ball sits 0.4 u
// higher than a fairway ball); the frame's y = 0 is BALL_R under the centre,
// so run() starts the ball exactly at `from`. With fromY false (or no Y) the
// ball starts on the highest contact surface under it, like kclProfile.
// After the run the object holds what the shot met: hazard (0 | 1 water | 2
// out of bounds | 3 valley), haz (the line-frame point it entered), first
// (the first contact, line frame), lastAttr (the last tick's contact) and
// attrMax (the largest attribute among the last four ticks' contacts: WSR's
// ball+0xb4, the ring's maximum, which is the lie the game reads at rest and
// the attribute its stop rule tests; the two differ only on a ball resting
// across a seam, where WSR takes the larger, e.g. outer ground 4 over
// fairway 1).
export function kclGround(m, from, launch, { fromY = true } = {}) {
  const p = packMesh(m);
  const { V, N, E, ATT, x0, z0, gw, gh, start, cells, top } = p;
  const ax = Math.sin(launch), az = Math.cos(launch);   // along
  const rx = -az, rz = ax;                               // right
  const FX = from[0], FZ = from[2];
  let Y0;
  if (fromY && Number.isFinite(from[1])) Y0 = from[1] - BALL_R;
  else { const g = topAt(p, FX, FZ); Y0 = g ? g.y : from[1] - BALL_R; }
  const yFloor = p.minY - 100;
  // the previous query's centre (world), for the swept side test
  let PX = FX, PY = Y0 + BALL_R, PZ = FZ;
  // every tick's centre, for lastLand's walk back
  const track = new Float64Array(3 * 8200);
  const ringA = [0, 0, 0, 0];   // the last four queries' contact attributes (0: none), as run()'s ring
  const G = {
    hazard: 0, haz: null, first: null, lastAttr: 0, attrMax: 0, ticks: 0, Y0, p,
    toWorld: (x, y, z) => [FX + ax * x + rx * z, Y0 + y, FZ + az * x + rz * z],
    toLine: (X, Y, Z) => { const dx = X - FX, dz = Z - FZ; return [dx * ax + dz * az, Y - Y0, dx * rx + dz * rz]; },
    // run() reads it once, at x = 0, for the launch height: the frame's y = 0
    heightAt: () => 0,
    // the highest surface along the line (yd along -> yd above y = 0), for callers
    groundAlong(xYd, zYd = 0) {
      const g = topAt(p, FX + (ax * xYd + rx * zYd) * YD, FZ + (az * xYd + rz * zYd) * YD);
      return g ? { h: (g.y - Y0) / YD, attr: g.attr } : null;
    },
    query(x, y, z, r, hit) {
      if (G.hazard) return 0;   // in a hazard: nothing more to touch (run() lets it fall)
      const X = FX + ax * x + rx * z, Y = Y0 + y, Z = FZ + az * x + rz * z;
      const qX = PX, qY = PY, qZ = PZ;
      PX = X; PY = Y; PZ = Z;
      if (G.ticks < 8200) { track[3 * G.ticks] = X; track[3 * G.ticks + 1] = Y; track[3 * G.ticks + 2] = Z; }
      const ri = G.ticks & 3;
      ringA[ri] = 0;
      G.ticks++;
      // 100 u below the course's lowest vertex: WSR stops the ball as out of
      // bounds (0x80412dfc) wherever it is, so this is tested before the cell
      // lookup (a ball that fell through a crack inside the grid never left
      // the slow path, and ran to the timeout with no hazard; review 2026-10-22)
      if (Y < yFloor) { G.hazard = 2; G.haz = [x, y, z]; return 0; }
      const gx = Math.floor((X - x0) / CELL), gz = Math.floor((Z - z0) / CELL);
      if (gx < 0 || gz < 0 || gx >= gw || gz >= gh || Y - r > top[gz * gw + gx]) return 0;
      let bestK = -1, bestD = 0, haz = 0;
      for (let s = start[gz * gw + gx], e = start[gz * gw + gx + 1]; s < e; s++) {
        const k = cells[s], o = 9 * k;
        const n0 = N[3 * k], n1 = N[3 * k + 1], n2 = N[3 * k + 2];
        const dist = (X - V[o]) * n0 + (Y - V[o + 1]) * n1 + (Z - V[o + 2]) * n2;
        if (dist >= r) continue;
        // behind the face: a contact only while the sphere still overlaps it
        // (dist > -r) or when this tick carried the centre through it from
        // in front (the KCL prism's thickness, without reaching through walls)
        if (dist <= -r && (qX - V[o]) * n0 + (qY - V[o + 1]) * n1 + (qZ - V[o + 2]) * n2 < -r) continue;
        const pX = X - dist * n0, pY = Y - dist * n1, pZ = Z - dist * n2;
        if ((pX - V[o]) * E[o] + (pY - V[o + 1]) * E[o + 1] + (pZ - V[o + 2]) * E[o + 2] > 0) continue;
        if ((pX - V[o + 3]) * E[o + 3] + (pY - V[o + 4]) * E[o + 4] + (pZ - V[o + 5]) * E[o + 5] > 0) continue;
        if ((pX - V[o + 6]) * E[o + 6] + (pY - V[o + 7]) * E[o + 7] + (pZ - V[o + 8]) * E[o + 8] > 0) continue;
        const a = ATT[k];
        if (HAZ_ATTR[a]) { haz = haz || HAZ_ATTR[a]; continue; }
        const depth = r - dist;
        if (depth > bestD) { bestD = depth; bestK = k; }
      }
      if (haz) { G.hazard = haz; G.haz = [x, y, z]; return 0; }
      if (bestK < 0) return 0;
      const n0 = N[3 * bestK], n1 = N[3 * bestK + 1], n2 = N[3 * bestK + 2];
      hit.attr = ATT[bestK];
      hit.n0 = n0 * ax + n2 * az; hit.n1 = n1; hit.n2 = n0 * rx + n2 * rz;
      G.lastAttr = hit.attr;
      ringA[ri] = hit.attr;
      G.attrMax = Math.max(ringA[0], ringA[1], ringA[2], ringA[3]);
      if (!G.first) G.first = [x, y, z];
      return bestD;
    },
    // WSR's ball+0xd0 as decoded (wsr-ground-phase.md 3.2): the ground under
    // the last centre whose top surface was neither water nor a wall. The
    // harness's water rows (results/knowledge/strokes.jsonl end) sit at the
    // entry instead (3 of 3 caught here within 6 yd of it), so this is only
    // what the decode names, not where the game was seen to put the ball
    lastLand() {
      for (let i = Math.min(G.ticks, 8200) - 1; i >= 0; i--) {
        const X = track[3 * i], Z = track[3 * i + 2], g = topAt(p, X, Z);
        if (g && g.attr !== 7 && g.attr !== 12 && g.attr !== 13) return [X, g.y, Z];
      }
      return [FX, Y0, FZ];
    },
  };
  return G;
}

// the game's wind ({ angle } rad, or { dir } in eighths of a turn, and
// speedIdx; the air moves along (sin a, cos a) in world X, Z) relative to a
// launch heading, as run() takes it (round-planner.mjs windAlong)
export function windRel(w, launch) {
  if (!w || !w.speedIdx) return null;
  const a = w.angle ?? (w.dir * Math.PI) / 4, wx = Math.sin(a), wz = Math.cos(a), dx = Math.sin(launch), dz = Math.cos(launch);
  return { mph: 2 * w.speedIdx, deg: (Math.atan2(wx * -dz + wz * dx, wx * dx + wz * dz) * 180) / Math.PI };
}

// shot3d(hole or mesh, { from, launch, club, q, lie, wind, back, side, spinStart, fromY, trace })
//   from [X, Y, Z] world (the ball centre), launch rad (dx = sin, dz = cos),
//   wind run()'s { mph, deg } relative to the launch line (windRel), or the
//   game's { angle | dir, speedIdx } (converted here), lie the KCL lie code
// -> { carry, first, stop, lateral, rest, restAttr, hazard, lastLand, ticks,
//      reason, apex, bounces, path }: carry / stop / lateral in yd along and
//   right of the launch line (stop and lateral at the hazard's entry for a
//   hazard), first / rest / lastLand world [X, Y, Z] (rest: the entry point
//   for a hazard, which is where the harness rows put a water ball; lastLand:
//   WSR's decoded drop spot for water / valley, else null), hazard 0 | 1 water | 2 out of
//   bounds (rest on attr 4, or below the course) | 3 valley; path (trace) the
//   line-frame path in yd, run()'s, and pathWorld.
export async function shot3d(hole, { from, launch, club, q, lie = 1, wind = null, back = 0, side = 0, spinStart = 0, fromY = true, trace = false } = {}) {
  const { kcl } = await import("./course.mjs");
  const m = typeof hole === "number" ? await kcl(hole) : hole;
  if (!m) return null;
  return shot3dSync(m, { from, launch, club, q, lie, wind, back, side, spinStart, fromY, trace });
}

export function shot3dSync(m, { from, launch, club, q, lie = 1, wind = null, back = 0, side = 0, spinStart = 0, fromY = true, trace = false } = {}) {
  const G = kclGround(m, from, launch, { fromY });
  const w = wind && wind.speedIdx != null ? windRel(wind, launch) : wind;
  const o = run({ club, q, surface: lieSurface(lie), back, side, spinStart, wind: w, ground: G, trace });
  // the lie at rest is the ring's maximum (WSR's ball+0xb4, what its stop rule
  // tested and the player code reads), not the last tick's triangle alone
  let carry = o.carry, stop = o.stop, lateral = o.lateral, rest, restAttr = G.attrMax || G.lastAttr, hazard = G.hazard, lastLand = null;
  if (G.hazard) {
    const [hx, hy, hz] = G.haz;
    stop = hx / YD; lateral = hz / YD;
    if (!G.first) carry = stop;   // straight into it: run()'s carry is where the fall ended
    rest = G.toWorld(hx, hy, hz);
    restAttr = G.hazard === 1 ? 7 : G.hazard === 3 ? 13 : 0;
    lastLand = G.lastLand();
  } else {
    rest = G.toWorld(o.stop * YD, 0, o.lateral * YD);
    const g = topAt(G.p, rest[0], rest[2]);
    rest[1] = g ? g.y + BALL_R : rest[1];
    if (restAttr === 4) hazard = 2;   // out of bounds: the game puts the ball back at from
  }
  const first = G.first ? G.toWorld(...G.first) : null;
  const out = { carry, first, stop, lateral, rest, restAttr, hazard, lastLand, ticks: o.ticks, reason: o.reason, apex: o.apex, bounces: o.bounces, path: o.path };
  if (o.path) out.pathWorld = o.path.map(([x, y, z]) => G.toWorld(x * YD, y * YD + BALL_R, z * YD));
  return out;
}

