// WSR's flagstick and flag, read from main.dol (NTSC-U rev 1), for the planner:
// where a ball path first meets the pin, and what WSR does with it.
//
// Units: KCL units (1 u = 0.1 m, 9.144 u/yd), velocities in u/tick, 240 ticks/s.
// `pin` is the pin object's position *(pin+0x4c) (= the harness's st.pin, the
// knowledge rows' `pin`): the cup centre at the green surface. It is the point
// IsHoleOut (0x80411b5c) compares the ball's y with, and the holed rows put the
// ball centre 2.3-2.8 u under it (cup floor 3 u down, ball radius 0.5).
//
// Two tests run in the per-tick wrapper 0x80414734 after Calc (0x80413b68) and
// the tree check, and before the ground contacts (0x8041228c), unless the mode
// (0x803fa8d4()+4) is 5 or 8 or the current player's lie (player+0xb0) is 6, 10
// or 11 (green, side of cup, cup; 0x804147a0: (1 << (lie - 6)) & 0x31). The
// fringe (9) is NOT skipped: a putt from the fringe meets the stick and the flag.
//  1. 0x80413020 -> 0x80401ab0 -> 0x803ff8ec: THE FLAG CLOTH, a box in the frame
//     the pin builds every frame at 0x803ffa68 (pin+0xc0: three axes, +0xe4 the
//     origin), NOT a box at the pin's base (wsr-ground-phase.md line 412 reads
//     it as "|y| <= 2 u about the pin base": the frame is the flag's). The stick
//     is yawed to the wind by 0x803ffb40 -> 0x803f2b3c (rows (cos t, 0, -sin t),
//     (0, 1, 0), (sin t, 0, cos t), t = the wind object's angle, so the flag
//     streams downwind along (sin t, cos t) in X, Z), and 0x803ffb40 stores the
//     flag's extension s = 0.5 + 0.5 * speedIdx / 15 (pin+0xb8 = speedIdx / 15,
//     0x803ffce0; 0 when the player manager's +0x8a8 is set, 0x803ecc84). Then
//        ax = (cos t, 0, -sin t)          across the cloth (the box's normal)
//        ay = (0, 1, 0)
//        az = (s sin t, -0.55, s cos t)   along the flag, drooping
//        origin = pin + (0, 26, 0) + 3.6 az
//     and a ball CENTRE (a point test, no radius) at local (x, y, z) with
//     |x| <= 2, |y| <= 2.8, |z| <= 2.8 (0x803ff98c-0x803ff9d8) is in the flag.
//     The cloth plane x = 0 holds the stick's axis. The flag reaches s(0.8 ..
//     6.4) u from the axis (0.04-0.35 yd calm, 0.09-0.70 yd at 30 mph), 4 u
//     thick, its centre 24.0 u (2.6 yd) up, heights 19.7-28.4 u (2.2-3.1 yd).
//     Response (0x80413080-0x80413328), when the ball moves toward the cloth
//     plane (v . n <= 0, n = sign(x) ax, depth = |x| - 1):
//       a centre within 1 u of the plane is pushed out to |x| = 1;
//       the speed toward the plane is cut to min(-v.n, 0.5 max(depth, 0));
//       the rest: horizontal x 0.1, plus 0.9 * 0.013 u/tick toward the pin
//       axis (the cup's XZ less the ball's, normalised); vertical x 0.1 when
//       rising, x 0.98 when falling; then v.y < -0.15 -> v.y x 0.95; spin
//       (+0x98..+0xa0) zeroed; v.y < -0.05 wobbles the flag (0x8040136c, 0.035).
//     So the flag catches the ball: its horizontal speed is gone in a few ticks
//     and it drops from 2-3 yd up, 0.04-0.7 yd downwind of the stick.
//  2. 0x80413350 -> 0x80401ab8 -> 0x803ffe30 -> 0x803f2340: THE STICK, a
//     vertical capsule centred ON the pin position, axis pin.y - 30 .. pin.y +
//     30 (30 = r2-0x794, not scaled by the pin's y scale; the debug draw at
//     0x803ffe48 is the one that uses 30 * scale y), radius 0.1 (r2-0x7e8) plus
//     the ball's 0.5 (0x80413410): the ball centre within 0.6 u (0.066 yd) of the
//     axis, from the cup's floor up to 30.6 u (3.35 yd) above the green. The
//     sweep runs from ball+0x64 (last tick's position) to the new one in four
//     quarter steps, and inside the first quarter that touches in four
//     sixteenths, the ball moved back to the first touching sixteenth. The
//     shape test: horizontal distance > 0.6 -> no; |dy| < 30 -> side contact
//     (normal horizontal, ball - axis); else a 0.6 sphere at the nearer end.
//     Response 0x80413648(ball, n, 1, depth, 0.7, e) (0x804135e0-0x80413628):
//       pos += n depth; n.y = 0, renormalised;
//       the normal component reversed x 0.7 when approaching (f2 = 0.7 is the
//       restitution: 0x80413674 f29 = f2, 0x804137d4 fneg f29);
//       the rest of the velocity (vertical included) capped at e |v.n|
//       (0x804137f0 f29 = -vn * f30, f30 = f3 = e);
//       e = clamp(0.299 sgn(x) |x|^1.737 + 0.001, 0.001, 0.3), x = 1 - 2 a, a
//       the approach speed -v.n in u/tick (0x803ef330: |x|^log2(1/0.3), 0 for
//       |x| < 0.001; 0x80212b1c clamp): e = 0.3 for a touch, 0.091 at a = 0.25,
//       0.001 from a = 0.5 u/tick (13.1 yd/s);
//       spin zeroed.
//     wsr-ground-phase.md line 409 swaps the two numbers ("normal reversed x e,
//     tangential <= 0.7 |v_n|"): the stick bounces the ball straight back at 0.7
//     of its approach speed and takes nearly everything else.
// What the stick does to a ball rolling into the cup (it stands in the mouth,
// ball centres 0.6 u from the axis, inside the cup's 1.0 u free-fall radius) is
// the cup's geometry (0x803f07a4) as much as the stick's; `captureOutcome`
// estimates it on a flat green and says so.

