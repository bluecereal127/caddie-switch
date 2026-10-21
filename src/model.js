// The shot model, out of App.jsx so the tools can run it (tools/test-solver.mjs):
// the clubs' seed numbers, the lie caps, the stop / carry curves, the club fit,
// the shot solver, and the putt solver re-exported from src/putt.js. Pure (no
// React, DOM or Node API).
//
// Shot model (CLAUDE.md "Model"):
//   stop  = 4a (1 + h wAlong) S(bars / 4, landing surface, spin)
//   carry = 4a (1 + h wAlong) C(bars / 4)
// S and C are WSR's own stop and carry against launch power per club, from
// the port of its ball physics (src/wsrsim.js -> tools/build-wsr-shape.mjs ->
// src/wsrShape.js), normalised so S(1, fairway, no spin) = 1: `a` stays the
// full-power fairway stop / 4 (WSR's own until logged shots refit it: the
// driver's 69.70 -> 278.8 yd, DEFAULT_CLUBS), so the Switch's distances come
// from the logs and the SHAPE is WSR's (decision D2) until Switch sweeps
// calibrate it. The shape is why stop is not linear in power: carry is (to
// 2 %), but the roll comes from the landing (a Coulomb friction impulse and a
// restitution per surface), and a flatter, slower landing rolls further:
// WSR's driver stops at 112 / 179 / 233 / 279 yd on 1 / 2 / 3 / 4 bars,
// rolling 54 / 58 / 50 / 39 of it.
// The shape is level ground; with the course's terrain along the shot line
// the solver flies WSR's ball over it instead ("elevation" below).
import { WSR_SHAPE, SHAPE_Q } from "./wsrShape.js";
import { run, CLUBS } from "./wsrsim.js";
import { treeCheck, TREE_SHAPES } from "./trees.js";
import { CUP_R, V_CAP, puttField, simPutt, solvePutt } from "./putt.js";

