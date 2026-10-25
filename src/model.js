// The shot model, out of App.jsx so the tools can run it (tools/test-solver.mjs):
// the clubs' seed numbers, the lie caps, the stop / carry curves, the club fit,
// the shot solver, and the putt solver re-exported from src/putt.js. Pure (no
// React, DOM or Node API).
//
// The ball is Nintendo Switch Sports' own (since 2026-10-25; WSR's before):
// src/nsssim.js, the NSS 1.5.0 ball decoded from its code and RomFS and
// replayed against 71 strokes recorded in Eden's RAM (flights to 0.1 mm, rests
// to 0.04 m). Shot model (CLAUDE.md "Model"):
//   stop  = 4a (1 + h wAlong) S(bars / 4, landing surface)
//   carry = 4a (1 + h wAlong) C(bars / 4)
// S and C are NSS's stop and carry against launch power per club, on level
// ground, calm (src/nsssim.js -> tools/build-nss-shape.mjs -> src/nssShape.js),
// normalised so S(1, fairway) = 1: `a` stays the full-power fairway stop / 4
// (NSS's own until logged shots refit it, DEFAULT_CLUBS), and k = 4a (1 + h
// wAlong) / stopYd is 1 for an uncalibrated club. NSS's launch speed is its
// GolfShotVelTable at the swing's whole percent; the carry follows it (the
// table was built to carry pct / 100 x CarryMaxYard), the stop does not: where
// a landing's normal speed crosses the roll switch (4 m/s) the ball takes a
// bounce more and the stop steps DOWN as the power rises (the driver on
// fairway 196.8 yd at 67 %, 186.7 at 68 %), so the solver works on the curve's
// rising pieces.
// Wind and terrain are flown: with the wind on the dial or the course's
// heights along the line the solver flies NSS's ball itself (src/nsssim.js run
// over the line's profile, the wind in the air as NSS's own law), from the
// table's solution. The logged shots agree: the 29 rows of 2026-08-21 flown
// from their frames' spots over NSS's terrain in their wind stop a median 0.5
// yd from what was logged, hole 10's four full-power driver tee shots within
// 1.1 yd (274 / 281 / 284 / 292 logged; tools/test-rows.mjs d, e). A flight
// costs about 0.5 ms (float32 ticks at 240 Hz), so a 7-club solve over the
// terrain takes 14 ms mean in Node, 18 in a wind (tools/test-solver.mjs h8).
import { NSS_SHAPE, SHAPE_Q } from "./nssShape.js";
import { run as nssRun, PHYSICS, M_PER_YD } from "./nsssim.js";
import { treeCheck, TREE_SHAPES } from "./trees.js";
import { CUP_R, V_CAP, puttField, simPutt, solvePutt } from "./putt.js";

const M = M_PER_YD;
const DEG = Math.PI / 180;

// The seed clubs are NSS's own, so an uncalibrated club flies exactly NSS's
// ball: a = NSS_SHAPE[id].stopYd / 4, its full-power stop on level fairway
// from rest (265.6 / 244.7 / 218.3 / 184.7 / 151.6 / 117.5 / 66.1 yd, driver to
// wedge, carrying 240.3 / 220.4 / 190.5 / 160.5 / 130.2 / 100.4 / 55.3 yd:
// GolfPlayerClubParam's CarryMaxYard 240 / 220 / 190 / 160 / 130 / 100 / 55 at
// LoftDeg 10.5 / 12 / 25 / 28 / 29 / 34 / 40), which makes the solver's k =
// 4a / stopYd exactly 1. h and c are residuals over NSS's own wind, which the
// solver flies (0 for a seed club): h = the stop's change per mph of tailwind
// beyond the flight's, as a fraction of the stop, c = sideways yd per mph of
// crosswind per bar beyond the flight's drift. Logged shots refit a, h and c
// (fitClub). WSR_SEEDS are the seeds before (WSR's own, 2026-10-21 to
// 2026-10-25), for the App's one-time move of an uncalibrated club.
// LIE MECHANIC (player-verified, NSS's RoughRatio / BunkerRatio): lies cap the
// usable BAR, they don't scale distance (flights.md 4: the speed is the
// fairway table's at the capped power).
//   rough: cap = 3 of the 4 bars for every club (0.75)
//   bunker: driver & spoon capped at 1 bar (0.25), irons at 2 (0.5), wedge at 3 (0.75)
// Drivers and spoons cannot backspin (player-confirmed; NSS's file gives every
// club BackSpinRatio 1, and the swing's backspin source is not decoded, so the
// rec cards show no spin range: rollSpin null).
const nssA = (id) => NSS_SHAPE[id].stopYd / 4;
const seed = (id, name, spin, traj) => ({ id, name, a: nssA(id), h: 0, c: 0, spin, traj, maxPower: 4.0, shots: 0,
  carryMaxYd: NSS_SHAPE[id].carryMaxYd, loftDeg: NSS_SHAPE[id].loftDeg });
