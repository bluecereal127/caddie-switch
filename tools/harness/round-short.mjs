// The short game of a natural WSR round: putts on the green, putts and chips
// from the fringe, and chips from within SHORT_YD of the pin, planned to hole
// out and otherwise to leave the shortest next putt. Nothing here touches
// the game; it reads only the state round-play.mjs passes (the ball, the pin,
// the lie, the wind) and the course's own KCL triangles.
//
// - Every candidate stroke is flown by WSR's ball in 3D over the hole's KCL
//   triangles: lib/kclputt.mjs fastPutt for the putter, and for the lofted
//   clubs fly() below, src/wsrsim.js run()'s tick (lift, the in-air wind,
//   gravity along the bisector of the ring's smoothed normal, drag, the
//   contact impulse with the A / B tables, the iron-on-green first contact,
//   the four-tick ring, the stop rule) with lib/kclputt.mjs's contact (one
//   triangle a tick, the deepest whose interior the ball's centre projects
//   into). Replayed at the game's own power and the struck heading (rounds
//   1-13), it put the 44 logged off-green strokes within 45 yd a median 0.021
//   yd (mean 0.12, p90 0.47) from where the game's ball came to rest (wedge
//   chips: 0.010 yd across, 0.007 along; the 9-iron's 0.5 yd along), where
//   the KCL line the profile port flies was 1.06 / 1.65 yd off (median /
//   mean, 17 chips), and it holes both logged chip-ins and no other chip;
//   fastPutt gives the game's verdict on 239 of the 240 logged putts (13 of
//   13 from the fringe).
// - The rough / bunker launch yaw: from lies 2 and 3 a straight swing leaves
//   2.000 deg right of the aim (tools/research/wsr-swing-redzone-spin.md 4.1,
//   measured in WSR by run-spin.mjs part C); every logged rough and bunker
//   stroke replays to the game's rest only with it, so the aim this returns
//   is the launch line turned 2 deg left.
// - The hidden pin-power assist: WSR pulls a partial swing toward the power
//   its aim table rests nearest the pin (lib/assist.mjs assistP3) whenever
//   the swing's state-1 window stays open past its first frame, which the
//   harness does not control (holdWindow off): PI_ASSIST, 32 of 100 putts
//   and 2 of 28 other strokes the young table pulls visibly in rounds 1-13.
//   The table is reset by every frame of the D-pad turn and by the club
//   change, and the swing freezes it TABLE_FRAMES (5-8.5) frames later, when
//   it holds the first simulations of its build (tableStates: power 0, whose
//   result is the ball's own distance, then full power, then 0.5), which our
//   own port flies: flown that way it reproduces 41 of the 42 logged pulls.
//   Within 300 u (32.8 yd) of the pin that pulls a swing under 0.3 toward
//   power 0, by up to 0.107 (wedge 0.23 -> 0.1232 on round 2's hole 16, 11 yd
//   short; 1.43 yd putts 0.226 -> 0.1197, short of the cup), and a long putt
//   over 0.7 toward full power when full power would rest nearer the pin
//   than the ball (8.3 yd 0.7139 -> 0.7683, 3.5 yd past). So each stroke is
//   scored on both launches, the swung power (1 - PI) and the table's pulls
//   (PI), and a putt takes a power whose launches all hole where there is
//   one (nothing 0.3 or more from the table's power is pulled).
// - The search, per club the lie allows (the putter, wedge, 9- and 7-iron;
//   on the green the putter only): a seed, then a fine grid of launch
//   headings and powers round it (25 x 64 for the putter, 21 x 41 for a
//   chip) flown with the cup. The putter's seeds come from a coarse fan of
//   headings (+-6 to +-25 deg) and powers, the best two regions; a chip's
//   from a 2D secant that puts its rest 0.25 yd past the cup. Each grid
//   point holes or leaves a rest; its chance to hole is Phi of its clearance
//   (how far inside the holing region it lies, in sigmas of SIGMA: 0.04 yd
//   across at the cup, 0.08 yd of rest along for the putter and wedge, 0.4
//   for the irons), and its value the expected strokes to hole out (1 if it
//   holes, else 1 plus its leave's: a putt's holing rate by distance, the
//   fringe a yard worse, a chip and a putt from elsewhere, 3.5 for water or
//   OB). Every point is scored on both launches, the swung power and the
//   assist's pulls, with 0.01 strokes a yard against launch lines that pass
//   more than 0.15 yd wide of the cup (a big break tracks the slope over a
//   longer path); the lowest expected strokes wins, ties to the larger
//   clearance. On the 281 logged short situations: median 0.66 s, p90 1.5 s,
//   max 2.9 s (opts.budgetMs, 4.5 s, stops the search early).
//
//   export async function shortPlan(hole, st, opts) -> { club, power, heading, expect, why } | null
//     st as round-play.mjs passes it (ball.pos, pin, player.lie, wind.angle /
//     speedIdx); power is the launch power p2 for lib/shot.mjs shoot() (the
//     putter's raw value), heading the aim to set by D-pad. null off the green
//     and fringe beyond opts.maxYd (SHORT_YD), or when no club has a launch.
//     opts: { maxYd, clubs, budgetMs, piPutt, piOther, tableFrames }
//   node --max-old-space-size=6000 tools/harness/round-short.mjs [--rounds 1,2,3] [--holes 1-18] [--max 40]
//     replays every logged short situation (results/round18.json, round-rN.json): what was
//     played and what happened, and what shortPlan plays there with its predicted outcome.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { YD, kcl, groundAt, dropMesh } from "./lib/course.mjs";
import { packGreen, fastPutt } from "./lib/kclputt.mjs";
import { P } from "./lib/green.mjs";

export const SHORT_YD = 40;
// the chance that the swing's state-1 window stays open past its first frame,
// so the assist acts: rounds 1-13 of the current harness, the swings a young
// table pulls visibly (within 300 u, under 0.3 from its power): 32 of 100
// putts, 2 of 28 other strokes; with the long putts the full-power state
// pulled, 37 of 110 putts
export const PI_ASSIST = { putter: 0.34, other: 0.1 };
// the frames the aim table builds between the D-pad turn's last frame (its
// last reset) and the first A-held frame, which freezes it: [5, 8.5] fits
// all 36 such pulls (34 short putts pulled to exactly 0, two long putts to
// full power once its simulation had come to rest nearer the pin than the
// ball); a stroke that needs no turn waits on a table built since the stroke
// began (13-36 frames on the five logged), which shortPlan does not assume
export const TABLE_FRAMES = [5, 8.5];
// the launch yaw a straight swing gets from rough and bunker (deg, + = left)
export const LIE_YAW_DEG = { 2: -2, 3: -2 };

const DEG = Math.PI / 180, U = 240 / YD;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

