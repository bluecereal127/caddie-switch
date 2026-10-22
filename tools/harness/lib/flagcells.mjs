// The flag cloth as a second holing route for the savestate solver (hole-solve.mjs).
//
// WSR's flag cloth (lib/flagstick.mjs, FLAGSTICK.md) is a box in the flag's
// frame, 19.7-28.4 u above the pin, streaming downwind 0.8s-6.4s u from the
// stick's axis (s = 0.5 + 0.5 speedIdx / 15). A ball whose centre is inside it
// at a tick's end while moving toward its plane loses its horizontal speed and
// drops by the cup: 18 of 21 catches holed in WSR. round-model.mjs flies WSR's
// ball over the disc's KCL with the stick and the cup but not the cloth; this
// module tests the cloth on the model's per-tick path.
//
//   flagCatch({ hole, ball, heading, club, power, lie, pin, flagWind, wind?, course? })
//     -> { catch, cap, holedEst, model, first, flat, kcl, pathFrom }
//     one stroke: round-model predict() with the pin (the flag in) and a
//     per-tick trace; pinCapture() on the path WSR's pin tests see (the model's
//     own, or, after the model's own stick hit or cup capture changed it, the
//     free flight without them); catch = the first pin contact is the cloth (a
//     box hit is only reported moving toward the plane: WSR's response acts);
//     holedEst = captureOutcome()'s flat-green estimate after the catch (on
//     WSR's own 21 catch states it agrees 20 times: it holes E4 #14, caught on
//     the box's far edge, which stopped 0.19 yd out); kcl = the same catch
//     continued over the KCL green (the cloth's responses tick by tick, then
//     fly() with state0 onto the green, the slope, the stick and the cup
//     window): 17 of 21 on those states (it misses three slow balls WSR holed
//     1.55-1.59 u from the cup centre, outside the 1.37 u window), so it is a
//     slope-aware cross-check, not the rule.
//   flagCells(st, opts) -> cells [{ club, power, heading, robust, how: "flag",
//     height, offset, marginU, route, ... }] most robust first (cells.stats:
//     the search's counts and time, not enumerable): the (club, power, aim) the
//     cloth catches and WSR would hole (opts.holeRule: "flat", the default,
//     "kcl", "both" or "either"). st = { ball: { pos }, pin, player: { lie },
//     hole? } as hole-solve.mjs holds it; opts: flagWind (the wind the hole
//     began with, index.json cups[...].wind) or flagFrame (the 14 floats at
//     pin+0xb8), wind (the flight's: null = calm, as hole-solve plays), clubs,
//     capOf (club, lie), budgetMs (60000), powerStep (0.0001), aimStepDeg
//     (0.01), maxEvalsPerClub (9000), maxCells (200), verifyTop (8: the first
//     cells flown again through flagCatch, cell.verified), hole, course, mode.
//
// The search, per club (the putter never reaches the cloth):
//  1. the pin line: every 0.01 of power from 0.08 to the lie's cap, one free
//     flight at the aim whose launch goes at the pin; a power is kept when the
//     ball, within 15 u (along the line) of the pin's distance, is within 12 u
//     of the cloth's heights, in the air or on a bounce (h17-s5's driver
//     reaches the cloth only off the bank in front of the green);
//  2. a coarse grid at the kept powers: aims every 0.05 deg across the
//     cloth's reach (6.4s + 5 u either side of the pin at its distance);
//  3. from the four best coarse cells, a pattern search (steps 0.004 / 0.04 deg
//     halving to the grid's) on the ball's distance from catching: the box's
//     local excess over its half on the side the ball approaches from (WSR's
//     response only acts toward the plane), the least over the ticks near the pin;
//  4. from every catch, a flood fill on the game's grid (power 0.0001: set to 4
//     decimals; aim 0.01 deg: the D-pad's reach), each catch's 5 x 5
//     neighbourhood flown (beyond the cap too, as neighbours, never as cells);
//     stages 1-3 run for every club before any fill, and each club's fill gets
//     its share of the budget left (a fill cut short: stats.truncated, the
//     club's truncated, a cell whose block was not all flown partial);
//  5. robust = the share of the 5 x 5 block that catches and holes (hole-solve's
//     holingCells counts its block the same way); marginU = the distance (u, at
//     the pin) from the cell to the nearest flown cell that does not hole, each
//     grid step scaled by how far it moves the ball where it passes the pin's
//     distance (central differences round the cell): the model's flight error
//     at the pin is 0.2-0.3 u (E4: [+0.08, -0.17, +0.21] u, the same on every
//     shot), so an in-flight cell with marginU over 0.5 u holds through it.
//     Sorted by robust, then the route (route "flight": the catch before any
//     ground contact, the one WSR was measured on, 11 of 12 holed in E4; route
//     "bounce": the ball hops into the cloth off the ground, WSR's own contact
//     physics in the model but never measured in WSR at the cloth), then
//     marginU. From E4's ball (hole 1, 109.5 yd) the model also finds bounce
//     routes for five clubs (a 7-iron at 0.774 landing short and hopping 2.6 yd
//     into the cloth at 9.6 yd/s); h17-s5's only route is a bounce.
// Not searched: bank shots (aims more than the cloth's reach off the pin line
// that a slope turns back at the pin), a bounce off the green itself into the
// cloth after passing it, wind in the flight (each cell is flown, so a wind
// works, but the aim grid is centred on the calm line).
import * as RM from "../round-model.mjs";
import * as FS from "./flagstick.mjs";