const DEFAULT_CLUBS = [
  seed("driver", "Driver", false, "low"),
  seed("spoon", "Spoon", false, "low-mid"),
  seed("3iron", "3 Iron", true, "mid"),
  seed("5iron", "5 Iron", true, "mid"),
  seed("7iron", "7 Iron", true, "mid-high"),
  seed("9iron", "9 Iron", true, "high"),
  seed("wedge", "Wedge", true, "highest"),
];
// the seeds the clubs carried before NSS's (src/wsrShape.js stopYd / 4 and the
// 10 mph secants of WSR's wind): a stored club still at one was never fitted
const WSR_SEEDS = {
  driver: { a: 278.798 / 4, h: 0.00626, c: 0.551 }, spoon: { a: 252.61 / 4, h: 0.00678, c: 0.538 },
  "3iron": { a: 211.701 / 4, h: 0.00924, c: 0.617 }, "5iron": { a: 175.6 / 4, h: 0.01051, c: 0.581 },
  "7iron": { a: 145.791 / 4, h: 0.00939, c: 0.423 }, "9iron": { a: 109.503 / 4, h: 0.01075, c: 0.364 },
  wedge: { a: 60.028 / 4, h: 0.01024, c: 0.185 },
};
// Caps in bars (fixed; not user-editable), NSS's ratios x 4: rough 3 for every
// club; sand wedge 3, irons 2, spoon & driver 1; the putter uncapped.
const BUNKER_CAPS = Object.fromEntries(Object.entries(NSS_SHAPE).map(([id, t]) => [id, 4 * t.bunkerRatio]));
const ROUGH_CAPS = Object.fromEntries(Object.entries(NSS_SHAPE).map(([id, t]) => [id, 4 * t.roughRatio]));
const capFor = (club, lie) =>
  lie === "bunker" ? (BUNKER_CAPS[club.id] ?? 2) : lie === "rough" ? (ROUGH_CAPS[club.id] ?? 3.0) : club.maxPower;

// The rec cards' calibration line names where the flight comes from.
const SHAPE_LABEL = "NSS's ball";
// a rec needing this close to the full capped bar is flagged: past the cap the
// bar goes red and the ball curves to a random side (CLAUDE.md)
const RED_MARGIN = 0.1;
// the solver's lowest power, bars
const MIN_BARS = 0.4;

// The landing surfaces the shape knows, which are also the Log's "landed"
// values. Any other read (water, OB, a wall or bank, no terrain, no line or
// map scale) rolls as fairway: the stop then is the fairway's, and the rec
// card says what the map shows there.
const LANDED = ["fairway", "rough", "green", "fringe", "bunker"];
const landingSurface = (lie) => (LANDED.includes(lie) ? lie : "fairway");
// a landing surface -> the NSS ball's attribute (src/nsssim.js ATTR)
const ATTR_OF = { fairway: 1, rough: 2, bunker: 3, green: 6, fringe: 7 };

// NSS's shape at launch power q (gauge bars / 4): linear between the table's
// whole percents (SHAPE_Q, 0.01 apart), clamped to q in [0.01, 1]; col "S" =
// stop on `surface`, "C" = carry, both in units of the full-power fairway stop.
// The (1 - f, f) weights return a knot's value exactly, so S(1, fairway) = 1
// and a full-power fairway stop is 4a to the last bit. Between two knots the
// game flies the lower one (it reads the table at (int)(100 power)): up to one
// step under this, 0.04 bar (the driver's 2.3 yd at full power, the wedge's
// 0.7). A club the table lacks gets the linear model (S = C = q). `spin` is
// kept for the callers and ignored (no spin columns: the swing's backspin is
// not decoded).
function shapeAt(clubId, q, col, surface = "fairway", spin = 0) {
  const t = NSS_SHAPE[clubId];
  const n = SHAPE_Q.length, x = Math.min(SHAPE_Q[n - 1], Math.max(SHAPE_Q[0], q));
  if (!t) return x;
  const row = col === "C" ? t.C : t.S[landingSurface(surface)];
  const i = Math.min(n - 2, Math.max(0, Math.floor((x - SHAPE_Q[0]) / (SHAPE_Q[1] - SHAPE_Q[0]) + 1e-9)));
  const f = Math.max(0, Math.min(1, (x - SHAPE_Q[i]) / (SHAPE_Q[i + 1] - SHAPE_Q[i])));
  return row[i] * (1 - f) + row[i + 1] * f;
}

// Where a shot of `bars` stops and where it first lands, yd, on level ground
// in calm air (the wind needs a flight: stopAt, solve): h is the fitted
// residual over NSS's own wind, 0 for a seed club.
function stopOf(club, bars, surface = "fairway", spin = 0, wAlong = 0) {
  return 4 * club.a * (1 + club.h * wAlong) * shapeAt(club.id, bars / 4, "S", surface, spin);
}
function carryOf(club, bars, wAlong = 0) {
  return 4 * club.a * (1 + club.h * wAlong) * shapeAt(club.id, bars / 4, "C");
}

// The power (bars, within [lo, hi]) whose stop on `surface` is `dist`, on a
// rising piece of the curve: bisection to 0.005 bar, then linear inside the
// last bracket, cut at the knot it holds if any (the curve is linear between
// knots 0.04 bar apart, so that is exact). { p, ok }: ok false when dist
// is out of reach (p then is the end it fell beyond).
function powerFor(club, dist, surface, wAlong, lo, hi) {
  const stop = (p) => stopOf(club, p, surface, 0, wAlong);
  let sl = stop(lo), sh = stop(hi);
  if (sl > dist) return { p: lo, ok: false };
  if (sh < dist) return { p: hi, ok: false };
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2, sm = stop(mid);
    if (sm < dist) { lo = mid; sl = sm; } else { hi = mid; sh = sm; }
  }
  // a knot inside the last bracket: narrow to its side, where the curve is linear
  const kb = Math.ceil(lo / KNOT_BARS - 1e-9) * KNOT_BARS;
  if (kb > lo && kb < hi) { const sk = stop(kb); if (sk < dist) { lo = kb; sl = sk; } else { hi = kb; sh = sk; } }
  const f = sh > sl ? (dist - sl) / (sh - sl) : 1;
  return { p: lo * (1 - f) + hi * f, ok: true };
}
// the table's knots in bars (a whole percent: 0.04 bar)
const KNOT_BARS = 4 * (SHAPE_Q[1] - SHAPE_Q[0]);

// The stop a shot of `bars` really has on level ground in calm air: the stop
// curve of the surface its own carry lands on (surfaceAt read at
// carryOf(bars), a missing or other read rolling as fairway).
function landedStop(club, bars, wAlong = 0, surfaceAt = null) {
  const lie = surfaceAt ? surfaceAt(carryOf(club, bars, wAlong)) ?? null : null;
  return stopOf(club, bars, landingSurface(lie), 0, wAlong);
}