// The seed clubs are WSR's own (2026-10-21), so an uncalibrated club flies
// exactly WSR's ball: a = WSR_SHAPE[id].stopYd / 4, its full-power stop on
// level fairway (278.8 / 252.6 / 211.7 / 175.6 / 145.8 / 109.5 / 60.0 yd,
// driver to wedge), which makes the solver's k = 4a / stopYd exactly 1. The
// third-party guide's maxes they replace (driver 250, spoon 200, 3i 175, 5i
// 155, 7i 135, 9i 100, wedge 80) were 30 yd short on the driver: the four
// clean full-power driver tee shots logged on hole 10 (2026-08-21; 4 mph
// head, calm, 2 mph tail, 11 mph tail-left), flown with src/wsrsim.js from
// where their frames put the ball, over the hole's terrain in their wind,
// stop at 276.8 / 280.4 / 285.5 / 296.0 yd against 274 / 281 / 284 / 292
// logged (tools/test-rows.mjs). The irons logged so far stop further than
// WSR's (by 6-15 yd on average at full power, the terrain flown); their rows
// refit them.
// h = stop change per mph of tailwind, as a fraction of the calm stop, and
// c = sideways drift in yd per mph of crosswind per bar, both from
// src/wsrsim.js's in-air wind at full power on level fairway:
//   h = (stop at 10 mph tail - stop at 10 mph head) / (2 x 10 x calm stop)
//   c = drift at 10 mph across (wind deg 90) / (10 x 4)
// driver 296.76 / 261.87 / 278.80 yd -> h 0.00626, drift 22.05 -> c 0.551;
// spoon 270.30 / 236.04 / 252.61, 21.53; 3 iron 232.12 / 193.01 / 211.70,
// 24.70; 5 iron 194.96 / 158.04 / 175.60, 23.23; 7 iron 160.11 / 132.74 /
// 145.79, 16.92; 9 iron 121.93 / 98.40 / 109.50, 14.54; wedge 66.61 /
// 54.32 / 60.03, 7.42. WSR's wind is not linear in mph (its speed index
// enters as index^0.74): per mph the driver's tail gains 0.97 % at 2 mph and
// 0.50 % at 30, so h and c are the 10 mph secants. Logged shots refit a and
// h, and c from rows with a sideways miss (fitClub); tools/test-solver.mjs
// reruns this derivation.
// LIE MECHANIC (player-verified): lies cap the usable BAR, they don't scale distance.
// Below the cap, every bar flies its normal distance.
//   rough: cap = 3 of the 4 bars for every club (official "reduced by a quarter")
//   bunker: driver & spoon capped at 1 bar, irons at 2, wedge at 3;
//           putter uncapped but rolls out much less in sand
// So from sand: driver max ≈ 1 bar's stop while a 3i gets 2 bars.
// Drivers and spoons cannot backspin. Trajectory: driver lowest → wedge highest.
const wsrA = (id) => WSR_SHAPE[id].stopYd / 4;
const DEFAULT_CLUBS = [
  { id: "driver", name: "Driver", a: wsrA("driver"), h: 0.00626, c: 0.551, spin: false, traj: "low",      maxPower: 4.0, shots: 0 },
  { id: "spoon",  name: "Spoon",  a: wsrA("spoon"),  h: 0.00678, c: 0.538, spin: false, traj: "low-mid",  maxPower: 4.0, shots: 0 },
  { id: "3iron",  name: "3 Iron", a: wsrA("3iron"),  h: 0.00924, c: 0.617, spin: true,  traj: "mid",      maxPower: 4.0, shots: 0 },
  { id: "5iron",  name: "5 Iron", a: wsrA("5iron"),  h: 0.01051, c: 0.581, spin: true,  traj: "mid",      maxPower: 4.0, shots: 0 },
  { id: "7iron",  name: "7 Iron", a: wsrA("7iron"),  h: 0.00939, c: 0.423, spin: true,  traj: "mid-high", maxPower: 4.0, shots: 0 },
  { id: "9iron",  name: "9 Iron", a: wsrA("9iron"),  h: 0.01075, c: 0.364, spin: true,  traj: "high",     maxPower: 4.0, shots: 0 },
  { id: "wedge",  name: "Wedge",  a: wsrA("wedge"),  h: 0.01024, c: 0.185, spin: true,  traj: "highest",  maxPower: 4.0, shots: 0 },
];
// Caps confirmed in-game (fixed; not user-editable): rough = 3 bars for every club;
// sand: wedge 3, all irons 2, spoon & driver 1; putter uncapped (dead roll in sand).
const BUNKER_CAPS = { driver: 1, spoon: 1, "3iron": 2, "5iron": 2, "7iron": 2, "9iron": 2, wedge: 3 };
const capFor = (club, lie) =>
  lie === "bunker" ? (BUNKER_CAPS[club.id] ?? 2) : lie === "rough" ? 3.0 : club.maxPower;

// The rec cards' calibration line names where the roll comes from; it says
// WSR's until the Switch sweeps (RUNBOOK tests 1-3) calibrate the shape.
const SHAPE_LABEL = "WSR-shaped roll";
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

// WSR's shape at launch power q (gauge bars / 4): linear between the table's
// 0.05 steps, clamped to q in [0.05, 1]; col "S" = stop, "C" = carry, both in
// units of the full-power fairway stop. spin: 0 = none, 1 = full (bs = the
// club's P1c x q: the spin scales with the bar, Switch-shaped, and is WSR's
// own at q = 1; woods have no full column, so they read none). The (1 - f, f)
// weights return a knot's value exactly, so S(1, fairway, 0) = 1 and a
// full-power fairway stop is 4a to the last bit. A club the table lacks gets
// the old linear model (S = C = q).
function shapeAt(clubId, q, col, surface = "fairway", spin = 0) {
  const t = WSR_SHAPE[clubId];
  const n = SHAPE_Q.length, x = Math.min(SHAPE_Q[n - 1], Math.max(SHAPE_Q[0], q));
  if (!t) return x;
  const bySpin = t.S[landingSurface(surface)];
  const row = col === "C" ? t.C : spin && bySpin.full ? bySpin.full : bySpin.none;
  const i = Math.min(n - 2, Math.max(0, Math.floor((x - SHAPE_Q[0]) / (SHAPE_Q[1] - SHAPE_Q[0]))));
  const f = (x - SHAPE_Q[i]) / (SHAPE_Q[i + 1] - SHAPE_Q[i]);
  return row[i] * (1 - f) + row[i + 1] * f;
}
const spinsBack = (club) => !!WSR_SHAPE[club.id]?.S.fairway.full;

