// The app's putt model (src/putt.js) on a green the harness plays: the field
// over the mesh green heights (public/terrain gNN.bin through puttField), the
// ball and cup in green-box fractions, the launch power for a flat roll, the
// app's roll with the cup taken away, the aim that passes the cup at a given
// offset, and a path's closest approach to the cup. run-cup.mjs and
// run-cupedge.mjs share it; run-pinputts.mjs and report.mjs "pins" also use
// the additions at the end of greenModel (a wider aim search for steep cups,
// one putt's prediction, a look-ahead pass signed by a travel direction).
import path from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { YD, ROOT, DERIVED, meshToMap, mapToMesh } from "./course.mjs";

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
export const P = await imp("src/putt.js");
const { parseGreenHeights } = await imp("src/terrain.js");

// a path's closest approach to the cup, in the green's east-north yards: the
// distance, the signed offset (+ = the ball passes right of the cup) and the
// speed there, over a polyline of [east, north, t] points
export function closest(pts, cupE, cupN) {
  let b = null;
  for (let i = 1; i < pts.length; i++) {
    const [e0, n0, t0] = pts[i - 1], [e1, n1, t1] = pts[i];
    const de = e1 - e0, dn = n1 - n0, L2 = de * de + dn * dn;
    const f = L2 > 0 ? Math.min(1, Math.max(0, ((cupE - e0) * de + (cupN - n0) * dn) / L2)) : 0;
    const pe = e0 + f * de, pn = n0 + f * dn, dist = Math.hypot(pe - cupE, pn - cupN);
    if (!b || dist < b.dist) {
      const L = Math.sqrt(L2) || 1;
      b = { dist, offset: ((pe - cupE) * dn - (pn - cupN) * de) / L, speed: L2 > 0 ? Math.sqrt(L2) / (t1 - t0) : 0, i };
    }
  }
  return b;
}

// the path's FIRST approach to the cup, the same fields as closest(): the
// nearest point up to where the distance first rises again. On a steep cup a
// putt that runs past it uphill stops and rolls back down, and its overall
// closest approach can be on the way back, travelling the other way (so the
// offset's sign flips); the first approach is the line at the cup
export function firstPass(pts, cupE, cupN) {
  let b = null;
  for (let i = 1; i < pts.length; i++) {
    const [e0, n0, t0] = pts[i - 1], [e1, n1, t1] = pts[i];
    const de = e1 - e0, dn = n1 - n0, L2 = de * de + dn * dn;
    const f = L2 > 0 ? Math.min(1, Math.max(0, ((cupE - e0) * de + (cupN - n0) * dn) / L2)) : 0;
    const pe = e0 + f * de, pn = n0 + f * dn, dist = Math.hypot(pe - cupE, pn - cupN);
    if (b && dist > b.dist + 1e-9) break;
    if (!b || dist < b.dist) {
      const L = Math.sqrt(L2) || 1;
      b = { dist, offset: ((pe - cupE) * dn - (pn - cupN) * de) / L, speed: L2 > 0 ? Math.sqrt(L2) / (t1 - t0) : 0, i };
    }
  }
  return b;
}

// the speed at a closest approach (closest() or firstPass() on a path whose
// points are evenly timed, as appRoll's every 0.1 s): each segment's mean
// speed stands at its middle, linearly between them at the point's place in
// its segment. closest()'s own `speed` is that segment's mean, which jumps
// by the 0.1 s of deceleration (0.1-0.2 yd/s) as the closest point moves
// from one segment to the next; this one is continuous
export function passSpeed(pts, pass, cupE, cupN) {
  const segV = (k) => {
    if (k < 1 || k >= pts.length) return null;
    const [e0, n0, t0] = pts[k - 1], [e1, n1, t1] = pts[k];
    return t1 > t0 ? Math.hypot(e1 - e0, n1 - n0) / (t1 - t0) : null;
  };
  const i = pass.i, v = segV(i);
  if (v == null) return 0;
  const [e0, n0] = pts[i - 1], [e1, n1] = pts[i], de = e1 - e0, dn = n1 - n0, L2 = de * de + dn * dn;
  const f = L2 > 0 ? Math.min(1, Math.max(0, ((cupE - e0) * de + (cupN - n0) * dn) / L2)) : 0;
  const u = segV(f < 0.5 ? i - 1 : i + 1);
  return u == null ? v : v + (u - v) * Math.abs(f - 0.5);
}

