// The live solver's core (pure; src/live3d.worker.js runs it off the page,
// tools/test-live3d.mjs and tools/test-course3d.mjs check it): NSS's own ball
// (src/nsssim.js, the golf ball of Nintendo Switch Sports tick for tick, 71
// strokes recorded in Eden replayed to 0.1 mm in the air) on NSS's own course
// (public/course3d v2, the Switch game's collision triangles, through
// tools/lib/nss3d.mjs: the cup in play opened, the actor trees as their kinds'
// measured shapes, the online platform's decks), solving a shot from wherever
// the ball is (the user, 2026-10-22: for "when i do not perfectly hit it on
// line with the known solved route"; 2026-10-24: NSS's data and physics
// replace WSR's). The 44 recorded strokes the model plays to a rest off the
// cup replay on this course bit for bit as on the dump's own collision, every
// recorded holed putt holes (tools/test-live3d.mjs).
//
// Frames: the NSS hole frame (metres, y up, -z toward the green; course3d's
// mesh units are 10 nss + O) for the ball; map fractions for the app; a
// heading is deg N-up in the NSS frame (nsssim's: 0 = -z), a bearing deg
// N-up on the map (the registration turns the frame by up to 0.25 deg).
//   buildCourse(meta, bin) -> C = { meta, N }: the hole's NSS course (nss3d.mjs
//     nssCourse; course3d v2 only, a v1 file is refused)
//   groundAt(C, X, Z) -> { y, attr, nssAttr, lie, wet } | null: the highest solid
//     ground under a mesh-unit point (y in mesh units, attr course3d's)
//   toMesh / toMap: map fractions <-> mesh units (the hole's NSS registration)
//   windOf(meta, mph, deg): the solver's dial (deg N-up, the way it blows) as
//     NSS's wind, { x, z } m/s in the NSS frame (windSpeedOf: the wind object's
//     speed s for the HUD's mph, which reads floor(2.25 s))
//   platformSpot(meta, start): the online platform's standing spot for
//     start = { kind: "platform", tier: "low" | "high", and one of fromLeft
//     (0-6, the seven spots from the player's left facing the green),
//     localX (m, + = the player's left: +-3.45, +-2.3, +-1.15, 0) or side
//     (L2 L1 R1 R2, the four slot bones) } -> course3d's spot | null
//   ballAtStart(C, { ball, start, lift }) -> { pos, lie, attr, from }: the
//     ball's centre (NSS m) where the stroke starts: on the platform's mat
//     (start.kind "platform": the ball's own platform-local x, ballLocalX,
//     or a standing spot's with the hand's 0.9 m (src/platform.js), on its
//     tier's mat), on the local tee (start.kind "local": NSS's GlfTeeOBJ,
//     where the game tees off, 0.00 yd in Eden on holes 2-18; H1's own tee shot
//     was not recorded, so H1 is taken to tee off there too), teed up 0.1 m (the
//     start of every recorded tee shot, within 0.06 mm; on the platform
//     inferred: the stroke-0 code adds the same lift when its tee test holds,
//     slots.md section 5), or at the map spot `ball` on the ground there (0.05 m
//     above it along the normal: a ball at rest)
//   shot(C, { pos, lie, club, pct, heading, wind, cupKey, platform, trace })
//     -> one stroke: nsssim.run's result plus restLie, the rest on the map and
//     the first tree it met
//   solveFrom(C, { ball, target, cupKey, pinFrac, windMph, windDeg, clubs,
//     start, lift }, onClub) -> { lie, lieName, liesAt, D, h0, from, cup,
//     physics, recs }: per club the power and aim whose ball stops nearest the
//     target (the pin unless a target is given; the cup in play, so a drop
//     counts), with its rest, carry, lie, miss, outcome, the first tree it
//     met, the safety of 0.04-0.08 bars either side, and the same club at
//     full power with its aim turned for the wind; recs best first. A ball
//     the model never brings to rest (a timeout) or that leaves the course
//     (water, OB, air OB, a fall) scores as out of play.
// Power: NSS reads the launch speed off GolfShotVelTable at (int)(100 power),
// so a club has one launch per percent of the gauge (0.04 bars): the solver
// searches those percents, and reports the middle of the chosen one's window
// (pct + 0.5) / 100 (at the cap the cap itself). The putter runs to 150 % (the
// game's PowerOverMaxPT); every other club stops at its lie's cap.
// (pinKey and onTee, the v1 names, still work.)
import * as S from "./nsssim.js";
import { nssCourse, LIE_NAME, MODEL_OF_ATTR, PLATFORM_TIERS, platformToWorld, M_PER_YD } from "../tools/lib/nss3d.mjs";

