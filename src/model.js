// The shot model, out of App.jsx so the tools can run it (tools/test-solver.mjs):
// the clubs' seed numbers, the lie caps, the stop / carry curves, the club fit,
// the shot solver and the putt solver. Pure (no React, DOM or Node API).
//
// Shot model (CLAUDE.md "Model"):
//   stop  = 4a (1 + h wAlong) S(bars / 4, landing surface, spin)
//   carry = 4a (1 + h wAlong) C(bars / 4)
// S and C are WSR's own stop and carry against launch power per club, from
// the port of its ball physics (src/wsrsim.js -> tools/build-wsr-shape.mjs ->
// src/wsrShape.js), normalised so S(1, fairway, no spin) = 1: `a` stays the
// full-power fairway stop / 4 (driver 62.5 -> 250 yd), fitted from logged
// shots, so the Switch's distances come from the logs and only the SHAPE is
// WSR's (decision D2) until Switch sweeps calibrate it. The shape is why stop
// is not linear in power: carry is (to 2 %), but the roll comes from the
// landing (a Coulomb friction impulse and a restitution per surface), and a
// flatter, slower landing rolls further: WSR's driver stops at 112 / 179 /
// 233 / 279 yd on 1 / 2 / 3 / 4 bars, rolling 54 / 58 / 50 / 39 of it.
import { WSR_SHAPE, SHAPE_Q } from "./wsrShape.js";

// The seed clubs: a = full-power (4-bar) stop on fairway / 4, from the Switch
// guide's maxes (driver 250, spoon 200, 3i 175, 5i 155, 7i 135, 9i 100, wedge
// 80 yd; WSR's own are 279 / 253 / 212 / 176 / 146 / 110 / 60). h = wind
// fraction per mph of tailwind, c = sideways drift yd per crosswind mph per
// bar; logged shots refit all three (fitClub).
// LIE MECHANIC (player-verified): lies cap the usable BAR, they don't scale distance.
// Below the cap, every bar flies its normal distance.
//   rough: cap = 3 of the 4 bars for every club (official "reduced by a quarter")
//   bunker: driver & spoon capped at 1 bar, irons at 2, wedge at 3;
//           putter uncapped but rolls out much less in sand
// So from sand: driver max ≈ 1 bar's stop while a 3i gets 2 bars.
// Drivers and spoons cannot backspin. Trajectory: driver lowest → wedge highest.
const DEFAULT_CLUBS = [
  { id: "driver", name: "Driver", a: 62.5,  h: 0.008, c: 0.35, spin: false, traj: "low",      maxPower: 4.0, shots: 0 },
  { id: "spoon",  name: "Spoon",  a: 50.0,  h: 0.009, c: 0.40, spin: false, traj: "low-mid",  maxPower: 4.0, shots: 0 },
  { id: "3iron",  name: "3 Iron", a: 43.75, h: 0.009, c: 0.42, spin: true,  traj: "mid",      maxPower: 4.0, shots: 0 },
  { id: "5iron",  name: "5 Iron", a: 38.75, h: 0.010, c: 0.44, spin: true,  traj: "mid",      maxPower: 4.0, shots: 0 },
  { id: "7iron",  name: "7 Iron", a: 33.75, h: 0.010, c: 0.47, spin: true,  traj: "mid-high", maxPower: 4.0, shots: 0 },
  { id: "9iron",  name: "9 Iron", a: 25.0,  h: 0.011, c: 0.50, spin: true,  traj: "high",     maxPower: 4.0, shots: 0 },
  { id: "wedge",  name: "Wedge",  a: 20.0,  h: 0.012, c: 0.55, spin: true,  traj: "highest",  maxPower: 4.0, shots: 0 },
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

/* ---------------- putting ---------------- */
const GRID_N = 9;
const emptyGreen = () => ({ box: null, grid: Array.from({ length: GRID_N }, () => Array.from({ length: GRID_N }, () => [0, 0])) });
const MU = 1.35;        // rolling friction, yd/s^2
const SLOPE_G = 1.1;    // accel per slope unit, yd/s^2
const CUP_R = 0.22;     // capture radius, yd
const CUP_V = 2.2;      // max capture speed, yd/s

function simPutt(grid, Wyd, Hyd, ball, cup, angDeg, pw) {
  const D = Math.hypot((cup.x - ball.x) * Wyd, (cup.y - ball.y) * Hyd);
  const base = Math.atan2((cup.x - ball.x) * Wyd, -((cup.y - ball.y) * Hyd));
  const th = base + (angDeg * Math.PI) / 180;
  const v0 = Math.sqrt(2 * MU * D) * pw;
  let px = ball.x * Wyd, py = ball.y * Hyd;
  let vx = Math.sin(th) * v0, vy = -Math.cos(th) * v0;
  const cx = cup.x * Wyd, cy = cup.y * Hyd;
  const path = [[px / Wyd, py / Hyd]];
  const dt = 0.045;
  let holed = false, best = Infinity;
  for (let i = 0; i < 400; i++) {
    const sp = Math.hypot(vx, vy);
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) best = d;
    if (d < CUP_R && sp < CUP_V) { holed = true; path.push([cx / Wyd, cy / Hyd]); break; }
    if (sp < 0.06) break;
    const gi = Math.min(GRID_N - 1, Math.max(0, Math.floor((px / Wyd) * GRID_N)));
    const gj = Math.min(GRID_N - 1, Math.max(0, Math.floor((py / Hyd) * GRID_N)));
    const [sx, sy] = grid[gj][gi];
    const ax = sx * SLOPE_G - MU * (vx / sp);
    const ay = sy * SLOPE_G - MU * (vy / sp);
    vx += ax * dt; vy += ay * dt; px += vx * dt; py += vy * dt;
    if (i % 4 === 0) path.push([px / Wyd, py / Hyd]);
  }
  path.push([px / Wyd, py / Hyd]);
  return { holed, best, endSp: Math.hypot(vx, vy), path, D };
}

