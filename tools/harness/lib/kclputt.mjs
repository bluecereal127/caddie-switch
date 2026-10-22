// WSR's putt over a green's own KCL triangles: src/wsrsim.js's tick (gravity
// along the bisector of the ring's smoothed normal, drag, the contact impulse
// with the A / B tables per attribute, the four-tick normal ring, the stop
// rule) with one contact a tick, the triangle whose interior the ball's centre
// projects into, the deepest. The steep-cup pilot (tools/harness/REPORT.md
// 5.4) built it in its analysis scratchpad as fastport.mjs: on 570 traced
// putts on nine cups from 0.9 to 13.1 deg its path stayed a median 0.025 yd
// (p90 0.078) from WSR's, its read verdicts agreed with WSR on 1,017 of 1,040
// putts against the app's 849, and a strength-forgiving read made with it
// holed its own putt in WSR from 56 of 58 steep spots against the app's 39.
// The cup is src/putt.js's measured window on the path (the port has no rim).
// KCL water triangles lying level inside a green (H4 1, H8 2, H19 1) roll as
// green, as WSR's ball rolls over them.
import { YD } from "./course.mjs";

const A_TAB = [0.3, 0.4, 0.5, 1.0, 0.7, 1.0, 0.15, 1.0, 1.0, 0.3, 0.001, 0.3, 0.3, 1.0, 0.1, 0.4, 1.0];
const B_TAB = [0.5, 0.5, 0.4, 0.001, 0.3, 0.001, 0.5, 0.001, 0.001, 0.5, 0.13, 0.5, 0.5, 0.001, 0.5, 0.5, 0.001];
const CONTACT_MASK = 0x1de5e, STOP_MASK = 0x1ce5e;

// water triangles (attr 7) sharing two vertices with the green or fringe at
// their height: a green's embedded water, which WSR rolls over as green
const greenWater = new WeakMap();
export function embeddedWater(m) {
  let s = greenWater.get(m);
  if (s) return s;
  s = new Set();
  const gv = new Map();
  for (let t = 0; t < m.nt; t++) {
    if (m.attr[t] !== 6 && m.attr[t] !== 9) continue;
    for (let k = 0; k < 3; k++) { const o = 9 * t + 3 * k; gv.set(`${m.tri[o].toFixed(1)},${m.tri[o + 2].toFixed(1)}`, m.tri[o + 1]); }
  }
  for (let t = 0; t < m.nt; t++) {
    if (m.attr[t] !== 7) continue;
    let shared = 0;
    for (let k = 0; k < 3; k++) { const o = 9 * t + 3 * k; const v = gv.get(`${m.tri[o].toFixed(1)},${m.tri[o + 2].toFixed(1)}`); if (v != null && Math.abs(v - m.tri[o + 1]) < 1.5) shared++; }
    if (shared >= 2) s.add(t);
  }
  greenWater.set(m, s);
  return s;
}

