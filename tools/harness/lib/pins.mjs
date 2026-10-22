// WSR's cup locations, and the pin put into one of them at a hole's start,
// for the putting campaign: every cup on every green, steep cups first.
//
// The cups (cups(), cupById()): tools/wsr-pins.json holes[h].spots, WSR's own
// pin spots decoded from the course PMP files, 118 of them (H1 3, H2-H17 6,
// H18 one spot listed under both sets, H19-H21 6). Each carries the slope of
// the KCL triangle under it (slopeDeg) and of the steepest green triangle
// within 1 yd of it (slopeMax1yd: 12 directions at 0.3, 0.6 and 1 yd), read
// from the collision meshes (captures/meshes/wsr-kcl-obj, the user's rip;
// tools/MESHES.md). The id is "s<slot>", the spot's first WSR slot. A round's
// own draw never reaches most of them: 3-hole rounds and the Special course
// draw set 1 only (wsr-harness-decodes.md section 4), and set 2 needs a 9- or
// 18-hole round with every player under par going in.
//
// The force (wsr-harness-decodes.md section 2): the hole-start state
// 0x803f8dec draws the pin with choosePin (the bl at 0x803f8e5c; the slot in
// GlfConfig+0x38) and derives the pin, the start, the cup and its decal from
// it in 0x80403ca0 (the bl at 0x803f8e64). Stopped at 0x803f8e60, between the
// two, the slot is written over the draw once the slot is checked to hold a
// pin (cfg+0x40 + 4 s != -1). The draw itself is consumed as usual, so the
// game's random sequence runs on as it would; the game places the pin, snaps
// the cup to the green and builds the cup prism itself, and one start serves
// every slot, so the tee does not move. No pin object or position is written.
//
// The checks once the tee is ready (verifyFacts): GetPinPos (*(*(fieldMgr +
// 0x3c) + 0x4c)) at the cup's tools/wsr-pins.json position within 0.5 u in x
// and z (that file rounds to 0.1 u), the pin object the slot's own (fieldMgr
// +0x3c = +0x38 + 0xf8 x the slot's PMP ordinal), the cup prism built (KCL +
// 0x68 != 0: 0x803f0bd0 clears it when the cup misses the green) with the cup
// centre at the pin, cfg+0x38 = the slot, and the ball at the WSR player
// start.
//
// The routes to a hole's start, both genuine play (no ball position, velocity
// or outcome is ever written; besides lib/shot.mjs's injection of each stroke
// the only writes are the slot above, the course selection of the Special
// trick and the calm wind of the green strokes):
// - a course's first hole (1, 4, 7, 10, 13, 16, 19): the course picked on the
//   select screen (SAVES/menu-course.sav) as make-states.mjs picks it, hole 19
//   by its Special trick (the setup's course read made 6), the force armed
//   before the tile is pressed;
// - any other hole H: hole H-1 played out from SAVES/h(H-1)-tee.sav with
//   lib/play.mjs's planner and the round's own wind (makePre); the state
//   before the holing stroke is kept as SAVES/pins/hHH-pre.sav with that
//   stroke's injected values, and every cup of H replays the same stroke
//   from it (replayPre: same state, same values, the same hole-out; the
//   look-ahead's records are compared with the first run's), the force armed
//   once the stroke's outcome is known, while the ball still rolls to the cup.
//
// States: SAVES/pins/ (gitignored with the rest of state/): one pre state per
// hole, a tee state per cup (temporary: make-pingreen.mjs deletes it once the
// cup's green state exists), a green state per cup, and index.json (the pre
// strokes, every cup's facts, checks and timings), updated under a lock since
// several instances run at once.

import fs from "node:fs";
import path from "node:path";
import { ROOT, YD, MESH_DIR, meshIdOf, kclProfile, simOf } from "./course.mjs";
import { lineTrees, appTreeCheck } from "./apptrees.mjs";
import { parseObj } from "../../lib/obj.mjs";
import { run } from "../../lib/wsrsim.mjs";
import { PTR, pointers, readBall } from "./wsr.mjs";
import { SAVES } from "./session.mjs";
import { STATE, stateSlotPath, screenshotDir, HOTKEY_MAP } from "./dolphin.mjs";
import { GdbTimeout } from "./gdb.mjs";
import { sleep } from "./dsu.mjs";
import { planStroke, waitStroke } from "./play.mjs";

export const FORCE_PC = 0x803f8e60;        // after bl choosePin (0x803f8e5c), before bl 0x80403ca0 (0x803f8e64)
export const SETUP_READS_SEL = 0x80406954; // lwz r31,0x1c(r3): the setup reads the course selection (make-states.mjs)
export const KCL_PTR = 0x806f5478;         // the course KCL object: +0x68 the cup's green prism, +0x6c the cup centre
export const PINS_DIR = path.join(SAVES, "pins");
export const SCREENS = path.join(STATE, "screens");
export const CALM = { dir: 0, speedIdx: 0 };
export const COURSE_FIRST = [1, 4, 7, 10, 13, 16, 19];
// the select screen's 3-hole tiles as DSU left-stick positions (make-states.mjs
// COURSES); the Special course is Resort A's tile with the setup's read made 6
export const COURSES = {
  1: { name: "Resort A", tile: [-0.264, 0.237] }, 4: { name: "Resort B", tile: [-0.264, -0.099] },
  7: { name: "Resort C", tile: [-0.264, -0.444] }, 10: { name: "Classic A", tile: [0.254, 0.237] },
  13: { name: "Classic B", tile: [0.254, -0.099] }, 16: { name: "Classic C", tile: [0.254, -0.444] },
  19: { name: "Special", tile: [-0.264, 0.237], special: true },
};