export const YD = 9.144;
const DEG = Math.PI / 180;
const GRAV = 0.002, DRAG = 0.999;
export const BAG = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"];
const BUNKER_CAP = { driver: 0.25, spoon: 0.25, "3iron": 0.5, "5iron": 0.5, "7iron": 0.5, "9iron": 0.5, wedge: 0.75, putter: 1 };
// the lie's power cap (hole-solve.mjs capOf)
export const capOf = (club, lie) => (club === "putter" ? 2.5 : lie === 2 ? 0.75 : lie === 3 || lie === 16 ? BUNKER_CAP[club] : 1);
// the cloth's heights over the pin (u): its box spans 19.68-28.36
export const CLOTH = { lo: 19.68, hi: 28.36 };

const clubName = (club) => (typeof club === "number" ? RM.CLUB_NAMES[club] : club);
export const flagOut = (lie, mode) => (lie != null && FS.FLAG.lieSkip.includes(lie)) || (mode != null && FS.FLAG.modeSkip.includes(mode));

// the flag's wind as flagFrame() takes it, from the frame WSR holds: pin+0xb8..0xef
// as 14 floats (state/flagstick/mlib.mjs readPinFrame().raw): +0xb8 = speedIdx / 15,
// +0xc0 = across = (cos t, 0, -sin t)
export function flagWindFromFrame(raw) {
  return { angle: Math.atan2(-raw[4], raw[2]), speedIdx: 15 * raw[0] };
}

// the ball's free flight: no stick, no cup capture (WSR's pin tests see this
// path up to their first contact); per tick [x, y, z, tick]
function flyFree({ course, ball, heading, club, power, lie, wind, pin, maxTicks = 9000 }) {
  return RM.fly({ course, pos: ball, heading, yaw: RM.lieYaw(lie), club: clubName(club), q: power, wind, pin,
    flagIn: false, holeOut: false, lieAttr: lie, trace: true, traceEvery: 1, maxTicks });
}