// ---- WSR's ball in 3D over packed KCL triangles ----
const A_TAB = [0.3, 0.4, 0.5, 1.0, 0.7, 1.0, 0.15, 1.0, 1.0, 0.3, 0.001, 0.3, 0.3, 1.0, 0.1, 0.4, 1.0];
const B_TAB = [0.5, 0.5, 0.4, 0.001, 0.3, 0.001, 0.5, 0.001, 0.001, 0.5, 0.13, 0.5, 0.5, 0.001, 0.5, 0.5, 0.001];
const STOP_MASK = 0x1ce5e;
// the club blocks (src/wsrsim.js CLUBS; wsr-club-physics.md 3): launch speed at
// power 0 / 1 (u/tick), angle, lift P14, the speed curve's p38, the type
// (1 = iron, for the first contact on a green), the curve floor P3c, the lie
// caps P48 (rough) / P50 (bunker) and the lie factors (the power ceiling
// after the assist) P4c (rough), P54 (bunker), P58 (others)
export const CLUB = {
  driver:  { p00: 0.02,  p04: 3.39, angle: 10, lift: 0.65, p38: 0.71,  type: 0, p3c: 0.1,  rough: 0.75, bunker: 0.25, fRough: 1, fBunker: 0.5,  fOther: 1 },
  spoon:   { p00: 0.00,  p04: 3.13, angle: 11, lift: 0.70, p38: 0.708, type: 0, p3c: 0.1,  rough: 0.75, bunker: 0.25, fRough: 1, fBunker: 0.5,  fOther: 1 },
  "3iron": { p00: 0.00,  p04: 2.79, angle: 19, lift: 0.50, p38: 0.67,  type: 1, p3c: 0.1,  rough: 0.75, bunker: 0.5,  fRough: 1, fBunker: 0.75, fOther: 1 },
  "5iron": { p00: 0.02,  p04: 2.45, angle: 23, lift: 0.50, p38: 0.66,  type: 1, p3c: 0.1,  rough: 0.75, bunker: 0.5,  fRough: 1, fBunker: 0.75, fOther: 1 },
  "7iron": { p00: 0.00,  p04: 2.13, angle: 24, lift: 0.50, p38: 0.665, type: 1, p3c: 0.1,  rough: 0.75, bunker: 0.5,  fRough: 1, fBunker: 0.75, fOther: 1 },
  "9iron": { p00: 0.00,  p04: 1.78, angle: 30, lift: 0.50, p38: 0.66,  type: 1, p3c: 0.1,  rough: 0.75, bunker: 0.5,  fRough: 1, fBunker: 0.75, fOther: 1 },
  wedge:   { p00: 0.01,  p04: 1.28, angle: 43, lift: 0.00, p38: 0.64,  type: 2, p3c: 0.1,  rough: 0.75, bunker: 0.75, fRough: 1, fBunker: 1,    fOther: 1 },
  putter:  { p00: 0.004, p04: 0.41, angle: 0,  lift: 0.00, p38: 0.63,  type: 3, p3c: 0.05, rough: 1,    bunker: 1,    fRough: 1, fBunker: 1,    fOther: 2.5 },
};
// the lie cap (the swing's p2 = p1 x cap; slot 16: rough attr 2, bunker attr 3,
// any other lie 1, as lib/shot.mjs rawFor feeds it) and the launch powers a
// swing can give there: [P3c cap, min(cap, lie factor)]
export const capOf = (club, lie) => (lie === 2 ? CLUB[club].rough : lie === 3 ? CLUB[club].bunker : 1);
export function powerRange(club, lie) {
  const c = CLUB[club], cap = capOf(club, lie);
  const f = lie === 2 ? c.fRough : lie === 3 ? c.fBunker : c.fOther;
  return { cap, lo: c.p3c * cap, hi: club === "putter" ? f : Math.min(cap, f) };
}