const WSR_PINS = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/wsr-pins.json"), "utf8"));
export const hh = (h) => String(h).padStart(2, "0");
const hex = (v) => (v >>> 0).toString(16);
const vec3 = (b, o) => [b.readFloatBE(o), b.readFloatBE(o + 4), b.readFloatBE(o + 8)];
const hotkey = (name) => Object.entries(HOTKEY_MAP).find(([k]) => k.endsWith(name))[1];
export const stamp = () => new Date().toISOString().slice(11, 19);

// ---- the cup list ----

// the KCL triangles of a hole, without lib/course.mjs's XZ grid (sized by the
// dead floor plane's extent, it takes gigabytes over 21 holes); the ground
// query below is course.mjs groundAt's, over every triangle: the highest
// triangle under (x, z) whose class the contact routine resolves (0x1de5e)
// or is water (7) or valley (13)
const SURF_MASK = 0x1de5e | (1 << 7) | (1 << 13);
function meshOf(hole) {
  const file = path.join(MESH_DIR, `WS2_glf_course_${meshIdOf(hole)}.kcl.obj`);
  if (!fs.existsSync(file)) throw new Error(`hole ${hole}: no KCL mesh ${file} (tools/MESHES.md)`);
  const o = parseObj(file);
  const nt = o.tris.length / 3, tri = new Float64Array(nt * 9), attr = new Int16Array(nt), nrm = new Float64Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) tri[9 * t + 3 * k + c] = o.verts[3 * o.tris[3 * t + k] + c];
    attr[t] = o.groups[o.triGroup[t]].type ?? 0;
    const ax = tri[9 * t], ay = tri[9 * t + 1], az = tri[9 * t + 2];
    const ux = tri[9 * t + 3] - ax, uy = tri[9 * t + 4] - ay, uz = tri[9 * t + 5] - az;
    const vx = tri[9 * t + 6] - ax, vy = tri[9 * t + 7] - ay, vz = tri[9 * t + 8] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const m = Math.hypot(nx, ny, nz) || 1;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    nrm[3 * t] = nx / m; nrm[3 * t + 1] = ny / m; nrm[3 * t + 2] = nz / m;
  }
  return { nt, tri, attr, nrm };
}
function groundUnder(m, x, z) {
  let best = null;
  for (let t = 0; t < m.nt; t++) {
    if (!((1 << m.attr[t]) & SURF_MASK)) continue;
    const o = 9 * t;
    const ax = m.tri[o], az = m.tri[o + 2], bx = m.tri[o + 3], bz = m.tri[o + 5], cx = m.tri[o + 6], cz = m.tri[o + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const y = l1 * m.tri[o + 1] + l2 * m.tri[o + 4] + l3 * m.tri[o + 7];
    if (!best || y > best.y) best = { y, attr: m.attr[t], n: [m.nrm[3 * t], m.nrm[3 * t + 1], m.nrm[3 * t + 2]] };
  }
  return best;
}
const tiltDeg = (n) => (Math.atan2(Math.hypot(n[0], n[2]), n[1]) * 180) / Math.PI;

const cupCache = new Map();
function cupsOfHole(h) {
  if (cupCache.has(h)) return cupCache.get(h);
  const m = meshOf(h), first = COURSE_FIRST.includes(h);
  const list = WSR_PINS.holes[h].spots.map((sp) => {
    const [x, , z] = sp.mesh;
    const g = groundUnder(m, x, z);
    let mx = 0;
    for (let a = 0; a < 360; a += 30) for (const r of [0.3, 0.6, 1.0]) {
      const q = groundUnder(m, x + Math.sin((a * Math.PI) / 180) * r * YD, z + Math.cos((a * Math.PI) / 180) * r * YD);
      if (q?.n && q.attr === 6) mx = Math.max(mx, tiltDeg(q.n));
    }
    return {
      hole: h, id: `s${sp.slots[0]}`, label: sp.label, slots: sp.slots, sets: sp.sets, mesh: sp.mesh, yd: sp.yd,
      slopeDeg: g?.n ? +tiltDeg(g.n).toFixed(2) : null, slopeMax1yd: +mx.toFixed(2),
      courseFirst: first, pre: first ? "menu" : `h${hh(h - 1)}-tee.sav`,
    };
  });
  cupCache.set(h, list);
  return list;
}

// every WSR cup (118), or those of the given holes, in hole and slot order
export function cups({ holes = Array.from({ length: 21 }, (_, i) => i + 1) } = {}) {
  return holes.flatMap((h) => cupsOfHole(h));
}
export function cupById(hole, id) {
  const c = cupsOfHole(hole).find((x) => x.id === id);
  if (!c) throw new Error(`hole ${hole} has no cup ${id} (its cups: ${cupsOfHole(hole).map((x) => x.id).join(", ")})`);
  return c;
}
export const startOf = (hole) => WSR_PINS.holes[hole].starts[0].mesh;

// ---- the states and their index ----

export const preName = (hole) => `pins/h${hh(hole)}-pre.sav`;
export const teeName = (cup) => `pins/h${hh(cup.hole)}-${cup.id}-tee.sav`;
export const greenName = (cup) => `pins/h${hh(cup.hole)}-${cup.id}-green.sav`;
export const cupKey = (cup) => `h${hh(cup.hole)}-${cup.id}`;
export const savePath = (name) => path.join(SAVES, name);

const INDEX = path.join(PINS_DIR, "index.json");
export function readPinIndex() {
  try { const x = JSON.parse(fs.readFileSync(INDEX, "utf8")); x.pre ??= {}; x.cups ??= {}; return x; } catch { return { pre: {}, cups: {} }; }
}
// read-modify-write under a lock directory (several instances write it)
export async function updatePinIndex(fn) {
  fs.mkdirSync(PINS_DIR, { recursive: true });
  const lock = `${INDEX}.lock`;
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmdirSync(lock); continue; } } catch { /* gone meanwhile */ }
      if (i > 600) throw new Error("SAVES/pins/index.json stays locked");
      await sleep(50);
    }
  }
  try {
    const idx = readPinIndex();
    fn(idx);
    const tmp = `${INDEX}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(idx, null, 1));
    for (let a = 0; ; a++) {
      try { fs.renameSync(tmp, INDEX); break; } catch (e) { if (a > 20) throw e; await sleep(50); }
    }
    return idx;
  } finally { fs.rmdirSync(lock); }
}

export function freeGB(dir = SAVES) { const st = fs.statfsSync(dir); return (st.bavail * st.bsize) / 2 ** 30; }
// before writing a state: stop under minGB free (a state is ~45 MB)
export function checkDisk(minGB = 5) {
  const f = freeGB();
  if (f < minGB) throw new Error(`only ${f.toFixed(2)} GB free on the state disk (the floor is ${minGB} GB): stopping`);
  return f;
}

// ---- the game's state around the pin ----

const isPtr = (v) => v >= 0x80000000 && v < 0x81800000;
export async function pinFacts(s) {
  return s.paused(async (gdb) => {
    const fm = await gdb.u32(PTR.fieldManager), cfgA = await gdb.u32(PTR.glfConfig);
    const kclA = await gdb.u32(KCL_PTR), pm = await gdb.u32(PTR.playerManager);
    if (![fm, cfgA, kclA, pm].every(isPtr)) throw new Error(`no golf hole in RAM (fieldMgr ${hex(fm)}, cfg ${hex(cfgA)}, KCL ${hex(kclA)})`);
    const cfg = await gdb.readMem(cfgA, 0xc0);
    const pinBase = await gdb.u32(fm + 0x38), pinObj = await gdb.u32(fm + 0x3c);
    const pinRam = vec3(await gdb.readMem(await gdb.u32(pinObj + 0x4c), 12), 0);
    // the cup object's position (0x80405818 copies the pin's into *(cup+0x4c))
    const cupObj = await gdb.u32(fm + 0x54), cupPosA = isPtr(cupObj) ? await gdb.u32(cupObj + 0x4c) : 0;
    const cupObjPos = isPtr(cupPosA) ? vec3(await gdb.readMem(cupPosA, 12), 0) : null;
    const k = await gdb.readMem(kclA + 0x68, 0x18);
    const p = await pointers(gdb);
    const b = await readBall(gdb, p.ball);
    const w = await gdb.readMem(p.wind, 0x14);
    return {
      hole: cfg.readInt32BE(0xc) + 1, mode: cfg.readInt32BE(4), slot: cfg.readInt32BE(0x38),
      pinSet: (await gdb.readMem(pm + 0x694, 4)).readInt32BE(0),
      ordinals: Array.from({ length: 16 }, (_, i) => cfg.readInt32BE(0x40 + 4 * i)),
      sets: Array.from({ length: 16 }, (_, i) => cfg.readInt32BE(0x80 + 4 * i)),
      pinObj: hex(pinObj), pinOrdinal: (pinObj - pinBase) / 0xf8, pinRam,
      cupRam: { prism: hex(k.readUInt32BE(0)), centre: vec3(k, 4), r: k.readFloatBE(16), depth: k.readFloatBE(20), obj: cupObjPos },
      ball: { pos: b.pos, life: b.life, moving: b.moving },
      wind: { angle: w.readFloatBE(8), speedIdx: w.readInt32BE(0x10), dir: Math.round(w.readFloatBE(8) / (Math.PI / 4)) },
    };
  });
}

// the checks of a forced tee (or of a later state of the same cup: tee: false)
export function verifyFacts(f, cup, slot, { tee = true } = {}) {
  const st = startOf(cup.hole);
  const off = (a, b) => [+(a[0] - b[0]).toFixed(3), +(a[2] - b[2]).toFixed(3)];
  const pinOff = off(f.pinRam, cup.mesh), teeOff = off(f.ball.pos, st), cupOff = off(f.cupRam.centre, f.pinRam);
  const v = {
    hole: f.hole === cup.hole,
    slot: f.slot === slot,
    pinObject: f.pinOrdinal === f.ordinals[slot],
    pin: Math.abs(pinOff[0]) < 0.5 && Math.abs(pinOff[1]) < 0.5,
    prism: f.cupRam.prism !== "0",
    cup: Math.hypot(...cupOff) < 0.5,
  };
  if (tee) v.tee = Math.abs(teeOff[0]) < 0.5 && Math.abs(teeOff[1]) < 0.5 && f.ball.life === 0;
  return { ...v, all: Object.values(v).every(Boolean), pinOffset: pinOff, cupOffset: cupOff, ...(tee ? { teeOffset: teeOff } : {}) };
}

// ---- the force ----

// stop the CPU, arm the hole-start breakpoint (and the Special's setup read),
// run on; the next hole start then stops in forceAtStart
export async function armForce(s, { special = false } = {}) {
  await s.gdb.haltSafe();
  await s.gdb.addBreak(FORCE_PC);
  if (special) await s.gdb.addBreak(SETUP_READS_SEL);
  await s.gdb.go();
}

// With the CPU running and armForce's breakpoints set: advance the screens
// until the hole start stops at FORCE_PC, check it is `hole` and that `slot`
// holds a pin, write the slot over the draw and run on. Between stops: A+B
// (the golf scene's dialogs, as lib/play.mjs waitStroke advances them after a
// hole-out); on the menu route `quietMs` without a press after the tile's A,
// and for the Special course A alone until the setup has read the selection
// (make-states.mjs). A stop that lands at the breakpoint just as a timeout's
// halt does is taken from gdb.lastStop.
export async function forceAtStart(s, { hole, slot, special = false, menu = false, quietMs = menu ? 4000 : 0, timeoutMs = 240000, log = () => {} }) {
  const gdb = s.gdb, t0 = Date.now();
  let setupRead = !special, quietUntil = t0 + quietMs, taps = 0;
  for (;;) {
    if (Date.now() - t0 > timeoutMs) {
      await gdb.haltSafe(); await gdb.clearBreaks(); await gdb.go();
      throw new Error(`hole ${hole}: no hole start within ${timeoutMs / 1000} s`);
    }
    let st;
    try { st = await gdb.waitStop(2000); } catch (e) {
      if (!(e instanceof GdbTimeout)) throw e;
      st = gdb.lastStop;
      if (st?.pc !== FORCE_PC && st?.pc !== SETUP_READS_SEL) {
        await gdb.go();
        if (!setupRead) { await s.dsu.tap(0, "Cross", 200); taps++; }
        else if (Date.now() >= quietUntil) {
          s.dsu.setButtons(0, ["Cross", "Circle"], true); await sleep(300); s.dsu.setButtons(0, ["Cross", "Circle"], false);
          taps++;
        }
        continue;
      }
    }
    if (st?.pc === SETUP_READS_SEL) {
      const sm = await gdb.u32(PTR.staticMem);
      await gdb.setU32(sm + 0x1c, 6);
      await gdb.removeBreak(SETUP_READS_SEL);
      setupRead = true; quietUntil = Date.now() + 4000;
      log(`${stamp()} Special: the course selection read as 6 at the golf scene's setup`);
      await gdb.go();
      continue;
    }
    if (st?.pc !== FORCE_PC) { await gdb.go(); continue; }
    const cfgA = await gdb.u32(PTR.glfConfig);
    const cfg = await gdb.readMem(cfgA, 0xc0);
    const h = cfg.readInt32BE(0xc) + 1, drawn = cfg.readInt32BE(0x38);
    const ordinal = cfg.readInt32BE(0x40 + 4 * slot), set = cfg.readInt32BE(0x80 + 4 * slot);
    const bad = h !== hole ? `the hole start is hole ${h}, not ${hole}` : ordinal === -1 ? `hole ${hole}: slot ${slot} holds no pin` : !setupRead ? "the Special setup read never came" : null;
    if (bad) { await gdb.clearBreaks(); await gdb.go(); throw new Error(bad); }
    const b = Buffer.alloc(4); b.writeInt32BE(slot);
    await gdb.writeMem(cfgA + 0x38, b);
    const now = (await gdb.readMem(cfgA + 0x38, 4)).readInt32BE(0);
    await gdb.clearBreaks();
    await gdb.go();
    log(`${stamp()} hole ${hole} start: choosePin drew slot ${drawn}; slot ${now} written (PMP pin ${ordinal}, set ${set}) after ${((Date.now() - t0) / 1000).toFixed(1)} s, ${taps} presses`);
    return { hole: h, drawn, slot: now, ordinal, set, ms: Date.now() - t0, taps };
  }
}