export const YD = 9.144;          // course3d mesh units per yard (10 per metre)
export const PHYSICS = "NSS";
const DEG = Math.PI / 180, MAP_W = 250, MAP_H = 304;
export const BAG = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"];
const A = S.ATTR;
// a ball teed up (every recorded tee shot starts 0.1 m above the pad), and at rest
const TEE_M = 0.1, REST_M = S.BALL_R;
// the ball beside its golfer on the platform (slots.md section 5: 0.9 m along platform-local x)
const HAND_M = { right: -0.9, left: 0.9 };
const PUTTER_MAX_PCT = Math.round(100 * S.PHYSICS.launch.powerOverMaxPT);
// the rests in play, and the dry ones (a bunker rest is in play; the safety check flags a stroke that finds one)
const SAFE = new Set([A.fairway, A.rough, A.bunker, A.green, A.fringe, A.cup, A.cupside]);
const DRY = new Set([A.fairway, A.rough, A.green, A.fringe, A.cup, A.cupside]);
const OUT = 1000, BUNKER_PEN = 10, ROUGH_PEN = 2;
const COARSE = 4, SAFE_DPCT = [-2, -1, 1, 2];
const TREE_NAME_M = 25;
const angDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;   // deg, a - b in (-180, 180]

// the lie a club is played from, as nsssim caps it: course3d's model attribute
// (1 fairway, 2 rough, 3 bunker, 6 green, 9 fringe, 15 tee, 16 / 17 bunker / sand OB)
// or a lie name
const NSS_LIE = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 15: "tee", 16: "bunker", 17: "bunker", 12: "fairway" };
export function capOf(club, lie) {
  if (club === "putter") return PUTTER_MAX_PCT / 100;
  return S.capFor(club, typeof lie === "number" ? NSS_LIE[lie] ?? "fairway" : lie ?? "fairway");
}
// a lie attribute under the ball (nsssim's) as the lie the stroke is played from
function lieOfAttr(a) {
  switch (a) {
    case A.rough: return { model: 2, nss: "rough" };
    case A.bunker: return { model: 3, nss: "bunker" };
    case A.sandOb: return { model: 17, nss: "bunker" };
    case A.green: case A.cup: case A.cupside: return { model: 6, nss: "green" };
    case A.fringe: return { model: 9, nss: "fringe" };
    default: return { model: MODEL_OF_ATTR[a] ?? 1, nss: "fairway" };
  }
}
const TEE_LIE = { model: 15, nss: "tee" };
const LIE_LABEL = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 15: "tee", 17: "sand OB", 12: "rock", 4: "OB", 7: "water" };

export function buildCourse(meta, bin) {
  return { meta, N: nssCourse(meta, bin) };
}