export const YD = 9.144;          // u per yd
export const TICK_HZ = 240;
export const GRAV = 0.002;        // u/tick^2 in the air (src/wsrsim.js)
export const DRAG = 0.999;
const FLT_MIN = 1.17549435e-38;

export const FLAG = {
  ballR: 0.5,                     // 0x80413410 / 0x80413064: f1 = 0.5 to the tests
  lieSkip: [6, 10, 11],           // 0x804147a0 mask 0x31 on lie - 6
  modeSkip: [5, 8],               // 0x80414770 / 0x80414778
  stick: {
    r: 0.1,                       // 0x803ffe3c r2-0x7e8
    halfH: 30,                    // 0x803ffe40 r2-0x794, about the pin position
    centreDy: 0,                  // 0x803ffe38: the capsule point is *(pin+0x4c) itself
    reach: 0.6,                   // r + ball 0.5, 0x803f238c
    top: 30.6,                    // centre height reach above the pin position
    quarters: 4, sixteenths: 4,   // 0x8041337c / 0x8041344c (0.25), loops to 4
  },
  stickResponse: {
    restitution: 0.7,             // 0x80413620 f2 -> 0x80413648 f29
    eK: 0.299, eAdd: 0.001, eLo: 0.001, eHi: 0.3,   // 0x804135e4-0x804135f4
    ePow: Math.log2(1 / 0.3),     // 0x803ef330(0.3, x) = sgn x |x|^log2(1/0.3) = |x|^1.737
    aRef: 0.5,                    // x = (a - 0.5) / -0.5 = 1 - 2a (0x804135a8 / 0x804135ac)
    flatten: true,                // r5 = 1: n.y = 0 (0x804136c8)
  },
  flag: {
    half: [2, 2.8, 2.8],          // 0x803ff9c4 (x^2 <= 4), 0x803ff990 (y^2, z^2 <= 7.84)
    core: 1,                      // depth = |x| - 1, 0x803ffa08
    up: 26, out: 3.6, droop: 0.55, // 0x803ffad0 / 0x803ffaf8 / 0x803ffaf0
    sBase: 0.5, sPerIdx: 0.5 / 15, // 0x803ffac8 s = 0.5 + 0.5 * (+0xb8), +0xb8 = speedIdx / 15 (0x803ffcd0)
  },
  flagResponse: {
    normalCap: 0.5,               // 0x80413214: approach <= 0.5 max(depth, 0)
    keep: 0.1,                    // 0x8041326c 0.9 mix: 0.1 t + 0.9 pull
    pull: 0.013,                  // 0x80413198, so 0.0117 u/tick toward the axis
    keepUp: 0.1, keepDown: 0.98,  // 0x8041324c / 0x80413254 (on the old v.y > 0)
    fallV: -0.15, fallDamp: 0.95, // 0x80413294 / 0x804132dc
  },
  cup: { R: 1.5, D: 3 },          // 0x8040562c -> 0x803f0bdc (wsr-ground-phase.md 6)
};