// make-states.mjs readyAt / walkTo: the player ready at the tee of `hole`
// (the shot setup's flags pm+0x674 / +0x675, the tutorial flag pm+0x8a8
// clear, the real ball at rest with lifetime 0), A+B for every dialog, minus
// to quit the first hole's swing tutorial
async function readyAt(s) {
  return s.paused(async (gdb) => {
    try {
      const pm = await gdb.u32(PTR.playerManager), cfg = await gdb.u32(PTR.glfConfig);
      if (!pm || !cfg || pm < 0x80000000 || cfg < 0x80000000) return null;
      const f = await gdb.readMem(pm + 0x674, 2), tut = (await gdb.readMem(pm + 0x8a8, 1))[0];
      const hole = (await gdb.readMem(cfg + 0xc, 4)).readInt32BE(0) + 1;
      const p = await pointers(gdb);
      const b = await readBall(gdb, p.ball);
      return { hole, ready: f[0] === 1 && f[1] === 1 && !tut && b.life === 0 && !b.moving, tut };
    } catch { return null; }
  });
}
export async function walkToTee(s, hole, { maxSteps = 60 } = {}) {
  for (let i = 0; i < maxSteps; i++) {
    const r = await readyAt(s);
    if (r?.ready && r.hole === hole) { await sleep(1500); const r2 = await readyAt(s); if (r2?.ready && r2.hole === hole) return true; }
    s.dsu.setButtons(0, ["Cross", "Circle"], true); await sleep(300); s.dsu.setButtons(0, ["Cross", "Circle"], false);
    await sleep(1800);
    if (r?.tut) { await s.dsu.tap(0, "L1", 250); await sleep(1500); }
  }
  return false;
}