// The power scan's step and the surface-edge tolerance, bars. A 0.02-bar step
// (half a percent; every other sample is one of the table's knots, so the
// curve is linear between two samples on one surface) moves a seed club's
// carry 0.3-1.2 yd, under the terrain's cells (one sample per 2 map px, 1.8-5
// yd), so a strip of another surface shows in a sample unless the line only
// clips a cell's corner; a solution whose carry lands on such a sliver is
// caught by the read at its own carry (solve).
const SCAN_STEP = 0.02, EDGE_TOL = 0.001;

// f(p) = landedStop over [MIN_BARS, cap], cut into runs on which it rises on
// one landing surface: sampled every SCAN_STEP, each change of surface between
// two samples bisected to EDGE_TOL, and each piece between two samples (one
// surface, linear there) kept when it rises, dropped where it falls (NSS's
// step down where a landing takes one bounce more: the table's knots either
// side of it are samples, so the fall is a piece of its own). Within a run f
// rises; between runs it jumps (up onto a green, down into a bunker or at a
// bounce more), so a distance has a solution on a run whose ends straddle it
// and none inside a jump. -> { runs: [{ a, b, s }] (power from a to b lands on
// s), split } (split cuts any [a, b] whose ends read sa and sb the same way).
function landingRuns(club, cap, wAlong, readLie) {
  const sOf = (p) => landingSurface(readLie(carryOf(club, p, wAlong)));
  const fOf = (p, s) => stopOf(club, p, s, 0, wAlong);
  const split = (a, sa, b, sb) => {
    const parts = [];
    for (let guard = 0; sa !== sb && guard < 16; guard++) {
      let lo = a, hi = b;
      while (hi - lo > EDGE_TOL) { const mid = (lo + hi) / 2; if (sOf(mid) === sa) lo = mid; else hi = mid; }
      parts.push({ a, b: lo, s: sa });
      a = hi; sa = sOf(hi);
    }
    parts.push({ a, b, s: sa });
    return parts;
  };
  const n = Math.max(1, Math.round((cap - MIN_BARS) / SCAN_STEP));
  const at = (k) => (k === n ? cap : MIN_BARS + k * SCAN_STEP);
  const runs = [];
  let cur = null;
  const add = (q) => {
    if (!(q.b > q.a) || fOf(q.b, q.s) < fOf(q.a, q.s)) { if (cur) runs.push(cur); cur = null; return; }
    if (cur && cur.s === q.s && cur.b === q.a) cur.b = q.b;
    else { if (cur) runs.push(cur); cur = { a: q.a, b: q.b, s: q.s }; }
  };
  let prev = at(0), sp = sOf(prev);
  if (n === 0 || cap <= MIN_BARS) return { runs: [{ a: MIN_BARS, b: cap, s: sp }], split };
  for (let k = 1; k <= n; k++) {
    const p = at(k), s = sOf(p);
    for (const q of split(prev, sp, p, s)) add(q);
    prev = p; sp = s;
  }
  if (cur) runs.push(cur);
  return { runs, split };
}

/* ---------------- the wind ---------------- */
// The dial's wind (mph, its direction relative to the shot: 0 = tail, 90 =
// toward the right) as NSS's wind object: s m/s, the air moving along the
// heading's frame. NSS draws s as a whole number 0..15 (WindVelMax) and the
// HUD shows floor(2.25 s) mph on every recorded pair (1 -> 2, 3 -> 6, 4 -> 9,
// 5 -> 11, 6 -> 13, 10 -> 22; flights.md 5.9: the rounding is not decoded, so
// this is approximate): a dial value that some whole s shows is read as that
// s, any other as mph / 2.25. NSS's wind acts in the air only, linear in s,
// 0.33 (W across + 0.6 W along) m/s^2 per unit with the height factor 0.2 to
// 3 m above the launch rising to 1 at 30 m.
const HUD_K = PHYSICS.wind.hudMphPerS, WIND_MAX = PHYSICS.air.windVelMax;
function windS(mph) {
  if (!(mph > 0)) return 0;
  const s = Math.ceil(mph / HUD_K - 1e-9);
  return Math.min(WIND_MAX, Math.floor(HUD_K * s + 1e-9) === Math.round(mph) && Number.isInteger(mph) ? s : mph / HUD_K);
}
// -> { speed (mph), deg, along, cross (mph, as the fit's wAlong / wCross), s,
// vec: the air's velocity { x, z } in the flight's frame (heading 0 = -z, +x
// to the right) or null in calm }
function windOf(speed = 0, deg = 0) {
  const rad = deg * DEG, s = windS(speed);
  return { speed, deg, along: speed * Math.cos(rad), cross: speed * Math.sin(rad), s,
    vec: s > 0 ? { x: s * Math.sin(rad), z: -s * Math.cos(rad) } : null };
}
// the wind the last solve used with a ctx, for stopAt / flightOf, which take
// only wAlong (App.jsx's rec-card bar): read when its along matches
const lastWind = new WeakMap();
function windFor(ctx, wAlong) {
  if (ctx && ctx.wind) return windOf(ctx.wind.speed ?? 0, ctx.wind.deg ?? 0);
  const w = ctx && typeof ctx === "object" ? lastWind.get(ctx) : null;
  if (w && Math.abs(w.along - wAlong) < 1e-9) return w;
  return windOf(Math.abs(wAlong), wAlong < 0 ? 180 : 0);
}