// One stroke of WSR's ball (any club but the putter, which fastPutt flies the
// same: identical rests and verdicts on hole 16's logged putts) from ball
// [x, y, z] (its centre, KCL u) along launch heading h (rad; (sin h, cos h) in
// x east / z south) at launch power q. wind { angle (the air moving along (sin
// a, cos a)), idx (WSR's speed index, 2 mph each) } acts in the air only; cup
// [x, z] with window(v yd/s) -> yd holes a ball on the ground whose tick
// passes within the window of the cup's centre (src/putt.js's measured rule).
// -> { stop, holed, best (closest approach on the ground, yd), reason (rest,
// holed, ticks, out: left the packed triangles, fell: below the course, i.e.
// water), land (first contact), landAttr, restAttr, ticks }
export function fly(g, ball, h, club, q, { wind = null, cup = null, window = null, maxTicks = 7200 } = {}) {
  const c = CLUB[club];
  const { V, N, E, ATT, x0, z0, cell, gw, gh, start, cells } = g;
  const s = q > 0 ? Math.pow(q, Math.log2(1 / c.p38)) : 0;
  const speed = c.p00 + s * (c.p04 - c.p00), th = c.angle * DEG;
  let px = ball[0], py = ball[1], pz = ball[2];
  let vx = Math.sin(h) * Math.cos(th) * speed, vy = Math.sin(th) * speed, vz = Math.cos(h) * Math.cos(th) * speed;
  let s98 = c.lift * s;
  const y0 = ball[1] - 0.5;
  let Wx = 0, Wz = 0, wmag = 0;
  if (wind && wind.idx > 0) { wmag = 15 * Math.pow(wind.idx / 15, Math.log2(1 / 0.6)); Wx = Math.sin(wind.angle); Wz = Math.cos(wind.angle); }
  const rN = new Float64Array(12), rA = new Uint8Array(4);
  for (let i = 0; i < 4; i++) rN[3 * i + 1] = 1;
  let ri = 0, nx = 0, ny = 1, nz = 0, attrMax = 0, stop = 0, life = 0, reason = "ticks";
  let qx = px, qy = py, qz = pz, cD = 0, landed = false, holed = false, best = Infinity, land = null, landAttr = 0, lastAttr = 0, touching = false;
  let vprev = Math.sqrt(vx * vx + vy * vy + vz * vz);
  // lib/kclputt.mjs's contact; lim: how far below a triangle's plane the
  // centre may be and still meet it (0.5 u there; here the tick's travel, so a
  // ball coming down at 1 u a tick cannot pass through the ground)
  const contact = (x, y, z, lim) => {
    const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
    if (gx < 0 || gz < 0 || gx >= gw || gz >= gh) return -2;
    let bestK = -1;
    cD = 0;
    for (let s2 = start[gz * gw + gx], e = start[gz * gw + gx + 1]; s2 < e; s2++) {
      const k = cells[s2], o = 9 * k;
      const n0 = N[3 * k], n1 = N[3 * k + 1], n2 = N[3 * k + 2];
      const dist = (x - V[o]) * n0 + (y - V[o + 1]) * n1 + (z - V[o + 2]) * n2, depth = 0.5 - dist;
      if (depth <= 0 || dist < -lim) continue;
      const pX = x - dist * n0, pY = y - dist * n1, pZ = z - dist * n2;
      if ((pX - V[o]) * E[o] + (pY - V[o + 1]) * E[o + 1] + (pZ - V[o + 2]) * E[o + 2] > 0) continue;
      if ((pX - V[o + 3]) * E[o + 3] + (pY - V[o + 4]) * E[o + 4] + (pZ - V[o + 5]) * E[o + 5] > 0) continue;
      if ((pX - V[o + 6]) * E[o + 6] + (pY - V[o + 7]) * E[o + 7] + (pZ - V[o + 8]) * E[o + 8] > 0) continue;
      if (depth > cD) { cD = depth; bestK = k; }
    }
    return bestK;
  };
  // the resting ball's ring: its ground's normal and attribute (as fastPutt)
  {
    const k = contact(px, py, pz, 0.6);
    if (k >= 0) {
      for (let i = 0; i < 4; i++) { rN[3 * i] = N[3 * k]; rN[3 * i + 1] = N[3 * k + 1]; rN[3 * i + 2] = N[3 * k + 2]; rA[i] = ATT[k]; }
      nx = N[3 * k]; ny = N[3 * k + 1]; nz = N[3 * k + 2]; attrMax = ATT[k];
    }
  }
  while (life < maxTicks) {
    life++;
    const air = life < 8 || attrMax === 0;
    // 1. lift, perpendicular to v in the vertical plane
    if (s98 !== 0) {
      let a0 = -vx * vy, a1 = vx * vx + vz * vz, a2 = -vy * vz;
      const m = Math.sqrt(a0 * a0 + a1 * a1 + a2 * a2);
      if (m > 1.17549435e-38) { a0 /= m; a1 /= m; a2 /= m; } else { a0 = 0; a1 = 0; a2 = 0; }
      const k = vprev * 0.0012 * s98;
      vx += a0 * k; vy += a1 * k; vz += a2 * k;
      s98 *= 0.9985;
    }
    // 2-3. no side spin, no backspin: the harness's swing gives neither
    // 4. wind, in the air (src/wsrsim.js: the ramp on the height over the
    // launch ground, a head or tail component at 0.6 of a cross one)
    if (wmag > 0 && air) {
      const f = Math.min(Math.max(0.1 + (0.9 * (py - y0)) / 300, 0.1), 1);
      const W0 = Wx * wmag * f, W2 = Wz * wmag * f;
      const hz = Math.sqrt(vx * vx + vz * vz);
      let u0 = 0, u2 = 0;
      if (hz > 1.17549435e-38) { u0 = vx / hz; u2 = vz / hz; }
      const along = W0 * u0 + W2 * u2, a740 = u0 * along, a742 = u2 * along;
      vx += 8e-5 * (0.6 * a740 + (W0 - a740));
      vz += 8e-5 * (0.6 * a742 + (W2 - a742));
    }
    // 5. gravity along the bisector of the smoothed normal and the vertical
    let ux = 0.5 * nx, uy = 0.5 * ny + 0.5, uz = 0.5 * nz;
    const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (ul > 1.17549435e-38) { ux /= ul; uy /= ul; uz /= ul; } else { ux = 0; uy = 1; uz = 0; }
    vx -= 0.002 * ux; vy -= 0.002 * uy; vz -= 0.002 * uz;
    // 6. integrate, drag, the stop rule
    px += vx; py += vy; pz += vz;
    vx *= 0.999; vy *= 0.999; vz *= 0.999;
    if (!air) {
      const d0 = px - qx, d1 = py - qy, d2 = pz - qz;
      if (d0 * d0 + d1 * d1 + d2 * d2 < 0.0015 * 0.0015) stop++; else stop = 0;
      if (stop > 20) {
        if ((1 << attrMax) & STOP_MASK) { reason = "rest"; break; }
        const hl = Math.hypot(nx, nz);
        if (hl > 1.17549435e-38) { vx = (nx / hl) * 0.02; vz = (nz / hl) * 0.02; } else { vx = 0; vz = 0; }
        vy = 0; stop = 0;
      }
    }
    // the cup takes a rolling ball only: in contact last tick and not hopping
    // (a ball in the ring's four ticks after a bounce can be rising over it)
    if (cup && !air && touching && Math.abs(vy) < 0.08) {
      const ex = px - qx, ez = pz - qz, L2 = ex * ex + ez * ez;
      const f = L2 > 0 ? Math.min(1, Math.max(0, ((cup[0] - qx) * ex + (cup[1] - qz) * ez) / L2)) : 0;
      const cx = qx + f * ex - cup[0], cz = qz + f * ez - cup[1], d = Math.hypot(cx, cz) / YD, v = (Math.sqrt(L2) * 240) / YD;
      if (d < best) best = d;
      if (window && v < 4.45 && d <= window(v)) { holed = true; reason = "holed"; break; }
    }
    qx = px; qy = py; qz = pz;
    const k = contact(px, py, pz, Math.max(0.5, Math.sqrt(vx * vx + vy * vy + vz * vz) + 0.1));
    if (k === -2) { reason = "out"; break; }
    let at = 0;
    touching = k >= 0;
    if (k >= 0) {
      const a = ATT[k], n0 = N[3 * k], n1 = N[3 * k + 1], n2 = N[3 * k + 2];
      if (vy < 0.25) at = a;
      const vdn = vx * n0 + vy * n1 + vz * n2;
      let dvx = 0, dvy = 0, dvz = 0;
      if (!(-vdn < 0)) {
        const vn = -vdn;
        let A = A_TAB[a], B = B_TAB[a];
        if (!landed && c.type === 1 && (a === 6 || a === 9)) { A = 0.48; B = 0.5; }
        const t0 = vx - n0 * vdn, t1 = vy - n1 * vdn, t2 = vz - n2 * vdn, tm = Math.sqrt(t0 * t0 + t1 * t1 + t2 * t2), cap = vn * A;
        const f = tm > cap ? cap / tm : 1;
        dvx = -(1 + B) * n0 * vdn - t0 * f; dvy = -(1 + B) * n1 * vdn - t1 * f; dvz = -(1 + B) * n2 * vdn - t2 * f;
        s98 = 0;
      }
      px += n0 * cD; py += n1 * cD; pz += n2 * cD;
      vx += dvx; vy += dvy; vz += dvz;
      if (!landed) { land = [px, py, pz]; landAttr = a; }
      landed = true;
      lastAttr = a;
      rN[3 * ri] = n0; rN[3 * ri + 1] = n1; rN[3 * ri + 2] = n2;
    } else { rN[3 * ri] = 0; rN[3 * ri + 1] = 1; rN[3 * ri + 2] = 0; }
    rA[ri] = at;
    ri = (ri + 1) & 3;
    attrMax = Math.max(rA[0], rA[1], rA[2], rA[3]);
    const s0 = rN[0] + rN[3] + rN[6] + rN[9], s1 = rN[1] + rN[4] + rN[7] + rN[10], s2 = rN[2] + rN[5] + rN[8] + rN[11];
    const sl = Math.sqrt(s0 * s0 + s1 * s1 + s2 * s2);
    if (sl > 1e-9) { nx = s0 / sl; ny = s1 / sl; nz = s2 / sl; } else { nx = 0; ny = 1; nz = 0; }
    vprev = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (py < ball[1] - 200) { reason = "fell"; break; }
  }
  return { stop: [px, py, pz], holed, best, reason, land, landAttr, restAttr: lastAttr, ticks: life };
}