// Where a shot of `bars` stops and where it first lands, yd. Wind stays a
// multiplier on the whole distance, as before the shape: in WSR the wind
// acts only in the air (wsr-ground-phase.md section 4), but the logs cannot
// separate carry from roll yet, so h is fitted on the stop.
function stopOf(club, bars, surface = "fairway", spin = 0, wAlong = 0) {
  return 4 * club.a * (1 + club.h * wAlong) * shapeAt(club.id, bars / 4, "S", surface, spin);
}
function carryOf(club, bars, wAlong = 0) {
  return 4 * club.a * (1 + club.h * wAlong) * shapeAt(club.id, bars / 4, "C");
}

// The power (bars, within [lo, hi]) whose stop on `surface` is `dist`: bisection
// on the monotone curve to 0.005 bar, then linear inside the last bracket (the
// curve is linear between knots 0.2 bar apart, so that is exact unless a knot
// falls inside the bracket). { p, ok }: ok false when dist is out of reach (p
// then is the end it fell beyond).
function powerFor(club, dist, surface, wAlong, lo, hi) {
  const stop = (p) => stopOf(club, p, surface, 0, wAlong);
  let sl = stop(lo), sh = stop(hi);
  if (sl > dist) return { p: lo, ok: false };
  if (sh < dist) return { p: hi, ok: false };
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2, sm = stop(mid);
    if (sm < dist) { lo = mid; sl = sm; } else { hi = mid; sh = sm; }
  }
  const f = sh > sl ? (dist - sl) / (sh - sl) : 1;
  return { p: lo * (1 - f) + hi * f, ok: true };
}

// The stop a shot of `bars` really has: the stop curve of the surface its own
// carry lands on (surfaceAt read at carryOf(bars), a missing or other read
// rolling as fairway). solve scans it; the rec card's power bar maps through
// it (App.jsx dragBar).
function landedStop(club, bars, wAlong = 0, surfaceAt = null) {
  const lie = surfaceAt ? surfaceAt(carryOf(club, bars, wAlong)) ?? null : null;
  return stopOf(club, bars, landingSurface(lie), 0, wAlong);
}

// The power scan's step and the surface-edge tolerance, bars. A 0.02-bar step
// moves the seed clubs' carry 0.34-0.39 yd (wedge) to 0.98-1.15 yd (driver),
// under the terrain's cells (one sample per 2 map px, 1.8-5 yd), so a strip of
// another surface shows in a sample unless the line only clips a cell's
// corner; a solution whose carry lands on such a sliver is caught by the read
// at its own carry (solve).
const SCAN_STEP = 0.02, EDGE_TOL = 0.001;

// f(p) = landedStop over [MIN_BARS, cap], cut into runs of one landing surface:
// sampled every SCAN_STEP, each change of surface between two samples bisected
// to EDGE_TOL. Within a run f is the monotone stop curve of its surface; at an
// edge it jumps (up onto a green, down into a bunker), so a distance has a
// solution on a run whose ends straddle it and none inside a jump. -> { runs:
// [{ a, b, s }] (power from a to b lands on s), split } (split cuts any [a, b]
// whose ends read sa and sb the same way).
function landingRuns(club, cap, wAlong, readLie) {
  const sOf = (p) => landingSurface(readLie(carryOf(club, p, wAlong)));
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
  let a = at(0), s = sOf(a), prev = a;
  for (let k = 1; k <= n; k++) {
    const p = at(k), sp = sOf(p);
    if (sp !== s) {
      const parts = split(prev, s, p, sp), last = parts[parts.length - 1];
      runs.push({ a, b: parts[0].b, s }, ...parts.slice(1, -1));
      a = last.a; s = last.s;
    }
    prev = p;
  }
  runs.push({ a, b: cap, s });
  return { runs, split };
}

/* ---------------- elevation ---------------- */
// With ctx.heightAt (the ground's height along the shot line, yd above + or
// below - the ground under the ball, at yd from the ball in the Switch's
// yards; the App reads it from src/terrain.js) the solver flies each club
// over the line's terrain with WSR's own ball (src/wsrsim.js run with a
// profile): the carry onto lower or higher ground, the bounce off the slope
// it lands on and the roll down or up it, where the shape assumes level
// ground. The flight is deterministic and ported, so nothing is guessed but
// the scaling: the sim runs in WSR's yards, and k = 4a (1 + h wAlong) /
// WSR_SHAPE[club].stopYd (the shape's own normalisation, so a level profile
// flies the shape's stop) scales its horizontal distances, heights unscaled
// (a 20 yd drop is 20 yd in both): the sim's ground at x is ctx.heightAt(k x)
// and its stop x is k x of the Switch's yd. WSR-shaped until logged shots on
// the big-drop holes (8, 12, 17, 21) calibrate them: the descent angle (from
// WSR's launch angle and lift) and the bounce on a slope. No wind in the
// flight: h and c stay the fitted multipliers.

