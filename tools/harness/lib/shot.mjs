// One injected shot in a running WSR, through the GDB stub, from a stopped
// CPU at address (state 0) to the ball at rest. No Wii Remote motion is
// involved: the harness sets the trigger's inputs at the state-0 test, and
// from then on the game's own code launches, flies, bounces and rolls the
// ball; the harness only holds the launch power and writes the spins.
//
// The fields (tools/research/wsr-swing-redzone-spin.md, wsr-ground-phase.md,
// checked against main.dol and the live game, tools/harness/lib/wsr.mjs):
// - trigger (0x80421254-0x804212b8): state 0 -> 1 when the follower's g
//   (follower+4) is >= 0.5, its previous value swing+0x14 is < 0.5, and
//   swing+0x28 > swing+0x2c; the game's own transition then writes state 1,
//   the timer, s7c = 0 and s1c. The shot fires on the next frame.
// - power: 0x80421364 stores min(p3, lie factor) into swing+0x98 on every
//   state-1 frame; the real shot 0x8041210c and the per-frame relaunch
//   0x8041490c read it, so it is rewritten right after that store
//   (0x80421368) on every state-1 frame.
// - spins: the hand-off 0x80414854 stores ball+0x9c (side) and +0xa0
//   (backspin) and the spin tick ball+0x58 (0x804148a0, from the lifetime),
//   then copies the ball into the look-ahead balls; the spins are rewritten
//   at 0x8041489c, before the tick's store and the copy.
// - aim: the launch rotates player+0x84 (x, z) = (sin h, cos h) by the lie
//   yaw (0 on tee and fairway); h = player+0x80 (pi = north, -z).
// - wind: field manager+0x78 -> wind object; physics reads +0x10 (speed
//   index, 2 mph each) and +8 (angle = dir * pi/4, dir 0 = +z south,
//   2 = +x east); 0x803ed620 writes +4, +8, +0xc, +0x10 together.
// - trace: 0x80410cfc runs once per tick right after the real ball's step
//   (0x80410cbc steps ballMgr+0x12c4 only, and only once the swing is
//   detached, i.e. after the hand-off).

import { PTR, CODE, BALL, SWING, PLAYER, CLUBS, pointers, readBall } from "./wsr.mjs";
import { REG, F } from "./gdb.mjs";

export const TRACE_PC = 0x80410cfc;
// the raw swing value, in the state-1 block of 0x80420d84: 0x80421310 bl
// 0x80422308 returns it in f1 and 0x80421314 stores it to swing+0x88; p1 =
// slot 7 (0x80409f60) of it, p2 the lie cap (0x8041e794), p3 the pin assist
// (0x8041e664), power = min(p3, lie factor) at 0x80421364
export const RAW_STORE = 0x80421314;
export const TREE_QUERY = 0x804138d4;   // after bl 0x80401ac0 in the tree check
// The state-1 window (tools/research/wsr-harness-decodes.md section 3): it
// ends after ceil(n) frames, n = clamp(18 + 28 (1.25 - raw), 18, 25), or as
// soon as the follower's velocity (follower+8, this frame's spring output) is
// negative (0x8042144c). The injected trigger leaves the follower settling
// down onto the rested remote, so without help the window closes after one
// frame: the shot fires on that frame (p3 = p2 there) and the pin assist,
// which acts only on the later frames (swing+0xe4 set), never runs. A human
// follow-through keeps the velocity up. 0x80421338 is after the p2 store
// (0x80421334) and before p3 (0x8041e664 reads p2 and s7c from memory),
// after this frame's spring: holding the velocity at >= 0 there keeps the
// window open to its timer, and s7c written there is what p3 reads.
export const WINDOW_HOLD = 0x80421338;
const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatBE(v); return b; };
const vec3 = (b, o) => [b.readFloatBE(o), b.readFloatBE(o + 4), b.readFloatBE(o + 8)];

export async function setWind(gdb, p, { dir, speedIdx }) {
  const angle = Math.fround(2 * Math.PI * Math.fround(dir) * 0.125);
  const b = Buffer.alloc(0x10);
  b.writeFloatBE(angle, 0); b.writeFloatBE(angle, 4); b.writeFloatBE(speedIdx, 8); b.writeInt32BE(speedIdx, 0xc);
  await gdb.writeMem(p.wind + 4, b);
}