// ---- small vector helpers ----
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hdist = (p, pin) => Math.hypot(p[0] - pin[0], p[2] - pin[2]);
const toYds = (uPerTick) => (uPerTick * TICK_HZ) / YD;

// the game's wind { angle | dir, speedIdx } (lib/wsr.mjs); null = calm, dir 0
export function windAngle(w) {
  if (!w) return 0;
  if (w.angle != null) return w.angle;
  return ((w.dir ?? 0) * Math.PI) / 4;
}

// ---- the flag's frame (0x803ffa68) ----
export function flagFrame(pin, wind, { calmFlag = false } = {}) {
  const t = windAngle(wind), idx = calmFlag ? 0 : (wind?.speedIdx ?? 0);
  const s = FLAG.flag.sBase + FLAG.flag.sPerIdx * idx;
  const ax = [Math.cos(t), 0, -Math.sin(t)], ay = [0, 1, 0];
  const az = [s * Math.sin(t), -FLAG.flag.droop, s * Math.cos(t)];
  const origin = add(add(pin, [0, FLAG.flag.up, 0]), mul(az, FLAG.flag.out));
  // the inverse of [ax ay az] (columns), PSMTXInverse 0x8003ea50
  const m = [ax[0], ay[0], az[0], ax[1], ay[1], az[1], ax[2], ay[2], az[2]];
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  const inv = [
    (m[4] * m[8] - m[5] * m[7]) / det, (m[2] * m[7] - m[1] * m[8]) / det, (m[1] * m[5] - m[2] * m[4]) / det,
    (m[5] * m[6] - m[3] * m[8]) / det, (m[0] * m[8] - m[2] * m[6]) / det, (m[2] * m[3] - m[0] * m[5]) / det,
    (m[3] * m[7] - m[4] * m[6]) / det, (m[1] * m[6] - m[0] * m[7]) / det, (m[0] * m[4] - m[1] * m[3]) / det,
  ];
  return { pin, t, s, ax, ay, az, origin, inv };
}

export function flagLocal(F, p) {
  const d = sub(p, F.origin), i = F.inv;
  return [i[0] * d[0] + i[1] * d[1] + i[2] * d[2], i[3] * d[0] + i[4] * d[1] + i[5] * d[2], i[6] * d[0] + i[7] * d[1] + i[8] * d[2]];
}

// 0x803ff8ec: inside the flag? -> { local, n, depth } or null
export function flagTest(F, p) {
  const L = flagLocal(F, p), [hx, hy, hz] = FLAG.flag.half;
  if (L[2] * L[2] > hz * hz || L[1] * L[1] > hy * hy || L[0] * L[0] > hx * hx) return null;
  const sg = L[0] > 0 ? 1 : -1;                  // 0x803ff9e0: x > 0 -> +ax, else -ax
  return { local: L, n: mul(F.ax, sg), depth: sg * L[0] - FLAG.flag.core };
}