/* ---------------- elevation ---------------- */
// With ctx.heightAt (the ground's height along the shot line, yd above + or
// below - the ground under the ball, at yd from the ball in the Switch's
// yards; the App reads it from src/terrain.js, NSS's collision) the solver
// flies each club over the line's terrain with NSS's ball (src/nsssim.js run
// with a profile): the carry onto lower or higher ground, the bounce off the
// slope it lands on and the roll down or up it, where the table assumes level
// ground. The flight is the game's own, so nothing is guessed but the scaling:
// k = 4a (1 + h wAlong) / NSS_SHAPE[club].stopYd (1 for a seed club) scales
// its horizontal distances, heights unscaled (a 20 yd drop is 20 yd in both):
// the sim's ground at s m is ctx.heightAt(k s / 0.9144) and its stop s m is
// k s / 0.9144 of the Switch's yd. The wind on the dial flies in the air
// (windOf); in calm without heights the table stands (the same ball, tabled).

// The line's profile, sampled once per ctx.heightAt / ctx.surfaceAt pair (the
// App keeps both while only the distance changes): the height every PROF_STEP
// yd from PROF_BACK behind the ball (a bounce back) to PROF_LEN ahead (past any
// club's stop; the profile holds its last sample beyond), linear between
// samples; the lie at the nearest sample, so a surface edge sits within 0.125
// yd of the terrain's own (its cells are 1.8-5 yd). Where the terrain has no
// data (past the frame) the height holds the sample on the ball's side of the
// gap.
const PROF_STEP = 0.25, PROF_BACK = 8, PROF_LEN = 500;
const profiles = new WeakMap();
function lineProfile(ctx) {
  const hit = profiles.get(ctx.heightAt);
  if (hit && hit.surfaceAt === ctx.surfaceAt) return hit.prof;
  const i0 = Math.round(PROF_BACK / PROF_STEP), n = i0 + Math.round(PROF_LEN / PROF_STEP) + 1;
  const h = new Float64Array(n), lies = new Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const yd = (i - i0) * PROF_STEP, z = ctx.heightAt(yd);
    h[i] = typeof z === "number" && Number.isFinite(z) ? z : NaN;
    if (!Number.isNaN(h[i])) any = true;
    lies[i] = ctx.surfaceAt ? ctx.surfaceAt(yd) ?? null : null;
  }
  let prof = null;
  if (any) {
    if (Number.isNaN(h[i0])) {
      for (let d = 1; ; d++) {
        const v = [h[i0 + d], h[i0 - d]].find((x) => x !== undefined && !Number.isNaN(x));
        if (v !== undefined) { h[i0] = v; break; }
      }
    }
    for (let i = i0 + 1; i < n; i++) if (Number.isNaN(h[i])) h[i] = h[i - 1];
    for (let i = i0 - 1; i >= 0; i--) if (Number.isNaN(h[i])) h[i] = h[i + 1];
    prof = { h, lies, n, i0 };
  }
  profiles.set(ctx.heightAt, { surfaceAt: ctx.surfaceAt, prof });
  return prof;
}
// a level line carrying ctx.surfaceAt's lies (the wind flown without heights)
const levels = new WeakMap();
let levelBare = null;
function levelProfile(surfaceAt) {
  if (typeof surfaceAt !== "function") return (levelBare ??= lineProfile({ heightAt: () => 0, surfaceAt: null }));
  if (!levels.has(surfaceAt)) levels.set(surfaceAt, lineProfile({ heightAt: () => 0, surfaceAt }));
  return levels.get(surfaceAt);
}
// the profile's height at yd (the Switch's yd from the ball)
function profHeight(prof, yd) {
  const { h, n, i0 } = prof, u = yd / PROF_STEP + i0;
  if (!(u > 0)) return h[0];
  if (u >= n - 1) return h[n - 1];
  const i = Math.floor(u);
  return h[i] + (h[i + 1] - h[i]) * (u - i);
}

// The ground src/nsssim.js's run flies over (its `profile`) from a line's
// profile, at k of the Switch's yd per sim yd: { heightAt(s), attrAt(s) } in
// NSS's metres, s m along the shot; the sim's ground at s is the profile's at
// k s / 0.9144 yd, its heights in m, and the attribute of the lie there (a
// landing surface; water, OB, walls and no read as fairway, as the table reads
// them). tools/build-derived.mjs flies the logged shots over it at k = 1
// (elevFlight).
function simProfile(prof, k = 1) {
  const { lies, n } = prof;
  return {
    heightAt: (s) => profHeight(prof, (k * s) / M) * M,
    attrAt: (s) => { const i = Math.round((k * s) / M / PROF_STEP) + prof.i0; return ATTR_OF[lies[i < 0 ? 0 : i >= n ? n - 1 : i]] ?? 1; },
  };
}

// The launch: the club's table speed at q (linear between its whole percents,
// as shapeAt), along heading 0 pitched up by the club's loft (flights.md 4).
// The ball's centre sits 0.05 m above the ground at rest (P1's contact radius),
// 0.1 on a tee.
const LAUNCH = {};
for (const [id, t] of Object.entries(NSS_SHAPE)) LAUNCH[id] = { club: t.club, speeds: PHYSICS.launchTable[t.club], loft: t.loftDeg * DEG };
function launchV0(id, q) {
  const L = LAUNCH[id], tb = L.speeds, x = Math.max(1, Math.min(tb.length, q * 100));
  const i = Math.min(tb.length - 1, Math.floor(x)), f = x - i;
  const s = i >= tb.length ? tb[tb.length - 1] : tb[i - 1] + (tb[i] - tb[i - 1]) * f;
  return [0, s * Math.sin(L.loft), -s * Math.cos(L.loft)];
}
const startHeight = (lie) => PHYSICS.ball.contactRadiusM + (lie === "tee" ? PHYSICS.ball.teeHeightM : 0);
const LIE_NAMES = new Set(["tee", "fairway", "rough", "bunker", "green", "fringe"]);