// The line's profile, sampled once per ctx.heightAt / ctx.surfaceAt pair (the
// App keeps both while only the distance changes): the height every PROF_STEP
// yd from PROF_BACK behind the ball (the slope at x - 1, a bounce back) to
// PROF_LEN ahead (past any club's stop; the profile holds its last sample
// beyond), linear between samples; the lie at the nearest sample, so a
// surface edge sits within 0.125 yd of the terrain's own (its cells are
// 1.8-5 yd). Where the terrain has no data (past the frame or the raster's
// crop) the height holds the sample on the ball's side of the gap.
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
// the profile's height at yd (the Switch's yd from the ball)
function profHeight(prof, yd) {
  const { h, n, i0 } = prof, u = yd / PROF_STEP + i0;
  if (!(u > 0)) return h[0];
  if (u >= n - 1) return h[n - 1];
  const i = Math.floor(u);
  return h[i] + (h[i + 1] - h[i]) * (u - i);
}

// The ground src/wsrsim.js's run flies over (its `profile`) from a line's
// profile, at k of the Switch's yd per WSR yd: the sim's ground at x is the
// profile's at k x. tools/build-derived.mjs flies the logged shots over it at
// k = 1 (their elevFactor).
function simProfile(prof, k = 1) {
  const { lies, n } = prof;
  return {
    heightAt: (x) => profHeight(prof, k * x),
    surfaceAt: (x) => { const i = Math.round((k * x) / PROF_STEP) + prof.i0; return lies[i < 0 ? 0 : i >= n ? n - 1 : i]; },
  };
}

// One club over the profile: bars -> { p, carry, stop } in the Switch's yd,
// and with trace also the run's path (WSR's yd) and k, for the tree check.
// The ball sits ballLift yd above the profile's origin at launch.
function flyer(cl, wAlong, prof, ballLift) {
  const k = (4 * cl.a * (1 + cl.h * wAlong)) / WSR_SHAPE[cl.id].stopYd;
  const profile = simProfile(prof, k);
  return (bars, trace = false) => {
    const o = run({ club: cl.id, q: bars / 4, profile, ballLift, trace });
    return { p: bars, carry: k * o.carry, stop: k * o.stop, ...(trace ? { path: o.path, k } : {}) };
  };
}

// The power whose flight stops at dist: from p0 (the flat scan's solution) a
// Newton step on the flat curve's slope there, then secant steps through the
// last two flights, at most REFINE_SIMS flights after p0's, inside the
// bracket the flights have narrowed from [MIN_BARS, cap] (a step leaving it
// bisects it; the cap's flight top is known to reach), until a flight stops
// within AIM_TOL yd of dist. The closest flight (the cap's among them) is
// the answer, exact within STOP_TOL yd, else flagged approx: a distance
// inside a jump of the stop (a dip that catches the roll, a bank it rolls
// back down, the carry crossing onto a green) has none closer.
// The terrain makes the stop ragged in power. Of the 3,357 club-distance
// pairs that have a stop within STOP_TOL on the 21 holes' default lines from
// the tee (5 yd apart; a 0.01-bar scan says which), 3 secant flights (the
// first design) found 85.5 %, 6 find 96.0 % (8: 97.9 %, at a 7-club solve's
// max 12.5 ms against 9.9). Aiming at AIM_TOL rather than stopping at
// STOP_TOL costs 0.9 flights a pair and makes the round trip hold (a rec's
// own stop solves back to its power within 0.02 bar for 527 of 534 recs over
// 8 holes, against 514 when stopping at STOP_TOL). A 7-club solve takes
// 3.3 ms mean, 8.3 ms p99, 9.9 ms at most in Node over 2,394 solves on the
// 21 lines from the tee and rough (tools/test-solver.mjs times H21's).
// -> the closest flight { p, carry, stop, e = stop - dist }.
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