// ---- the pin-power assist and its aim table ----
// lib/assist.mjs assistP3 with no backspin: a swing under the cap whose table
// rests within 300 u of the pin is pulled toward the table's power pPin,
// p3 = p2 + (1 - w) cap (pPin - p2), w = clamp(0.5 + 0.5 (|p2 - pPin| / 0.3)^log2(1000),
// 0.5, 1) (and, when a table power holes, w no more than clamp(0.01 + 0.99
// (|d| / 0.05)^log2(20), 0.01, 1)). best: the table's best result (u), null
// for the young table, whose only result is power 0 resting where the ball
// is: the ball's distance x 1.1 in rough, x 1.3 in a bunker. Logged pulls to
// pPin = 0: putter 0.2650 -> 0.1711, 0.2517 -> 0.1478, 0.2081 -> 0.1068; wedge
// 0.23 -> 0.1232; from rough 0.19 -> 0.1195. Nothing is pulled from 0.3 or
// more away from pPin.
export function assistedPower(p2, { club, lie, toPinYd, pPin = 0, best = null }) {
  const cap = capOf(club, lie), mult = lie === 2 ? 1.1 : lie === 3 || lie === 16 ? 1.3 : 1;
  const b = best ?? toPinYd * YD * mult;
  if (p2 >= cap || !(b < 300)) return p2;
  const d = Math.abs(p2 - pPin);
  let w = clamp(0.5 + 0.5 * (d < 0.001 ? 0 : Math.pow(d / 0.3, Math.log2(1000))), 0.5, 1);
  if (b === 0) w = Math.min(w, clamp(0.01 + 0.99 * (d < 0.001 ? 0 : Math.pow(d / 0.05, Math.log2(20))), 0.01, 1));
  return Math.max(0, p2 + (1 - w) * cap * (pPin - p2));
}

// The aim table as the swing finds it (tools/research/wsr-harness-decodes.md
// 1): reset by every frame of the D-pad turn and the club change, then built
// at 160 ball ticks a frame, the powers k / 256 in the builder's order (0,
// 256, 128, 64, 192, 32, ...), each flown along the aim (no lie yaw, no
// spin, the wind as the ball gets it, with the cup) to its result: the rest's
// distance to the pin x 1.1 in rough, x 1.3 in a bunker, x 2 in water or out
// of bounds, 0 holed. The entries between computed powers are interpolated,
// the array smoothed with 11 taps (1 5 15 30 45 51 45 30 15 5 1) / 243 (zeros
// stay), its minimum (or the middle of its longest holed run) is the best.
// The first A-held frame freezes it, TABLE_FRAMES frames after the last reset
// (calibrated on the logged pulls; see tableStates). -> [{ from, to (frames),
// pPin, best (u) }] for the table after each completed simulation.
export const TABLE_ORDER = [0, 256, 128, 64, 192, 32, 96, 160, 224, 16, 48, 80, 112, 144, 176, 208, 240];
const TAPS = [1, 5, 15, 30, 45, 51, 45, 30, 15, 5, 1].map((x) => x / 243);
function tableBest(res) {
  const keys = [...res.keys()].sort((a, b) => a - b), a = new Float64Array(257);
  for (let i = 0; i <= 256; i++) {
    // the nearest computed powers at or below and at or above i
    let lo = null, hi = null;
    for (const k of keys) { if (k <= i) lo = k; if (k >= i && hi == null) hi = k; }
    if (lo == null) a[i] = res.get(hi);
    else if (hi == null || hi === lo) a[i] = res.get(lo);
    else a[i] = res.get(lo) + ((res.get(hi) - res.get(lo)) * (i - lo)) / (hi - lo);
  }
  let runS = -1, best = null;
  for (let i = 0; i <= 257; i++) {
    if (i <= 256 && a[i] === 0) { if (runS < 0) runS = i; continue; }
    if (runS >= 0) { const len = i - runS; if (!best || len > best.len) best = { len, idx: Math.floor((runS + i - 1) / 2) }; runS = -1; }
  }
  if (best) return { pPin: best.idx / 256, best: 0 };
  let bi = 0, bv = Infinity;
  for (let i = 0; i <= 256; i++) {
    let s = 0;
    for (let t = -5; t <= 5; t++) s += TAPS[t + 5] * a[clamp(i + t, 0, 256)];
    if (s < bv) { bv = s; bi = i; }
  }
  return { pPin: bi / 256, best: bv };
}
export function tableStates(ctx, club, aimH, { maxFrames = 40 } = {}) {
  const { g, m, ball, cup } = ctx, res = new Map(), out = [];
  let ticks = 0;
  for (const k of TABLE_ORDER) {
    const q = k / 256;
    const r = club === "putter" ? fastPutt(g, ball, aimH, P.wsrPuttV0(q) / U, 7200, cup, P.cupWindow) : fly(g, ball, aimH, club, q, { wind: ctx.wind, cup, window: P.cupWindow });
    ctx.sims++;
    ticks += r.ticks;
    let v;
    if (r.holed) v = 0;
    else {
      const fell = r.reason === "fell" || r.reason === "out" || r.stop[1] < ball[1] - 30;
      const gr = fell ? null : groundAt(m, r.stop[0], r.stop[2]);
      const mult = !gr || HAZARD.has(gr.attr) ? 2 : gr.attr === 2 ? 1.1 : gr.attr === 3 || gr.attr === 16 ? 1.3 : 1;
      v = Math.hypot(r.stop[0] - cup[0], r.stop[2] - cup[1]) * mult;
    }
    res.set(k, v);
    const st = { from: ticks / 160, ...tableBest(res) };
    if (out.length) out[out.length - 1].to = st.from;
    out.push(st);
    if (st.from > maxFrames) break;
  }
  out[out.length - 1].to = Infinity;
  return out;
}

// ---- what a leave is worth: the expected strokes still to play ----
// A putt's holing rate by distance, from the rounds' KCL-read putts (every
// one within 11 yd holed but those the assist moved) with a margin for the
// longer ones; a fringe leave putts a yard worse; from off the green a chip
// and a putt
export function puttHoleRate(d) {
  if (d <= 3) return 0.99;
  if (d <= 8) return 0.99 - 0.01 * (d - 3);
  if (d <= 15) return 0.94 - 0.03 * (d - 8);
  return Math.max(0.4, 0.73 - 0.02 * (d - 15));
}
const HAZARD = new Set([4, 5, 7, 13]);
export function leaveValue(d, attr) {
  if (attr == null || HAZARD.has(attr)) return 3.5;
  if (attr === 6 || attr === 10 || attr === 11) return 1 + (1 - puttHoleRate(d));
  if (attr === 9) return 1.05 + (1 - puttHoleRate(d + 1));
  const far = 0.012 * Math.min(d, 60);
  if (attr === 1 || attr === 15) return 1.9 + far;
  if (attr === 2) return 2.05 + far;
  if (attr === 3 || attr === 16) return 2.3 + far;
  return 2.2 + far;
}