// One club over the profile: bars -> { p, carry, stop, lateral } in the
// Switch's yd (stop: the distance the shot reaches along its own line, the
// drift's lateral included; behind the ball it is the along distance, < 0),
// and with trace also the path for the tree check. The ball sits ballLift yd
// above the profile's origin at launch, on a tee from lie "tee".
function flyer(cl, wind, prof, ballLift, lie) {
  const k = (4 * cl.a * (1 + cl.h * wind.along)) / NSS_SHAPE[cl.id].stopYd;
  const profile = simProfile(prof, k);
  const g0 = profHeight(prof, 0) * M, y0 = g0 + ballLift * M + startHeight(lie);
  const nl = LIE_NAMES.has(lie) ? lie : "fairway";
  return (bars, trace = false) => {
    const o = nssRun({ club: LAUNCH[cl.id].club, v0: launchV0(cl.id, bars / 4), lie: nl, start: [0, y0, 0], heading: 0, profile, wind: wind.vec, trace: trace ? 4 : false });
    const along = -o.rest[2], lat = o.rest[0], s = along > 0 ? Math.sqrt(along * along + lat * lat) : along;
    const r = { p: bars, carry: (k * o.carry) / M, stop: (k * s) / M, lateral: (k * lat) / M };
    if (trace) {
      // the path as src/trees.js reads it: [yd along (sim yd: x k is the
      // Switch's), yd above the launch, yd right], every 1/60 s
      r.path = o.path.map((q) => [-q[3] / M, (q[2] - y0) / M, q[1] / M]);
      r.k = k; r.dt = (4 * PHYSICS.tick.dt); r.ballZ = (y0 - g0) / M - 0.056 / M;
    }
    return r;
  };
}

// The power whose flight stops at dist: from p0 (the table's solution) a
// Newton step on the table's slope there, then secant steps through the last
// two flights, at most REFINE_SIMS flights after p0's, inside the bracket the
// flights have narrowed from [MIN_BARS, cap] (a step leaving it bisects it;
// the cap's flight top is known to reach), until a flight stops within
// AIM_TOL yd of dist. The closest flight (the cap's among them) is the answer,
// exact within STOP_TOL yd, else flagged approx: a distance inside a jump of
// the stop (a bounce more, a dip that catches the roll, a bank it rolls back
// down, the carry crossing onto a green) has none closer.
// -> the closest flight { p, carry, stop, lateral, e = stop - dist }.
const STOP_TOL = 0.5, AIM_TOL = 0.05, REFINE_SIMS = 6;
function refine(fly, top, cap, dist, p0, slope0) {
  const pts = [];
  let lo = MIN_BARS, loKnown = false, hi = cap;
  const flyAt = (p) => {
    const o = p === cap ? top : fly(p), e = o.stop - dist;
    pts.push({ ...o, e });
    if (e < 0) { if (p >= lo) { lo = p; loKnown = true; } } else if (p <= hi) hi = p;
    return e;
  };
  let e = flyAt(p0);
  for (let it = 0; it < REFINE_SIMS && Math.abs(e) > AIM_TOL; it++) {
    const b = pts[pts.length - 1], a = pts[pts.length - 2];
    let p = a && b.e !== a.e ? b.p - (b.e * (b.p - a.p)) / (b.e - a.e) : b.p - b.e / slope0;
    if (!(p > lo && p < hi)) {
      // below the floor while the floor is unflown: fly the floor itself
      if (!loKnown && !(p > lo) && !pts.some((x) => x.p === lo)) p = lo;
      else p = (lo + hi) / 2;
    }
    if (pts.some((x) => x.p === p)) break;
    e = flyAt(p);
  }
  if (!pts.some((x) => x.p === cap)) pts.push({ ...top, e: top.stop - dist });
  return pts.reduce((m, x) => (Math.abs(x.e) < Math.abs(m.e) || (Math.abs(x.e) === Math.abs(m.e) && x.p < m.p) ? x : m));
}
// an approximate rec ranks after the exact ones of a like power fraction
const APPROX_PENALTY = 1;

// The ground a ctx flies: its terrain profile, else a level line when the
// wind blows (null in calm without heights: the table)
const groundFor = (ctx, wind) => (typeof ctx.heightAt === "function" ? lineProfile(ctx) : null) ?? (wind.vec ? levelProfile(ctx.surfaceAt) : null);

// The stop of `bars` by the solver's own f: flown over the profile (or the
// level line in a wind), else landedStop's table. The rec card's power bar
// maps through it (App.jsx dragBar). The wind: ctx.wind ({ speed, deg }) when
// given, else the last solve's with this ctx when its along wind is wAlong,
// else wAlong straight along the line.
function stopAt(club, bars, wAlong = 0, ctx = {}) {
  const wind = windFor(ctx, wAlong);
  const prof = NSS_SHAPE[club.id] ? groundFor(ctx, wind) : null;
  if (!prof || !(club.a * (1 + club.h * wind.along) > 0)) return landedStop(club, bars, wAlong, ctx.surfaceAt ?? null);
  return flyer(club, wind, prof, Number.isFinite(ctx.ballLift) ? ctx.ballLift : 0, ctx.lie ?? lastLie.get(ctx) ?? "fairway")(bars).stop;
}
const lastLie = new WeakMap();

/* ---------------- trees ---------------- */
// With ctx.trees (src/trees.js treesAlong: the hole's trees on the shot
// line's frame, the App's from the pipeline's tree markers and the player's
// own) solve checks every club's rec, not only the three it shows, against
// the trees' collision (treeCheck). A rec whose flight goes into a trunk or
// loses a shot's worth through a canopy gets `tree` and TREE_PENALTY on its
// score; its card names the best clean rec as the alternative (a lofted iron
// over the canopy, a driver or spoon under the branches) and how it passes
// that tree.

