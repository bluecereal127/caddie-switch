// Playing a hole out for real, to reach the next hole's tee: every stroke is
// an injected shot (lib/shot.mjs) whose club, power and aim the port chooses
// by flying src/wsrsim.js over the KCL triangles toward the pin (the port
// reproduces WSR's carry and rest to 0.1-0.8 yd on hole 10's tee line,
// results/h10-irons.json), and the ball has to go in the cup by itself:
// approach shots, then putts until it drops. No position is ever written.
//
// Strokes: out of reach of the pin, the longest club at its lie's cap along
// the game's own default line for the stroke (the aim the shot setup left in
// player+0x84; the tee's is the start's facing); in reach, the club and power
// whose port stop over the KCL line is nearest the pin (lofted clubs first,
// 0.01 power steps, the lie's cap); on the green or fringe, the putter aimed
// at the cup with a power that rolls the port's ball 0.4 yd past it.

import { YD, kcl, groundAt, kclProfile, simOf } from "./course.mjs";
import { pointers, readBall, PLAYER, CLUBS, PTR } from "./wsr.mjs";
import { run } from "../../lib/wsrsim.mjs";
import { sleep } from "./dsu.mjs";

// lie caps (wsr-club-physics.md 3: rough P48 0.75; bunker P50 by club)
const BUNKER_CAP = { driver: 0.25, spoon: 0.25, "3iron": 0.5, "5iron": 0.5, "7iron": 0.5, "9iron": 0.5, wedge: 0.75 };
const capOf = (club, lie) => (lie === 2 ? 0.75 : lie === 3 || lie === 16 ? BUNKER_CAP[club] : 1.0);
const SURF = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 15: "fairway", 16: "bunker" };

// the wind relative to a shot for the port: deg 0 = tail, 90 = toward the right
function windFor(st, dx, dz) {
  if (!st.wind.speedIdx) return null;
  const a = st.wind.angle, wx = Math.sin(a), wz = Math.cos(a);
  return { mph: 2 * st.wind.speedIdx, deg: (Math.atan2(wx * -dz + wz * dx, wx * dx + wz * dz) * 180) / Math.PI };
}

export async function planStroke(hole, st) {
  const ball = st.ball.pos, pin = st.pin;
  const lie = st.player.lie;
  let dx = pin[0] - ball[0], dz = pin[2] - ball[2];
  const D = Math.hypot(dx, dz) / YD;
  dx /= D * YD; dz /= D * YD;
  const toPin = Math.atan2(dx, dz);
  if (lie === 6 || lie === 9 || lie === 10 || lie === 11) {
    // putt: straight at the cup, rolling 0.4 yd past it on the port's green
    const prof = await kclProfile(hole, ball[0], ball[2], dx, dz, { step: 0.1 });
    let lo = 0.02, hi = 2.5;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const o = run({ club: "putter", q: mid, surface: "green", profile: prof ? simOf(prof) : null, trace: false });
      if (o.stop < D + 0.4) lo = mid; else hi = mid;
    }
    return { club: "putter", power: (lo + hi) / 2, heading: toPin, why: `putt ${D.toFixed(1)} yd` };
  }
  const prof = await kclProfile(hole, ball[0], ball[2], dx, dz);
  const wind = windFor(st, dx, dz);
  const clubs = lie === 3 || lie === 16 ? ["wedge", "9iron", "7iron", "5iron", "3iron"] : ["wedge", "9iron", "7iron", "5iron", "3iron", "spoon", "driver"];
  let best = null;
  for (const club of clubs) {
    const cap = capOf(club, lie);
    for (let q = Math.min(cap, 1); q >= 0.1 - 1e-9; q -= 0.01) {
      const o = run({ club, q, surface: SURF[lie] ?? "fairway", profile: prof ? simOf(prof) : null, wind, trace: false });
      const err = Math.abs(o.stop - D);
      // prefer the more lofted club when two are as close (they stop with less roll)
      if (!best || err < best.err - 0.5) best = { club, power: +q.toFixed(2), heading: toPin, err, stop: o.stop };
    }
  }
  if (best.err < 15) {
    // aim off the wind: the port's own lateral drift (yd, + right of the
    // line) over D; a larger heading turns the aim left (aim = (sin h, cos h)
    // in x east / z south). Stroke 2 of hole 10 without this: 5.9 yd left of
    // the pin in a 4 mph crosswind.
    const o = run({ club: best.club, q: best.power, surface: SURF[lie] ?? "fairway", profile: prof ? simOf(prof) : null, wind, trace: false });
    const heading = toPin + (o.lateral ?? 0) / D;
    return { ...best, heading, drift: o.lateral, why: `approach ${D.toFixed(0)} yd, port stop ${best.stop.toFixed(1)}, aim off ${(o.lateral ?? 0).toFixed(1)} yd` };
  }
  // out of reach: the longest club allowed, at its cap, along the game's own line
  const club = lie === 3 || lie === 16 ? "3iron" : "driver";
  const aim = st.player.aim;
  return { club, power: capOf(club, lie), heading: Math.atan2(aim[0], aim[1]), why: `layup, pin ${D.toFixed(0)} yd out of reach` };
}