// the catch continued over the KCL: the cloth's responses and the stick tick by
// tick in the air (WSR's order: the step, then the flag, then the stick) until
// the ball is below the cloth or out of its reach, then fly() from that state
// (lift and spin zeroed by the response) onto the green with the stick and the
// cup. A ball that bounced before the catch has `landed` false in fly() again
// (an iron's first green contact rule applies once more: a small error).
export function kclAfterCatch(cap, { course, hole, club, lie = 1, pin, flagWind, wind = null }) {
  const c = course ?? RM.loadCourse(hole);
  const F = cap.frame ?? FS.flagFrame(pin, flagWind);
  const st = { p: cap.at.slice(0, 3), v: cap.vel.slice(0, 3) };
  let cloth = FS.flagRespond(st, F) ? 1 : 0, sticks = 0, life = Math.round(cap.tick);
  const reach = 6.4 * F.s + 4;
  for (let k = 0; k < 800; k++) {
    if (st.p[1] < pin[1] + CLOTH.lo - 0.7 || Math.hypot(st.p[0] - pin[0], st.p[2] - pin[2]) > reach) break;
    life++;
    const prev = st.p.slice();
    st.v[1] -= GRAV;
    st.p = [st.p[0] + st.v[0], st.p[1] + st.v[1], st.p[2] + st.v[2]];
    st.v = [st.v[0] * DRAG, st.v[1] * DRAG, st.v[2] * DRAG];
    if (FS.flagRespond(st, F)) cloth++;
    const sw = FS.stickSweepTick(pin, prev, st.p);
    if (sw) { st.p = sw.p; FS.stickRespond(st, sw.hit); sticks++; }
  }
  const handoff = { h: st.p[1] - pin[1], offset: Math.hypot(st.p[0] - pin[0], st.p[2] - pin[2]), tick: life };
  const o = RM.fly({ course: c, pos: st.p, heading: 0, club: clubName(club), q: 0.5, wind, pin, flagIn: true, lieAttr: lie, trace: false,
    state0: { life, vel: st.v, lift: 0, vprev: Math.hypot(st.v[0], st.v[1], st.v[2]) } });
  return { holed: o.outcome === "holed", outcome: o.outcome, restYd: Math.hypot(o.rest[0] - pin[0], o.rest[2] - pin[2]) / YD,
    clothTicks: cloth, sticks, handoff, cupPass: o.cupPass, stickAfter: o.flagHit ?? null };
}

const firstOf = (cap) => (!cap ? "none" : cap.kind === "box" ? "cloth" : "stick");

/**
 * One stroke against the flag cloth. ball / pin [x, y, z] (u), heading (rad), club (name or
 * index), power (the launch power), lie (player+0xb0), flagWind (the wind the hole began
 * with: the flag's frame), wind (the flight's wind; hole-solve plays calm: null),
 * course (round-model's, else loaded), mode (WSR skips the pin tests in mode 5 / 8),
 * outcome: false skips the estimates.
 * -> { catch, cap (pinCapture's first contact or null), first ("cloth" | "stick" | "none"),
 *      holedEst (catch and the flat estimate holes it), flat (captureOutcome), kcl
 *      (kclAfterCatch), model (predict's answer, path per tick), pathFrom ("model" | "free"),
 *      path (the per-tick path the pin tests ran on) }
 * No flag on lies 6, 10, 11: { catch: false, flagOut: true }.
 */
export function flagCatch({ hole, ball, heading, club, power, lie = 1, pin, flagWind = null, wind = null, course = null, mode = null, outcome = true }) {
  if (flagOut(lie, mode)) return { catch: false, cap: null, first: "none", holedEst: false, flat: null, kcl: null, model: null, flagOut: true };
  const c = course ?? RM.loadCourse(hole);
  const name = clubName(club);
  const model = RM.predict({ hole, ball, heading, club: name, power, lie, wind, pin, trace: true, traceEvery: 1, course: c });
  // the model's stick bounce or cup capture changes its path from that tick on:
  // the pin tests then read the free flight (identical before it)
  let path = model.path, pathFrom = "model";
  if (model.flag || model.holed) {
    path = flyFree({ course: c, ball, heading, club: name, power, lie, wind, pin, maxTicks: (model.flag?.tick ?? model.ticks) + 240 }).path;
    pathFrom = "free";
  }
  const cap = FS.pinCapture(path, pin, { ticksPerSample: 1, wind: flagWind, lie, mode, wsr: true });
  const isCatch = cap?.kind === "box";
  let flat = null, kcl = null;
  if (isCatch && outcome) {
    flat = FS.captureOutcome(cap, pin, { wind: flagWind });
    kcl = kclAfterCatch(cap, { course: c, hole, club: name, lie, pin, flagWind, wind });
  }
  return { catch: isCatch, cap, first: firstOf(cap), holedEst: isCatch && !!flat?.holed, flat, kcl, model, pathFrom, path };
}

// ---- the cell search ----