// 0x80413020's response on { p, v } (mutated); true when it acted
export function flagRespond(st, F, hit = flagTest(F, st.p)) {
  if (!hit) return false;
  const R = FLAG.flagResponse, n = hit.n, vn = dot(st.v, n);
  if (-vn < 0) return false;                      // moving away from the cloth plane
  const t = sub(st.v, mul(n, vn));
  let dx = F.pin[0] - st.p[0], dz = F.pin[2] - st.p[2];   // CalcDeltaXZ before the push
  const dl = Math.hypot(dx, dz);
  if (dl > FLT_MIN) { dx /= dl; dz /= dl; } else { dx = 0; dz = 0; }
  if (hit.depth < 0) st.p = add(st.p, mul(n, -hit.depth));
  const cap = Math.min(-vn, R.normalCap * Math.max(hit.depth, 0));
  const vN = Math.abs(vn) < FLT_MIN ? [0, 0, 0] : mul(n, -cap);   // SetLength keeps the direction (-n)
  const ky = st.v[1] > 0 ? R.keepUp : R.keepDown;
  const tN = [R.keep * t[0] + (1 - R.keep) * R.pull * dx, t[1] * ky, R.keep * t[2] + (1 - R.keep) * R.pull * dz];
  st.v = add(vN, tN);
  if (st.v[1] < R.fallV) st.v[1] *= R.fallDamp;
  return true;
}

// ---- the stick (0x803f2340 via 0x803ffe30) ----
export function stickTest(pin, p) {
  const S = FLAG.stick, dx = p[0] - pin[0], dz = p[2] - pin[2], d2 = dx * dx + dz * dz;
  if (d2 > S.reach * S.reach) return null;
  const dy = p[1] - (pin[1] + S.centreDy);
  if (dy * dy < S.halfH * S.halfH) {
    const d = Math.sqrt(d2);
    return { part: "side", n: d > FLT_MIN ? [dx / d, 0, dz / d] : [0, 0, 0], depth: S.reach - d };
  }
  const end = [pin[0], pin[1] + S.centreDy + (dy > S.halfH ? S.halfH : -S.halfH), pin[2]];
  const q = sub(p, end), ql = len(q);
  if (ql > S.reach) return null;
  return { part: dy > 0 ? "top" : "bottom", n: ql > 0 ? mul(q, 1 / ql) : [0, 1, 0], depth: S.reach - ql };
}

export function stickE(a) {
  const R = FLAG.stickResponse, x = (a - R.aRef) / -R.aRef;
  const ax = Math.abs(x), pw = ax < 0.001 ? 0 : Math.sign(x) * Math.pow(ax, R.ePow);
  return Math.min(R.eHi, Math.max(R.eLo, R.eK * pw + R.eAdd));
}

// 0x80413648(ball, n, 1, depth, 0.7, e) on { p, v } (mutated)
export function stickRespond(st, hit) {
  const R = FLAG.stickResponse, a = -dot(st.v, hit.n), e = stickE(a);
  st.p = add(st.p, mul(hit.n, hit.depth));
  let n = [hit.n[0], 0, hit.n[2]];
  const nl = len(n);
  n = nl < FLT_MIN ? n : mul(n, 1 / nl);
  const vn = dot(st.v, n);
  let vN = mul(n, vn), t = sub(st.v, vN);
  if (-vn > 0) vN = mul(vN, -R.restitution);
  const cap = -vn * e, tl = len(t);
  if (!(cap >= tl)) t = mul(t, cap / tl);
  st.v = add(t, vN);
  return { e, a, n };
}

// WSR's own sweep of one tick from p0 to p1 (0x80413350): the touching
// sub-position or null
export function stickSweepTick(pin, p0, p1) {
  const S = FLAG.stick, step = mul(sub(p1, p0), 1 / S.quarters);
  let p = p0;
  for (let k = 0; k < S.quarters; k++) {
    p = add(p, step);
    if (stickTest(pin, p)) {
      const st2 = mul(step, 1 / S.sixteenths);
      let q = sub(p, step), hitQ = p, hit = stickTest(pin, p);
      for (let j = 0; j < S.sixteenths; j++) {
        q = add(q, st2);
        const h = stickTest(pin, q);
        if (h) { hitQ = q; hit = h; break; }
      }
      return { p: hitQ, hit, frac: (k + 1) / S.quarters };
    }
  }
  return null;
}