export const toMesh = (meta, fx, fy) => { const B = meta.reg.f2m; return [B[0][0] * fx + B[0][1] * fy + B[0][2], B[1][0] * fx + B[1][1] * fy + B[1][2]]; };
export const toMap = (meta, X, Z) => { const B = meta.reg.m2f; return [B[0][0] * X + B[0][1] * Z + B[0][2], B[1][0] * X + B[1][1] * Z + B[1][2]]; };
// map fractions <-> NSS metres (x, z)
const mapToNss = (meta, fx, fy) => { const [X, Z] = toMesh(meta, fx, fy); return [(X - meta.O[0]) / meta.unitsPerM, (Z - meta.O[2]) / meta.unitsPerM]; };
const nssToMap = (meta, x, z) => toMap(meta, meta.unitsPerM * x + meta.O[0], meta.unitsPerM * z + meta.O[2]);
// a map bearing (deg N-up) as a mesh heading (atan2(dX, dZ)), and back
export function meshHeading(meta, deg) {
  const b = deg * DEG, ux = Math.sin(b) / MAP_W, uy = -Math.cos(b) / MAP_H, B = meta.reg.f2m;
  return Math.atan2(B[0][0] * ux + B[0][1] * uy, B[1][0] * ux + B[1][1] * uy);
}
export function mapBearing(meta, h) {
  const vx = Math.sin(h), vz = Math.cos(h), B = meta.reg.m2f;
  const px = MAP_W * (B[0][0] * vx + B[0][1] * vz), py = MAP_H * (B[1][0] * vx + B[1][1] * vz);
  return ((Math.atan2(px, -py) / DEG) % 360 + 360) % 360;
}
// NSS headings (deg N-up in the NSS frame: direction (sin h, -cos h)) <-> mesh headings (rad)
const headingOf = (dx, dz) => Math.atan2(dx, -dz) / DEG;
const meshOfHeading = (h) => Math.PI - h * DEG;

// NSS's wind object has an integer speed s (m/s, 0-15; every recorded one is), and the
// HUD reads it as floor(2.25 s) mph on all six recorded pairs (1 -> 2, 3 -> 6, 4 -> 9, 5 ->
// 11, 6 -> 13, 10 -> 22: so 12 and 23 mph never show, as the captures found); a dial value
// that no s gives is read as mph / 2.25. (The rounding is not decoded: nsssim's note.)
export function windSpeedOf(mph) {
  if (!(mph > 0)) return 0;
  const k = S.PHYSICS.wind.hudMphPerS;
  for (let s = 1; s <= S.PHYSICS.air.windVelMax; s++) if (Math.floor(k * s + 1e-9) === mph) return s;
  return mph / k;
}
export function windOf(meta, mph, deg) {
  const s = windSpeedOf(mph);
  if (!(s > 0)) return null;
  const H = meshHeading(meta, deg);
  return { x: s * Math.sin(H), z: s * Math.cos(H), s, mph };
}

// the highest solid ground under a mesh-unit point
export function groundAt(C, X, Z) {
  const { meta, N } = C, U = meta.unitsPerM, O = meta.O;
  const g = N.topGround((X - O[0]) / U, (Z - O[2]) / U);
  if (!g) return null;
  return { y: U * g.y + O[1], attr: MODEL_OF_ATTR[g.attr] ?? 1, nssAttr: g.attr, lie: LIE_NAME[g.attr], wet: g.wet != null };
}

// the online platform's standing spot (see the head of this file)
export function platformSpot(meta, start) {
  const tier = start && meta.platform?.tiers?.[start.tier];
  if (!tier) return null;
  if (Number.isInteger(start.fromLeft)) return tier.find((p) => p.fromLeft === start.fromLeft) ?? null;
  if (Number.isFinite(start.localX)) return tier.find((p) => Math.abs(p.localX - start.localX) < 1e-6) ?? null;
  if (start.side) return tier.find((p) => p.side === start.side) ?? null;
  return null;
}
// the ball on the platform: its platform-local x (ballLocalX, else a standing spot's
// plus the hand's offset) on its tier's mat, teed up; null without the platform or a spot
export function platformBall(C, start) {
  const { meta, N } = C, T = PLATFORM_TIERS[start?.tier];
  if (!T || !meta.platform || !N.platformOrigin) return null;
  let lx = Number.isFinite(start.ballLocalX) ? start.ballLocalX : null;
  if (lx == null) { const s = platformSpot(meta, start); if (!s) return null; lx = s.localX + (HAND_M[start.hand] ?? HAND_M.right); }
  const w = platformToWorld(N.platformOrigin, meta.platform.yawDeg, [lx, T.matY, T.z]);
  return { pos: [w[0], w[1] + TEE_M, w[2]], localX: lx, mat: w[1] };
}

