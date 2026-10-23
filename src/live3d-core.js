// The live solver's core (pure; src/live3d.worker.js runs it off the page,
// tools/test-live3d.mjs checks it against the harness): WSR's own physics, the
// harness's 3D model (tools/harness/lib/model3d.mjs, 0.02 yd median error
// against the game), on the hole's course from public/course3d
// (tools/build-course3d.mjs), solving a shot from wherever the ball is tapped
// on the map (the user, 2026-10-22: for "when i do not perfectly hit it on
// line with the known solved route").
//   buildCourse(meta, bin, palm?) → { meta, c }: the course packed as the
//     harness packs it (bit for bit) and registered with the model
//   groundAt(c, x, z) → { y, attr } | null: the top contact surface there
//   toMesh / toMap: map fractions ↔ mesh units (the hole's registration)
//   windOf(meta, mph, deg): the solver's dial (deg N-up, the way it blows) as
//     WSR's wind (an angle in the mesh's frame; speedIdx = mph / 2, odd speeds between)
//   solveFrom(C, { ball, target, pinKey, pinFrac, windMph, windDeg }, onClub)
//     → { lie, liesAt, D, recs }: per club the power and aim whose ball stops
//     nearest the target (the pin unless a target is given; the cup in play,
//     so a drop counts), with its rest, carry, lie, miss, a 0.1-bar sand check,
//     and the same club at full power with its aim turned for the wind
import * as M from "../tools/harness/lib/model3d.mjs";

export const YD = 9.144;
const DEG = Math.PI / 180, MAP_W = 250, MAP_H = 304, BALL_R = 0.5;
const BAG = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"];
const BUNKER_CAP = { driver: 0.25, spoon: 0.25, wedge: 0.75 };
export const capOf = (club, lie) => (club === "putter" ? 2.5 : lie === 2 ? 0.75 : lie === 3 || lie === 16 ? BUNKER_CAP[club] ?? 0.5 : 1);
// the KCL type under the ball as the game's lie (the same numbers: 1 fairway,
// 2 rough, 3 and 16 bunker, 6 green, 9 fringe, 15 tee); anything else plays as fairway
const LIE_OF = { 1: 1, 2: 2, 3: 3, 6: 6, 9: 9, 10: 6, 11: 6, 15: 15, 16: 16 };
const GROUND = new Set([1, 2, 3, 6, 9, 10, 11, 15, 16, 7, 4, 13]);
const SAFE = new Set(["fairway", "rough", "green", "fringe", "cup", "tee", "bunker"]);
// (a bunker rest is in play; the 0.1-bar check below still flags a stroke that finds one)
const DRY = new Set(["fairway", "rough", "green", "fringe", "cup", "tee"]);
const POWER_ERR = [-0.025, -0.0125, 0.0125, 0.025];
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function buildCourse(meta, bin, palm = null) {
  const o = meta.offs, V = new Float32Array(bin, o.V, 3 * meta.nv), N = new Float32Array(bin, o.N, 3 * meta.nn);
  const H = new Float32Array(bin, o.H, meta.n), A = new Uint8Array(bin, o.A, meta.n);
  const I = meta.idx === "u32" ? new Uint32Array(bin, o.I, 5 * meta.n) : new Uint16Array(bin, o.I, 5 * meta.n);
  const v3 = (T, i) => [T[3 * i], T[3 * i + 1], T[3 * i + 2]];
  const prisms = new Array(meta.n);
  for (let i = 0; i < meta.n; i++) prisms[i] = { h: H[i], p: v3(V, I[5 * i]), fn: v3(N, I[5 * i + 1]), e1: v3(N, I[5 * i + 2]), e2: v3(N, I[5 * i + 3]), e3: v3(N, I[5 * i + 4]), attr: A[i] };
  let pm = false;
  if (meta.palm && palm) {
    const q = palm.meta.offs, n = palm.meta.n, f = (k, m) => Float64Array.from(new Float32Array(palm.buf, q[k], m));
    pm = { n, PV: f("PV", 3 * n), FN: f("FN", 3 * n), E1: f("E1", 3 * n), E2: f("E2", 3 * n), E3: f("E3", 3 * n), H: f("H", n), attr: new Uint8Array(palm.buf, q.attr, n).slice(), thick: palm.meta.thick };
  }
  const trees = meta.trees.map((t) => ({ ...t }));
  const c = M.packCourse(prisms, meta.thick, { hole: meta.hole, id: meta.id, src: "course3d", trees, palm: pm });
  M.registerCourse(meta.hole, c);
  return { meta, c };
}