// The stop of `bars` by the solver's own f: over the profile when ctx has
// the terrain (as solve flies it), else landedStop's flat curve. The rec
// card's power bar maps through it (App.jsx dragBar).
function stopAt(club, bars, wAlong = 0, ctx = {}) {
  const prof = typeof ctx.heightAt === "function" && WSR_SHAPE[club.id] ? lineProfile(ctx) : null;
  if (!prof || !(club.a * (1 + club.h * wAlong) > 0)) return landedStop(club, bars, wAlong, ctx.surfaceAt ?? null);
  return flyer(club, wAlong, prof, Number.isFinite(ctx.ballLift) ? ctx.ballLift : 0)(bars).stop;
}

/* ---------------- trees ---------------- */
// With ctx.trees (src/trees.js treesAlong: the hole's trees on the shot
// line's frame, the App's from the pipeline's tree markers and the player's
// own) solve checks every club's rec, not only the three it shows, against
// WSR's tree collision shapes (treeCheck). A rec whose flight goes into a
// trunk or through a canopy (the ball drops nearly dead under the tree) gets
// `tree` and TREE_PENALTY on its score; its card names the best clean rec as
// the alternative (a lofted iron over the canopy, a driver or spoon under the
// branches) and how it passes that tree.

// The flight a rec's tree check flies: the run's path at `bars`, k (the
// Switch's yd per WSR yd along the shot), the carry it lands at and ballZ,
// the ball's height at launch above the ground under it (yd). Over the
// terrain it is the profile flight the solver refines on, with the same k, so
// the path lands at the rec's carry; without terrain the flat run, scaled
// to carryOf (k = carryOf / WSR's carry). The heights are WSR's either way,
// unscaled (WSR-shaped: its launch angles 10 / 11 / 19 / 23 / 24 / 30 / 43
// degrees and lift give full-power apexes of 22.7 / 22.8 / 28.2 / 28.4 /
// 22.9 / 22.1 / 16.2 yd, driver to wedge, until logged shots calibrate the
// trajectories), with no wind. null for a club WSR lacks.
function flightOf(club, bars, wAlong = 0, ctx = {}) {
  if (!CLUBS[club.id]) return null;
  const prof = typeof ctx.heightAt === "function" && WSR_SHAPE[club.id] ? lineProfile(ctx) : null;
  const ballLift = Number.isFinite(ctx.ballLift) ? ctx.ballLift : 0;
  if (prof && club.a * (1 + club.h * wAlong) > 0) {
    const o = flyer(club, wAlong, prof, ballLift)(bars, true);
    return { path: o.path, k: o.k, carry: o.carry, ballZ: profHeight(prof, 0) + ballLift };
  }
  const o = run({ club: club.id, q: bars / 4 }), carry = carryOf(club, bars, wAlong);
  return { path: o.path, k: o.carry > 0 ? carry / o.carry : 1, carry, ballZ: ballLift };
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
// blocked). One more flight per rec, traced: a 7-club solve from the 21 tees
// to their pins takes 4.33 ms mean, 7.5 p90 with the trees against 3.80 and
// 6.6 without (H7, 31 trees: 4.62 against 4.01; tools/test-trees.mjs keeps
// H7 and H19 inside the 15 ms budget).
function checkTrees(recs, trees, wAlong, ctx) {
  const fl = new Map(), ck = new Map();
  for (const r of recs) {
    const f = flightOf(r.club, r.power, wAlong, ctx);
    if (!f) continue;
    fl.set(r, f); ck.set(r, treeCheck(f.path, trees, { ...f, aim: r.aim }));
  }
  const alt = recs.filter((r) => ck.has(r) && !treeHit(ck.get(r)) && !r.blocked).reduce((b, r) => (!b || r.score < b.score ? r : b), null);
  for (const r of recs) {
    const c = ck.get(r);
    if (!c || !treeHit(c)) continue;
    const t = trees.find((x) => x.id === c.tree), fa = alt && fl.get(alt);
    r.score += TREE_PENALTY;
    r.tree = { kind: c.kind, at: c.at, id: c.tree, shape: TREE_SHAPES[t.kind].name, own: !!t.own,
      alt: alt ? { club: alt.club.name, power: alt.power, how: treeCheck(fa.path, [t], { ...fa, aim: alt.aim }).kind } : null };
  }
}

/* ---------------- putting ---------------- */
// The putt model is src/putt.js (WSR's roll on a green over the mesh heights,
// decision D3); the solver's callers take it from here. GRID_N / emptyGreen
// are the painted slope grid the hole state carries (App.jsx).
const GRID_N = 9;
const emptyGreen = () => ({ box: null, grid: Array.from({ length: GRID_N }, () => Array.from({ length: GRID_N }, () => [0, 0])) });

/* ---------------- math ---------------- */
function fitClub(club, shots) {
  const mine = shots.filter((s) => s.club === club.id);
  if (mine.length === 0) return { ...club, shots: 0 };
  const next = { ...club, shots: mine.length };
  const clean = mine.filter((s) => s.lie === "tee" || s.lie === "fairway");
  const pool = clean.length ? clean : mine;
  // Each row's power goes through the club's shape: shaped = 4 S(power / 4,
  // landed, no spin), so carry / shaped = a (1 + h wAlong) at any power and on
  // any landing (the row's `landed`, fairway when absent). A logged shot's
  // spin is unknown; the tee/fairway rows the fit prefers are where it
  // matters least, and the rec cards show the spin range instead (D4).
  // Caution: WSR quietly pulls a PARTIAL swing's launch power halfway toward
  // the power that lands nearest the pin when its aim can land within ~33 yd
  // of it (up to 0.107 of full power; backspin switches it off;
  // wsr-swing-redzone-spin.md section 3.5). Whether the Switch kept it is open
  // (that document's section 12, item 10), so partial-power approach rows near
  // the pin may be biased; full swings, the anchors the Guide asks for first,
  // are never touched. The pool rules stay as they are.
  // A row with flatEnded (tools/build-derived.mjs: its logged stop over its
  // elevFactor, WSR's stop over the hole's terrain along the shot against the
  // same shot on level fairway) is read as that level-fairway stop, so its
  // landing is fairway; any other row as its logged stop (carry) where it
  // finished.
  const stop = (s) => (s.flatEnded > 0 ? s.flatEnded : s.carry);
  const shaped = (s) => 4 * shapeAt(club.id, s.power / 4, "S", s.flatEnded > 0 ? "fairway" : s.landed, 0);
  const xs = [], ys = [];
  pool.forEach((s) => {
    if (s.power > 0 && stop(s) > 0) { xs.push(s.wAlong); ys.push(stop(s) / shaped(s)); }
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
        const f = 1 + club.h * s.wAlong;
        if (s.power > 0 && f > 0.5) { sum += stop(s) / (shaped(s) * f); cnt++; }
      });
      if (cnt) next.a = sum / cnt;
    }
  }
  let nu = 0, de = 0;
  pool.forEach((s) => {
    if (s.lateral == null) return;
    const pe = s.power;
    const x = s.wCross * pe;
    if (Math.abs(s.wCross) > 1) { nu += s.lateral * x; de += x * x; }
  });
  if (de > 0) next.c = Math.max(0, Math.min(2, nu / de));
  return next;
}