// The flight a rec's tree check flies: NSS's ball at `bars` (over the terrain
// as the solver refines on it, else a level line), traced every 1/60 s, with
// k (the Switch's yd per path yd along the shot), the carry it lands at, the
// path's dt and ballZ, the ball's height at launch above the ground under it
// (yd, its centre less the ball's radius). The heights are NSS's own (its
// lofts 10.5 / 12 / 25 / 28 / 29 / 34 / 40 degrees, the hop lift, drag and
// gravity: full-power apexes 25.5 / 24.8 / 30.7 / 29.0 / 23.8 / 22.0 / 14.3
// yd), in the dial's wind. null for a club NSS lacks.
function flightOf(club, bars, wAlong = 0, ctx = {}) {
  if (!NSS_SHAPE[club.id]) return null;
  const wind = windFor(ctx, wAlong);
  const prof = groundFor(ctx, wind) ?? levelProfile(ctx.surfaceAt);
  const o = flyer(club, wind, prof, Number.isFinite(ctx.ballLift) ? ctx.ballLift : 0, ctx.lie ?? lastLie.get(ctx) ?? "fairway")(bars, true);
  return { path: o.path, k: o.k, carry: o.carry, ballZ: o.ballZ, dt: o.dt };
}

// A tree-hit rec sorts below every clean one (a score is |frac - 0.8|, +0.5
// past 0.97 of the cap and +1 approx: 1.7 at most) and above one the player
// marked blocked (+10)
const TREE_PENALTY = 5;
const treeHit = (c) => c.kind === "canopy" || c.kind === "trunk";
// recs -> each hit one gets tree = { kind ("canopy" / "trunk"), at (yd along
// the flight), id (the tree marker's), shape (broadleaf, conifer, palm), own
// (a player's marker, checked as a median broadleaf), alt } and the
// penalty; alt = the clean rec with the best score that the player has not
// blocked, { club (name), power, how: "over" / "under" the canopy of that
// same tree, or "clear" of it } (null when every rec hits a tree or is
// blocked). One more flight per rec, traced.
function checkTrees(recs, trees, ctx) {
  const fl = new Map(), ck = new Map();
  for (const r of recs) {
    const f = flightOf(r.club, r.power, r.wAlong, ctx);
    if (!f) continue;
    fl.set(r, f); ck.set(r, treeCheck(f.path, trees, { ...f, aim: r.aim }));
  }
  const alt = recs.filter((r) => ck.has(r) && !treeHit(ck.get(r)) && !r.blocked).reduce((b, r) => (!b || r.score < b.score ? r : b), null);
  for (const r of recs) {
    const c = ck.get(r);
    if (!c || !treeHit(c)) continue;
    const t = trees.find((x) => x.id === c.tree), fa = alt && fl.get(alt);
    r.score += TREE_PENALTY;
    r.tree = { kind: c.kind, at: c.at, id: c.tree, shape: TREE_SHAPES[t?.kind]?.name ?? t?.name ?? "tree", own: !!t?.own,
      ...(c.lossYd != null ? { lossYd: c.lossYd } : {}),
      alt: alt && t ? { club: alt.club.name, power: alt.power, how: treeCheck(fa.path, [t], { ...fa, aim: alt.aim }).kind } : null };
  }
}

/* ---------------- putting ---------------- */
// The putt model is src/putt.js (NSS's roll on a green over the mesh heights);
// the solver's callers take it from here. GRID_N / emptyGreen are the painted
// slope grid the hole state carries (App.jsx).
const GRID_N = 9;
const emptyGreen = () => ({ box: null, grid: Array.from({ length: GRID_N }, () => Array.from({ length: GRID_N }, () => [0, 0])) });

/* ---------------- the fit ---------------- */
// A logged row's level-ground flight in its own wind: NSS's stop (yd) and
// sideways drift (yd, + right) of `bars` landing on `surface`, k = 1 (the
// table in calm air, a flight over a level line of that surface in a wind),
// cached
const rowFlights = new Map();
function levelShot(id, bars, surface, wAlong, wCross) {
  const speed = Math.hypot(wAlong ?? 0, wCross ?? 0);
  if (!(speed > 0) || !NSS_SHAPE[id]) return { stop: NSS_SHAPE[id] ? NSS_SHAPE[id].stopYd * shapeAt(id, bars / 4, "S", surface) : NaN, lateral: 0 };
  const deg = (Math.atan2(wCross ?? 0, wAlong ?? 0) * 180) / Math.PI;
  const key = `${id}|${bars}|${surface}|${speed}|${deg}`;
  let r = rowFlights.get(key);
  if (!r) {
    const seedClub = { id, a: NSS_SHAPE[id].stopYd / 4, h: 0 };
    const o = flyer(seedClub, windOf(speed, deg), levelProfile(SURFACE_FNS[landingSurface(surface)]), 0, "fairway")(bars);
    r = { stop: o.stop, lateral: o.lateral };
    if (rowFlights.size > 4096) rowFlights.clear();
    rowFlights.set(key, r);
  }
  return r;
}
const SURFACE_FNS = Object.fromEntries(LANDED.map((s) => [s, () => s]));