// until the next stroke can be taken on this hole (or the hole has moved on)
export async function waitStroke(s, hole, { maxSteps = 80 } = {}) {
  for (let i = 0; i < maxSteps; i++) {
    const r = await s.paused(async (gdb) => {
      try {
        const pm = await gdb.u32(PTR.playerManager), cfg = await gdb.u32(PTR.glfConfig);
        const f = await gdb.readMem(pm + 0x674, 2), tut = (await gdb.readMem(pm + 0x8a8, 1))[0];
        const h = (await gdb.readMem(cfg + 0xc, 4)).readInt32BE(0) + 1;
        const p = await pointers(gdb);
        const b = await readBall(gdb, p.ball);
        const swState = await gdb.u32(p.swing + 0x30);
        return { hole: h, ready: f[0] === 1 && f[1] === 1 && !tut && !b.moving && (swState === 0 || swState === 3), tut,
          fields: { hole: h, f674: f[0], f675: f[1], tut, moving: b.moving, life: b.life, swState } };
      } catch { return null; }
    });
    if (r && r.hole !== hole) return { moved: true, hole: r.hole };
    if (r?.ready) return { ready: true };
    if (i % 5 === 4 && s.log) s.log(`  waiting for a stroke on hole ${hole}: ${JSON.stringify(r?.fields ?? r)}`);
    // advance dialogs: A+B (a brief press at address arms nothing); minus quits the tutorial
    s.dsu.setButtons(0, ["Cross", "Circle"], true); await sleep(250); s.dsu.setButtons(0, ["Cross", "Circle"], false);
    await sleep(1500);
    if (r?.tut) { await s.dsu.tap(0, "L1", 250); await sleep(1000); }
  }
  throw new Error(`hole ${hole}: no stroke ready`);
}

// play the current hole until the ball is holed; returns the strokes
export async function playHole(s, hole, { log = console.log, maxStrokes = 12 } = {}) {
  const strokes = [];
  for (let k = 0; k < maxStrokes; k++) {
    const w = await waitStroke(s, hole);
    if (w.moved) return { holed: true, strokes, next: w.hole };
    const st = await s.state();
    const plan = await planStroke(hole, st);
    const shot = await s.shoot({ power: plan.power, club: plan.club, heading: plan.heading, trace: false, untilRest: "predicted" });
    const b = shot.ball;
    const toPin = Math.hypot(b.rest[0] - st.pin[0], b.rest[2] - st.pin[2]) / YD;
    strokes.push({ ...plan, from: st.ball.pos, lie: st.player.lie, rest: b.rest, holed: b.holeFrame >= 0, toPin });
    log(`hole ${hole} stroke ${k + 1}: ${plan.why}: ${plan.club} ${plan.power.toFixed(2)} -> ${b.holeFrame >= 0 ? "HOLED" : `${toPin.toFixed(1)} yd from the pin`}`);
    if (b.holeFrame >= 0) {
      // let the ball drop and the game move on
      const w2 = await waitStroke(s, hole, { maxSteps: 60 }).catch(() => null);
      return { holed: true, strokes, next: w2?.hole };
    }
  }
  throw new Error(`hole ${hole}: not holed in ${maxStrokes} strokes`);
}