export async function setAim(gdb, p, heading) {
  const b = Buffer.alloc(12);
  b.writeFloatBE(heading, 0); b.writeFloatBE(Math.sin(heading), 4); b.writeFloatBE(Math.cos(heading), 8);
  await gdb.writeMem(p.player + PLAYER.heading, b);
}

export async function setClub(gdb, p, club) {
  const idx = typeof club === "number" ? club : CLUBS.indexOf(club);
  if (idx < 0 || idx > 7) throw new Error(`no club ${club}`);
  await gdb.setU32(p.clubManager + 0x2c, idx);
  return idx;
}

// resume and return the PC of the next stop
async function runTo(gdb, timeoutMs) {
  const st = await gdb.cont(timeoutMs);
  return st.pc;
}

// The raw swing value that makes the game's own pipeline give launch power
// `power` (wsr-swing-redzone-spin.md 3.1, slot 7 0x80409f60 read live):
// p2 = p1 * cap on a capped lie (p1 <= 1); p1 = max(P3c, P3c + (1 - P3c) u^log2(1/P34)),
// u = (raw - P3c)/(1 - P3c), P34 = block+0x34, P3c = block+0x3c; the putter's
// curve is linear (P34 0.5, P3c 0.05) and its p1 runs past 1 to 2.5 (P40 1,
// P44 1.25 make the raw >= 1 branch linear too). cap: rough P48 (+0x48),
// bunker P50 (+0x50), any other lie 1 (slot 16 0x80409cb0).
async function rawFor(gdb, p, power) {
  const cm = await gdb.readMem(p.clubManager, 0x30);
  const club = await gdb.u32(p.clubManager + 0xc + 4 * cm.readInt32BE(0x2c));
  const type = await gdb.u32(club + 4);
  const blk = await gdb.readMem(await gdb.u32(club + 0x18), 0x60);
  const P34 = blk.readFloatBE(0x34), P3c = blk.readFloatBE(0x3c);
  const lie = (await gdb.readMem(p.player + PLAYER.lie, 2)).readUInt16BE(0);
  const cap = lie === 2 ? blk.readFloatBE(0x48) : lie === 3 ? blk.readFloatBE(0x50) : 1;
  const p1 = power / cap;
  if (type === 3) return { raw: Math.max(p1, P3c), cap, type };
  const u = Math.pow(Math.max(0, (Math.min(p1, 1) - P3c) / (1 - P3c)), 1 / Math.log2(1 / P34));
  return { raw: P3c + (1 - P3c) * u, cap, type };
}

/**
 * opts: { power (0..1, the launch power swing+0x98), club, heading, wind {dir, speedIdx},
 *         powerMode: "hold" (default: the raw value fed so the game's own pipeline and
 *           gauge show the power, and the result held so the pin assist cannot move it)
 *           or "game" (the raw value only: the game computes p1..p3 itself, its hidden
 *           pin-power assist included, as for a human swing),
 *         side (ball+0x9c), back (ball+0xa0), trace (bool), maxTicks, timeoutMs,
 *         holdWindow (keep the state-1 window open to its timer, WINDOW_HOLD above; the
 *           per-frame p2, p3 and power are recorded in out.window),
 *         s7c (with holdWindow: the swing's backspin input swing+0x7c, 0..1, written on
 *           every state-1 frame before p3 reads it) }
 * The CPU must be stopped. Returns the launch, the hand-off, the trace and the rest.
 */
export async function shoot(gdb, opts) {
  try { return await shoot1(gdb, opts); } finally {
    if (opts.dsu) opts.dsu.setButtons(0, [A_BUTTON, B_BUTTON], false);
    await gdb.clearBreaks();
  }
}

// The Wii Remote's A button (DSU slot 0 "Cross", tools/harness/lib/dolphin.mjs):
// WSR golf swings only with A held. The player update (0x803fadd8-0x803faea8)
// counts the frames A has been held (bit 0x800 of the controller state) in
// playerManager+0x678 and fires the real shot only when that count is > 20
// (0x803faf74); without A a swing is a practice swing.
const A_BUTTON = "Cross";
const PM_AHELD = 0x678;
// The address reference: with B held (bit 0x400) and the remote steady
// (0x80423e78), the swing driver 0x80422d70 calls 0x804233bc, which takes the
// remote's current orientation as address and sets motion+0x60 = 1 (motion =
// swing+0xc). The A count above also needs that flag on every frame
// (0x803fcb34 -> 0x804226e8, else the count is reset, 0x803faf04-0x803faf14).
const B_BUTTON = "Circle";
const MOTION_READY = 0x60;