// ---- the menu route (a course's first hole) ----

// the course-select state again (it has no ball to check: given time, as
// make-states.mjs gives it)
export async function loadMenu(s) {
  fs.copyFileSync(path.join(SAVES, "menu-course.sav"), stateSlotPath(4, s.instance));
  s.slot4 = null;   // Session.load's record of what slot 4 holds
  await s.gdb.haltSafe(); await s.gdb.clearBreaks(); await s.gdb.go();
  await s.dsu.tap(1, hotkey("Load State Slot 4"), 200);
  await sleep(6000);
}
// point at the course's tile, arm the force, press A
export async function pickCourse(s, hole) {
  const c = COURSES[hole];
  if (!c) throw new Error(`hole ${hole} is not a course's first hole`);
  await sleep(1500);
  s.dsu.setStick(0, "left", ...c.tile);
  await sleep(600);
  await armForce(s, { special: !!c.special });
  await s.dsu.tap(0, "Cross", 250);
  return c;
}

// ---- the play route (any other hole): the stroke that holes hole H-1 ----

const lookAhead = (b) => ({ holeFrame: b.holeFrame, restFrame: b.restFrame, closeFrame: b.closeFrame, landFrame: b.landFrame, rest: b.rest, close: b.close });

// From hole H-1's tee (the session started at SAVES/h(H-1)-tee.sav): play it
// out (lib/play.mjs planStroke, the round's own wind, the power held), saving
// the state before every stroke (a chip-in holes too); the state before the
// holing stroke becomes SAVES/pins/hHH-pre.sav. Returns the index entry: the
// stroke's injected values, the ball it starts from (what a load of the state
// is recognised by) and its look-ahead records.
export async function makePre(s, hole, opts = {}) {
  const tmp = `pins/tmp-pre-i${s.instance}.sav`;
  try { return await makePre1(s, hole, tmp, opts); } finally {
    // a play-out that fails leaves no temporary state behind
    if (fs.existsSync(savePath(tmp))) fs.unlinkSync(savePath(tmp));
  }
}
async function makePre1(s, hole, tmp, { log = () => {}, maxStrokes = 12 } = {}) {
  const prev = hole - 1;
  fs.mkdirSync(PINS_DIR, { recursive: true });
  const strokes = [], t0 = Date.now();
  for (let k = 0; k < maxStrokes; k++) {
    const w = await waitStroke(s, prev);
    if (w.moved) throw new Error(`hole ${prev} ended without a recorded holing stroke`);
    const st = await s.state();
    if (st.hole !== prev) throw new Error(`at hole ${st.hole}, not ${prev}`);
    const plan = await planStroke(prev, st);
    checkDisk();
    await s.saveState(tmp);
    const stroke = { club: plan.club, power: plan.power, heading: plan.heading, powerMode: "hold", wind: null, untilRest: "predicted" };
    const shot = await s.shoot({ ...stroke, trace: false });
    const b = shot.ball, holed = b.holeFrame >= 0;
    const toPin = Math.hypot(b.rest[0] - st.pin[0], b.rest[2] - st.pin[2]) / YD;
    strokes.push({ k: k + 1, why: plan.why, ...stroke, lie: st.player.lie, from: st.ball.pos, rest: b.rest, holed, toPin });
    log(`${stamp()} hole ${prev} stroke ${k + 1}: ${plan.why}: ${plan.club} ${plan.power.toFixed(3)} -> ${holed ? "HOLED" : `${toPin.toFixed(1)} yd from the pin`}`);
    if (holed) {
      fs.renameSync(savePath(tmp), savePath(preName(hole)));
      return {
        file: preName(hole), fromTee: `h${hh(prev)}-tee.sav`, prevHole: prev, ball: { pos: st.ball.pos, life: st.ball.life },
        stroke, outcome: lookAhead(b), windRam: st.wind, pinRam: st.pin, strokes, ms: Date.now() - t0, made: new Date().toISOString(),
      };
    }
  }
  throw new Error(`hole ${prev}: not holed in ${maxStrokes} strokes`);
}