// ---- the search ----
// one stroke's outcome: launch heading h, launch power q
function outcome(ctx, club, h, q) {
  const { g, m, ball, cup } = ctx;
  let r;
  if (club === "putter") {
    r = fastPutt(g, ball, h, P.wsrPuttV0(q) / U, 7200, cup, P.cupWindow);
    if (!r.holed && (r.reason !== "rest" || r.stop[1] < ball[1] - 30)) r.reason = r.stop[1] < ball[1] - 30 ? "fell" : r.reason;
  } else r = fly(g, ball, h, club, q, { wind: ctx.wind, cup, window: P.cupWindow });
  ctx.sims++;
  if (r.holed) return { holed: true, leave: 0, attr: 6, value: 1, stop: r.stop, best: 0 };
  const leave = Math.hypot(r.stop[0] - cup[0], r.stop[2] - cup[1]) / YD;
  let attr = null;
  if (r.reason === "rest") { const gr = groundAt(m, r.stop[0], r.stop[2]); attr = gr ? (gr.attr === 10 || gr.attr === 11 ? 6 : gr.attr) : null; }
  return { holed: false, leave, attr, value: 1 + leaveValue(leave, attr), stop: r.stop, best: r.best, reason: r.reason };
}
// the rest with the cup taken away, for the secant
function restOf(ctx, club, h, q) {
  const { g, ball } = ctx;
  ctx.sims++;
  const r = club === "putter" ? fastPutt(g, ball, h, P.wsrPuttV0(q) / U, 7200) : fly(g, ball, h, club, q, { wind: ctx.wind });
  return r.stop;
}

// The launch (heading, power) whose rest, with no cup, lies `past` yd beyond the
// cup on the ball -> cup line: a 1D bisection on the distance first (chips),
// then a 2D secant turning the heading by the rest's bearing error and the
// power by its distance error. -> { h, q, miss (yd) }
function centreLine(ctx, club, range) {
  const { ball, cup, toCup } = ctx;
  const past = 0.25, T = [cup[0] + Math.sin(toCup) * past * YD, cup[1] + Math.cos(toCup) * past * YD];
  const dT = Math.hypot(T[0] - ball[0], T[1] - ball[2]) / YD, bT = Math.atan2(T[0] - ball[0], T[1] - ball[2]);
  const distOf = (s) => Math.hypot(s[0] - ball[0], s[2] - ball[2]) / YD;
  let h = bT, q;
  if (club === "putter") {
    // the flat roll's power, then the secant (rough and fringe roll shorter)
    const powerOfV0 = (v) => { const u = v / U; return u > 0.004 ? Math.pow((u - 0.004) / 0.406, 1 / Math.log2(1 / 0.63)) : 0; };
    q = clamp(powerOfV0(P.vFlat(dT)), range.lo, range.hi);
  } else {
    let lo = range.lo, hi = range.hi;
    if (distOf(restOf(ctx, club, h, hi)) < dT - 1) return null;   // out of reach
    for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (distOf(restOf(ctx, club, h, mid)) < dT) lo = mid; else hi = mid; }
    q = (lo + hi) / 2;
  }
  let best = null, prev = null;
  for (let it = 0; it < 12; it++) {
    const s = restOf(ctx, club, h, q), d = distOf(s), b = Math.atan2(s[0] - ball[0], s[2] - ball[2]);
    const miss = Math.hypot(s[0] - T[0], s[2] - T[1]) / YD;
    if (!best || miss < best.miss) best = { h, q, miss };
    if (miss < 0.03) break;
    // the heading: turn by the bearing error (the break turns with the line),
    // at most 4 deg a step and 15 deg off the line to the target
    if (d > 0.3) h = bT + clamp(angDiff(h + clamp(angDiff(bT, b), -4 * DEG, 4 * DEG), bT), -15 * DEG, 15 * DEG);
    // the power: a secant on the distance, a proportional step first
    let qn;
    if (prev && Math.abs(d - prev.d) > 1e-4 && Math.abs(q - prev.q) > 1e-6) qn = q + ((dT - d) * (q - prev.q)) / (d - prev.d);
    else qn = q * (d > 0.05 ? clamp(Math.pow(dT / d, club === "putter" ? 0.6 : 0.8), 0.5, 1.8) : 1.5);
    prev = { q, d };
    q = clamp(qn, range.lo, range.hi);
    if (Math.abs(q - prev.q) < 1e-6 && it > 2) break;
  }
  return best;
}

// The putter's seeds: the power whose rest on the straight line to the cup
// lies 0.25 yd past it (a bisection), then a coarse fan of headings (+-6 to
// +-25 deg: wider the shorter the putt) and powers flown with the cup, each
// point scored on both launches as the fine
// grid will be (powers from the floor to 1.7 times that, or 0.15 more); the
// seeds are the best point and the best one of another region (4 or more aim
// steps or 0.1 of power away). The rest-point secant
// chips use runs off on a green that breaks hard round the cup (round 3's
// holes 5 and 6).
function puttSeeds(ctx, range) {
  const { ball, toCup, D } = ctx;
  const dT = D + 0.25, distOf = (st) => ((st[0] - ball[0]) * Math.sin(toCup) + (st[2] - ball[2]) * Math.cos(toCup)) / YD;
  let lo = range.lo, hi = Math.min(range.hi, 1.5);
  if (distOf(restOf(ctx, "putter", toCup, lo)) >= dT) hi = lo;
  else for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (distOf(restOf(ctx, "putter", toCup, mid)) < dT) lo = mid; else hi = mid; }
  const qLine = (lo + hi) / 2;
  const A = clamp((Math.atan2(1.2, Math.max(D, 0.1)) / DEG) * 1.5, 6, 25), nA = 33, nQ = 40;
  const qLo = range.lo, qHi = Math.min(range.hi, Math.max(1.7 * qLine + 0.03, qLine + 0.15)), qStep = (qHi - qLo) / (nQ - 1);
  const fan = scanGrid(ctx, "putter", toCup, qLine, { aimHalfDeg: A, nAim: nA, qLo, qHi, nQ });
  const map = holingMap(fan, 1, 1), pi = ctx.piPutt;
  const valueAt = (i, q) => {
    const jf = (q - qLo) / qStep;
    if (jf >= 0 && jf <= nQ - 1) { const j0 = Math.min(nQ - 2, Math.floor(jf)), f = jf - j0; return map[i][j0].value * (1 - f) + map[i][j0 + 1].value * f; }
    return outcome(ctx, "putter", fan.hs[i], q).value;
  };
  const yaw = (LIE_YAW_DEG[ctx.lie] ?? 0) * DEG, cands = [];
  for (let i = 0; i < nA; i++) {
    const states = tableWeights(ctx, "putter", fan.hs[i] - yaw);
    for (let j = 0; j < nQ; j++) {
      const q = fan.qs[j];
      let pulled = 0;
      for (const t of states) {
        const qa = assistedPower(q, { club: "putter", lie: ctx.lie, toPinYd: D, pPin: t.pPin, best: t.best });
        pulled += t.w * (Math.abs(qa - q) < 1e-9 ? map[i][j].value : valueAt(i, qa));
      }
      const E = (1 - pi) * map[i][j].value + pi * pulled;
      cands.push({ i, j, E, key: E - 1e-3 * map[i][j].c });
    }
  }
  cands.sort((x, y) => x.key - y.key);
  const picks = [cands[0]];
  const other = cands.find((c) => Math.abs(c.i - cands[0].i) >= 4 || Math.abs(fan.qs[c.j] - fan.qs[cands[0].j]) >= 0.1);
  if (other && other.E < cands[0].E + 0.5) picks.push(other);
  return picks.map((p) => {
    const row = fan.cell[p.i];
    let rlo = null, rhi = null;
    for (let j = p.j; j >= 0 && row[j].holed; j--) rlo = fan.qs[j];
    for (let j = p.j; j < nQ && row[j].holed; j++) rhi = fan.qs[j];
    return { h: fan.hs[p.i], q: fan.qs[p.j], qLine, E: p.E, run: rlo != null ? [rlo, rhi] : null, aimStepDeg: (2 * A) / (nA - 1), qStep };
  });
}