// the approach-aware distance from catching at one tick (box-local units; 0 inside the
// half the ball approaches the plane from)
function catchExcess(F, p, prev) {
  const L = FS.flagLocal(F, p);
  const vx = (p[0] - prev[0]) * F.ax[0] + (p[2] - prev[2]) * F.ax[2];
  const ix = vx > 0 ? Math.max(L[0], -2 - L[0], 0) : vx < 0 ? Math.max(-L[0], L[0] - 2, 0) : Math.max(Math.abs(L[0]) - 2, 0);
  return Math.max(ix, Math.abs(L[1]) - 2.8, Math.abs(L[2]) - 2.8, 0);
}

export function flagCells(st, opts = {}) {
  const t0 = performance.now();
  const hole = opts.hole ?? st.hole;
  const ball = st.ball.pos, pin = st.pin, lie = st.player?.lie ?? 1, mode = opts.mode ?? st.mode ?? null;
  const out = [];
  const stats = { hole, lie, ms: 0, flights: 0, clubs: {}, truncated: false, holeRule: opts.holeRule ?? "flat" };
  Object.defineProperty(out, "stats", { value: stats, enumerable: false });
  const done = () => { stats.ms = Math.round(performance.now() - t0); return out; };
  if (flagOut(lie, mode)) { stats.flagOut = true; return done(); }
  const flagWind = opts.flagWind ?? (opts.flagFrame ? flagWindFromFrame(opts.flagFrame) : null);
  if (!flagWind) throw new Error("flagCells needs opts.flagWind (the wind the hole began with) or opts.flagFrame");
  const wind = opts.wind ?? null;
  const course = opts.course ?? RM.loadCourse(hole);
  const capFn = opts.capOf ?? capOf;
  const clubs = (opts.clubs ?? BAG).map(clubName).filter((c) => c !== "putter");
  const budget = opts.budgetMs ?? 60000, maxEvals = opts.maxEvalsPerClub ?? 9000;
  const dq = opts.powerStep ?? 0.0001, da = (opts.aimStepDeg ?? 0.01) * DEG;
  const rule = opts.holeRule ?? "flat", maxCells = opts.maxCells ?? 200, verifyTop = opts.verifyTop ?? 8;
  const F = FS.flagFrame(pin, flagWind);
  const D = Math.hypot(pin[0] - ball[0], pin[2] - ball[2]);
  const yaw = RM.lieYaw(lie);
  const bearing = Math.atan2(pin[0] - ball[0], pin[2] - ball[2]);
  const h0 = bearing - yaw;                       // the aim whose launch goes at the pin
  const ux = Math.sin(bearing), uz = Math.cos(bearing);
  const along = (p) => (p[0] - ball[0]) * ux + (p[2] - ball[2]) * uz;
  const WIN = 15, NEAR = 12;                      // u: the pin window along the line; the heights kept
  const reachU = 6.4 * F.s + 5;                   // the cloth's lateral reach plus a margin (u)
  const over = () => performance.now() - t0 > budget;
  const holedBy = (r) => (rule === "kcl" ? r.kclHoled : rule === "both" ? r.flatHoled && r.kclHoled : rule === "either" ? r.flatHoled || r.kclHoled : r.flatHoled);
  stats.flagWind = flagWind; stats.D = +(D / YD).toFixed(2); stats.frame = { t: F.t, s: F.s };

  // stages 1-3 for every club first (whether the cloth can catch it at all: about a
  // second a club), then the flood fills, each its share of the budget left
  const todo = [];
  for (const club of clubs) {
    if (over()) { stats.truncated = true; break; }
    const cap = capFn(club, lie), lo = 0.08;
    const tc = performance.now();
    const C = (stats.clubs[club] = { cap, flights: 0, lineBand: null, linePowers: 0, coarse: 0, seeds: 0, refine: 0, fill: 0, catches: 0, holes: 0, cells: 0, best: null, closest: null, ms: 0 });
    // one flight and what it says at the pin
    const tOutAt = new Map();                     // the line's exit tick from the pin window, by power (0.01 grid)
    const maxTicksFor = (q) => {
      let m = 0;
      for (const [k, t] of tOutAt) if (Math.abs(k - q) <= 0.021 && t > m) m = t;
      return m ? Math.ceil(m * 1.2) + 120 : 9000;
    };
    const evalAt = (q, h, maxTicks = maxTicksFor(q)) => {
      const o = flyFree({ course, ball, heading: h, club, power: q, lie, wind, pin, maxTicks });
      C.flights++; stats.flights++;
      const P = o.path;
      let e = Infinity, tIn = null, tOut = null, vband = Infinity, pass = null, n0 = -1, n1 = -1;
      for (let i = 1; i < P.length; i++) {
        const p = P[i], s = along(p) - D;
        if (Math.hypot(p[0] - pin[0], p[2] - pin[2]) <= 10) { if (n0 < 0) n0 = i; n1 = i; }
        if (!pass && s >= 0 && along(P[i - 1]) - D < 0) { const a = P[i - 1], f = (D - along(a)) / (along(p) - along(a)); pass = [a[0] + f * (p[0] - a[0]), a[1] + f * (p[1] - a[1]), a[2] + f * (p[2] - a[2])]; }
        if (s < -WIN || s > WIN) { if (tIn != null && tOut == null && s > WIN) tOut = p[3]; continue; }
        if (tIn == null) tIn = p[3];
        const hh = p[1] - pin[1];
        vband = Math.min(vband, hh < CLOTH.lo ? CLOTH.lo - hh : hh > CLOTH.hi ? hh - CLOTH.hi : 0);
        const ex = catchExcess(F, p, P[i - 1]);
        if (ex < e) e = ex;
      }
      if (tIn != null && tOut == null) tOut = P[P.length - 1][3];
      // the pin's tests reach 6.7 u from the axis at most: only the ticks within 10 u of it
      // (the path's ticks are its indices: traceEvery 1 from tick 0)
      let cp = null;
      if (n0 >= 0) {
        const s0 = Math.max(0, n0 - 1);
        cp = FS.pinCapture(P.slice(s0, n1 + 2), pin, { ticksPerSample: 1, wind: flagWind, lie, mode, wsr: true });
        if (cp) { cp.tick += s0; cp.index += s0; }
      }
      const r = { q, h, e, vband, tIn, tOut, pass, status: cp ? (cp.kind === "box" ? "catch" : "stick") : "none" };
      // the nearest any flight came to a catch (box-local units, 0 = caught or inside)
      if (Number.isFinite(e) && (!C.closest || e < C.closest.e)) C.closest = { e: +e.toFixed(3), power: +q.toFixed(4), aimOffDeg: +((h - h0) / DEG).toFixed(3), status: r.status };
      if (cp?.kind === "box") {
        const flat = FS.captureOutcome(cp, pin, { wind: flagWind });
        const kcl = kclAfterCatch(cp, { course, hole, club, lie, pin, flagWind, wind });
        // the ground before the catch: the path's first contact (fly's carry) before the catch tick
        const k = P.findIndex((x) => x[0] === o.carry[0] && x[1] === o.carry[1] && x[2] === o.carry[2]);
        Object.assign(r, { e: 0, cap: cp, flatHoled: flat.holed, flatHow: flat.how, flatRest: flat.restYd, kclHoled: kcl.holed, kclRest: kcl.restYd,
          bounced: k >= 0 && P[k][3] < cp.tick });
        r.H = holedBy(r);
      } else r.H = false;
      return r;
    };
    // 1. the pin line
    const line = [];
    for (let k = 0; ; k++) { const q = +(lo + 0.01 * k).toFixed(4); if (q > cap + 1e-9) break; line.push(q); }
    if (line[line.length - 1] < cap - 1e-9) line.push(cap);
    const L = [];
    for (const q of line) {
      if (over()) { stats.truncated = true; break; }
      const r = evalAt(q, h0, 9000);
      if (r.tOut != null) tOutAt.set(q, r.tOut);
      L.push(r);
    }
    const keep = new Set();
    L.forEach((r, k) => { if (r.vband <= NEAR || r.status === "catch") for (const j of [k - 1, k, k + 1]) if (L[j]) keep.add(L[j].q); });
    C.linePowers = keep.size;
    const inBand = L.filter((r) => r.vband === 0).map((r) => r.q);
    C.lineBand = inBand.length ? [Math.min(...inBand), Math.max(...inBand)] : null;
    if (!keep.size) { C.ms = Math.round(performance.now() - tc); continue; }
    // 2. the coarse grid across the cloth's reach
    const K = Math.max(2, Math.ceil(reachU / D / (0.05 * DEG)));
    const coarse = [];
    for (const q of [...keep].sort((a, b) => a - b)) for (let k = -K; k <= K; k++) {
      if (over()) { stats.truncated = true; break; }
      coarse.push(evalAt(q, h0 + k * 0.05 * DEG));
    }
    C.coarse = coarse.length;
    // the game's grid: q = i dq, aim = h0 + j da
    const grid = new Map();
    const key = (i, j) => `${i},${j}`;
    const cell = (i, j) => {
      const k = key(i, j);
      let r = grid.get(k);
      if (!r) { r = evalAt(i * dq, h0 + j * da); r.i = i; r.j = j; grid.set(k, r); C.fill++; }
      return r;
    };
    // 3. seeds: coarse catches, and the four best coarse cells refined by a pattern search
    const seeds = [];
    for (const r of coarse) if (r.status === "catch") seeds.push(r);
    const ranked = coarse.filter((r) => Number.isFinite(r.e)).sort((a, b) => a.e - b.e);
    const starts = [];
    for (const r of ranked) {
      if (starts.length >= 4 || r.e > 10) break;
      if (starts.some((s) => Math.abs(s.q - r.q) < 0.015 && Math.abs(s.h - r.h) < 0.3 * DEG)) continue;
      starts.push(r);
    }
    for (const s0 of starts) {
      if (over()) { stats.truncated = true; break; }
      let cur = s0, sq = 0.004, sa = 0.04 * DEG, n = 0;
      while (cur.status !== "catch" && n < 90 && (sq >= dq * 0.75 || sa >= da * 0.75)) {
        let best = null;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const q = cur.q + a * sq;
          if (q < lo || q > cap + 1e-9) continue;
          const r = evalAt(q, cur.h + b * sa); n++; C.refine++;
          if (!best || (r.status === "catch") > (best.status === "catch") || ((r.status === "catch") === (best.status === "catch") && r.e < best.e)) best = r;
          if (r.status === "catch") break;
        }
        if (best && (best.status === "catch" || best.e < cur.e)) cur = best;
        else { sq /= 2; sa /= 2; }
      }
      if (cur.status === "catch") seeds.push(cur);
      else if (cur.e < 0.5) {
        // close but not caught: the game's grid round it
        const i0 = Math.round(cur.q / dq), j0 = Math.round((cur.h - h0) / da);
        for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const q = (i0 + a) * dq; if (q < lo || q > cap + 1e-9) continue; const r = cell(i0 + a, j0 + b); if (r.status === "catch") seeds.push(r); }
      }
    }
    C.seeds = seeds.length;
    C.ms = Math.round(performance.now() - tc);
    if (seeds.length) todo.push({ club, cap, lo, C, grid, key, cell, seeds });
  }
  // 4. the flood fills on the game's grid: each catch's 5 x 5 block flown, the catches inside the cap expanded
  for (let nc = 0; nc < todo.length; nc++) {
    const { club, cap, lo, C, grid, key, cell, seeds } = todo[nc];
    const tc = performance.now();
    const share = (budget - (tc - t0)) / (todo.length - nc);
    if (!(share > 0)) { stats.truncated = true; C.truncated = true; continue; }
    const iCap = Math.floor((cap + 1e-9) / dq), iLo = Math.ceil(lo / dq);
    const queue = [], expanded = new Set();
    for (const s of seeds) {
      const i0 = Math.round(s.q / dq), j0 = Math.round((s.h - h0) / da);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (i0 + a <= iCap && i0 + a >= iLo) queue.push([i0 + a, j0 + b]);
    }
    let evals0 = C.fill;
    while (queue.length) {
      if (performance.now() - tc > share || C.fill - evals0 > maxEvals) { stats.truncated = true; C.truncated = true; break; }
      const [i, j] = queue.pop();
      const k = key(i, j);
      if (expanded.has(k)) continue;
      expanded.add(k);
      const r = cell(i, j);
      if (r.status !== "catch") continue;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const r2 = cell(i + a, j + b);
        if (r2.status === "catch" && i + a <= iCap && i + a >= iLo && !expanded.has(key(i + a, j + b))) queue.push([i + a, j + b]);
      }
    }
    // 5. robustness and the margin
    const all = [...grid.values()];
    const H = all.filter((r) => r.H), notH = all.filter((r) => !r.H);
    C.catches = all.filter((r) => r.status === "catch" && r.i <= iCap).length;
    C.holes = H.filter((r) => r.i <= iCap).length;
    const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    const stepU = (di, dj) => med(H.map((r) => { const n2 = grid.get(key(r.i + di, r.j + dj)); return n2?.H && n2.pass && r.pass ? Math.hypot(n2.pass[0] - r.pass[0], n2.pass[1] - r.pass[1], n2.pass[2] - r.pass[2]) : null; }).filter((x) => x != null));
    const su0 = stepU(1, 0) ?? 0.2, sa0 = stepU(0, 1) ?? D * da;
    C.stepU = { power: +su0.toFixed(3), aim: +sa0.toFixed(3) };
    const local = (r, di, dj, fb) => {
      const a = grid.get(key(r.i + di, r.j + dj)), b = grid.get(key(r.i - di, r.j - dj));
      return a?.pass && b?.pass ? Math.max(1e-3, Math.hypot(a.pass[0] - b.pass[0], a.pass[1] - b.pass[1], a.pass[2] - b.pass[2]) / 2) : fb;
    };
    for (const r of H) {
      if (r.i > iCap || r.i < iLo) continue;
      let n = 0, m = 0;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const v = grid.get(key(r.i + a, r.j + b)); if (v) { m++; if (v.H) n++; } }
      const su = local(r, 1, 0, su0), sa2 = local(r, 0, 1, sa0);
      let mU = Infinity;
      for (const x of notH) { const d = Math.hypot((x.i - r.i) * su, (x.j - r.j) * sa2); if (d < mU) mU = d; }
      const cp = r.cap;
      out.push({ club, power: +(r.i * dq).toFixed(4), heading: r.h, robust: n / Math.max(1, m), how: "flag", height: +cp.height.toFixed(2), offset: +cp.offset.toFixed(2),
        marginU: Number.isFinite(mU) ? +mU.toFixed(2) : null, aimOffDeg: +((r.h - h0) / DEG).toFixed(3), tick: cp.tick, speed: +cp.speed.toFixed(2),
        local: cp.local.map((x) => +x.toFixed(2)), bounced: r.bounced, route: r.bounced ? "bounce" : "flight", stepU: { power: +su.toFixed(3), aim: +sa2.toFixed(3) }, holedEst: r.flatHoled, flat: { how: r.flatHow, restYd: +r.flatRest.toFixed(2) },
        kcl: { holed: r.kclHoled, restYd: +r.kclRest.toFixed(2) }, i: r.i, j: r.j, ...(m < 25 ? { partial: true } : {}) });
    }
    C.cells = out.filter((c) => c.club === club).length;
    C.ms += Math.round(performance.now() - tc);
  }
  out.sort((a, b) => b.robust - a.robust || (a.bounced === b.bounced ? 0 : a.bounced ? 1 : -1) || (b.marginU ?? 0) - (a.marginU ?? 0));
  stats.cells = out.length;
  for (const [club, C] of Object.entries(stats.clubs)) { const b = out.find((c) => c.club === club); C.best = b ? { power: b.power, aimOffDeg: b.aimOffDeg, robust: +b.robust.toFixed(2), marginU: b.marginU } : null; }
  if (out.length > maxCells) out.splice(maxCells);
  // the best few through flagCatch (predict() itself, the whole stroke)
  for (const c of out.slice(0, verifyTop)) {
    const v = flagCatch({ hole, ball, heading: c.heading, club: c.club, power: c.power, lie, pin, flagWind, wind, course, mode });
    c.verified = v.catch && !!holedBy({ flatHoled: !!v.flat?.holed, kclHoled: !!v.kcl?.holed });
    c.model = { restYd: v.model?.toPin ?? null, outcome: v.model?.outcome ?? null, stick: !!v.model?.flag };
  }
  return done();
}