// load the pre state (unless the session sits in it untouched) and replay its
// holing stroke; the look-ahead's records must be the first run's
export async function replayPre(s, pre, { fresh = false, log = () => {} } = {}) {
  const t0 = Date.now();
  if (!fresh) await s.load(savePath(pre.file), pre.ball);
  const tLoad = Date.now() - t0;
  const shot = await s.shoot({ ...pre.stroke, wind: pre.stroke.wind ?? undefined, trace: false });
  const got = lookAhead(shot.ball);
  const same = JSON.stringify(got) === JSON.stringify(pre.outcome);
  if (shot.ball.holeFrame < 0) throw new Error(`the replayed stroke from ${pre.file} did not hole (${JSON.stringify(got)})`);
  if (!same) log(`${stamp()} the replay holed but its look-ahead records differ from the first run's: ${JSON.stringify(got)} vs ${JSON.stringify(pre.outcome)}`);
  return { same, holeFrame: got.holeFrame, loadMs: tLoad, ms: Date.now() - t0 };
}

// ---- the green (a green state per cup) ----

// A stroke toward `target` (KCL x, y, z) that the port and the app's tree
// check both pass, for the green states: lib/play.mjs flies no trees and
// rolls outer ground as fairway, and on hole 16 every straight line to its
// AM cup from the fairway crosses OB ground 30-60 yd out and tree t16-4's
// canopy at ~42 yd; the game puts such a ball back where it was struck. The
// candidates: headings round the line to the target (to +-20 deg) and round
// the game's own line for the stroke (player+0x84, which follows the fairway
// past a dogleg), every club the lie allows at powers 0.1 to its cap in 0.01
// steps, each flown by the port over the KCL profile (calm, as the strokes
// are). Scored by how far the port's stop is from the target, plus 5 yd for a
// rough stop, 15 for a bunker and 0.5 a club for the less lofted ones (they
// roll further; lib/play.mjs prefers lofted clubs too). Taken in that order,
// the first that stops on fairway, rough, green, fringe or bunker with no OB,
// water, wall or valley from the carry to the stop, and whose flight (and
// first 5 yd of bounce) src/trees.js treeCheck finds clear of every tree with
// `margin` yd to spare, over the hole's trees as derived.json ships them
// (lib/apptrees.mjs). Headings within 1.5 deg of one in `exclude` are skipped.
const CLUBS_BY_LOFT = ["wedge", "9iron", "7iron", "5iron", "3iron", "spoon", "driver"];
const BUNKER_CAP = { driver: 0.25, spoon: 0.25, "3iron": 0.5, "5iron": 0.5, "7iron": 0.5, "9iron": 0.5, wedge: 0.75 };
const capOf = (club, lie) => (lie === 2 ? 0.75 : lie === 3 || lie === 16 ? BUNKER_CAP[club] : 1.0);
const SURF = { 1: "fairway", 2: "rough", 3: "bunker", 6: "green", 9: "fringe", 15: "fairway", 16: "bunker" };
const STOP_OK = { fairway: 0, tee: 0, green: 0, fringe: 0, rough: 5, bunker: 15 };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export async function searchPlan(hole, st, target, { margin = 2, exclude = [] } = {}) {
  const ball = st.ball.pos, lie = st.player.lie, surface = SURF[lie] ?? "fairway";
  const clubs = lie === 3 || lie === 16 ? CLUBS_BY_LOFT.slice(0, 5) : CLUBS_BY_LOFT;
  const toT = Math.atan2(target[0] - ball[0], target[2] - ball[2]), game = Math.atan2(st.player.aim[0], st.player.aim[1]);
  const heads = [];
  for (const d of [0, 2, -2, 4, -4, 6, -6, 9, -9, 12, -12, 16, -16, 20, -20]) heads.push(toT + (d * Math.PI) / 180);
  for (const d of [0, 4, -4]) heads.push(game + (d * Math.PI) / 180);
  const cands = [], lines = [];
  for (const h of heads) {
    if (lines.some((l) => Math.abs(angDiff(l.h, h)) < 0.5 * Math.PI / 180)) continue;
    if (exclude.some((e) => Math.abs(angDiff(e, h)) < 1.5 * Math.PI / 180)) continue;
    const dx = Math.sin(h), dz = Math.cos(h);
    const prof = await kclProfile(hole, ball[0], ball[2], dx, dz);
    if (!prof) continue;
    const at = (yd) => prof.lies[Math.min(prof.n - 1, Math.max(0, prof.i0 + Math.round(yd / prof.step)))];
    const line = { h, dx, dz, prof, at, sim: simOf(prof), trees: null };
    lines.push(line);
    for (const [ci, club] of clubs.entries()) {
      for (let k = Math.round(Math.min(capOf(club, lie), 1) * 100); k >= 10; k--) {
        const q = k / 100, o = run({ club, q, surface, profile: line.sim, trace: false });
        const stopLie = at(o.stop);
        if (!(stopLie in STOP_OK)) continue;
        const sx = ball[0] + dx * o.stop * YD, sz = ball[2] + dz * o.stop * YD;
        const yd = Math.hypot(sx - target[0], sz - target[2]) / YD;
        cands.push({ line, club, q, stop: o.stop, carry: o.carry, stopLie, yd, score: yd + STOP_OK[stopLie] + 0.5 * ci });
      }
    }
  }
  cands.sort((a, b) => a.score - b.score);
  let tried = 0;
  for (const c of cands) {
    const { prof, at } = c.line;
    let bad = false;
    for (let yd = Math.min(c.carry, c.stop); yd <= Math.max(c.carry, c.stop) + 1e-9 && !bad; yd += prof.step) if (!(at(yd) in STOP_OK)) bad = true;
    if (bad) continue;
    if (++tried > 400) break;
    const o = run({ club: c.club, q: c.q, surface, profile: c.line.sim, trace: true });
    c.line.trees ??= lineTrees(hole, ball, c.line.dx, c.line.dz);
    const tc = appTreeCheck(c.line.trees, o);
    if (tc.kind === "trunk" || tc.kind === "canopy" || (tc.margin != null && tc.margin < margin)) continue;
    const off = (angDiff(c.line.h, toT) * 180) / Math.PI;
    return {
      club: c.club, power: c.q, heading: c.line.h, score: c.score, stop: c.stop, stopLie: c.stopLie, trees: tc,
      why: `searched ${off >= 0 ? "+" : ""}${off.toFixed(1)} deg off the target line, port stop ${c.stop.toFixed(1)} yd on ${c.stopLie}, ${c.yd.toFixed(1)} yd from the target, trees ${tc.kind}${tc.margin != null ? ` by ${tc.margin.toFixed(1)} yd` : ""}`,
    };
  }
  return null;
}