// a green's triangles round (cx, cz) within R u, as flat arrays on a 1 yd grid
export function packGreen(m, cx, cz, R, embedded = embeddedWater(m)) {
  const ids = [];
  for (let t = 0; t < m.nt; t++) {
    const a = embedded.has(t) ? 6 : m.attr[t];
    if (!((1 << a) & CONTACT_MASK)) continue;
    const o = 9 * t;
    const x = (m.tri[o] + m.tri[o + 3] + m.tri[o + 6]) / 3, z = (m.tri[o + 2] + m.tri[o + 5] + m.tri[o + 8]) / 3;
    if (Math.hypot(x - cx, z - cz) < R) ids.push(t);
  }
  const n = ids.length, V = new Float64Array(9 * n), N = new Float64Array(3 * n), E = new Float64Array(9 * n), ATT = new Uint8Array(n);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  ids.forEach((t, k) => {
    for (let j = 0; j < 9; j++) V[9 * k + j] = m.tri[9 * t + j];
    for (let j = 0; j < 3; j++) N[3 * k + j] = m.nrm[3 * t + j];
    ATT[k] = embedded.has(t) ? 6 : m.attr[t];
    // the edges' outward in-plane normals (e x n, away from the third vertex)
    for (let e = 0; e < 3; e++) {
      const i = 9 * k + 3 * e, j = 9 * k + 3 * ((e + 1) % 3), c = 9 * k + 3 * ((e + 2) % 3);
      const ex = V[j] - V[i], ey = V[j + 1] - V[i + 1], ez = V[j + 2] - V[i + 2];
      const n0 = N[3 * k], n1 = N[3 * k + 1], n2 = N[3 * k + 2];
      let qx = ey * n2 - ez * n1, qy = ez * n0 - ex * n2, qz = ex * n1 - ey * n0;
      const ql = Math.hypot(qx, qy, qz) || 1; qx /= ql; qy /= ql; qz /= ql;
      if ((V[c] - V[i]) * qx + (V[c + 1] - V[i + 1]) * qy + (V[c + 2] - V[i + 2]) * qz > 0) { qx = -qx; qy = -qy; qz = -qz; }
      E[9 * k + 3 * e] = qx; E[9 * k + 3 * e + 1] = qy; E[9 * k + 3 * e + 2] = qz;
    }
    for (let v = 0; v < 3; v++) { x0 = Math.min(x0, V[9 * k + 3 * v]); x1 = Math.max(x1, V[9 * k + 3 * v]); z0 = Math.min(z0, V[9 * k + 3 * v + 2]); z1 = Math.max(z1, V[9 * k + 3 * v + 2]); }
  });
  const cell = YD, gw = Math.ceil((x1 - x0) / cell) + 1, gh = Math.ceil((z1 - z0) / cell) + 1;
  const lists = Array.from({ length: gw * gh }, () => []);
  for (let k = 0; k < n; k++) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let v = 0; v < 3; v++) { a = Math.min(a, V[9 * k + 3 * v]); b = Math.max(b, V[9 * k + 3 * v]); c = Math.min(c, V[9 * k + 3 * v + 2]); d = Math.max(d, V[9 * k + 3 * v + 2]); }
    for (let gx = Math.floor((a - 0.3 - x0) / cell); gx <= Math.floor((b + 0.3 - x0) / cell); gx++)
      for (let gz = Math.floor((c - 0.3 - z0) / cell); gz <= Math.floor((d + 0.3 - z0) / cell); gz++) if (gx >= 0 && gz >= 0 && gx < gw && gz < gh) lists[gz * gw + gx].push(k);
  }
  const start = new Int32Array(gw * gh + 1), flat = [];
  for (let i = 0; i < gw * gh; i++) { start[i] = flat.length; for (const k of lists[i]) flat.push(k); }
  start[gw * gh] = flat.length;
  return { n, V, N, E, ATT, x0, z0, cell, gw, gh, start, cells: Int32Array.from(flat) };
}