function solvePutt(grid, Wyd, Hyd, ball, cup) {
  const cost = (r, pw) => (r.holed ? -2 + pw * 0.1 : r.best + Math.max(0, r.best - CUP_R) * 0.3);
  let best = null;
  const tryOne = (a, p) => {
    const r = simPutt(grid, Wyd, Hyd, ball, cup, a, p);
    const c = cost(r, p);
    if (!best || c < best.c) best = { c, a, p, r };
  };
  for (let a = -35; a <= 35; a += 5) for (let p = 0.7; p <= 1.55; p += 0.085) tryOne(a, p);
  const { a: a0, p: p0 } = best;
  for (let a = a0 - 4; a <= a0 + 4; a += 1) for (let p = Math.max(0.5, p0 - 0.08); p <= p0 + 0.08; p += 0.02) tryOne(a, p);
  return best;
}

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
  const shaped = (s) => 4 * shapeAt(club.id, s.power / 4, "S", s.landed, 0);
  const xs = [], ys = [];
  pool.forEach((s) => {
    if (s.power > 0 && s.carry > 0) { xs.push(s.wAlong); ys.push(s.carry / shaped(s)); }
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
        if (s.power > 0 && f > 0.5) { sum += s.carry / (shaped(s) * f); cnt++; }
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
// line or scale. ctx is where later inputs go (the landing's height for
// elevation, the trees).
function solve(clubs, inputs, blockedRules, ctx = {}) {
  const { dist, windSpeed, relWindDeg, lie, hole, stroke } = inputs;
  const rad = (relWindDeg * Math.PI) / 180;
  const wAlong = windSpeed * Math.cos(rad);
  const wCross = windSpeed * Math.sin(rad);
  const readLie = (yd) => (ctx.surfaceAt ? ctx.surfaceAt(yd) ?? null : null);
  const out = [];
  let maxReach = null;
  clubs.forEach((cl) => {
    const cap = capFor(cl, lie);
    const denom = cl.a * (1 + cl.h * wAlong);
    if (denom <= 0 || cap <= 0) return;
    const reachSurface = landingSurface(readLie(carryOf(cl, cap, wAlong)));
    const reach = stopOf(cl, cap, reachSurface, 0, wAlong);
    if (!maxReach || reach > maxReach.yd) maxReach = { yd: reach, club: cl.name };
    // The landing surface in two passes: solve for fairway and read where that
    // carry lands, then solve on that surface and read once more at the new
    // carry. If the two reads disagree the second wins (solved on, not read
    // again): a carry that moves onto a third surface is not chased. A pass
    // out of reach reads at the power it fell beyond (the floor or the cap),
    // which is no solution, so a rec found through that read is kept only if
    // the read at its own carry agrees; a chain that ends out of reach falls
    // back to the cap read's surface below.
    const onFairway = powerFor(cl, dist, "fairway", wAlong, MIN_BARS, cap);
    let landsOn = readLie(carryOf(cl, onFairway.p, wAlong));
    let surface = landingSurface(landsOn), sol = onFairway;
    if (surface !== "fairway") {
      sol = powerFor(cl, dist, surface, wAlong, MIN_BARS, cap);
      let second = readLie(carryOf(cl, sol.p, wAlong));
      if (landingSurface(second) !== surface) {
        const clamped = !sol.ok;
        surface = landingSurface(second);
        sol = surface === "fairway" ? onFairway : powerFor(cl, dist, surface, wAlong, MIN_BARS, cap);
        // the clamp end is no solution, so its read only names a surface to try:
        // a rec solved on it must land on it (read at its own carry) or the club
        // is dropped, never shipped with a landing its carry contradicts
        if (clamped && sol.ok) {
          second = readLie(carryOf(cl, sol.p, wAlong));
          if (landingSurface(second) !== surface) return;
        }
      }
      landsOn = second;
    }
    if (!sol.ok) {
      // the chain ended on a surface that cannot reach dist although the cap
      // read (the surface maxReach is built from) can: solve on that one and
      // keep it only when that power really lands there, so a distance at or
      // below maxReach has the club that set it, and a true jump of the stop
      // curve at a surface edge still returns nothing
      if (dist > reach) return;
      sol = powerFor(cl, dist, reachSurface, wAlong, MIN_BARS, cap);
      if (!sol.ok) return;
      landsOn = readLie(carryOf(cl, sol.p, wAlong));
      if (landingSurface(landsOn) !== reachSurface) return;
      surface = reachSurface;
    }
    const p = sol.p;
    const drift = cl.c * wCross * p;
    const aim = -drift;
    const frac = p / cap;
    const rule = hole ? blockedRules.find(
      (r) => r.hole === hole && r.club === cl.id && (r.stroke === 0 || r.stroke === stroke) && Math.abs(r.aim - aim) <= 10
    ) : null;
    let score = Math.abs(frac - 0.8) + (frac > 0.97 ? 0.5 : 0);
    if (rule) score += 10;
    // carry and roll at the solved power; rollSpin = the same with the full
    // backspin of that bar (irons and wedge): the range the card shows,
    // because the spin is a motion input the app cannot know (D4)
    const carry = carryOf(cl, p, wAlong);
    const roll = stopOf(cl, p, surface, 0, wAlong) - carry;
    const rollSpin = spinsBack(cl) ? stopOf(cl, p, surface, 1, wAlong) - carry : null;
    out.push({ club: cl, power: p, drift, aim, frac, cap, score, calibrated: cl.shots, blocked: rule || null,
      carry, roll, surface, landsOn, rollSpin, red: p >= cap - RED_MARGIN });
  });
  return { recs: out.sort((x, y) => x.score - y.score).slice(0, 3), wAlong, wCross, maxReach };
}

export {
  DEFAULT_CLUBS, BUNKER_CAPS, capFor, SHAPE_LABEL, LANDED, landingSurface, shapeAt, stopOf, carryOf,
  GRID_N, emptyGreen, MU, SLOPE_G, CUP_R, CUP_V, simPutt, solvePutt, fitClub, solve,
};