// The stroke from a spot, given what came back from it before (`risk`: n
// plans the game put back, the headings they took): on the green or fringe,
// lib/play.mjs planStroke's putt to a point `back` yd short of the pin;
// otherwise searchPlan toward that point (its tree margin 2 yd, then 4, then
// 6 for a spot something came back from, those headings excluded); with no
// such stroke, planStroke toward it, then toward points on the game's own
// line D - 60 yd out (80 to 230) and D / 2 out (60 to 180); past that, none.
async function planFor(hole, st, back, risk, log) {
  const [bx, , bz] = st.ball.pos, [px, py, pz] = st.pin, d = Math.hypot(px - bx, pz - bz);
  const calm = { ...st, wind: { ...st.wind, speedIdx: 0 } };
  const bb = Math.min(back * YD, d * 0.5), target = [px - ((px - bx) / d) * bb, py, pz - ((pz - bz) / d) * bb];
  if ([6, 9, 10, 11].includes(st.player.lie)) return planStroke(hole, { ...calm, pin: target });
  const n = risk?.n ?? 0;
  if (n <= 2) {
    const p = await searchPlan(hole, st, target, { margin: 2 + 2 * n, exclude: risk?.exclude ?? [] });
    if (p) return p;
    log(`${stamp()}   no searched stroke passes (margin ${2 + 2 * n} yd); the port's plans instead`);
  }
  const tier = n <= 2 ? 0 : n - 2;
  if (tier === 0) return planStroke(hole, { ...calm, pin: target });
  if (tier > 2) return null;
  const D = d / YD, L = tier === 1 ? Math.min(230, Math.max(80, D - 60)) : Math.min(180, Math.max(60, D / 2));
  const h = Math.atan2(st.player.aim[0], st.player.aim[1]);
  const plan = await planStroke(hole, { ...calm, pin: [bx + Math.sin(h) * L * YD, py, bz + Math.cos(h) * L * YD] });
  return { ...plan, why: `along the game's line ${L.toFixed(0)} yd (${plan.why})` };
}