// the table states the swing can find along aim heading aimH, weighted by how
// much of TABLE_FRAMES each covers -> [{ w, pPin, best }]
function tableWeights(ctx, club, aimH) {
  const [F0, F1] = ctx.tableFrames;
  const out = [];
  for (const s of tableStates(ctx, club, aimH, { maxFrames: F1 })) {
    const w = (Math.min(s.to, F1) - Math.max(s.from, F0)) / (F1 - F0);
    if (w > 1e-9) out.push({ w, pPin: s.pPin, best: s.best });
  }
  return out.length ? out : [{ w: 1, pPin: 0, best: null }];
}

// a grid of launches round (h0, q0), flown with the cup
function scanGrid(ctx, club, h0, q0, { aimHalfDeg, nAim, qLo, qHi, nQ }) {
  const hs = [], qs = [];
  for (let i = 0; i < nAim; i++) hs.push(h0 + ((-aimHalfDeg + (2 * aimHalfDeg * i) / (nAim - 1)) * DEG));
  for (let j = 0; j < nQ; j++) qs.push(qLo + ((qHi - qLo) * j) / (nQ - 1));
  const cell = hs.map((h) => qs.map((q) => outcome(ctx, club, h, q)));
  return { hs, qs, cell };
}

// The errors a launch must survive (1 sigma, yd at the cup): across, the
// port's own path error (putts' rests 0.002-0.25 yd off WSR's, ~0.05 at the
// cup) and the D-pad's residual (<= 0.035 deg); along, the rest's error: the
// putter and the wedge, which the port put within ~0.05 yd on the logged
// strokes, 0.08; the irons, whose 30-45 yd chips ran 0.5-0.6 yd past it, 0.4
export const SIGMA = { across: 0.04, along: { putter: 0.08, wedge: 0.08, iron: 0.4 } };
const Phi = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp((-x * x) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x >= 0 ? 1 - p : p; };
// Each grid point's chance to hole under those errors, from its clearance:
// the distance, in sigmas, from it to the boundary of the holing region (half
// way to the nearest point on the other side; beyond the grid is unknown and
// counts as a miss), Phi(clearance) inside and Phi(-clearance) outside; and
// the value of a miss there, the mean of the missing neighbours within 2
// sigmas (a lipped putt's tap-in, a chip's leave)
function holingMap(grid, sa, sq) {
  const nA = grid.hs.length, nQ = grid.qs.length, ra = Math.ceil(4 * sa), rq = Math.ceil(4 * sq);
  const isHoled = (i, j) => (i >= 0 && j >= 0 && i < nA && j < nQ ? grid.cell[i][j].holed : false);
  const map = grid.cell.map((row) => row.map(() => null));
  for (let i = 0; i < nA; i++) for (let j = 0; j < nQ; j++) {
    const own = grid.cell[i][j].holed;
    let dmin = Infinity, k = 1;
    for (let di = -ra; di <= ra; di++) for (let dj = -rq; dj <= rq; dj++) {
      if (!di && !dj) continue;
      if (isHoled(i + di, j + dj) === own) continue;
      const d = Math.hypot(di / sa, dj / sq);
      if (d < dmin) { dmin = d; k = Math.max(Math.abs(di), Math.abs(dj)); }
    }
    const c = dmin === Infinity ? 5 : dmin * (1 - 0.5 / k);
    let v = 0, w = 0;
    for (let di = -Math.ceil(2 * sa); di <= Math.ceil(2 * sa); di++) for (let dj = -Math.ceil(2 * sq); dj <= Math.ceil(2 * sq); dj++) {
      const r = grid.cell[i + di]?.[j + dj];
      if (!r || r.holed) continue;
      const wt = Math.exp(-0.5 * ((di / sa) ** 2 + (dj / sq) ** 2));
      v += wt * r.value; w += wt;
    }
    const pHole = own ? Phi(c) : Phi(-c);
    const vMiss = w > 0 ? v / w : 2.01;
    map[i][j] = { pHole, c: own ? c : -c, vMiss, value: pHole + (1 - pHole) * vMiss };
  }
  return map;
}

// the best launch of one club: its centre line, the grid round it, each point
// on both launches (the swung power, and the assist's pull on a young table)
function planClub(ctx, club) {
  const range = powerRange(club, ctx.lie);
  const seeds = club === "putter" ? puttSeeds(ctx, range) : [centreLine(ctx, club, range)].filter(Boolean);
  let best = null;
  for (const seed of seeds) {
    if (best && Date.now() > ctx.deadline) break;
    const r = refine(ctx, club, range, seed);
    if (r && (!best || r.E < best.E - 1e-6 || (Math.abs(r.E - best.E) <= 1e-6 && r.cl2 > best.cl2))) best = r;
  }
  return best;
}