// one putt from ball [x, y, z] (KCL u) at heading (rad), launch speed v0
// (u/tick); with cup [x, z] and window(v yd/s) -> yd, the tick whose segment
// comes within window(its speed) of the cup's centre holes it (src/putt.js's
// rule on the port's own path). -> { ticks, reason, stop, holed, best }
export function fastPutt(g, ball, heading, v0, maxTicks = 7200, cup = null, window = null) {
  let holed = false, best = Infinity;
  const { V, N, E, ATT, x0, z0, cell, gw, gh, start, cells } = g;
  let px = ball[0], py = ball[1], pz = ball[2], vx = Math.sin(heading) * v0, vy = 0, vz = Math.cos(heading) * v0;
  const rN = new Float64Array(12), rA = new Uint8Array(4);
  let ri = 0, nx = 0, ny = 1, nz = 0, attrMax = 0, stop = 0, life = 0, reason = "ticks";
  let qx = px, qy = py, qz = pz, cD = 0;
  const contact = (x, y, z) => {
    const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
    if (gx < 0 || gz < 0 || gx >= gw || gz >= gh) return -1;
    let bestK = -1;
    cD = 0;
    for (let s = start[gz * gw + gx], e = start[gz * gw + gx + 1]; s < e; s++) {
      const k = cells[s], o = 9 * k;
      const n0 = N[3 * k], n1 = N[3 * k + 1], n2 = N[3 * k + 2];
      const dist = (x - V[o]) * n0 + (y - V[o + 1]) * n1 + (z - V[o + 2]) * n2, depth = 0.5 - dist;
      if (depth <= 0 || dist < -0.5) continue;
      const pX = x - dist * n0, pY = y - dist * n1, pZ = z - dist * n2;
      if ((pX - V[o]) * E[o] + (pY - V[o + 1]) * E[o + 1] + (pZ - V[o + 2]) * E[o + 2] > 0) continue;
      if ((pX - V[o + 3]) * E[o + 3] + (pY - V[o + 4]) * E[o + 4] + (pZ - V[o + 5]) * E[o + 5] > 0) continue;
      if ((pX - V[o + 6]) * E[o + 6] + (pY - V[o + 7]) * E[o + 7] + (pZ - V[o + 8]) * E[o + 8] > 0) continue;
      if (depth > cD) { cD = depth; bestK = k; }
    }
    return bestK;
  };
  {
    const k = contact(px, py, pz);
    if (k >= 0) for (let i = 0; i < 4; i++) { rN[3 * i] = N[3 * k]; rN[3 * i + 1] = N[3 * k + 1]; rN[3 * i + 2] = N[3 * k + 2]; rA[i] = ATT[k]; }
    else for (let i = 0; i < 4; i++) rN[3 * i + 1] = 1;
    if (k >= 0) { nx = N[3 * k]; ny = N[3 * k + 1]; nz = N[3 * k + 2]; attrMax = ATT[k]; }
  }
  while (life < maxTicks) {
    life++;
    const air = life < 8 || attrMax === 0;
    let ux = 0.5 * nx, uy = 0.5 * ny + 0.5, uz = 0.5 * nz;
    const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (ul > 1.17549435e-38) { ux /= ul; uy /= ul; uz /= ul; } else { ux = 0; uy = 1; uz = 0; }
    vx -= 0.002 * ux; vy -= 0.002 * uy; vz -= 0.002 * uz;
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
    if (cup) {
      const ex = px - qx, ez = pz - qz, L2 = ex * ex + ez * ez;
      const f = L2 > 0 ? Math.min(1, Math.max(0, ((cup[0] - qx) * ex + (cup[1] - qz) * ez) / L2)) : 0;
      const cx = qx + f * ex - cup[0], cz = qz + f * ez - cup[1], d = Math.hypot(cx, cz) / YD, v = (Math.sqrt(L2) * 240) / YD;
      if (d < best) best = d;
      if (window && v < 4.45 && d <= window(v)) { holed = true; reason = "holed"; break; }
    }
    qx = px; qy = py; qz = pz;
    const k = contact(px, py, pz);
    let at = 0;
    if (k >= 0) {
      const a = ATT[k], n0 = N[3 * k], n1 = N[3 * k + 1], n2 = N[3 * k + 2];
      if (vy < 0.25) at = a;
      const vdn = vx * n0 + vy * n1 + vz * n2;
      let dvx = 0, dvy = 0, dvz = 0;
      if (!(-vdn < 0)) {
        const vn = -vdn, A = A_TAB[a], B = B_TAB[a];
        const t0 = vx - n0 * vdn, t1 = vy - n1 * vdn, t2 = vz - n2 * vdn, tm = Math.sqrt(t0 * t0 + t1 * t1 + t2 * t2), cap = vn * A;
        const f = tm > cap ? cap / tm : 1;
        dvx = -(1 + B) * n0 * vdn - t0 * f; dvy = -(1 + B) * n1 * vdn - t1 * f; dvz = -(1 + B) * n2 * vdn - t2 * f;
      }
      px += n0 * cD; py += n1 * cD; pz += n2 * cD;
      vx += dvx; vy += dvy; vz += dvz;
      rN[3 * ri] = n0; rN[3 * ri + 1] = n1; rN[3 * ri + 2] = n2;
    } else { rN[3 * ri] = 0; rN[3 * ri + 1] = 1; rN[3 * ri + 2] = 0; }
    rA[ri] = at;
    ri = (ri + 1) & 3;
    attrMax = Math.max(rA[0], rA[1], rA[2], rA[3]);
    const s0 = rN[0] + rN[3] + rN[6] + rN[9], s1 = rN[1] + rN[4] + rN[7] + rN[10], s2 = rN[2] + rN[5] + rN[8] + rN[11];
    const sl = Math.sqrt(s0 * s0 + s1 * s1 + s2 * s2);
    if (sl > 1e-9) { nx = s0 / sl; ny = s1 / sl; nz = s2 / sl; } else { nx = 0; ny = 1; nz = 0; }
  }
  return { ticks: life, reason, stop: [px, py, pz], holed, best };
}