async function shoot1(gdb, opts) {
  const { power, side = 0, back = 0, trace = true, maxTicks = 9000, timeoutMs = 120000 } = opts;
  const p = await pointers(gdb);
  if (opts.club != null) await setClub(gdb, p, opts.club);
  if (opts.heading != null) await setAim(gdb, p, opts.heading);
  if (opts.wind) await setWind(gdb, p, opts.wind);
  const out = { power, side, back, club: opts.club, heading: opts.heading, wind: opts.wind, events: [] };

  // 1. the trigger, at the state-0 test of the current player's swing. The
  // byte player+0x7c disables the swing logic (0x803fcd44 passes it to
  // 0x80422d70 as r5, which then only resets the swing) until the motion
  // object's "held at address" flag (swing+0xc -> +0x60) clears it; nothing
  // sets it again at address (it is set for a finished swing, the putter's
  // stroke, or a ball past its apex), so one write enables the swing.
  await gdb.setU8(p.player + PLAYER.swingOff, 0);
  if (!opts.dsu) throw new Error("shoot needs opts.dsu to hold the A and B buttons");
  const motion = await gdb.u32(p.swing + 0xc);
  const follower = await gdb.u32(p.swing + SWING.follower);
  const hold = !!opts.holdWindow;
  if (opts.s7c != null && !hold) throw new Error("s7c needs holdWindow (it is written on the state-1 frames)");
  await gdb.addBreak(CODE.swingState0);
  // B until the address reference is taken
  opts.dsu.setButtons(0, B_BUTTON, true);
  for (let i = 0; ; i++) {
    await runTo(gdb, 20000);
    if ((await gdb.reg(27)) !== p.swing) continue;
    if ((await gdb.readMem(motion + MOTION_READY, 1))[0]) { out.bFrames = i; break; }
    if (i > 600) throw new Error("B did not set the address reference");
  }
  opts.dsu.setButtons(0, B_BUTTON, false);
  // then A for more than 20 frames
  opts.dsu.setButtons(0, A_BUTTON, true);
  for (let i = 0; ; i++) {
    const pc = await runTo(gdb, 20000);
    if (pc !== CODE.swingState0) throw new Error(`unexpected stop at ${pc.toString(16)}`);
    const r27 = await gdb.reg(27);
    if (r27 !== p.swing) continue;
    const held = (await gdb.readMem(p.playerManager + PM_AHELD, 4)).readInt32BE(0);
    if (held <= 21) { if (i > 900) throw new Error(`A not seen held (count ${held})`); continue; }
    out.aHeldFrames = held;
    const st = await gdb.u32(p.swing + SWING.state);
    // state 3 waits for the remote back at address (0x804212bc-0x80421300:
    // 3 -> 0 once the follower's g <= 0.5, writing nothing else); Dolphin's
    // emulated remote rests pointing at the screen (remote angle 2.49 deg,
    // g 0.5038), so the harness makes that step itself
    if (st !== 0 && st !== 3) { if (i > 600) throw new Error(`swing state ${st}, not 0 or 3`); continue; }
    out.stateAtTrigger = st;
    if (st === 3) await gdb.setU32(p.swing + SWING.state, 0);
    await gdb.writeMem(follower + 4, f32(0.5));                   // g >= 0.5
    if (hold) await gdb.writeMem(follower + 8, f32(0));           // velocity: not negative on frame 1
    await gdb.writeMem(p.swing + SWING.gPrev, f32(0.45));         // previous g < 0.5
    await gdb.writeMem(p.swing + SWING.speed, Buffer.concat([f32(1), f32(0.5)])); // +0x28 > +0x2c
    break;
  }
  await gdb.removeBreak(CODE.swingState0);

  // 2. on every state-1 frame feed the raw swing value (so the game's own
  // p1, p2, p3, launch power and gauge come out at `power`) and, in "hold"
  // mode, hold the launch power and p3 (the gauge's target) at it after the
  // game stores them; catch the launch and the hand-off
  const mode = opts.powerMode ?? "hold";
  // opts.raw feeds that raw value as is (an over-swing: raw > 1.1 on a full
  // lie, > 1.0 on a capped one, is the red zone, swing-redzone-spin 3.1)
  const rf = opts.raw != null ? { raw: opts.raw, cap: null } : await rawFor(gdb, p, power);
  out.raw = rf.raw; out.cap = rf.cap; out.powerMode = mode;
  await gdb.addBreak(RAW_STORE);
  // the power store: written in "hold" mode, only read with holdWindow
  if (mode === "hold" || hold) await gdb.addBreak(CODE.powerStored);
  if (hold) await gdb.addBreak(WINDOW_HOLD);
  await gdb.addBreak(CODE.realShot);
  await gdb.addBreak(CODE.spinStored);
  let frames1 = 0;
  out.gamePower = [];
  if (hold) out.window = [];
  for (;;) {
    const pc = await runTo(gdb, 20000);
    if (pc === RAW_STORE) {
      if ((await gdb.reg(27)) !== p.swing) continue;
      await gdb.setReg(F(1), Math.fround(rf.raw));
      if (mode !== "hold") frames1++;
    } else if (pc === WINDOW_HOLD) {
      if ((await gdb.reg(27)) !== p.swing) continue;
      const vel = (await gdb.readMem(follower + 8, 4)).readFloatBE(0);
      if (vel < 0) await gdb.writeMem(follower + 8, f32(0));
      if (opts.s7c != null) await gdb.writeMem(p.swing + SWING.backspin, f32(opts.s7c));
      const sb = await gdb.readMem(p.swing + SWING.timer, 4);
      out.window.push({ timer: sb.readInt32BE(0), vel, p2: (await gdb.readMem(p.swing + SWING.p2, 4)).readFloatBE(0), fired: (await gdb.readMem(p.swing + SWING.fired, 1))[0] });
    } else if (pc === CODE.powerStored) {
      if ((await gdb.reg(27)) !== p.swing) continue;
      const sb = await gdb.readMem(p.swing + SWING.p3, 8);
      out.gamePower.push([sb.readFloatBE(0), sb.readFloatBE(4)]);   // the game's own p3 and power
      if (hold && out.window.length) Object.assign(out.window[out.window.length - 1], { p3: sb.readFloatBE(0), power: sb.readFloatBE(4) });
      if (mode === "hold") {
        await gdb.writeMem(p.swing + SWING.p3, Buffer.concat([f32(power), f32(power)]));
        frames1++;
      }
    } else if (pc === CODE.realShot) {
      out.launchBall = (await gdb.reg(3)).toString(16);
      out.launchFrame = frames1;
    } else if (pc === CODE.spinStored) {
      if ((await gdb.reg(31)) !== p.ball) continue;
      const b = await gdb.readMem(p.ball, 0xa4);
      // the spin tick: 0x80414890 loads the lifetime ball+0x54 into r0 and
      // 0x804148a0, one instruction after this stop, stores it to ball+0x58,
      // so +0x58 still holds the previous value here (0 on every shot of the
      // first 2f run, whose red-zone rows the port then curved from launch);
      // the spins act from the tick after it (Calc: lifetime > ball+0x58)
      out.handoff = {
        life: b.readInt32BE(BALL.life), spinStart: b.readInt32BE(BALL.life), staleSpinStart: b.readInt32BE(BALL.spinStart),
        gameSide: b.readFloatBE(BALL.side), gameBack: b.readFloatBE(BALL.back),
        pos: vec3(b, BALL.pos), vel: vec3(b, BALL.vel), lift: b.readFloatBE(BALL.lift),
        launchVel: vec3(b, BALL.vContact),
      };
      // keepGameSpin: let the game's own side spin and backspin through (the
      // red zone's curve, the coin); otherwise write side and back
      if (!opts.keepGameSpin) await gdb.writeMem(p.ball + BALL.side, Buffer.concat([f32(side), f32(back)]));
      opts.dsu.setButtons(0, A_BUTTON, false);
      if (opts.onHandoff) await opts.onHandoff(gdb, p);
      break;
    }
  }
  out.state1Frames = frames1;
  const sw = await gdb.readMem(p.swing, 0xe8);
  out.swingAtHandoff = { raw: sw.readFloatBE(SWING.raw), p1: sw.readFloatBE(SWING.p1), p2: sw.readFloatBE(SWING.p2), p3: sw.readFloatBE(SWING.p3), power: sw.readFloatBE(SWING.power), s7c: sw.readFloatBE(SWING.backspin),
    m: sw.readFloatBE(0xc0), coin: sw.readUInt32BE(0xd8) };
  await gdb.removeBreak(RAW_STORE);
  if (mode === "hold" || hold) await gdb.removeBreak(CODE.powerStored);
  if (hold) await gdb.removeBreak(WINDOW_HOLD);
  await gdb.removeBreak(CODE.realShot);
  await gdb.removeBreak(CODE.spinStored);

  // 3. the ball to rest: tick by tick (trace), or from the look-ahead's
  // records. After the hand-off 0x80414a08 advances the look-ahead ball 60
  // frames per real frame and records into the REAL ball (0x80414a94 is
  // passed it): first ground contact +0xfc / frame +0x13c, apex +0x12c /
  // +0x150, rest +0x114 / frame +0x148 (wsr-ground-phase.md section 7). It is
  // the same code on a copy of the ball, so its rest is the real one (the
  // first trace: 73.07340240478516, 103.22662353515625, 21.604270935058594
  // both); untilRest "real" waits for the real ball anyway.
  const path = [];
  if (!trace) {
    // hazards: the look-ahead's records are not the real outcome for a ball
    // that ends in water or a valley or below the course (the real ball sinks
    // under the 0.96 / 0.97 water drag, stops 100 u under the course minimum,
    // and the game puts it back at the drop spot ball+0xd0: hole 1's driver at
    // 0.25 into the pond at 95.7 yd came back at 86 yd); poll the real ball's
    // water state ball+0xbc (1 water, 2 OB floor under it, 3 valley) on the way
    const t0 = Date.now();
    let hazard = 0, prev = null, jump = null;
    for (;;) {
      await gdb.go();
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 120));
      await gdb.haltSafe();
      const b = await readBall(gdb, p.ball);
      if (b.water) hazard = Math.max(hazard, b.water);
      if (prev && Math.hypot(b.pos[0] - prev[0], b.pos[2] - prev[2]) > 60) jump = { from: prev, to: b.pos };
      prev = b.pos;
      if (opts.untilRest === "real" ? (!b.moving && b.life > 0) : b.restFrame >= 0) break;
      if (Date.now() - t0 > timeoutMs) throw new Error("no rest within the timeout");
    }
    out.hazard = hazard;
    if (jump) out.placed = jump;
  }
  if (trace) {
    // treeWatch { x, z, r } (KCL units): while the ball is within r of (x, z)
    // horizontally, break also right after the tree query (0x804138d4, in the
    // ball's tree check 0x804138a0: r3 = the code, 1 trunk, 2 broadleaf
    // canopy, 3 conifer canopy, 4 palm fronds; r31 = the ball;
    // wsr-tree-collision.md section 1) and record the real ball's contacts
    const tw = opts.treeWatch, contacts = [];
    let watching = false;
    await gdb.addBreak(TRACE_PC);
    for (let t = 0; t < maxTicks; t++) {
      const pc = await runTo(gdb, timeoutMs);
      if (pc === TREE_QUERY) {
        if ((await gdb.reg(31)) === p.ball) {
          const code = await gdb.reg(3);
          if (code) { const b = await gdb.readMem(p.ball, 0x60); contacts.push({ life: b.readInt32BE(BALL.life), code, pos: vec3(b, BALL.pos) }); }
        }
        t--;
        continue;
      }
      const b = await gdb.readMem(p.ball, 0x180);
      const moving = b[BALL.moving];
      const pos = vec3(b, BALL.pos);
      path.push([b.readInt32BE(BALL.life), ...pos, ...vec3(b, BALL.vel), b.readUInt16BE(BALL.attrMax), b[BALL.touched], moving]);
      if (tw) {
        const near = tw === "all" || Math.hypot(pos[0] - tw.x, pos[2] - tw.z) < tw.r;
        if (near && !watching) { await gdb.addBreak(TREE_QUERY); watching = true; }
        else if (!near && watching) { await gdb.removeBreak(TREE_QUERY); watching = false; }
      }
      if (!moving) break;
    }
    if (watching) await gdb.removeBreak(TREE_QUERY);
    await gdb.removeBreak(TRACE_PC);
    if (tw) out.treeContacts = contacts;
  }
  out.path = path;
  out.ball = await readBall(gdb, p.ball);
  out.sim = await readBall(gdb, p.simBall);
  return out;
}