// first t in [0, 1] where the segment a -> b brings the ball centre into the
// stick's capsule (exact, continuous) -> { t, part, chord } or null
export function segStick(pin, a, b) {
  const S = FLAG.stick, R = S.reach, y0 = pin[1] + S.centreDy;
  const ah = [a[0] - pin[0], a[2] - pin[2]], dh = [b[0] - a[0], b[2] - a[2]], dy = b[1] - a[1];
  const A = dh[0] * dh[0] + dh[1] * dh[1], B = 2 * (ah[0] * dh[0] + ah[1] * dh[1]), C = ah[0] * ah[0] + ah[1] * ah[1] - R * R;
  let tin, tout;
  if (A < 1e-12) { if (C > 0) return null; tin = -Infinity; tout = Infinity; }
  else {
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    tin = (-B - sq) / (2 * A); tout = (-B + sq) / (2 * A);
  }
  const lo = Math.max(0, tin), hi = Math.min(1, tout);
  if (lo > hi) return null;
  const chord = Number.isFinite(tout - tin) ? (tout - tin) * Math.sqrt(A) : Infinity;
  let best = null;
  // side: |a.y + t dy - y0| < halfH within [lo, hi]
  const ya = a[1] - y0;
  let sLo = lo, sHi = hi;
  if (Math.abs(dy) < 1e-12) { if (Math.abs(ya) >= S.halfH) sLo = Infinity; }
  else {
    const t1 = (-S.halfH - ya) / dy, t2 = (S.halfH - ya) / dy;
    sLo = Math.max(sLo, Math.min(t1, t2)); sHi = Math.min(sHi, Math.max(t1, t2));
  }
  if (sLo <= sHi) best = { t: sLo, part: "side" };
  // the end spheres
  for (const [ey, part] of [[y0 + S.halfH, "top"], [y0 - S.halfH, "bottom"]]) {
    const o = [a[0] - pin[0], a[1] - ey, a[2] - pin[2]], d = sub(b, a);
    const qa = dot(d, d), qb = 2 * dot(o, d), qc = dot(o, o) - R * R;
    let t = null;
    if (qc <= 0) t = 0;
    else if (qa > 1e-12) {
      const disc = qb * qb - 4 * qa * qc;
      if (disc >= 0) { const tt = (-qb - Math.sqrt(disc)) / (2 * qa); if (tt >= 0 && tt <= 1) t = tt; }
    }
    if (t != null && (!best || t < best.t)) best = { t, part };
  }
  return best ? { ...best, chord } : null;
}

// ---- the planner's 2D trace to world ----
// run({ trace: true }).path = [along, height, lateral] yd from the ball (every
// 4 ticks, src/wsrsim.js), height of the centre over its start, lateral + =
// right; the frame of round-planner.mjs: forward (sin L, cos L), right
// (-cos L, sin L) in world X, Z; from = the ball centre [X, Y, Z] in u.
export function traceToWorld(path, from, launch) {
  const fx = Math.sin(launch), fz = Math.cos(launch), rx = -Math.cos(launch), rz = Math.sin(launch);
  return path.map(([al, h, lat]) => [from[0] + (fx * al + rx * lat) * YD, from[1] + h * YD, from[2] + (fz * al + rz * lat) * YD]);
}