// From the cup's tee state (the session in it untouched when `fresh`): strokes
// (planFor above), calm, the power held, the real ball waited for, until the
// ball rests on the green (lie 6) at least minYd from the cup; then saved as
// SAVES/pins/hHH-<id>-green.sav. A fringe or bunker lie is played on from
// (the strokes are recorded). A ball the game puts back where it was struck
// (out of bounds) ends the attempt: the tee is reloaded, so no penalty stroke
// stays in the state's round, and that spot's next plan is taken; a hole-out,
// a rest within minYd, the hole ended by WSR's stroke limit or no green after
// maxStrokes reloads the tee and tries the next `back`. Every attempt is
// returned.
export async function playToGreen(s, cup, { teeFile, teeBall, fresh = false, backs = [4, 6, 2.5, 8, 3, 10], minYd = 1.5, maxStrokes = 8, maxTries = 12, log = () => {} } = {}) {
  const tries = [], t0 = Date.now(), slot = cup.slots[0];
  const unsafe = new Map(), spot = (p) => `${Math.round(p[0])},${Math.round(p[2])}`;
  let bi = 0;
  for (let a = 0; a < maxTries && bi < backs.length; a++) {
    const back = backs[bi], ta = Date.now();
    if (!(fresh && a === 0)) await s.load(teeFile, teeBall);
    const f0 = await pinFacts(s), v0 = verifyFacts(f0, cup, slot);
    if (!v0.pin || !v0.slot) throw new Error(`${path.basename(teeFile)}: the pin in RAM is not ${cupKey(cup)}'s (${JSON.stringify(v0)})`);
    const strokes = [];
    let end = null, last = null;
    for (let k = 1; k <= maxStrokes; k++) {
      if (k > 1) { const w = await waitStroke(s, cup.hole); if (w.moved) { end = "hole over"; break; } }
      const st = await s.state();
      const [bx, , bz] = st.ball.pos, [px, , pz] = st.pin, d = Math.hypot(px - bx, pz - bz);
      last = { lie: st.player.lie, pos: st.ball.pos, life: st.ball.life, distYd: d / YD };
      const prev = strokes[strokes.length - 1];
      if (prev && Math.hypot(bx - prev.from[0], bz - prev.from[2]) < 2) {
        const r = unsafe.get(spot(prev.from)) ?? { n: 0, exclude: [] };
        r.n++; r.exclude.push(prev.heading);
        unsafe.set(spot(prev.from), r);
        end = "put back"; break;
      }
      if ([6, 10, 11].includes(st.player.lie)) { end = st.player.lie === 6 && d / YD >= minYd ? "green" : "near"; break; }
      const risk = unsafe.get(spot(st.ball.pos));
      const plan = await planFor(cup.hole, st, back, risk, log);
      if (!plan) { end = "no plan left"; break; }
      const stroke = { club: plan.club, power: plan.power, heading: plan.heading, powerMode: "hold", wind: CALM, untilRest: "real" };
      const shot = await s.shoot({ ...stroke, trace: false });
      const r = shot.ball.pos, holed = shot.ball.holeFrame >= 0;
      strokes.push({ k, tier: risk?.n ?? 0, why: plan.why, ...stroke, lie: st.player.lie, from: st.ball.pos, rest: r, hazard: shot.hazard ?? 0, holed, toPin: Math.hypot(r[0] - px, r[2] - pz) / YD });
      log(`${stamp()} ${cupKey(cup)} back ${back} stroke ${k} (lie ${st.player.lie}): ${plan.why}: ${plan.club} ${plan.power.toFixed(3)} -> ${holed ? "HOLED" : `${(Math.hypot(r[0] - px, r[2] - pz) / YD).toFixed(1)} yd from the pin`}${shot.hazard ? ` (hazard ${shot.hazard})` : ""}`);
      if (holed) { end = "holed"; break; }
    }
    end ??= "no green";
    tries.push({ back, end, strokes, last, ms: Date.now() - ta });
    if (end !== "put back" && end !== "green") bi++;
    if (end === "green") {
      // the same pin, prism and cup at the green as at the tee
      const vg = verifyFacts(await pinFacts(s), cup, slot, { tee: false });
      if (!vg.all) throw new Error(`${cupKey(cup)}: the checks fail at the green (${JSON.stringify(vg)})`);
      checkDisk();
      const ts = Date.now();
      await s.saveState(greenName(cup));
      log(`${stamp()} ${cupKey(cup)}: on the green ${last.distYd.toFixed(2)} yd from the cup; saved ${greenName(cup)}`);
      return { file: greenName(cup), back, ball: { pos: last.pos, life: last.life }, distYd: last.distYd, lie: last.lie, verified: vg, strokes, tries, saveMs: Date.now() - ts, ms: Date.now() - t0 };
    }
    log(`${stamp()} ${cupKey(cup)} back ${back}: ${end}${last ? ` (lie ${last.lie}, ${last.distYd.toFixed(2)} yd from the cup)` : ""}; next try`);
  }
  const e = new Error(`${cupKey(cup)}: no green state after ${tries.length} tries (backs ${backs.join(", ")}; ${tries.map((t) => t.end).join(", ")})`);
  e.tries = tries;
  throw e;
}