// where the stroke starts (see the head of this file)
export function ballAtStart(C, { ball = null, start = null, lift = 0, onTee = false } = {}) {
  const { meta, N } = C;
  if (start?.kind === "platform") {
    const B = platformBall(C, start);
    if (B) return { pos: B.pos, lie: TEE_LIE, attr: 12, from: { kind: "platform", tier: start.tier, localX: B.localX, map: nssToMap(meta, B.pos[0], B.pos[2]) } };
  }
  const tee = onTee || start?.kind === "local", kind = tee ? "local" : "ground";
  let x, z;
  if (start?.kind === "local" && meta.tee?.teeObj) [x, , z] = N.nssOf(meta.tee.teeObj);
  else if (ball) [x, z] = mapToNss(meta, ball.x, ball.y);
  else throw new Error("no ball and no start");
  const g = N.topGround(x, z);
  if (!g) throw new Error("no course under the ball");
  // a platform start the course has no platform for: the ground raised by the lift
  const up = start?.kind === "platform" && lift > 0 ? lift * M_PER_YD : 0;
  const pos = [x, g.y + (tee ? TEE_M : REST_M / g.ny) + up, z];
  return { pos, lie: tee || start?.kind === "platform" ? TEE_LIE : lieOfAttr(g.attr), attr: MODEL_OF_ATTR[g.attr] ?? 1, wet: g.wet != null, from: { kind: start?.kind ?? kind, map: nssToMap(meta, x, z) } };
}

// the cup in play: cupKey (pinKey) when the course has it, else the cup within 1 m of pinFrac
function cupOf(C, key, pinFrac) {
  const { meta, N } = C;
  if (key && N.cups[key]) return N.cups[key];
  if (!pinFrac) return null;
  const [x, z] = mapToNss(meta, pinFrac.x, pinFrac.y);
  let best = null, bd = 1;
  for (const c of Object.values(N.cups)) { const d = Math.sqrt((c.x - x) ** 2 + (c.z - z) ** 2); if (d < bd) { bd = d; best = c; } }
  return best;
}

// the first tree a stroke met (its tick, the part, where) by name: an actor
// tree's id, else the nearest baked tree (meta.treeInfo) within TREE_NAME_M
function treeOf(C, t) {
  if (!t) return null;
  const { meta, N } = C, U = meta.unitsPerM, O = meta.O;
  let id = null, wsr = null, bd = TREE_NAME_M * TREE_NAME_M;
  for (const s of N.trees) { const d = (s.x - t.at[0]) ** 2 + (s.z - t.at[2]) ** 2; if (d < bd) { bd = d; id = s.id; wsr = s.wsr; } }
  for (const s of meta.treeInfo ?? []) { const d = ((s.X - O[0]) / U - t.at[0]) ** 2 + ((s.Z - O[2]) / U - t.at[2]) ** 2; if (d < bd) { bd = d; id = s.id; wsr = s.wsr ?? null; } }
  return { id, wsr, part: t.part, at: nssToMap(meta, t.at[0], t.at[2]), tick: t.tick };
}

const powerOf = (pct, cap) => Math.min(cap, (pct + 0.5) / 100);
// one stroke: club at gauge percent pct (or power), heading deg (NSS frame), from pos
export function shot(C, { pos, lie = TEE_LIE, club, pct = null, power = null, heading, wind = null, cupKey = null, platform = false, trace = false, track = true }) {
  const { N } = C, cup = cupKey ? N.cups[cupKey] ?? null : null;
  const cap = capOf(club, lie.nss);
  if (pct == null) pct = S.pctOf(Math.min(power ?? cap, cap));
  const pw = powerOf(pct, cap);
  let met = null;
  const o = {
    club, power: pw, lie: lie.nss, start: pos, heading, wind, ground: N.ground({ cupKey: cup?.key ?? null, platform }), trace,
    cup: cup ? { x: cup.x, y: cup.y, z: cup.z } : null,
    // a trunk in flight or rolling; a canopy or fronds in flight (the leaf counter and
    // the palm leaves act on a shot only)
    onTick: track ? (s) => {
      if (met) return;
      const part = s.a4 === A.tree ? "trunk" : s.mode !== 1 ? null : s.a8 === A.leaf ? "canopy" : s.a8 === A.palmLeaf ? "fronds" : null;
      if (part) met = { part, tick: s.tick, at: s.p };
    } : null,
  };
  // the putter past full power: the launch the table gives at that percent
  if (club === "putter" && pw > 1) o.v0 = S.launchVelocity("putter", pw, heading);
  const p = S.run(o);
  const restAttr = p.outcome === "holed" ? A.cup : p.restAttr;
  return { ...p, pct, power: pw, restLie: p.outcome === "water" ? "water" : p.outcome === "OB" && restAttr !== A.ob && restAttr !== A.sandOb ? "OB" : LIE_NAME[restAttr] ?? String(restAttr), restAttrOf: restAttr, met };
}