// ctx.surfaceAt(yd) -> the lie the course map shows `yd` along the shot line
// (the App reads it from the terrain, src/terrain.js), or null without terrain,
// line or scale; ctx.heightAt(yd) -> the ground's height there, yd relative to
// the ground under the ball (null where the terrain has no data), which turns
// on the elevation above; ctx.ballLift = how far the ball sits above that
// ground, yd (0; the online platform's upper tier); ctx.trees = the trees on
// the line's frame (src/trees.js treesAlong), which turns on the tree check
// ("trees" above).
// A rec: { club, power, drift, aim, frac, cap, score, calibrated, blocked,
// carry, roll, surface, landsOn, rollSpin, red, elev, tree }, tree null
// unless the flight hits one (checkTrees), and with elevation
// (elev true) also stop (= carry + roll, within STOP_TOL of dist unless
// approx), dh / dhStop = the ground's height at the carry / the stop minus
// the ball's (yd, + uphill) and approx.
function solve(clubs, inputs, blockedRules, ctx = {}) {
  const { dist, windSpeed, relWindDeg, lie, hole, stroke } = inputs;
  const rad = (relWindDeg * Math.PI) / 180;
  const wAlong = windSpeed * Math.cos(rad);
  const wCross = windSpeed * Math.sin(rad);
  const readLie = (yd) => (ctx.surfaceAt ? ctx.surfaceAt(yd) ?? null : null);
  const prof = typeof ctx.heightAt === "function" ? lineProfile(ctx) : null;
  const ballLift = Number.isFinite(ctx.ballLift) ? ctx.ballLift : 0;
  const trees = Array.isArray(ctx.trees) && ctx.trees.length ? ctx.trees : null;
  const out = [];
  let maxReach = null;
  const reach = (yd, cl) => { if (!maxReach || yd > maxReach.yd) maxReach = { yd, club: cl.name }; };
  // a solution's aim, power fraction and score (a blocked rule's aim within 10 yd)
  const scored = (cl, cap, p) => {
    const drift = cl.c * wCross * p;
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
    const fly = prof && WSR_SHAPE[cl.id] ? flyer(cl, wAlong, prof, ballLift) : null;
    // The landing surface by a power scan (landingRuns): every power from the
    // floor to the cap with the surface its own carry lands on. maxReach is the
    // top of f, at the end of a run (f need not rise overall: a bunker under a
    // long carry stops it short of a shorter one's roll); over the terrain it
    // is the cap's flight instead (below).
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
    // it): the best score as before, ties to the lower power
    let best = null;
    for (const sol of sols) {
      const sc = scored(cl, cap, sol.p);
      if (!best || sc.score < best.score || (sc.score === best.score && sol.p < best.p)) best = { ...sol, ...sc };
    }
    if (!fly) {
      if (!best) return;
      const { p, surface, landsOn } = best;
      // carry and roll at the solved power; rollSpin = the same with the full
      // backspin of that bar (irons and wedge): the range the card shows,
      // because the spin is a motion input the app cannot know (D4)
      const carry = carryOf(cl, p, wAlong);
      const roll = stopOf(cl, p, surface, 0, wAlong) - carry;
      const rollSpin = spinsBack(cl) ? stopOf(cl, p, surface, 1, wAlong) - carry : null;
      out.push({ club: cl, power: p, drift: best.drift, aim: best.aim, frac: best.frac, cap, score: best.score, calibrated: cl.shots, blocked: best.rule || null,
        carry, roll, surface, landsOn, rollSpin, red: p >= cap - RED_MARGIN, elev: false, tree: null });
      return;
    }
    // Over the terrain: the cap's flight is the club's reach (its surfaces
    // read at its own contacts; not below 0, where a bank in front of the ball
    // throws it back behind), and a club whose cap stops short of dist is
    // out of reach. The rest refines the flat best on the profile (refine);
    // without one (dist past the flat reach, or inside a jump of the flat
    // curve) it starts from the flat fairway curve shifted by the cap's
    // difference between the flight and the flat stop.
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
    const p = r.p, landsOn = readLie(r.carry), surface = landingSurface(landsOn), sc = scored(cl, cap, p);
    const roll = r.stop - r.carry, h0 = profHeight(prof, 0) + ballLift;
    // rollSpin: the flight carries no spin; the full backspin's effect on the
    // stop is the shape's (flat ground, that power and landing surface),
    // taken off the terrain's roll
    const rollSpin = spinsBack(cl) ? roll - (stopOf(cl, p, surface, 0, wAlong) - stopOf(cl, p, surface, 1, wAlong)) : null;
    out.push({ club: cl, power: p, drift: sc.drift, aim: sc.aim, frac: sc.frac, cap, score: sc.score + (approx ? APPROX_PENALTY : 0), calibrated: cl.shots, blocked: sc.rule || null,
      carry: r.carry, roll, surface, landsOn, rollSpin, red: p >= cap - RED_MARGIN,
      elev: true, stop: r.stop, dh: profHeight(prof, r.carry) - h0, dhStop: profHeight(prof, r.stop) - h0, approx, tree: null });
  });
  if (trees) checkTrees(out, trees, wAlong, ctx);
  return { recs: out.sort((x, y) => x.score - y.score).slice(0, 3), wAlong, wCross, maxReach };
}

export {
  DEFAULT_CLUBS, BUNKER_CAPS, capFor, SHAPE_LABEL, LANDED, MIN_BARS, landingSurface, shapeAt, stopOf, carryOf, landedStop, stopAt, STOP_TOL,
  flightOf, TREE_PENALTY, lineProfile, simProfile,
  GRID_N, emptyGreen, CUP_R, V_CAP, puttField, simPutt, solvePutt, fitClub, solve,
};