// ---- the capture ----
// pathWorld: ball centre positions [X, Y, Z] in u, `ticksPerSample` ticks apart
// (1 for a per-tick 3D path, 4 for a converted 2D trace). opts:
//   wind { angle | dir, speedIdx }: needed for the flag (its yaw and length);
//     without it only the stick is tested (flag: false to skip it anyway);
//   lie, mode: WSR's gates (lie 6 / 10 / 11 or mode 5 / 8 -> null);
//   calmFlag: the manager's +0x8a8 (the flag drawn at speed 0);
//   wsr: true samples the stick as WSR does (quarter ticks; needs a per-tick
//     path); default the exact continuous test, flagged `grazing` when the
//     chord through the capsule is shorter than a quarter tick's travel (WSR's
//     point sampling may then step past it).
// -> null or { kind: "stick" | "box", part, index (segment start), frac, tick,
//    at [X, Y, Z], vel (u/tick), speed (yd/s), along (yd, horizontal from the
//    path's start), height (u over the pin), offset (u from the axis), n, vn
//    (u/tick toward the surface), e (stick), local (box), grazing, frame }
// "box" is the flag cloth (see the header), not a box at the base.
export function pinCapture(pathWorld, pin, opts = {}) {
  const { ticksPerSample = 1, wind, lie, mode, calmFlag = false, wsr = false } = opts;
  if (lie != null && FLAG.lieSkip.includes(lie)) return null;
  if (mode != null && FLAG.modeSkip.includes(mode)) return null;
  if (!pathWorld || pathWorld.length < 2) return null;
  const useFlag = opts.flag !== false && wind != null;
  const F = useFlag ? flagFrame(pin, wind, { calmFlag }) : null;
  const tps = Math.max(1, Math.round(ticksPerSample));
  let along = 0;
  for (let i = 0; i + 1 < pathWorld.length; i++) {
    const a = pathWorld[i], b = pathWorld[i + 1], seg = sub(b, a), v = mul(seg, 1 / tps), segH = Math.hypot(seg[0], seg[2]);
    for (let k = 1; k <= tps; k++) {
      const p0 = lerp(a, b, (k - 1) / tps), p1 = lerp(a, b, k / tps);
      // the flag first (WSR's order: 0x804147d4 before 0x804147f0), at the tick's end
      let flagHit = null;
      if (F) { const h = flagTest(F, p1); if (h && dot(v, h.n) <= 0) flagHit = h; }
      let stick = null;
      if (wsr) {
        const s = stickSweepTick(pin, p0, p1);
        if (s) stick = { p: s.p, hit: s.hit, frac: (k - 1 + s.frac) / tps };
      } else {
        const s = segStick(pin, p0, p1);
        if (s) { const p = lerp(p0, p1, s.t); stick = { p, hit: stickTest(pin, lerp(p0, p1, Math.min(1, s.t + 1e-9))) || stickTest(pin, p), frac: (k - 1 + s.t) / tps, part: s.part, chord: s.chord }; }
      }
      if (!flagHit && !stick) continue;
      const base = { index: i, vel: v, speed: toYds(len(v)), pin, wind: wind ?? null, frame: F };
      const qstep = len(v) / FLAG.stick.quarters;
      if (flagHit) {
        const at = p1;
        return { kind: "box", part: "flag", ...base, frac: k / tps, tick: i * tps + k, at, along: (along + segH * (k / tps)) / YD,
          height: at[1] - pin[1], offset: hdist(at, pin), n: flagHit.n, vn: -dot(v, flagHit.n), depth: flagHit.depth, local: flagHit.local,
          stickToo: !!stick, grazing: false };
      }
      const hit = stick.hit || { n: [0, 0, 0], depth: 0, part: stick.part };
      return { kind: "stick", part: hit.part ?? stick.part, ...base, frac: stick.frac, tick: i * tps + stick.frac * tps, at: stick.p,
        along: (along + segH * stick.frac) / YD, height: stick.p[1] - pin[1], offset: hdist(stick.p, pin), n: hit.n, depth: hit.depth,
        vn: -dot(v, hit.n), e: stickE(-dot(v, hit.n)), grazing: !wsr && stick.chord != null && stick.chord < qstep };
    }
    along += segH;
  }
  return null;
}

export function pinCaptureFromTrace(path, from, launch, pin, opts = {}) {
  return pinCapture(traceToWorld(path, from, launch), pin, { ticksPerSample: 4, ...opts });
}