// the highest contact surface at (x, z): the prism whose triangle holds the point
export function groundAt(c, x, z) {
  const a = Math.floor(x / M.CELL) - c.gx0, b = Math.floor(z / M.CELL) - c.gz0;
  if (a < 0 || b < 0 || a >= c.gw || b >= c.gh) return null;
  const k = b * c.gw + a, T = c.TRI;
  let best = null;
  for (let j = c.start[k]; j < c.start[k + 1]; j++) {
    const i = c.cells[j];
    if (!GROUND.has(c.attr[i])) continue;
    const o = 9 * i, x0 = T[o], z0 = T[o + 2], x1 = T[o + 3], z1 = T[o + 5], x2 = T[o + 6], z2 = T[o + 8];
    const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
    if (!d) continue;
    const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d, l2 = 1 - l0 - l1;
    if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
    const y = l0 * T[o + 1] + l1 * T[o + 4] + l2 * T[o + 7];
    if (!best || y > best.y) best = { y, attr: c.attr[i] };
  }
  return best;
}

export const toMesh = (meta, fx, fy) => { const B = meta.reg.f2m; return [B[0][0] * fx + B[0][1] * fy + B[0][2], B[1][0] * fx + B[1][1] * fy + B[1][2]]; };
export const toMap = (meta, X, Z) => { const B = meta.reg.m2f; return [B[0][0] * X + B[0][1] * Z + B[0][2], B[1][0] * X + B[1][1] * Z + B[1][2]]; };
// a map bearing (deg N-up) as a mesh heading (the model's: atan2(dx, dz))
export function meshHeading(meta, deg) {
  const b = deg * DEG, ux = Math.sin(b) / MAP_W, uy = -Math.cos(b) / MAP_H, B = meta.reg.f2m;
  return Math.atan2(B[0][0] * ux + B[0][1] * uy, B[1][0] * ux + B[1][1] * uy);
}
// a mesh heading as a map bearing
export function mapBearing(meta, h) {
  const vx = Math.sin(h), vz = Math.cos(h), B = meta.reg.m2f;
  const px = MAP_W * (B[0][0] * vx + B[0][1] * vz), py = MAP_H * (B[1][0] * vx + B[1][1] * vz);
  return ((Math.atan2(px, -py) / DEG) % 360 + 360) % 360;
}
export const windOf = (meta, mph, deg) => (mph > 0 ? { speedIdx: mph / 2, angle: meshHeading(meta, deg) } : null);

// the ball at a map spot: on the ground there (its centre a ball's radius up), its lie
export function ballAt(C, fx, fy) {
  const [X, Z] = toMesh(C.meta, fx, fy), g = groundAt(C.c, X, Z);
  return g ? { pos: [X, g.y + BALL_R, Z], attr: g.attr, lie: LIE_OF[g.attr] ?? 1 } : null;
}