function fitClub(club, shots) {
  const mine = shots.filter((s) => s.club === club.id);
  if (mine.length === 0) return { ...club, shots: 0 };
  const next = { ...club, shots: mine.length };
  const clean = mine.filter((s) => s.lie === "tee" || s.lie === "fairway");
  const pool = clean.length ? clean : mine;
  // Each row is read through NSS's own ball at its power, where it finished
  // (`landed`, fairway when absent) and in its own wind (levelShot): shaped =
  // that stop / stopYd x 4, so stop / shaped = a (1 + h wAlong) with h the
  // residual over NSS's wind (0 when the logs agree with it). A logged shot's
  // spin is unknown; the tee/fairway rows the fit prefers are where it
  // matters least.
  // Caution: WSR quietly pulls a PARTIAL swing's launch power halfway toward
  // the power that lands nearest the pin when its aim can land within ~33 yd
  // of it (wsr-swing-redzone-spin.md section 3.5); whether NSS kept it is open,
  // so partial-power approach rows near the pin may be biased; full swings,
  // the anchors the Guide asks for first, are never touched.
  // A row with flatEnded (tools/build-derived.mjs: its logged stop over its
  // elevFactor, NSS's stop over the hole's terrain along the shot against the
  // same shot on level fairway, both in the row's wind) is read as that
  // level-fairway stop, so its landing is fairway; any other row as its
  // logged stop (carry) where it finished.
  if (!NSS_SHAPE[club.id]) return next;
  const stopYd = NSS_SHAPE[club.id].stopYd;
  const stop = (s) => (s.flatEnded > 0 ? s.flatEnded : s.carry);
  const flown = (s) => levelShot(club.id, s.power, s.flatEnded > 0 ? "fairway" : s.landed, s.wAlong ?? 0, s.wCross ?? 0);
  const shaped = (s) => (4 * flown(s).stop) / stopYd;
  const xs = [], ys = [];
  pool.forEach((s) => {
    if (s.power > 0 && stop(s) > 0 && shaped(s) > 0) { xs.push(s.wAlong ?? 0); ys.push(stop(s) / shaped(s)); }
  });
  if (ys.length >= 1) {
    const n = ys.length;
    const mx = xs.reduce((u, v) => u + v, 0) / n;
    const my = ys.reduce((u, v) => u + v, 0) / n;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    if (den > 4 && n >= 3) {
      const B = num / den, A = my - B * mx;
      if (A > 0) { next.a = A; next.h = Math.max(-0.03, Math.min(0.03, B / A)); }
    } else {
      let sum = 0, cnt = 0;
      pool.forEach((s) => {
        const f = 1 + club.h * (s.wAlong ?? 0);
        if (s.power > 0 && f > 0.5 && shaped(s) > 0) { sum += stop(s) / (shaped(s) * f); cnt++; }
      });
      if (cnt) next.a = sum / cnt;
    }
  }
  // c: the sideways miss beyond NSS's own drift, per mph across per bar
  let nu = 0, de = 0;
  pool.forEach((s) => {
    if (s.lateral == null) return;
    const x = (s.wCross ?? 0) * s.power;
    if (Math.abs(s.wCross ?? 0) > 1) { nu += (s.lateral - ((4 * next.a) / stopYd) * flown(s).lateral) * x; de += x * x; }
  });
  if (de > 0) next.c = Math.max(-2, Math.min(2, nu / de));
  return next;
}

// A logged shot flown for tools/build-derived.mjs's elevFactor (and
// tools/test-rows.mjs, which flies it again): NSS's ball at the row's power
// from its lie in its wind (the dial's mph and direction relative to the
// shot), over a line profile (lineProfile, the Switch's yd) and over level
// fairway, k = 1 -> { over, level } stops, yd.
function elevFlight({ club, power, lie = "fairway", windSpeed = 0, windDeg = 0, prof }) {
  if (!NSS_SHAPE[club]) return null;
  const cl = { id: club, a: NSS_SHAPE[club].stopYd / 4, h: 0 }, wind = windOf(windSpeed, windDeg);
  const over = flyer(cl, wind, prof, 0, lie)(power).stop;
  const level = flyer(cl, wind, levelProfile(null), 0, lie)(power).stop;
  return { over, level };
}