// ---- what happens next: a flat-green estimate ----
// From the capture, WSR's flag / stick responses exactly, then a ball on a flat
// green at the pin's height with the cup as a pit: in the air GRAV and DRAG (no
// wind, no lift: the responses zero the spin), on the green a bounce of 0.5
// (B[6]) and a roll losing 0.0002 u/tick^2 (wsr-ground-phase.md 6) and DRAG.
// The cup: a centre inside R - r = 1.0 u of the axis falls to the floor
// (holed); below the surface inside the rim it is held by the wall (holed); on
// the rim (1.0-1.5 u) at a horizontal speed under 0.17 u/tick (WSR's capture
// speed, wsr-ground-phase.md 6) it rolls down the edge (holed, "rim"); faster
// it is treated as rolling over. Not WSR's KCL contact: no slope, no funnel,
// no lip hop; the 3D port or the harness settles the close calls.
// -> { holed, how, rest, restYd, ticks, path (every 4 ticks), events }
export function captureOutcome(cap, pin, opts = {}) {
  if (!cap) return null;
  const F = cap.frame || (opts.wind != null ? flagFrame(pin, opts.wind, opts) : null);
  const r = FLAG.ballR, R = FLAG.cup.R, y0 = pin[1], yRest = y0 + r;
  const st = { p: cap.at.slice(), v: cap.vel.slice() };
  const events = [];
  if (cap.kind === "box") { flagRespond(st, F); events.push({ tick: 0, ev: "flag", v: st.v.slice() }); }
  else { const hit = stickTest(pin, st.p) || { n: cap.n, depth: cap.depth ?? 0 }; const o = stickRespond(st, hit); events.push({ tick: 0, ev: "stick", e: o.e, v: st.v.slice() }); }
  const path = [st.p.slice()];
  let onGround = st.p[1] <= yRest + 1e-6 && hdist(st.p, pin) > R, still = 0;
  const done = (holed, how, t) => ({ holed, how, rest: st.p.slice(), restYd: hdist(st.p, pin) / YD, ticks: t, path, events });
  for (let t = 1; t <= 4000; t++) {
    const p0 = st.p.slice();
    if (!onGround) st.v[1] -= GRAV;
    st.v = mul(st.v, DRAG);
    if (onGround) {
      const h = Math.hypot(st.v[0], st.v[2]), dec = 0.0002;
      if (h <= dec) { st.v[0] = 0; st.v[2] = 0; } else { st.v[0] *= 1 - dec / h; st.v[2] *= 1 - dec / h; }
    }
    st.p = add(st.p, st.v);
    if (F && flagRespond(st, F)) events.push({ tick: t, ev: "flag" });
    const sw = stickSweepTick(pin, p0, st.p);
    if (sw) { st.p = sw.p; const o = stickRespond(st, sw.hit); events.push({ tick: t, ev: "stick", e: o.e }); }
    const rho = hdist(st.p, pin), vh = Math.hypot(st.v[0], st.v[2]);
    if (rho <= R - r && st.p[1] <= yRest) { if (st.p[1] <= y0 - FLAG.cup.D + r) return done(true, "floor", t); onGround = false; }
    else if (rho <= R && st.p[1] < y0) return done(true, "wall", t);
    else if (rho <= R && st.p[1] <= yRest && vh < 0.17 && st.v[1] <= 0) return done(true, "rim", t);
    else if (rho > R && st.p[1] <= yRest) {
      st.p[1] = yRest;
      if (st.v[1] < -0.01) { st.v[1] = -0.5 * st.v[1]; onGround = false; events.push({ tick: t, ev: "bounce" }); }
      else { st.v[1] = 0; onGround = true; }
    } else if (rho > R && st.p[1] > yRest + 1e-6) onGround = false;
    if (t % 4 === 0) path.push(st.p.slice());
    if (onGround && len(st.v) < 0.0015) { if (++still >= 20) return done(false, "rest", t); } else still = 0;
  }
  return done(false, "timeout", 4000);
}

// whether WSR holes it (the flat-green estimate above): the flag drops the
// ball near the stick, the stick bounces it back at 0.7 of its approach speed
export function capturedIs(cap, pin = cap?.pin, opts = {}) {
  if (!cap) return false;
  const p = pin || cap.pin;
  if (!p) throw new Error("capturedIs needs the pin");
  return captureOutcome(cap, p, opts).holed;
}