export function solveFrom(C, { ball, target = null, pinKey = null, pinFrac = null, windMph = 0, windDeg = 0, clubs = null, onTee = false }, onClub = null) {
  const { meta } = C, hole = meta.hole;
  M.registerCourse(hole, C.c);
  const B = ballAt(C, ball.x, ball.y);
  if (!B) throw new Error("no course under the ball");
  const pin = (pinKey && meta.pins[pinKey]) || (pinFrac ? (() => { const p = ballAt(C, pinFrac.x, pinFrac.y); return p ? [p.pos[0], p.pos[1] - BALL_R, p.pos[2]] : null; })() : null);
  const tgt = target ? toMesh(meta, target.x, target.y) : pin ? [pin[0], pin[2]] : null;
  if (!tgt) throw new Error("no target and no pin");
  // on the tee the game's lie is the tee (15), though the pad is fairway in the KCL
  const wind = windOf(meta, windMph, windDeg), lie = onTee ? 15 : B.lie, ballPos = B.pos;
  const D = Math.hypot(tgt[0] - ballPos[0], tgt[1] - ballPos[2]) / YD;
  const h0 = Math.atan2(tgt[0] - ballPos[0], tgt[1] - ballPos[2]);
  const hPin = pin ? Math.atan2(pin[0] - ballPos[0], pin[2] - ballPos[2]) : h0;
  const list = clubs ?? (lie === 6 ? ["putter"] : D < 40 ? [...BAG, "putter"] : BAG);
  const at = (club, q, h) => {
    const p = M.predict({ hole, ball: ballPos, heading: h, club, power: q, lie, wind, pin });
    // the miss, a rest that is not in play (water, out of bounds, the woods) after every one that is, a bunker 10 yd worse, rough 2
    const miss = p.holed ? 0 : Math.hypot(p.rest[0] - tgt[0], p.rest[1] - tgt[1]) / YD;
    const pen = p.holed ? 0 : p.hazard || !SAFE.has(p.restLie) ? 1000 : p.restLie === "bunker" ? 10 : p.restLie === "rough" ? 2 : 0;
    return { q, h, p, miss, d: miss + pen };
  };
  const fix = (t) => angDiff(h0, Math.atan2(t.p.rest[0] - ballPos[0], t.p.rest[1] - ballPos[2]));
  const safe = (club, t) => {
    if (t.q >= capOf(club, lie) - 0.0015) return !t.p.hazard && DRY.has(t.p.restLie);
    for (const dq of POWER_ERR) { const q = t.q + dq; if (q < 0.03 || q > capOf(club, lie) + 1e-9) continue; const u = at(club, q, t.h); if (u.p.hazard || !DRY.has(u.p.restLie)) return false; }
    return true;
  };
  const row = (club, t) => {
    const len = Math.hypot(t.p.rest[0] - ballPos[0], t.p.rest[1] - ballPos[2]);
    return {
      club, power: t.q, bars: 4 * t.q, max: t.q >= capOf(club, lie) - 0.0015, heading: t.h, bearing: mapBearing(meta, t.h),
      aimOffTarget: -angDiff(t.h, h0) / DEG, aimOffFlag: -angDiff(t.h, hPin) / DEG,
      rest: toMap(meta, t.p.rest[0], t.p.rest[1]), aimTo: toMap(meta, ballPos[0] + Math.sin(t.h) * len, ballPos[2] + Math.cos(t.h) * len),
      restLie: t.p.restLie, holed: !!t.p.holed, miss: t.miss, score: t.d, carry: t.p.carry, hazard: t.p.hazard ?? 0, safe: safe(club, t),
    };
  };
  const recs = [];
  list.forEach((club, n) => {
    const cap = capOf(club, lie), lo = club === "putter" ? 0.03 : 0.08, step = club === "putter" ? 0.04 : 0.02;
    let b = null;
    for (let q = lo; q <= cap + 1e-9; q += step) { const t = at(club, q, h0), t2 = at(club, q, h0 + fix(t)); for (const u of [t, t2]) if (!b || u.d < b.d) b = u; }
    const scanQ = (span, st) => { const base = b; for (let x = -span; x <= span + 1e-9; x += st) { const q = base.q + x; if (q < lo || q > cap) continue; const t = at(club, q, base.h); if (t.d < b.d) b = t; } };
    const scanA = (span, st) => { const base = b; for (let a = -span; a <= span + 1e-9; a += st) { const t = at(club, base.q, base.h + a * DEG); if (t.d < b.d) b = t; } };
    scanQ(0.02, 0.004); scanA(1, 0.2); scanQ(0.004, 0.0005); scanA(0.2, 0.02);
    // the same club at full power, its aim turned twice for the drift
    let f = at(club, cap, h0); f = at(club, cap, h0 + fix(f)); f = at(club, cap, f.h + fix(f));
    const rec = { ...row(club, b), full: b.q >= cap - 0.0015 ? null : row(club, f) };
    recs.push(rec);
    if (onClub) onClub({ done: n + 1, of: list.length, rec });
  });
  recs.sort((x, y) => (y.holed - x.holed) || x.score - y.score);
  return { lie, liesAt: B.attr, D, h0, recs };
}
