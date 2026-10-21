// The app's putt model (src/putt.js) on a green the harness plays: the field
// over the mesh green heights (public/terrain gNN.bin through puttField), the
// ball and cup in green-box fractions, the launch power for a flat roll, the
// app's roll with the cup taken away, the aim that passes the cup at a given
// offset, and a path's closest approach to the cup. run-cup.mjs and
// run-cupedge.mjs share it.
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
  // the putt whose app roll stops at (TX, TZ) (KCL units): the aim bisected
  // on the side the stop falls on, the speed on how far along it stops,
  // three rounds; -> { angDeg (right of the cup), v0, power, miss (yd), pass
  // (the roll's closest approach to the cup, yd) }
  const puttTo = (TX, TZ) => {
    const tb = Math.atan2(TX - ball[0], TZ - ball[2]), dT = Math.hypot(TX - ball[0], TZ - ball[2]) / YD;
    // aim: degrees right of the cup's direction (a smaller heading is right)
    let ang = (-Math.atan2(Math.sin(tb - toPin), Math.cos(tb - toPin)) * 180) / Math.PI, v0 = P.vFlat(dT);
    const stopOf = (a, v) => { const o = appRoll(a, v), m = toMesh(o.r.stop); return { m, pass: o.pass.dist }; };
    for (let round = 0; round < 3; round++) {
      let lo = ang - 20, hi = ang + 20;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2, s = stopOf(mid, v0).m;
        // the stop's side of the ball -> target line: + = right of it
        const side = (s[0] - ball[0]) * -Math.cos(tb) + (s[1] - ball[2]) * Math.sin(tb);
        if (side < 0) lo = mid; else hi = mid;
      }
      ang = (lo + hi) / 2;
      let vl = 0.05, vh = 8;
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
  return { D, toPin, field, fBall, fCup, W, H, toMesh, powerFor, appRoll, aimFor, along, across, fromCup, puttTo };
}