// ball, pin: KCL positions [x, y, z]
export function greenModel(hole, ball, pin) {
  const tag = String(hole).padStart(2, "0");
  const D = Math.hypot(pin[0] - ball[0], pin[2] - ball[2]) / YD;
  const toPin = Math.atan2(pin[0] - ball[0], pin[2] - ball[2]);
  const d = DERIVED.holes[hole], box = d.greenBox;
  const W = (box.x1 - box.x0) * DERIVED.mapW * d.scale, H = (box.y1 - box.y0) * DERIVED.mapH * d.scale;
  const field = P.puttField({ green: { box, grid: d.grid, slopeMaxPct: d.slopeMaxPct }, heights: parseGreenHeights(readFileSync(path.join(ROOT, `public/terrain/g${tag}.bin`))), W, H });
  const fr = (X, Z) => { const [fx, fy] = meshToMap(hole, X, Z); return { x: (fx - box.x0) / (box.x1 - box.x0), y: (fy - box.y0) / (box.y1 - box.y0) }; };
  const toMesh = (f) => mapToMesh(hole, box.x0 + f[0] * (box.x1 - box.x0), box.y0 + f[1] * (box.y1 - box.y0));
  const fBall = fr(ball[0], ball[2]), fCup = fr(pin[0], pin[2]);
  // launch power for a flat roll of r yd: invert wsrPuttV0 (yd/s) against vFlat
  const powerFor = (r) => { const v = P.vFlat(r); let lo = 0.001, hi = 2.5; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (P.wsrPuttV0(m) < v) lo = m; else hi = m; } return (lo + hi) / 2; };
  // the app's roll with the cup taken away: the same launch, a cup 50 times as
  // far along the same direction (never reached), the power rescaled to it
  const appRoll = (angDeg, v0) => {
    const K = 50, far = { x: fBall.x + (fCup.x - fBall.x) * K, y: fBall.y + (fCup.y - fBall.y) * K };
    const r = P.simPutt(field, fBall, far, angDeg, v0 / P.vFlat(D * K), { trace: true });
    // simPutt's path is every 12 steps of 1/120 s (0.1 s), its last point the rest
    const pts = r.path.map(([x, y], i) => [x * W, -y * H, Math.min(i * 0.1, r.t)]);
    return { r, pass: closest(pts, fCup.x * W, -fCup.y * H) };
  };
  // the aim (deg right of the cup) whose app roll passes the cup at offset o:
  // the holing line (o = 0) bisected over +-25 deg, other offsets within 6 deg
  // of it, where the pass moves monotonically with the aim (on hole 20's 8 deg
  // cup at 1 yd/s a wider search jumped to a 25 deg line passing 1.2 yd off)
  const holing = new Map();
  const bisect = (o, v0, lo, hi) => {
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (appRoll(m, v0).pass.offset < o) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  const aimFor = (o, v0) => {
    if (!holing.has(v0)) holing.set(v0, bisect(0, v0, -25, 25));
    const a0 = holing.get(v0);
    return o === 0 ? a0 : bisect(o, v0, a0 - 6, a0 + 6);
  };
  const along = (q) => ((q[0] - ball[0]) * Math.sin(toPin) + (q[2] - ball[2]) * Math.cos(toPin)) / YD;
  const across = (q) => ((q[0] - ball[0]) * -Math.cos(toPin) + (q[2] - ball[2]) * Math.sin(toPin)) / YD;
  // the horizontal distance of a point from the cup centre (the look-ahead's
  // closest-approach record, ball+0x120, is a position without a direction)
  const fromCup = (q) => Math.hypot(q[0] - pin[0], q[2] - pin[2]) / YD;
  // The app's roll with the cup taken away, resting where WSR's stop rule
  // would: src/putt.js rests a ball under STOP_V only on a slope of CREEP_DEG
  // (12 deg) or less, so its roll can never stop on the 12-15 deg faces round
  // hole 21's cups, where WSR's stop rule (a displacement under 0.0015 u a
  // tick for 20 ticks, tools/research/wsr-ground-phase.md section 3) rests a
  // ball that slows to a stop up to about 15 deg. simPutt's step (the same
  // forces, launch hop and exact drag step), the rest threshold restDeg in
  // place of CREEP_DEG; -> appRoll's { r: { stop, t }, pass: { dist } }. Only
  // run-pinputts.mjs's spot planner uses it (puttTo's restDeg), to find a
  // putt that WSR's look-ahead then tries; every prediction stays src/putt.js's
  const DRAG_E = Math.exp(-P.DRAG * P.DT), DRAG_C1 = (1 - DRAG_E) / P.DRAG, DRAG_C2 = (P.DT - DRAG_C1) / P.DRAG;
  const restRoll = (angDeg, v0, restDeg) => {
    const gr = new Float64Array(2), cx = fCup.x * W, cy = fCup.y * H;
    const th = Math.atan2((fCup.x - fBall.x) * W, -((fCup.y - fBall.y) * H)) + (angDeg * Math.PI) / 180;
    const ux = Math.sin(th), uy = -Math.cos(th), creep = Math.tan((restDeg * Math.PI) / 180);
    let x = fBall.x * W, y = fBall.y * H;
    field.grad(x, y, gr);
    const vL = v0 * (1 + P.launchHop(gr[0] * ux + gr[1] * uy));
    let vx = ux * vL, vy = uy * vL, sp = vL, pass = Math.hypot(x - cx, y - cy), step = 0;
    for (; step < P.STEP_CAP; step++) {
      field.grad(x, y, gr);
      const s = Math.hypot(gr[0], gr[1]);
      if (sp < P.STOP_V && s <= creep) break;
      const half = Math.atan(s) / 2;
      let ax = 0, ay = 0;
      if (s > 0) { const k = (P.G * Math.sin(half)) / s; ax = -k * gr[0]; ay = -k * gr[1]; }
      if (sp > 0) { const k = Math.min(P.DECEL * Math.cos(half), sp / P.DT) / sp; ax -= k * vx; ay -= k * vy; }
      const nvx = vx * DRAG_E + ax * DRAG_C1, nvy = vy * DRAG_E + ay * DRAG_C1;
      const nx = x + vx * DRAG_C1 + ax * DRAG_C2, ny = y + vy * DRAG_C1 + ay * DRAG_C2;
      const dx = nx - x, dy = ny - y, L2 = dx * dx + dy * dy;
      const f = L2 > 0 ? Math.min(1, Math.max(0, ((cx - x) * dx + (cy - y) * dy) / L2)) : 0;
      pass = Math.min(pass, Math.hypot(x + f * dx - cx, y + f * dy - cy));
      x = nx; y = ny; vx = nvx; vy = nvy; sp = Math.hypot(nvx, nvy);
    }
    return { r: { stop: [x / W, y / H], t: step * P.DT }, pass: { dist: pass } };
  };

  // the putt whose app roll stops at (TX, TZ) (KCL units): the aim bisected
  // on the side the stop falls on, the speed on how far along it stops,
  // three rounds; -> { angDeg (right of the cup), v0, power, miss (yd), pass
  // (the roll's closest approach to the cup, yd) }. The aim is searched
  // within aimSpan deg of the round's start and the speed up to vMax yd/s;
  // the defaults (20 deg, 8 yd/s: a flat roll of 13 yd) are what
  // make-greenspot.mjs used, run-pinputts.mjs reaches 15 yd rings with more.
  // restDeg: plan with restRoll (WSR's rest up to that slope) instead of the
  // app's roll (run-pinputts.mjs, for spots on faces steeper than CREEP_DEG)
  const puttTo = (TX, TZ, { vMax = 8, aimSpan = 20, restDeg = null } = {}) => {
    const tb = Math.atan2(TX - ball[0], TZ - ball[2]), dT = Math.hypot(TX - ball[0], TZ - ball[2]) / YD;
    // aim: degrees right of the cup's direction (a smaller heading is right)
    let ang = (-Math.atan2(Math.sin(tb - toPin), Math.cos(tb - toPin)) * 180) / Math.PI, v0 = P.vFlat(dT);
    const stopOf = (a, v) => { const o = restDeg != null ? restRoll(a, v, restDeg) : appRoll(a, v), m = toMesh(o.r.stop); return { m, pass: o.pass.dist }; };
    for (let round = 0; round < 3; round++) {
      let lo = ang - aimSpan, hi = ang + aimSpan;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2, s = stopOf(mid, v0).m;
        // the stop's side of the ball -> target line: + = right of it
        const side = (s[0] - ball[0]) * -Math.cos(tb) + (s[1] - ball[2]) * Math.sin(tb);
        if (side < 0) lo = mid; else hi = mid;
      }
      ang = (lo + hi) / 2;
      let vl = 0.05, vh = vMax;
      for (let i = 0; i < 40; i++) {
        const mid = (vl + vh) / 2, s = stopOf(ang, mid).m;
        const a = ((s[0] - ball[0]) * Math.sin(tb) + (s[1] - ball[2]) * Math.cos(tb)) / YD;
        if (a < dT) vl = mid; else vh = mid;
      }
      v0 = (vl + vh) / 2;
    }
    const s = stopOf(ang, v0);
    let lo = 0.001, hi = 2.5;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (P.wsrPuttV0(m) < v0) lo = m; else hi = m; }
    return { angDeg: ang, v0, power: (lo + hi) / 2, miss: Math.hypot(s.m[0] - TX, s.m[1] - TZ) / YD, pass: s.pass };
  };

  // ---- additions for run-pinputts.mjs and report.mjs "pins" ----
  // the app's roll with the cup taken away (appRoll) and its first approach
  // to the cup (firstPass) as well as its overall closest one, each with the
  // speed there interpolated (passSpeed, `v`) besides the segment's mean
  const appRoll1 = (angDeg, v0) => {
    const o = appRoll(angDeg, v0);
    const pts = o.r.path.map(([x, y], i) => [x * W, -y * H, Math.min(i * 0.1, o.r.t)]);
    const cE = fCup.x * W, cN = -fCup.y * H, first = firstPass(pts, cE, cN);
    return { ...o, pass: { ...o.pass, v: passSpeed(pts, o.pass, cE, cN) }, first: { ...first, v: passSpeed(pts, first, cE, cN) }, pts };
  };
  // The aim whose app roll passes the cup at offset o over a wide field, for
  // steep cups, where the holing line can sit outside aimFor's +-25 deg and
  // a 0.3 yd offset 6 deg or more from it: the aims -span..+span deg scanned
  // every `step`, each bracket where the pass offset crosses o bisected (40
  // halvings), and of the crossings that land on o (within 0.002 yd: a
  // bracket can straddle a jump of the closest approach from one stretch of
  // the path to another, where the offset never takes the value o) the one
  // nearest `near` deg (default: the holing line's own crossing nearest 0
  // for o != 0, else 0). first: the offset of the first approach (firstPass)
  // instead of the overall closest one, which on a steep cup can be a ball
  // rolling back down past it the other way. null when no aim passes at o.
  const scanCache = new Map();
  const aimScan = (o, v0, { span = 60, step = 1, near = null, first = false } = {}) => {
    const key = `${o}|${v0}|${span}|${step}|${first}`;
    let xs = scanCache.get(key);
    if (!xs) {
      xs = [];
      const off = (a) => (first ? appRoll1(a, v0).first : appRoll(a, v0).pass).offset - o;
      let pa = -span, pf = off(pa);
      for (let a = -span + step; a <= span + 1e-9; a += step) {
        const f = off(a);
        if ((pf < 0) !== (f < 0)) {
          let lo = pa, hi = a;
          const loNeg = pf < 0;
          for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if ((off(m) < 0) === loNeg) lo = m; else hi = m; }
          const am = (lo + hi) / 2;
          if (Math.abs(off(am)) < 0.002) xs.push(am);
        }
        pa = a; pf = f;
      }
      scanCache.set(key, xs);
    }
    if (!xs.length) return null;
    const ref = near ?? (o === 0 ? 0 : aimScan(0, v0, { span, step, first }) ?? 0);
    return xs.reduce((b, x) => (Math.abs(x - ref) < Math.abs(b - ref) ? x : b));
  };
  // aimFor where its brackets hold the answer (the line it finds passes at o
  // within 0.002 yd, its first approach too with `first`, so run-cupedge.mjs's
  // putts come out the same), else aimScan; -> { a, how: "aimFor" | "scan" }
  // or null
  const aimAt = (o, v0, { first = false } = {}) => {
    const a = aimFor(o, v0), r = appRoll1(a, v0);
    if (Math.abs(r.pass.offset - o) < 0.002 && (!first || Math.abs(r.first.offset - o) < 0.002)) return { a, how: "aimFor" };
    const b = aimScan(o, v0, { first });
    return b == null ? null : { a: b, how: "scan" };
  };
  // the app's own view of one injected putt, with the current src/putt.js:
  // heading = the game's aim (rad, player+0x80; a smaller heading is right),
  // power = WSR putter power. -> { angDeg (right of the cup), v0 (yd/s), the
  // verdict with the cup (simPutt and its window: holed, margin, best), the
  // roll with the cup taken away (appRoll: pass, offset (+ = right), speed
  // (yd/s, the segment's mean) and v (interpolated, passSpeed) at the overall
  // closest approach, dir = the travel direction there in east / north yd,
  // first = { pass, offset, speed, v } at the first approach, rest along /
  // across the ball -> cup line and from the cup in yd, stop (KCL x, z),
  // endSp, the roll's time t) }
  const predict = (heading, power) => {
    let d = toPin - heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const angDeg = (d * 180) / Math.PI, v0 = P.wsrPuttV0(power);
    const sim = P.simPutt(field, fBall, fCup, angDeg, v0 / P.vFlat(D), { trace: false });
    const o = appRoll1(angDeg, v0);
    const pts = o.pts, i = Math.max(1, Math.min(o.pass.i, pts.length - 1));
    const dir = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
    const s = toMesh(o.r.stop), q = [s[0], 0, s[1]];
    return { angDeg, v0, holed: sim.holed, margin: sim.margin, best: sim.best, pass: o.pass.dist, offset: o.pass.offset, speed: o.pass.speed, v: o.pass.v, dir,
      first: { pass: o.first.dist, offset: o.first.offset, speed: o.first.speed, v: o.first.v },
      rest: [along(q), across(q)], restFromCup: fromCup(q), stop: s, endSp: o.r.endSp, t: o.r.t };
  };
  // a look-ahead closest approach (ball+0x120, a KCL position with no
  // direction) as a signed pass in yd (+ = right of the cup) for a ball
  // travelling along dir ([east, north], e.g. predict()'s dir)
  const signedPass = (q, dir) => {
    const e = (q[0] - pin[0]) / YD, n = -(q[2] - pin[2]) / YD, L = Math.hypot(dir[0], dir[1]) || 1;
    return (e * dir[1] - n * dir[0]) / L;
  };
  return { D, toPin, field, fBall, fCup, W, H, toMesh, powerFor, appRoll, aimFor, along, across, fromCup, puttTo, appRoll1, aimScan, aimAt, predict, signedPass };
}
