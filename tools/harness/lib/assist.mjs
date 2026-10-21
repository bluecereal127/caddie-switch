// WSR's hidden pin-power assist on partial swings (tools/research/
// wsr-swing-redzone-spin.md section 3.5) and the aim table it reads
// (tools/research/wsr-harness-decodes.md section 1). The table lives in the
// club manager: while the player addresses the ball (pm+0x674, +0x675 set,
// player+0xbc = 0, i.e. A not held, pm+0x8a8 = 0) the builder 0x8040854c
// launches 257 simulated balls at powers i/256 along the live aim, stepping
// 160 ball ticks per frame, and keeps the power whose smoothed rest is
// nearest the pin. It freezes on the first A-held frame. On every state-1
// frame after the real shot (swing+0xe4 set) 0x8041e664 pulls p2 toward that
// power (0x80407d08); the shot flies with the last frame's value.
import { pointers } from "./wsr.mjs";
import { sleep } from "./dsu.mjs";

export const AIM = {
  exact: 0x34,       // f32[257]: the sim result for power p/256 (KCL units to the pin)
  smooth: 0x43c,     // f32[257]: the 11-tap smoothed results, recomputed on every builder call
  progress: 0x1878,  // s32: -9999 reset, k = sims completed, 257 = complete
  best: 0x187c,      // f32: the best smoothed distance, 9999 = none
  bestIdx: 0x1880,   // s32: its power index (0..256)
};
export const RESET = 0xffffd8f1;   // -9999 as s32
export const ASSIST_REACH = 300;   // u: the assist acts only when the best distance is below (32.8 yd)

export async function readAimTable(gdb, p, { arrays = false } = {}) {
  const b = await gdb.readMem(p.clubManager + AIM.progress, 12);
  const t = { progress: b.readInt32BE(0), best: b.readFloatBE(4), bestIdx: b.readInt32BE(8) };
  if (arrays) {
    for (const k of ["exact", "smooth"]) {
      const a = await gdb.readMem(p.clubManager + AIM[k], 257 * 4);
      t[k] = Array.from({ length: 257 }, (_, i) => a.readFloatBE(4 * i));
    }
  }
  return t;
}

// Rebuild the table for the live club, aim, wind, ball and pin: a reset
// (only the heading setter, the aim-line setter and the D-pad club change
// reset it in play; direct writes of the club, aim or wind do not) and the
// game run with no button held until the build completes, about 1,500-2,700
// frames for a fairway landing (the port's tick counts / 160).
export async function buildAimTable(s, { timeoutMs = 900000, pollMs = 1500 } = {}) {
  await s.paused(async (gdb) => { const p = await pointers(gdb); await gdb.setU32(p.clubManager + AIM.progress, RESET); });
  const t0 = Date.now();
  for (;;) {
    await sleep(pollMs);
    const t = await s.paused(async (gdb) => readAimTable(gdb, await pointers(gdb)));
    if (t.progress === 257) {
      const full = await s.paused(async (gdb) => readAimTable(gdb, await pointers(gdb), { arrays: true }));
      return { ...full, ms: Date.now() - t0 };
    }
    if (Date.now() - t0 > timeoutMs) throw new Error(`aim table at ${t.progress} of 257 after ${timeoutMs} ms`);
  }
}

// The assist as decoded: p3 from p2, the table (p_pin = bestIdx / 256, best
// in KCL units), the lie cap and the backspin s7c * P1c.
//   f29 = p2                                   if p2 >= cap or best >= 300 u
//         p2 + (1 - w) cap (p_pin - p2)        otherwise
//   w   = clamp(0.5 + 0.5 (|p2 - p_pin| / 0.3)^log2(1000), 0.5, 1), and when a
//         simulated power holes out (best = 0) the smaller of that and
//         clamp(0.01 + 0.99 (|p2 - p_pin| / 0.05)^log2(20), 0.01, 1): within
//         0.05 of the holing run's middle the swing is pulled up to 99 % of
//         the way into it (0x80409a30, r3 = the holed flag; live on hole 1's
//         7-iron, p2 0.6029 -> 0.6293 and 0.6629 -> 0.6364 around p_pin 0.6328)
//   p3  = f29                                  if f29 >= p2 (the swing short of the pin's power)
//         f29 + (p2 - f29) clamp(s7c P1c, 0, 0.5) / 0.5   if past it
const curve = (x, k) => (Math.abs(x) < 0.001 ? 0 : Math.pow(Math.abs(x), Math.log2(1 / k)));   // 0x803ef330
export function assistP3({ p2, pPin, best, cap = 1, spin = 0 }) {
  if (p2 >= cap || !(best < ASSIST_REACH)) return { f29: p2, p3: p2, w: 1 };
  const d = Math.abs(p2 - pPin);
  let w = Math.min(Math.max(0.5 + 0.5 * curve(d / 0.3, 0.001), 0.5), 1);
  if (best === 0) w = Math.min(w, Math.min(Math.max(0.01 + 0.99 * curve(d / 0.05, 0.05), 0.01), 1));
  const f29 = Math.max(0, p2 + (1 - w) * cap * (pPin - p2));
  const p3 = f29 >= p2 ? f29 : f29 + (p2 - f29) * Math.min(Math.max(spin, 0), 0.5) / 0.5;
  return { f29, p3, w };
}