// the fine grid round one seed and the launch it picks
function refine(ctx, club, range, cl) {
  const D = ctx.D, isPutt = club === "putter";
  let aimHalfDeg, qLo, qHi;
  if (isPutt) {
    // round the fan's seed: +-2.5 of its aim steps (and at least 4 sigmas
    // across at the cup), the seed's holing run and 2 of its power steps
    // either side, and down to half the run's start, where the assist pulls it
    aimHalfDeg = clamp(Math.max(2.5 * cl.aimStepDeg, (4 * SIGMA.across) / Math.max(D, 0.3) / DEG), 0.3, 15);
    const [a, b] = cl.run ?? [cl.q, cl.q];
    qLo = Math.max(range.lo, Math.min(a - 2 * cl.qStep, a < 0.3 ? 0.5 * a - 0.01 : a - 2 * cl.qStep));
    qHi = Math.min(range.hi, b + 2 * cl.qStep);
  } else {
    aimHalfDeg = clamp((Math.atan2(0.3, D) / DEG) * 1.2, 0.25, 4);
    qLo = Math.max(range.lo, cl.q - Math.max(0.012, 0.08 * cl.q));
    qHi = Math.min(range.hi, cl.q + Math.max(0.012, 0.08 * cl.q));
  }
  if (!(qHi > qLo)) qHi = Math.min(range.hi, qLo + 0.02);
  if (!(qHi > qLo)) return null;
  const nAim = isPutt ? 25 : 21, nQ = isPutt ? 64 : 41;
  const grid = scanGrid(ctx, club, cl.h, cl.q, { aimHalfDeg, nAim, qLo, qHi, nQ });
  // the errors in grid steps: across, the aim step's width at the cup; along,
  // the rest's change over a power step on the centre line
  const qStep = (qHi - qLo) / (nQ - 1), latStep = Math.max(0.2, D) * Math.tan(((2 * aimHalfDeg) / (nAim - 1)) * DEG);
  const dq = Math.max(qStep, 0.002), rp = restOf(ctx, club, cl.h, Math.min(range.hi, cl.q + dq)), rm = restOf(ctx, club, cl.h, Math.max(range.lo, cl.q - dq));
  const slope = Math.max(1, Math.hypot(rp[0] - rm[0], rp[2] - rm[2]) / YD / (Math.min(range.hi, cl.q + dq) - Math.max(range.lo, cl.q - dq)));
  const sigAlong = isPutt ? SIGMA.along.putter : CLUB[club].type === 1 ? SIGMA.along.iron : SIGMA.along.wedge;
  const sa = clamp(SIGMA.across / latStep, 0.5, 12), sq = clamp(sigAlong / (slope * qStep), 0.5, 20);
  const map = holingMap(grid, sa, sq);
  const pi = isPutt ? ctx.piPutt : ctx.piOther;
  const scored = [];
  for (let i = 0; i < nAim; i++) for (let j = 0; j < nQ; j++) scored.push({ i, j, h: grid.hs[i], q: grid.qs[j], u: map[i][j] });
  scored.sort((x, y) => x.u.value - y.u.value || y.u.c - x.u.c);
  // the pulled launch, for each table state the swing can find along this
  // aim (the launch heading less the lie's yaw): read off the grid where it
  // falls inside it, else flown at the heading and +-2 sigmas across it
  const yaw = (LIE_YAW_DEG[ctx.lie] ?? 0) * DEG, statesAt = new Map(), flown = new Map();
  const statesFor = (i) => { if (!statesAt.has(i)) statesAt.set(i, tableWeights(ctx, club, grid.hs[i] - yaw)); return statesAt.get(i); };
  const atPower = (i, qa) => {
    const ja = (qa - qLo) / qStep;
    if (ja >= 0 && ja <= nQ - 1) {
      const j0 = Math.min(nQ - 2, Math.floor(ja)), f = ja - j0, a0 = map[i][j0], a1 = map[i][j0 + 1];
      return { value: a0.value * (1 - f) + a1.value * f, pHole: a0.pHole * (1 - f) + a1.pHole * f, c: f < 0.5 ? a0.c : a1.c };
    }
    const key = `${i}|${qa.toFixed(5)}`;
    if (flown.has(key)) return flown.get(key);
    let v = 0, p = 0, w = 0;
    const off = Math.max(1, Math.round(2 * sa));
    for (const di of [-off, 0, off]) {
      const hh = grid.hs[i] + (di * 2 * aimHalfDeg * DEG) / (nAim - 1);
      const r = outcome(ctx, club, hh, qa), k = di ? 0.25 : 0.5;
      v += k * r.value; p += k * (r.holed ? 1 : 0); w += k;
    }
    const o = { value: v / w, pHole: p / w, c: 0 };
    flown.set(key, o);
    return o;
  };
  const assisted = (c) => {
    let value = 0, pHole = 0, cmin = Infinity, same = true, qa = c.q, wq = -1;
    for (const t of statesFor(c.i)) {
      const q3 = assistedPower(c.q, { club, lie: ctx.lie, toPinYd: D, pPin: t.pPin, best: t.best });
      const o = Math.abs(q3 - c.q) < 1e-9 ? c.u : (same = false, atPower(c.i, q3));
      value += t.w * o.value; pHole += t.w * o.pHole; cmin = Math.min(cmin, o.c);
      if (t.w > wq) { wq = t.w; qa = q3; }
    }
    return { qa, value, pHole, c: cmin, same };
  };
  // every point within 0.25 strokes of the best swung one (at most 500 for a
  // putt, 60 for a chip, whose pulled launch is flown)
  const top = scored.filter((c) => c.u.value <= scored[0].u.value + 0.25).slice(0, isPutt ? 500 : 60);
  // a line that breaks far round the cup tracks the slope over a longer path
  // than the port was checked on: 0.01 strokes a yard the launch line passes
  // wide of the cup, past 0.15 yd
  const bend = (h) => 0.01 * Math.max(0, D * Math.abs(Math.sin(angDiff(ctx.toCup, h))) - 0.15);
  let best = null;
  for (const c of top) {
    if (Date.now() > ctx.deadline && best) break;
    const a = assisted(c);
    const E = (1 - pi) * c.u.value + pi * a.value + bend(c.h), cl2 = Math.min(c.u.c, a.same ? c.u.c : a.c);
    if (!best || E < best.E - 1e-6 || (Math.abs(E - best.E) <= 1e-6 && cl2 > best.cl2)) best = { ...c, a, E, cl2 };
  }
  if (!best) return null;
  // the holing run of powers at the chosen heading (for the record)
  const row = grid.cell[best.i];
  let lo = null, hi = null;
  for (let j = best.j; j >= 0 && row[j].holed; j--) lo = grid.qs[j];
  for (let j = best.j; j < row.length && row[j].holed; j++) hi = grid.qs[j];
  return { club, ...best, pi, centre: cl, run: lo != null ? [lo, hi] : null, own: row[best.j], grid: { aimHalfDeg, qLo, qHi, n: nAim * nQ, sa: +sa.toFixed(2), sq: +sq.toFixed(2) } };
}