// an index entry that has just succeeded: an earlier run's failure (its error
// and green attempts) is kept under `earlier`, not beside the new state
export function settleErrors(e) {
  if (e.error || e.greenTries) {
    (e.earlier ??= []).push({ error: e.error, errorAt: e.errorAt, greenTries: e.greenTries });
    delete e.error; delete e.errorAt; delete e.greenTries;
  }
  return e;
}

// a green state into the index (with every attempt), and the cup's tee state
// deleted unless keepTee (a tee state is only the way to its green state)
export async function recordGreen(cup, g, { keepTee = false, screen = null } = {}) {
  const tee = savePath(teeName(cup));
  if (!keepTee && fs.existsSync(tee)) fs.unlinkSync(tee);
  await updatePinIndex((x) => {
    const e = (x.cups[cupKey(cup)] ??= { hole: cup.hole, id: cup.id, slot: cup.slots[0], label: cup.label });
    e.green = {
      file: g.file, back: g.back, ball: g.ball, distYd: g.distYd, lie: g.lie, verified: g.verified, strokes: g.strokes,
      tries: g.tries.map((t) => ({ back: t.back, end: t.end, strokes: t.strokes.map((k) => ({ tier: k.tier, lie: k.lie, club: k.club, power: k.power, heading: k.heading, toPin: k.toPin, holed: k.holed, hazard: k.hazard })), last: t.last, ms: t.ms })),
      ms: g.ms, saveMs: g.saveMs, screen, made: new Date().toISOString(),
    };
    e.teeFile = keepTee ? teeName(cup) : null;
    settleErrors(e);
  });
}

// ---- screenshots ----

// Dolphin's screenshot hotkey (DSU slot 1), the new file in the instance's
// ScreenShots copied to state/screens/<name>; the CPU must be running
export async function screenshot(s, name) {
  const dir = screenshotDir(s.instance);
  const before = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
  for (let a = 0; a < 3; a++) {
    await s.dsu.tap(1, hotkey("Take Screenshot"), 150);
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const fresh = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => !before.has(f));
      if (fresh.length) {
        await sleep(400);
        fs.mkdirSync(SCREENS, { recursive: true });
        const out = path.join(SCREENS, name);
        fs.copyFileSync(path.join(dir, fresh.sort().pop()), out);
        return out;
      }
    }
  }
  throw new Error("no screenshot appeared");
}