export function solveFrom(C, { ball = null, target = null, cupKey = null, pinKey = null, pinFrac = null, windMph = 0, windDeg = 0, clubs = null, start = null, lift = 0, onTee = false }, onClub = null) {
  const { meta } = C;
  const St = ballAtStart(C, { ball, start, lift, onTee });
  const cup = cupOf(C, cupKey ?? pinKey, pinFrac);
  const pinXZ = cup ? [cup.x, cup.z] : pinFrac ? mapToNss(meta, pinFrac.x, pinFrac.y) : null;
  const tgt = target ? mapToNss(meta, target.x, target.y) : pinXZ;
  if (!tgt) throw new Error("no target and no pin");
  const pos = St.pos, lie = St.lie, platform = St.from.kind === "platform";
  const wind = windOf(meta, windMph, windDeg);
  const dx = tgt[0] - pos[0], dz = tgt[1] - pos[2];
  const D = Math.sqrt(dx * dx + dz * dz) / M_PER_YD, h0 = headingOf(dx, dz);
  const hPin = pinXZ ? headingOf(pinXZ[0] - pos[0], pinXZ[1] - pos[2]) : h0;
  const list = clubs ?? (lie.nss === "green" ? ["putter"] : D < 40 ? [...BAG, "putter"] : BAG);
  const ux = Math.sin(h0 * DEG), uz = -Math.cos(h0 * DEG);   // the line to the target
  const at = (club, pct, h) => {
    const p = shot(C, { pos, lie, club, pct, heading: h, wind, cupKey: cup?.key ?? null, platform });
    const rx = p.rest[0] - tgt[0], rz = p.rest[2] - tgt[1];
    const miss = p.holed ? 0 : Math.sqrt(rx * rx + rz * rz) / M_PER_YD;
    const out = p.outcome !== "rest" && p.outcome !== "holed";
    const pen = p.holed ? 0 : out || !SAFE.has(p.restAttrOf) ? OUT : p.restAttrOf === A.bunker ? BUNKER_PEN : p.restAttrOf === A.rough ? ROUGH_PEN : 0;
    return { pct, h, p, miss, d: miss + pen, along: ((p.rest[0] - pos[0]) * ux + (p.rest[2] - pos[2]) * uz) / M_PER_YD };
  };
  // the aim that turns this stroke's rest onto the target's line
  const fix = (t) => {
    const rx = t.p.rest[0] - pos[0], rz = t.p.rest[2] - pos[2];
    return rx * rx + rz * rz < 4 ? 0 : angDiff(h0, headingOf(rx, rz));
  };
  const dry = (p) => (p.outcome === "rest" || p.outcome === "holed") && DRY.has(p.restAttrOf);
  const recs = [];
  list.forEach((club, n) => {
    const cap = capOf(club, lie.nss), hi = club === "putter" ? Math.min(PUTTER_MAX_PCT, S.pctOf(cap)) : S.pctOf(cap);
    const lo = Math.round(100 * S.PHYSICS.clubs[S.clubOf(club)].powerMin);
    const memo = new Map();
    const run = (pct, h) => {
      if (pct < lo || pct > hi) return null;
      const k = `${pct}|${h}`;
      if (!memo.has(k)) memo.set(k, at(club, pct, h));
      return memo.get(k);
    };
    // the gauge every COARSE percent, each aim turned by the last stroke's drift;
    // up the gauge until two strokes in a row stop well past the target
    let h = h0, past = 0;
    const steps = [], coarse = [];
    for (let q = lo; q < hi; q += COARSE) steps.push(q);
    steps.push(hi);
    for (const q of steps) {
      const t = run(q, h);
      coarse.push(t);
      h = t.p.outcome === "rest" || t.p.outcome === "holed" ? t.h + fix(t) : h;
      past = t.along > D + Math.max(25, 0.2 * D) ? past + 1 : 0;
      if (past >= 2) break;
    }
    // refined from a coarse stroke: the aim onto the line, then the neighbouring
    // percents, the aim, the percents again
    const refine = (seed) => {
      let b = seed;
      const take = (t) => { if (t && t.d < b.d) b = t; };
      for (let k = 0; k < 2; k++) { const t = run(b.pct, b.h + fix(b)); if (!t || t.d >= b.d) break; b = t; }
      const scanQ = (span) => { const base = b; for (let d = -span; d <= span; d++) if (d) take(run(base.pct + d, base.h)); };
      const scanA = (span, step) => { const base = b; for (let a = -span; a <= span + 1e-9; a += step) if (Math.abs(a) > 1e-9) take(run(base.pct, base.h + a)); };
      scanQ(Math.ceil(COARSE / 2)); scanA(0.6, 0.2); scanA(0.1, 0.05); scanQ(1);
      return b;
    };
    // from the best coarse stroke, and from the best in play elsewhere on the gauge
    // (a lay-up short of a hazard against a carry over it)
    const byD = [...coarse].sort((p, q) => p.d - q.d || p.pct - q.pct);
    const alt = byD.find((t) => Math.abs(t.pct - byD[0].pct) >= 2 * COARSE && t.d < OUT);
    let b = refine(byD[0]);
    if (alt) { const t = refine(alt); if (t.d < b.d) b = t; }
    // the same club at full power, its aim turned twice for the drift
    let f = run(hi, h0); f = run(hi, f.h + fix(f)); f = run(hi, f.h + fix(f));
    const safe = (t) => {
      if (t.pct >= hi) return dry(t.p);
      if (!dry(t.p)) return false;
      for (const d of SAFE_DPCT) { const u = run(t.pct + d, t.h); if (u && !dry(u.p)) return false; }
      return true;
    };
    const row = (t) => {
      const rx = t.p.rest[0] - tgt[0], rz = t.p.rest[2] - tgt[1];
      const len = Math.sqrt((t.p.rest[0] - pos[0]) ** 2 + (t.p.rest[2] - pos[2]) ** 2);
      const hx = Math.sin(t.h * DEG), hz = -Math.cos(t.h * DEG);
      return {
        long: (rx * ux + rz * uz) / M_PER_YD, right: (rx * -uz + rz * ux) / M_PER_YD,
        club, pct: t.pct, power: t.p.power, bars: 4 * t.p.power, max: t.pct >= hi, over: t.p.power > 1,
        heading: meshOfHeading(t.h), bearing: mapBearing(meta, meshOfHeading(t.h)),
        aimOffTarget: angDiff(t.h, h0), aimOffFlag: angDiff(t.h, hPin),
        rest: nssToMap(meta, t.p.rest[0], t.p.rest[2]), aimTo: nssToMap(meta, pos[0] + hx * len, pos[2] + hz * len),
        restLie: t.p.restLie, holed: t.p.holed, miss: t.miss, score: t.d, carry: t.p.carryYd,
        hazard: t.p.outcome === "water" ? 1 : t.p.outcome === "OB" ? 2 : 0, outcome: t.p.outcome, safe: safe(t),
        tree: treeOf(C, t.p.met),
      };
    };
    const rec = { ...row(b), full: b.pct >= hi ? null : row(f) };
    recs.push(rec);
    if (onClub) onClub({ done: n + 1, of: list.length, rec });
  });
  recs.sort((x, y) => (y.holed - x.holed) || x.score - y.score);
  return { lie: lie.model, lieName: LIE_LABEL[lie.model] ?? String(lie.model), liesAt: St.attr, D, h0: meshOfHeading(h0), from: St.from, cup: cup?.key ?? null, physics: PHYSICS, recs };
}