export async function shortPlan(hole, st, opts = {}) {
  const t0 = Date.now();
  const lie = st.player.lie === 10 || st.player.lie === 11 ? 6 : st.player.lie;
  const ball = st.ball.pos, cup = [st.pin[0], st.pin[2]];
  const D = Math.hypot(cup[0] - ball[0], cup[1] - ball[2]) / YD;
  const onGreen = lie === 6;
  if (!onGreen && lie !== 9 && D > (opts.maxYd ?? SHORT_YD)) return null;
  const m = await kcl(hole);
  if (!m) return null;
  const toCup = Math.atan2(cup[0] - ball[0], cup[1] - ball[2]);
  const R = Math.max(40, D / 2 + 22) * YD;
  const g = packGreen(m, (ball[0] + cup[0]) / 2, (ball[2] + cup[1]) / 2, R);
  const ctx = {
    m, g, ball, cup, toCup, D, lie, sims: 0, deadline: t0 + (opts.budgetMs ?? 4500),
    wind: st.wind?.speedIdx ? { angle: st.wind.angle ?? (st.wind.dir * Math.PI) / 4, idx: st.wind.speedIdx } : null,
    piPutt: opts.piPutt ?? PI_ASSIST.putter, piOther: opts.piOther ?? PI_ASSIST.other, tableFrames: opts.tableFrames ?? TABLE_FRAMES,
  };
  const clubs = opts.clubs ?? (onGreen ? ["putter"] : lie === 3 || lie === 16 ? ["wedge", "9iron", "7iron", "putter"] : ["putter", "wedge", "9iron", "7iron"]);
  const yaw = (LIE_YAW_DEG[lie] ?? 0) * DEG;
  const opts2 = [];
  for (const club of clubs) {
    if (Date.now() > ctx.deadline && opts2.length) break;
    const o = planClub(ctx, club);
    if (o) opts2.push(o);
  }
  if (!opts2.length) return null;
  opts2.sort((a, b) => a.E - b.E);
  const b = opts2[0];
  const aim = b.h - yaw;   // the aim that launches along b.h
  const right = (toCup - aim) / DEG;
  const ms = Date.now() - t0;
  const pct = (x) => `${Math.round(100 * x)}%`;
  const own = b.own;
  const expect = {
    src: "round-short", distance: +D.toFixed(2), lie, aimDeg: +right.toFixed(3), launchDeg: +((toCup - b.h) / DEG).toFixed(3),
    holeP: +((1 - b.pi) * b.u.pHole + b.pi * b.a.pHole).toFixed(3), E: +b.E.toFixed(3),
    swung: { power: +b.q.toFixed(4), holeP: +b.u.pHole.toFixed(3), holed: own.holed, leave: +own.leave.toFixed(2), leaveAttr: own.attr },
    pulled: { power: +b.a.qa.toFixed(4), holeP: +b.a.pHole.toFixed(3), weight: b.pi },
    holes: b.run ? b.run.map((x) => +x.toFixed(4)) : null,
    others: opts2.slice(1).map((o) => ({ club: o.club, E: +o.E.toFixed(3), holeP: +((1 - o.pi) * o.u.pHole + o.pi * o.a.pHole).toFixed(3), power: +o.q.toFixed(4) })),
    sims: ctx.sims, ms,
  };
  const why = `short game (WSR's ball over the KCL, ${ctx.sims} strokes flown, ${ms} ms): ${b.club} ${b.q.toFixed(4)} aimed ${right >= 0 ? "+" : ""}${right.toFixed(2)} deg right of the cup${yaw ? ` (launching ${((toCup - b.h) / DEG).toFixed(2)}: the lie's 2 deg yaw)` : ""}, ${D.toFixed(2)} yd; ` +
    `holes ${pct(b.u.pHole)} as swung${b.run ? ` (holing powers ${b.run[0].toFixed(3)}-${b.run[1].toFixed(3)} on this line)` : `, else ${own.leave.toFixed(1)} yd`}` +
    (b.a.same ? ", out of the assist's reach" : `, ${pct(b.a.pHole)} if the assist pulls it to ${b.a.qa.toFixed(4)}`) +
    `; ${b.E.toFixed(2)} strokes to hole out${opts2.length > 1 ? ` (${opts2.slice(1).map((o) => `${o.club} ${o.E.toFixed(2)}`).join(", ")})` : ""}`;
  return { club: b.club, power: b.q, heading: aim, expect, why };
}

// ---- the replay of the logged rounds ----
const HERE = path.dirname(fileURLToPath(import.meta.url));
function loggedRows(rounds) {
  const out = [];
  for (const f of fs.readdirSync(path.join(HERE, "results")).filter((f) => /^round(18|-r\d+)\.json$/.test(f))) {
    const round = f === "round18.json" ? 1 : Number(/r(\d+)/.exec(f)[1]);
    if (rounds && !rounds.includes(round)) continue;
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(HERE, "results", f), "utf8")); } catch { continue; }
    for (const [h, rec] of Object.entries(r.holes ?? {})) for (const s of rec.strokes ?? []) out.push({ round, hole: Number(h), ...s });
  }
  return out;
}
const band = (d) => (d < 1 ? "<1" : d < 2 ? "1-2" : d < 3 ? "2-3" : d < 5 ? "3-5" : d < 8 ? "5-8" : d < 12 ? "8-12" : d < 20 ? "12-20" : d < 30 ? "20-30" : "30-40");
const LIE_NAME = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 10: "green", 11: "green", 15: "tee", 16: "bunker" };

async function replay() {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
  const rounds = arg("--rounds", null)?.split(",").map(Number) ?? null;
  const [h0, h1] = (arg("--holes", "1-21")).split("-").map(Number);
  const maxYd = Number(arg("--max", SHORT_YD));
  const rows = loggedRows(rounds).filter((s) => s.hole >= h0 && s.hole <= (h1 ?? h0) && s.gamePower != null && ([6, 9, 10, 11].includes(s.lie) || s.club === "putter" || s.toPin <= maxYd));
  rows.sort((a, b) => a.hole - b.hole || a.round - b.round || a.k - b.k);
  const stats = new Map(), add = (k, holed, after) => { const s = stats.get(k) ?? { n: 0, holed: 0, after: [] }; s.n++; if (holed) s.holed++; else s.after.push(after); stats.set(k, s); };
  const res = [];
  let curHole = null;
  for (const s of rows) {
    if (s.hole !== curHole) { if (curHole != null) dropMesh(curHole); curHole = s.hole; }
    const kind = s.club === "putter" ? (LIE_NAME[s.lie] === "green" ? "putt" : `putt from ${LIE_NAME[s.lie]}`) : `chip from ${LIE_NAME[s.lie]}`;
    add(`${kind}|${band(s.toPin)}`, s.holed, s.after);
    const st = { ball: { pos: s.from }, pin: s.pin, player: { lie: s.lie }, wind: { angle: (s.wind.dir * Math.PI) / 4, speedIdx: s.wind.speedIdx, dir: s.wind.dir } };
    const t = Date.now();
    const pl = await shortPlan(s.hole, st);
    const ms = Date.now() - t;
    const was = `${s.club} ${(+s.plan.power).toFixed(4)}${Math.abs(s.gamePower - (s.club === "putter" ? s.raw : s.plan.power)) > 0.0015 ? ` (the game launched ${s.gamePower.toFixed(4)})` : ""}`;
    res.push({ id: `r${s.round}h${s.hole}k${s.k}`, kind, toPin: s.toPin, was, actual: s.holed ? "holed" : `${s.after} yd`, plan: pl ? { club: pl.club, power: +pl.power.toFixed(4), aimDeg: pl.expect.aimDeg, holeP: pl.expect.holeP, swung: pl.expect.swung, pulled: pl.expect.pulled, E: pl.expect.E, others: pl.expect.others } : null, ms });
    console.log(`${`r${s.round} h${s.hole} k${s.k}`.padEnd(12)} ${kind.padEnd(18)} ${s.toPin.toFixed(1).padStart(5)} yd | played ${was}: ${s.holed ? "HOLED" : `${s.after} yd`} | shortPlan ${pl ? `${pl.club} ${pl.power.toFixed(4)} ${pl.expect.aimDeg >= 0 ? "+" : ""}${pl.expect.aimDeg.toFixed(2)} deg: holes ${Math.round(100 * pl.expect.swung.holeP)}% swung${pl.expect.swung.holed ? "" : ` (else ${pl.expect.swung.leave} yd)`}, ${Math.round(100 * pl.expect.pulled.holeP)}% pulled to ${pl.expect.pulled.power}; ${pl.expect.E} strokes` : "none"} (${ms} ms)`);
  }
  if (curHole != null) dropMesh(curHole);
  console.log("\nlogged short game, holed / strokes by kind and distance band (misses: where they finished, yd)");
  for (const [k, s] of [...stats].sort()) console.log(`  ${k.padEnd(24)} ${s.holed}/${s.n}${s.after.length ? `  misses ${s.after.map((x) => x.toFixed(2)).join(" ")}` : ""}`);
  const planned = res.filter((r) => r.plan);
  const expHoled = planned.reduce((t, r) => t + r.plan.holeP, 0), actHoled = res.filter((r) => r.actual === "holed").length;
  console.log(`\nshortPlan on the ${res.length} situations: predicted holes ${expHoled.toFixed(1)} (played: ${actHoled}); expected strokes ${planned.reduce((t, r) => t + r.plan.E, 0).toFixed(1)}; plan time median ${res.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(res.length / 2)]} ms, max ${Math.max(...res.map((r) => r.ms))} ms`);
  const out = arg("--out", null);
  if (out) fs.writeFileSync(path.resolve(out), JSON.stringify(res, null, 1));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await replay();