// ctx.surfaceAt(yd) -> the lie the course map shows `yd` along the shot line
// (the App reads it from the terrain, src/terrain.js), or null without terrain,
// line or scale; ctx.heightAt(yd) -> the ground's height there, yd relative to
// the ground under the ball (null where the terrain has no data), which turns
// on the elevation above; ctx.ballLift = how far the ball sits above that
// ground, yd (0; the online platform's tiers); ctx.trees = the trees on
// the line's frame (src/trees.js treesAlong), which turns on the tree check
// ("trees" above).
// A rec: { club, power, drift, aim, frac, cap, score, calibrated, blocked,
// carry, roll, surface, landsOn, rollSpin (null: no spin range), red, elev,
// tree }, tree null unless the flight hits one (checkTrees); a flown rec (the
// wind on the dial, or heights along the line) also has stop (= carry + roll,
// within STOP_TOL of dist unless approx) and approx, and with heights (elev
// true) dh / dhStop = the ground's height at the carry / the stop minus the
// ball's (yd, + uphill). drift = the flight's sideways drift at the stop (yd,
// + right; 0 in calm) plus the fitted residual c x wCross x bars; aim = -drift.
function solve(clubs, inputs, blockedRules, ctx = {}) {
  const { dist, windSpeed, relWindDeg, lie, hole, stroke } = inputs;
  const wind = windOf(windSpeed ?? 0, relWindDeg ?? 0);
  if (ctx && typeof ctx === "object") { lastWind.set(ctx, wind); lastLie.set(ctx, lie); }
  const wAlong = wind.along, wCross = wind.cross;
  const readLie = (yd) => (ctx.surfaceAt ? ctx.surfaceAt(yd) ?? null : null);
  const terrain = typeof ctx.heightAt === "function" ? lineProfile(ctx) : null;
  const prof = terrain ?? (wind.vec ? levelProfile(ctx.surfaceAt) : null);
  const ballLift = Number.isFinite(ctx.ballLift) ? ctx.ballLift : 0;
  const trees = Array.isArray(ctx.trees) && ctx.trees.length ? ctx.trees : null;
  const out = [];
  let maxReach = null;
  const reach = (yd, cl) => { if (!maxReach || yd > maxReach.yd) maxReach = { yd, club: cl.name }; };
  // a solution's aim, power fraction and score (a blocked rule's aim within 10 yd)
  const scored = (cl, cap, p, flownDrift = 0) => {
    const drift = flownDrift + cl.c * wCross * p;
    const aim = -drift;
    const frac = p / cap;
    const rule = hole ? blockedRules.find(
      (r) => r.hole === hole && r.club === cl.id && (r.stroke === 0 || r.stroke === stroke) && Math.abs(r.aim - aim) <= 10
    ) : null;
    let score = Math.abs(frac - 0.8) + (frac > 0.97 ? 0.5 : 0);
    if (rule) score += 10;
    return { drift, aim, frac, score, rule };
  };
  clubs.forEach((cl) => {
    const cap = capFor(cl, lie);
    const denom = cl.a * (1 + cl.h * wAlong);
    if (denom <= 0 || cap < MIN_BARS) return;
    const fly = prof && NSS_SHAPE[cl.id] ? flyer(cl, wind, prof, ballLift, lie) : null;
    // The landing surface by a power scan (landingRuns): every power from the
    // floor to the cap with the surface its own carry lands on, on the rising
    // pieces of the curve. maxReach is the top of f, at the end of a run (f
    // need not rise overall: a bunker under a long carry, or a bounce more,
    // stops it short of a shorter one's roll); flown it is the cap's flight
    // instead (below).
    const { runs, split } = landingRuns(cl, cap, wAlong, readLie);
    const f = (p, s) => stopOf(cl, p, s, 0, wAlong);
    if (!fly) for (const r of runs) reach(f(r.b, r.s), cl);
    // The solutions: each run whose ends straddle dist, bisected on its surface
    // and kept when the read at its own carry agrees. A strip narrower than a
    // step that the solution's carry lands in cuts the run again around it.
    const sols = [];
    const tryRun = (r, depth) => {
      if (!(f(r.a, r.s) <= dist && dist <= f(r.b, r.s))) return;
      const { p } = powerFor(cl, dist, r.s, wAlong, r.a, r.b);
      const landsOn = readLie(carryOf(cl, p, wAlong)), s = landingSurface(landsOn);
      if (s === r.s) sols.push({ p, surface: s, landsOn });
      else if (depth < 4) [...split(r.a, r.s, p, s), ...split(p, s, r.b, r.s)].forEach((q) => tryRun(q, depth + 1));
    };
    runs.forEach((r) => tryRun(r, 0));
    // several solutions (a carry onto a green and a shorter one rolling up to
    // it; either side of a bounce more): the best score, ties to the lower power
    let best = null;
    for (const sol of sols) {
      const sc = scored(cl, cap, sol.p);
      if (!best || sc.score < best.score || (sc.score === best.score && sol.p < best.p)) best = { ...sol, ...sc };
    }
    if (!fly) {
      if (!best) return;
      const { p, surface, landsOn } = best;
      // carry and roll at the solved power, level ground, calm (the table)
      const carry = carryOf(cl, p, wAlong);
      const roll = stopOf(cl, p, surface, 0, wAlong) - carry;
      out.push({ club: cl, power: p, drift: best.drift, aim: best.aim, frac: best.frac, cap, score: best.score, calibrated: cl.shots, blocked: best.rule || null,
        carry, roll, surface, landsOn, rollSpin: null, red: p >= cap - RED_MARGIN, elev: false, tree: null, wAlong });
      return;
    }
    // Flown: the cap's flight is the club's reach (its surfaces read at its
    // own contacts; not below 0, where a bank in front of the ball throws it
    // back behind), and a club whose cap stops short of dist is out of reach.
    // The rest refines the table's best on the profile (refine); without one
    // (dist past the table's reach, or inside a jump of its curve) it starts
    // from the fairway curve shifted by the cap's difference between the
    // flight and the table.
    const top = fly(cap);
    reach(Math.max(0, top.stop), cl);
    if (top.stop < dist) return;
    const slopeOf = (p, s) => {
      const d = Math.min(0.01, (cap - MIN_BARS) / 2), a = Math.max(MIN_BARS, Math.min(cap - 2 * d, p - d));
      return (f(a + 2 * d, s) - f(a, s)) / (2 * d);
    };
    let p0, s0;
    if (best) { p0 = best.p; s0 = best.surface; }
    else {
      s0 = "fairway";
      p0 = powerFor(cl, dist - (top.stop - landedStop(cl, cap, wAlong, readLie)), s0, wAlong, MIN_BARS, cap).p;
    }
    const r = refine(fly, top, cap, dist, p0, Math.max(1e-3, slopeOf(p0, s0) || 0));
    const approx = Math.abs(r.e) > STOP_TOL;
    // the floor flies past dist: the club cannot hit it that short
    if (approx && r.e > 0 && r.p <= MIN_BARS) return;
    const p = r.p, landsOn = readLie(r.carry), surface = landingSurface(landsOn), sc = scored(cl, cap, p, r.lateral);
    const roll = r.stop - r.carry;
    const rec = { club: cl, power: p, drift: sc.drift, aim: sc.aim, frac: sc.frac, cap, score: sc.score + (approx ? APPROX_PENALTY : 0), calibrated: cl.shots, blocked: sc.rule || null,
      carry: r.carry, roll, surface, landsOn, rollSpin: null, red: p >= cap - RED_MARGIN, elev: !!terrain, stop: r.stop, approx, tree: null, wAlong };
    if (terrain) {
      const h0 = profHeight(terrain, 0) + ballLift;
      rec.dh = profHeight(terrain, r.carry) - h0; rec.dhStop = profHeight(terrain, r.stop) - h0;
    }
    out.push(rec);
  });
  if (trees) checkTrees(out, trees, ctx);
  return { recs: out.sort((x, y) => x.score - y.score).slice(0, 3), wAlong, wCross, maxReach };
}

export {
  DEFAULT_CLUBS, WSR_SEEDS, BUNKER_CAPS, ROUGH_CAPS, capFor, SHAPE_LABEL, LANDED, MIN_BARS, landingSurface, shapeAt, stopOf, carryOf, landedStop, stopAt, STOP_TOL,
  flightOf, TREE_PENALTY, lineProfile, simProfile, windOf, windS, elevFlight, launchV0,
  GRID_N, emptyGreen, CUP_R, V_CAP, puttField, simPutt, solvePutt, fitClub, solve,
};
