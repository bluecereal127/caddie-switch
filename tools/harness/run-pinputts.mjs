// The putting battery for one cup: every test of REPORT.md section 5 (the
// roll, the capture window, the read that forgives the strength) from spots
// all round one of WSR's cup locations, so the app's putt model (src/putt.js)
// can be judged on every green, steep cups included. From a green state on
// the hole with that cup (SAVES/pins/hHH-<id>-green.sav, whose maker forces
// the pin slot through WSR's own choosePin result at hole start; or any green
// state of a played round, e.g. SAVES/h20-green.sav), real putts take the
// ball to spots round the cup, each spot is saved as a temporary state, and
// from it the battery is putted. Every outcome is the game's own: the
// look-ahead's records the game writes into the real ball at the hand-off,
// or the real ball itself, traced tick by tick or waited for. Nothing writes
// the ball, the pin or an outcome; the only writes are the shot's own
// (club, aim, the swing's trigger and power, held so the pin assist cannot
// move it) and the calm wind at each putt.
//
// Spots, relative to the KCL fall line at the cup (the triangle under the
// pin, lib/course.mjs groundAt): angle 0 = up the fall line (the putt from
// there runs straight down), 90 = right of the fall line looking downhill,
// 180 = down it, 270 = left; rings of 8 directions at 3 and 8 yd (r3-a000 ...
// r8-a315) and 4 at 15 yd (r15-a000, -a090, -a180, -a270), plus "approach",
// the green state's own ball. On a cup under 0.5 deg north stands in for the
// uphill direction (0 = north of the cup, 90 = west). A spot is used when the
// KCL under its nominal point is green (attr 6), the app's roll from the
// green state's ball (lib/green.mjs puttTo, the aim within 30 deg, the speed
// to 16 yd/s) stops within 0.2 yd of it on a path 0.35 yd or more from the
// cup (the target slid sideways in 0.25 yd steps, as make-greenspot.mjs
// does; where none does, the same roll resting as WSR's stop rule does up to
// 15 deg, since the app's rests nothing past 12), and a putt (power held, calm) rests on the green within 0.15 +
// 0.12 R yd of it: up to 6 putts in the look-ahead only, each planned past
// the last one's miss (at most 2 yd further), the first in the tolerance (or
// the nearest within twice it, flagged loose) then putted for real and its
// state saved once the next stroke is ready. On a steep face no ball stays:
// round hole 21's 13 deg cup the 3 yd ring above and beside it runs 15-17 deg.
//
// Per spot, every putt calm and power held, from the spot's state:
// - read: the app's read (src/putt.js solvePutt over lib/green.mjs's field)
//   at its aim, the WSR putter power moved by -0.08 ... +0.08 in 0.02 steps
//   (x4 = gauge bars; power from the read's launch as run-puttread.mjs
//   turns it); its dq = 0 putt again waiting for the real ball ("read-real")
//   and again traced tick by tick ("read-trace");
// - roll: six putts that miss on purpose, flat roll D + e for e = 0.5, 2, 4
//   yd (lib/green.mjs powerFor), aimed where the app's roll first passes the
//   cup 0.3 yd right and left (aimOf below: "aimFor", "scan", "clear" or
//   "short"), traced on cups of 6 deg or more (--trace-deg); the e = 2, +0.3
//   putt again in the other mode (waited for when untraced, look-ahead only
//   when traced: "roll-check");
// - window, on r3-a000, -a090, -a180, -a270 (--window-spots): the cup's
//   holed / missed edge at 1, 2 and 3 yd/s at the cup (--speeds) as
//   run-cupedge.mjs --speeds measures it (the excess whose app roll on the
//   holing line reaches the cup at that speed, bisected over 0-8 yd and,
//   when 0 is already too fast, over the negative excess down to the
//   putter's 0.05 floor; the putt on that line; WSR's line against the app's
//   from the two putts the app passes 0.25 yd right and left, traced on
//   cups of --trace-deg or more for their first approach; each edge
//   bisected 5 times over 0.2 yd from the centre), the centre the app's line
//   where its putt holes, else WSR's line as those two putts put it, else
//   the first of the app's offsets 0.05 ... 0.2 either side that holes, and
//   an edge with no miss within 0.2 yd bisected 5 more times out to 0.35
//   (hole 20's 8 deg cup puts WSR's line 0.04-0.085 yd off the app's, which
//   left run-cupedge.mjs's right-hand bracket without a miss).
// A putt waits for the look-ahead's rest record (ball+0x148 >= 0); when none
// comes within 6 s (a ball the look-ahead never sees stop), the real ball is
// waited for instead (2 minutes at most) and `src` says so. A GDB error (E00:
// a halt the stub could not read through) gets one retry from a fresh load;
// a Dolphin that stops answering (a halt that times out, a state that will
// not load) is stopped and started again, and the spot done again, once.
//
//   node tools/harness/run-pinputts.mjs --hole 21 --green pins/h21-s3-green.sav [--id s3]
//        [--spots approach,r3-a000,... | --quick] [--tests read,roll,window]
//        [--window-spots r3-a000,r3-a090,r3-a180,r3-a270] [--speeds 1,2,3]
//        [--trace-deg 6] [--out results/pins/h21-s3.json] [--fresh] [--plan plan.json] [--instance 0]
// --quick: the spots approach, r3-a000 and r3-a090, the window at 2 yd/s.
// --trace-deg: the cup slope from which the roll putts are traced (6).
// --plan: a JSON object { <spot>: { inj: [heading, power] } }: that putt is
// the spot's first probe, before the app's plans (on hole 21's 12-15 deg
// faces the app's roll plans putts that rest yards from the spot).
// --read-file: { <spot>: { a, q0, src, range } }: the read test putts that
// read (aim deg right of the cup, WSR putter power) instead of solvePutt's;
// --no-read-checks: without the read's waited-for and traced runs.
// The output is written after every test block and is resumable: a rerun
// keeps the finished spots and redoes the rest, re-creating each by its
// recorded putt from the green state (deterministic), checked against the
// recorded spot. Spot states live in the instance's state slot 3 (one file,
// overwritten per spot, deleted at the end with Dolphin's lastState.sav undo
// copy of it); the green state is copied into slot 4 once (Session.load).
//
// Output (results/pins/hHH-<id>.json; numbers to 5 decimals, positions in
// KCL units (x east, y up, z south; 9.144 per yd), distances in yd, speeds in
// yd/s, frames at 60 Hz, ticks at 240 Hz; "inj" = the injected heading and
// power as full-precision strings, enough to replay any putt bit for bit):
// { kind: "pinputts", version: 1, hole, id ("s<slot>", tools/wsr-pins.json),
//   label, slots, sets, green (the state file), instance, startedAt, updatedAt,
//   done (every spot finished), timing { putts, puttS, spotS, totalS, copies
//   (green state copies into slot 4), restarts } of the last run, runs [that,
//   per run],
//   cup: { pin (RAM, *(fieldMgr+0x3c)+0x4c), slot (RAM, GlfConfig+0x38),
//     slotTable [[PMP ordinal, set] per slot 0-15, cfg+0x40 / +0x80],
//     kclCup { centre, r, depth, prism } (RAM, KCL+0x6c..+0x7c, +0x68),
//     cupObj (RAM, *(*(fieldMgr+0x54)+0x4c)), wsr { mesh, label, slots, sets,
//     yd } (tools/wsr-pins.json, the spot nearest the pin) and its distance,
//     kcl { slopeDeg, down [x, z] (the fall line), attr, n } (the triangle
//     under the pin), ref ("fall" | "north"), app { slopeDeg, grad [east,
//     south rise per yd], fallOffDeg (its fall line against the KCL's) } },
//   ball0, life0, lie0 (the green state's ball),
//   spots: { <name>: { name, ring, angle, nominal [x, z], kclAttr, usable,
//     why (when not), done, ball [x, y, z], life, lie, D, off (from the
//     nominal point), loose, create { probes [{ inj, heading, power, slide,
//     target, appMiss, appPass, holed, rest, attr, off }], putt { inj,
//     heading, power }, replayed, delta (u, the real rest against the
//     probe's or the recorded spot's), failed }, model { D, slopeDeg (the app's at the ball), kclSlopeDeg
//     (the KCL's) }, read { a, p, q0, holes (the model), range { lo, hi, mid }
//     (holing WSR power at a), putts [putt] }, roll [putt], window [{ v, e,
//     eHow ("0-8" | "negative"), speed (the app's at the cup), unreachable,
//     power, a0, centre, shiftPutts, shift { right, left, mean, signed, k
//     (WSR's line per yd of the app's offset between them) },
//     c (the bisection's centre, app offset), how ("app" | "wsr" | "scan"),
//     centre2s (the putts tried for a centre when the app's line missed),
//     centre2 (the one that holed), sides { right|left: { holedAt, missedAt,
//     holedTo, missedFrom (|offset - c|), holedPass, missedPass, putts } or
//     { failed, putts } } }], checks [{ role, inj, restDelta (u,
//     the look-ahead-only run's rest against the real ball's in a run of the
//     same putt that waited for or traced it), sameVerdict, sameRecords (the
//     hole-out, rest and closest frames) }], timing { createS, putts, puttS,
//     totalS } } } }
// putt: { role (read | read-real | read-trace | roll | roll-check |
//   win-centre | win-centre2 | win-shift | win-edge), inj, heading (rad,
//   player+0x80), power (WSR putter power), dq | e, o, aimHow | v, o, side,
//   skipped (a power under the putter's 0.05 floor, or no aim), ms, loadMs,
//   frames { b, a, state1 } (the swing's frames with B held, A held, state 1),
//   wsr: { src (lookahead | real | trace | real-fallback), holed (holeFrame
//     >= 0), holeFrame, restFrame, closeFrame, landFrame, restAttr, rest
//     (look-ahead rest, ball+0x114), close (closest approach, ball+0x120),
//     pos, life, moving (the real ball, when waited for or traced), restSrc,
//     restFromCup, restAlong, restAcross (the ball -> cup line, + right),
//     pass (|close - cup|), offset (signed by the app's travel direction at
//     its own closest approach), trace { ticks, cut, pass, offset, speed,
//     speedTick, first { pass, offset, speed }, closeOnPath, restOnPath,
//     path [[east, north] yd from the cup every 0.1 s] }, check { restDelta
//     (u, look-ahead rest against the real ball), inCup, holedReal } },
//   app: { angDeg, v0, holed, margin, pass, offset, speed, v (interpolated
//     speed at the closest approach, lib/green.mjs passSpeed), first, rest
//     [along, across], restFromCup } (lib/green.mjs predict, src/putt.js as
//     it was; report.mjs "pins" recomputes it from inj) }
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { HARNESS, STATE } from "./lib/dolphin.mjs";
import { YD, ROOT, kcl, groundAt } from "./lib/course.mjs";
import { P, greenModel, closest, firstPass } from "./lib/green.mjs";
import { waitStroke } from "./lib/play.mjs";
import { pointers, readBall, PTR } from "./lib/wsr.mjs";
import { sleep } from "./lib/dsu.mjs";
import { GdbError } from "./lib/gdb.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(n);
const hole = Number(arg("--hole"));
const greenArg = arg("--green");
if (!hole || !greenArg) { console.log("usage: run-pinputts.mjs --hole H --green <state> [--id sN] [--spots ...|--quick] [--out ...] [--instance N]"); process.exit(1); }
const hh = String(hole).padStart(2, "0");
// --green: an absolute path, a path under state/saves, or one from the working directory
const greenFile = path.isAbsolute(greenArg) ? greenArg : fs.existsSync(path.join(SAVES, greenArg)) ? path.join(SAVES, greenArg) : path.resolve(greenArg);
if (!fs.existsSync(greenFile)) throw new Error(`no green state ${greenArg}`);
const greenRel = path.relative(SAVES, greenFile).replace(/\\/g, "/");
const idArg = arg("--id", null);
const quick = flag("--quick");
const tests = new Set(arg("--tests", "read,roll,window").split(","));
const speeds = arg("--speeds", quick ? "2" : "1,2,3").split(",").map(Number);
const windowSpots = new Set(arg("--window-spots", "r3-a000,r3-a090,r3-a180,r3-a270").split(","));
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const fresh = flag("--fresh");
// --plan: { <spot>: { inj: [heading, power] } }, a putt per spot tried first
// when the spot is made (makeSpot)
const PLANS = arg("--plan", null) ? JSON.parse(fs.readFileSync(path.resolve(arg("--plan")), "utf8")) : {};
// --read-file: { <spot>: { a, q0, src, range } }, the read putted instead of
// solvePutt's (readTest); --no-read-checks skips its waited-for and traced runs
const READS = arg("--read-file", null) ? JSON.parse(fs.readFileSync(path.resolve(arg("--read-file")), "utf8")) : {};

const RINGS = [[3, [0, 45, 90, 135, 180, 225, 270, 315]], [8, [0, 45, 90, 135, 180, 225, 270, 315]], [15, [0, 90, 180, 270]]];
const ALL = ["approach", ...RINGS.flatMap(([R, as]) => as.map((a) => `r${R}-a${String(a).padStart(3, "0")}`))];
const wanted = arg("--spots", null)?.split(",") ?? (quick ? ["approach", "r3-a000", "r3-a090"] : ALL);
for (const n of wanted) if (!ALL.includes(n)) throw new Error(`no spot ${n} (spots: ${ALL.join(", ")})`);
const DQ = [-0.08, -0.06, -0.04, -0.02, 0, 0.02, 0.04, 0.06, 0.08];
const ROLL = [[0.5, 0.3], [0.5, -0.3], [2, 0.3], [2, -0.3], [4, 0.3], [4, -0.3]];
const TRACE_DEG = Number(arg("--trace-deg", 6)), LA_TIMEOUT = 6000, REAL_TIMEOUT = 120000, MAX_TICKS = 12000, PUTTER_MIN = 0.05, MIN_FREE = 5e9;
const CALM = { dir: 0, speedIdx: 0 };
const E = Math.log2(1 / 0.63), YD_S = 240 / 9.144;
// WSR putter power for a launch speed (yd/s), as run-puttread.mjs inverts it
const powerOfV0 = (v) => { const u = v / YD_S; return u > 0.004 ? Math.pow((u - 0.004) / 0.406, 1 / E) : 0; };
const deg = (r) => (r * 180) / Math.PI;
const slopeOf = (n) => deg(Math.atan2(Math.hypot(n[0], n[2]), n[1]));
const hdist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const T0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);

function freeBytes() {
  try { const f = fs.statfsSync(STATE); return f.bavail * f.bsize; } catch { return Infinity; }
}

let s = new Session({ instance: inst, log });
await s.start(greenFile);
const st0 = await s.state();
if (st0.hole !== hole) { await s.stop(); throw new Error(`${greenRel} is on hole ${st0.hole}, not ${hole}`); }
const ball0 = st0.ball.pos, life0 = st0.ball.life, pin = st0.pin;
const expect0 = { pos: ball0, life: life0 };

// ---- the cup ----
const vec3 = (b, o) => [b.readFloatBE(o), b.readFloatBE(o + 4), b.readFloatBE(o + 8)];
const ram = await s.paused(async (gdb) => {
  const p = await pointers(gdb);
  const cfg = await gdb.u32(PTR.glfConfig);
  const c = await gdb.readMem(cfg + 0x38, 0x88);
  const slotTable = [];
  for (let k = 0; k < 16; k++) slotTable.push([c.readInt32BE(8 + 4 * k), c.readInt32BE(0x48 + 4 * k)]);
  const kclMgr = await gdb.u32(0x806f5478);
  const k = await gdb.readMem(kclMgr + 0x68, 0x18);
  const cupObj = await gdb.u32(p.fieldManager + 0x54);
  const cupPos = vec3(await gdb.readMem(await gdb.u32(cupObj + 0x4c), 12), 0);
  return { slot: c.readInt32BE(0), slotTable, kclCup: { prism: k.readUInt32BE(0).toString(16), centre: vec3(k, 4), r: k.readFloatBE(16), depth: k.readFloatBE(20) }, cupObj: cupPos };
});
const WSR = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/wsr-pins.json"), "utf8")).holes[hole];
const wsrSpot = WSR.spots.reduce((b, x) => (!b || Math.hypot(x.mesh[0] - pin[0], x.mesh[2] - pin[2]) < Math.hypot(b.mesh[0] - pin[0], b.mesh[2] - pin[2]) ? x : b), null);
const wsrDist = Math.hypot(wsrSpot.mesh[0] - pin[0], wsrSpot.mesh[1] - pin[1], wsrSpot.mesh[2] - pin[2]);
if (wsrDist > 1) { await s.stop(); throw new Error(`the pin ${pin.map((v) => v.toFixed(1))} is ${wsrDist.toFixed(1)} u from WSR's nearest spot on hole ${hole}`); }
const id = idArg ?? `s${wsrSpot.slots[0]}`;
if (!wsrSpot.slots.includes(Number(id.replace(/^s/, "")))) { await s.stop(); throw new Error(`the state's pin is WSR spot s${wsrSpot.slots.join("/s")} (${wsrSpot.label}), not ${id}`); }
const outFile = path.resolve(HARNESS, arg("--out", `results/pins/h${hh}-${id}.json`));

const m = await kcl(hole);
if (!m) { await s.stop(); throw new Error("no KCL mesh (captures/meshes/wsr-kcl-obj)"); }
const tri = groundAt(m, pin[0], pin[2]);
const hor = Math.hypot(tri.n[0], tri.n[2]), cupSlope = slopeOf(tri.n);
const ref = cupSlope >= 0.5 ? "fall" : "north";
const down = ref === "fall" ? [tri.n[0] / hor, tri.n[2] / hor] : [0, 1];   // the uphill side is -down
const right = [-down[1], down[0]];                                          // right of `down`, looking down it
const ringDir = (a) => { const t = (a * Math.PI) / 180; return [-down[0] * Math.cos(t) + right[0] * Math.sin(t), -down[1] * Math.cos(t) + right[1] * Math.sin(t)]; };
const g0 = greenModel(hole, ball0, pin);
const gr = new Float64Array(2);
g0.field.grad(g0.fCup.x * g0.W, g0.fCup.y * g0.H, gr);
// the app's downhill in east / north (+x east, +y south in the box) against the KCL's
const appDown = [-gr[0], gr[1]], kclDown = [down[0], -down[1]];
const fallOffDeg = Math.hypot(...appDown) > 0 && ref === "fall"
  ? deg(Math.acos(Math.max(-1, Math.min(1, (appDown[0] * kclDown[0] + appDown[1] * kclDown[1]) / Math.hypot(...appDown))))) : null;
const cup = {
  pin, slot: ram.slot, slotTable: ram.slotTable, kclCup: ram.kclCup, cupObj: ram.cupObj,
  wsr: { mesh: wsrSpot.mesh, label: wsrSpot.label, slots: wsrSpot.slots, sets: wsrSpot.sets, yd: wsrSpot.yd }, wsrDist,
  kcl: { slopeDeg: cupSlope, down, attr: tri.attr, n: tri.n }, ref,
  app: { slopeDeg: deg(Math.atan(Math.hypot(gr[0], gr[1]))), grad: [gr[0], gr[1]], fallOffDeg },
};
const traced = cupSlope >= TRACE_DEG;
log(`hole ${hole} ${id} (${wsrSpot.label}, set ${wsrSpot.sets.join("/")}) from ${greenRel}: slot ${ram.slot}, the cup's KCL triangle ${cupSlope.toFixed(2)} deg, the app's ${cup.app.slopeDeg.toFixed(2)} deg${fallOffDeg != null ? ` (fall lines ${fallOffDeg.toFixed(1)} deg apart)` : ""}; ball ${g0.D.toFixed(2)} yd from the cup, lie ${st0.player.lie}; roll putts ${traced ? "traced" : "untraced"}`);

// ---- the output, resumed ----
let res = null;
if (!fresh && fs.existsSync(outFile)) {
  res = JSON.parse(fs.readFileSync(outFile, "utf8"));
  if (res.hole !== hole || res.id !== id || res.green !== greenRel || hdist(res.cup.pin, pin) > 1e-3 || hdist(res.ball0, ball0) > 1e-3) {
    await s.stop();
    throw new Error(`${outFile} holds another cup or green state (hole ${res.hole} ${res.id} ${res.green}); --fresh replaces it`);
  }
  log(`resuming ${path.relative(HARNESS, outFile)}: ${Object.values(res.spots).filter((x) => x.done).length} spots done`);
}
res ??= { kind: "pinputts", version: 1, hole, id, label: wsrSpot.label, slots: wsrSpot.slots, sets: wsrSpot.sets, green: greenRel, startedAt: new Date().toISOString(), spots: {} };
Object.assign(res, { instance: inst, cup, ball0, life0, lie0: st0.player.lie });
// the output written whole to a temporary file and renamed over the last one
// (a run killed while writing leaves the last whole file), retried for up to
// 10 s while Windows refuses the open or the rename to another program
// holding the file (errno UNKNOWN -4094 on open: results/cup-h11.json and
// results/pins/h03-s1-p1.json each lost a run to it once)
const write = () => {
  res.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const text = JSON.stringify(res, (k, v) => (typeof v === "number" ? +v.toFixed(5) : v)), tmp = `${outFile}.${process.pid}.tmp`;
  for (let a = 0; ; a++) {
    try { fs.writeFileSync(tmp, text); fs.renameSync(tmp, outFile); return; } catch (e) {
      if (a >= 40 || !["UNKNOWN", "EBUSY", "EPERM", "EACCES"].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
};

// ---- one putt ----
let slot3 = null, nPutts = 0, puttMs = 0, currentSpot = null;
const loadSpot = (sp) => (sp.slot === 3 ? s.loadSlot(3, sp.expect, `the spot ${sp.name}`) : s.load(greenFile, expect0));
async function realRest(timeoutMs = REAL_TIMEOUT) {
  const t0 = Date.now();
  for (;;) {
    const b = await s.paused(async (gdb) => readBall(gdb, (await pointers(gdb)).ball));
    if (!b.moving && b.life > 0) return b;
    if (Date.now() - t0 > timeoutMs) return { ...b, timedOut: true };
    await sleep(150);
  }
}
// role, the injected heading and power; trace: tick by tick; real: wait for the real ball
async function putt(sp, g, role, heading, power, { trace = false, real = false, extra = {} } = {}) {
  const rec = { role, ...extra, inj: [String(heading), String(power)], heading, power };
  if (!(power >= PUTTER_MIN)) return { ...rec, skipped: `power under the putter's ${PUTTER_MIN} floor` };
  const t0 = Date.now();
  let shot = null, src = trace ? "trace" : real ? "real" : "lookahead", tl = t0;
  for (let attempt = 0; ; attempt++) {
    try {
      await loadSpot(sp);
      tl = Date.now();
      shot = await s.shoot({ power, club: "putter", heading, wind: CALM, trace, maxTicks: MAX_TICKS, untilRest: real ? "real" : undefined, timeoutMs: trace || real ? REAL_TIMEOUT : LA_TIMEOUT });
      break;
    } catch (e) {
      if (!trace && /no rest within the timeout/.test(e.message)) {
        // the look-ahead has no rest for this putt: the real ball's own; a
        // real ball still rolling after REAL_TIMEOUT is kept as it is then
        src = real ? "real" : "real-fallback";
        shot = { ball: real ? { ...(await realRest(0)), timedOut: true } : await realRest(), path: [] };
        break;
      }
      if (attempt >= 1) throw e;
      log(`  ${e.message}; retrying from a fresh load`);
    }
  }
  const b = shot.ball, app = g.predict(heading, power);
  const realBall = src !== "lookahead";
  const w = { src, holed: b.holeFrame >= 0, holeFrame: b.holeFrame, restFrame: b.restFrame, closeFrame: b.closeFrame, landFrame: b.landFrame,
    restAttr: b.restFrame >= 0 ? b.restAttr : null, rest: b.restFrame >= 0 ? b.rest : null, close: b.close };
  if (realBall) Object.assign(w, { pos: b.pos, life: b.life, moving: b.moving, timedOut: b.timedOut || undefined });
  const restPt = realBall ? b.pos : b.rest;
  w.restSrc = realBall ? "real" : "lookahead";
  if (restPt && (realBall || b.restFrame >= 0)) Object.assign(w, { restFromCup: g.fromCup(restPt), restAlong: g.along(restPt), restAcross: g.across(restPt) });
  w.pass = g.fromCup(b.close);
  w.offset = g.signedPass(b.close, app.dir);
  if (trace && shot.path.length) {
    const pts = shot.path.map((r) => [r[1] / YD, -r[3] / YD, r[0] / 240]);
    const c = closest(pts, pin[0] / YD, -pin[2] / YD), f = firstPass(pts, pin[0] / YD, -pin[2] / YD);
    const tick = shot.path[Math.min(c.i, shot.path.length - 1)];
    const onPath = (q) => shot.path.reduce((mn, r) => Math.min(mn, Math.hypot(r[1] - q[0], r[2] - q[1], r[3] - q[2])), Infinity);
    const last = shot.path[shot.path.length - 1];
    w.trace = { ticks: shot.path.length, cut: !!last[9], pass: c.dist, offset: c.offset, speed: c.speed, speedTick: Math.hypot(tick[4], tick[6]) * YD_S,
      first: { pass: f.dist, offset: f.offset, speed: f.speed },
      closeOnPath: onPath(b.close), restOnPath: b.restFrame >= 0 ? Math.hypot(last[1] - b.rest[0], last[2] - b.rest[1], last[3] - b.rest[2]) : null,
      path: shot.path.filter((r, i) => i % 24 === 0 || i === shot.path.length - 1).map((r) => [(r[1] - pin[0]) / YD, -(r[3] - pin[2]) / YD]) };
  }
  if (realBall) {
    const inCup = Math.hypot(b.pos[0] - pin[0], b.pos[2] - pin[2]) < ram.kclCup.r && b.pos[1] < pin[1];
    w.check = { restDelta: b.restFrame >= 0 ? Math.hypot(b.rest[0] - b.pos[0], b.rest[1] - b.pos[1], b.rest[2] - b.pos[2]) : null, inCup, holedReal: inCup };
  }
  rec.wsr = w;
  rec.app = { angDeg: app.angDeg, v0: app.v0, holed: app.holed, margin: app.margin, pass: app.pass, offset: app.offset, speed: app.speed, v: app.v, first: app.first, rest: app.rest, restFromCup: app.restFromCup };
  rec.ms = Date.now() - t0;
  rec.loadMs = tl - t0;
  if (shot.bFrames != null) rec.frames = { b: shot.bFrames, a: shot.aHeldFrames, state1: shot.state1Frames };
  nPutts++; puttMs += rec.ms;
  return rec;
}
const brief = (r) => (r.skipped ? `skipped (${r.skipped})` : `WSR ${r.wsr.holed ? "HOLED" : `missed, rests ${r.wsr.restFromCup?.toFixed(2) ?? "?"} yd from the cup`}${r.wsr.src !== "lookahead" ? ` [${r.wsr.src}]` : ""}, passes ${r.wsr.offset >= 0 ? "+" : ""}${r.wsr.offset.toFixed(3)} | app ${r.app.holed ? "holed" : "missed"}, ${r.app.offset >= 0 ? "+" : ""}${r.app.offset.toFixed(3)} at ${r.app.v.toFixed(2)} yd/s (${(r.ms / 1000).toFixed(1)} s)`);

// ---- making a spot ----
// the putt from the green state's ball that stops at `aim` (KCL x, z): the
// target slid sideways (along the ring's tangent) until the app's roll stops
// within 0.2 yd of it on a path minPass yd or more from the cup, on green.
// Where no slide works, the same again with the roll resting as WSR's stop
// rule rests a ball, up to PLAN_REST_DEG (lib/green.mjs restRoll): the app's
// roll rests nothing on a slope over its CREEP_DEG (12 deg), so on hole 21's
// 12-14 deg faces it could plan no spot that WSR holds (the plan is only a
// first guess; the look-ahead's probes decide, and `plan` records which)
const PLAN_REST_DEG = 15;
function planSpot(u, aim, minPass) {
  const slides = [0];
  for (let k = 1; k <= 12; k++) slides.push(0.25 * k, -0.25 * k);
  for (const restDeg of [null, PLAN_REST_DEG]) for (const sl of slides) {
    const TX = aim[0] - u[1] * sl * YD, TZ = aim[1] + u[0] * sl * YD;
    if (groundAt(m, TX, TZ)?.attr !== 6) continue;
    const p = g0.puttTo(TX, TZ, { vMax: 16, aimSpan: 30, restDeg });
    if (p.pass >= minPass && p.miss < 0.2) return { TX, TZ, slide: sl, p, plan: restDeg == null ? "app" : `rest${restDeg}` };
  }
  return null;
}
async function settle(sp) {
  const w = await waitStroke(s, hole);
  if (w.moved) return null;
  const st = await s.state();
  return { pos: st.ball.pos, life: st.ball.life, lie: st.player.lie };
}
async function saveSpot(sp, at) {
  if (freeBytes() < MIN_FREE) throw new Error(`under ${(MIN_FREE / 1e9).toFixed(0)} GB free on the disk; stopping before another state`);
  slot3 = await s.saveSlot(3);
  const st = await s.state();
  if (hdist(st.ball.pos, at.pos) > 1e-4) throw new Error(`the ball moved while ${sp.name} was saved`);
  sp.slot = 3;
  // the lifetime too, as the session checks every load, unless it moved at rest
  sp.expect = { pos: st.ball.pos, life: st.ball.life === at.life ? st.ball.life : null };
}
// one look-ahead putt from the green state (a probe for a spot's putt: the
// game's own rest and its surface, ball+0x114 / +0x154), retried once on a
// GDB error; null rest when the look-ahead sees no stop within LA_TIMEOUT
async function probe(heading, power) {
  for (let attempt = 0; ; attempt++) {
    try {
      await s.load(greenFile, expect0);
      const b = (await s.shoot({ power, club: "putter", heading, wind: CALM, trace: false, timeoutMs: LA_TIMEOUT })).ball;
      return { holed: b.holeFrame >= 0, rest: b.rest, attr: b.restAttr };
    } catch (e) {
      if (/no rest within the timeout/.test(e.message)) return { holed: false, rest: null, attr: null };
      if (attempt >= 1) throw e;
      log(`  ${e.message}; retrying from a fresh load`);
    }
  }
}
// the spot: the app's plan (planSpot) putted first in the look-ahead only,
// up to 6 times, each plan aimed past the last probe's miss (at most 2 yd
// further each time); the first that rests on the green (attr 6) within tol
// of the spot, else the nearest within 2 tol ("loose"), is putted for real
// and the state saved once the next stroke is ready (its rest checked
// against the probe's: the same putt from the same state)
async function makeSpot(sp, prev) {
  const R = sp.ring, tol = 0.15 + 0.12 * R, nom = sp.nominal;
  const offOf = (q) => Math.hypot(q[0] - nom[0], q[2] - nom[1]) / YD;
  let chosen = null;
  // a spot made before: its putt again (the same state and inputs give the same ball)
  const was = prev?.create?.putt?.inj ?? prev?.create?.attempts?.at(-1)?.inj;
  if (prev?.usable && was) chosen = { inj: was, replay: true };
  const probes = [];
  if (!chosen) {
    let aim = nom, minPass = 0.35;
    // a putt given for the spot with --plan (planned by a model that follows
    // WSR's roll over the KCL triangles closer than the app's does): tried
    // first in the look-ahead, then the app's plans as below
    const given = PLANS[sp.name];
    if (given) {
      const [heading, power] = given.inj.map(Number);
      const pr = await probe(heading, power);
      const x = { inj: given.inj.map(String), heading, power, plan: "given", ...pr, off: pr.rest ? offOf(pr.rest) : null };
      probes.push(x);
      log(`  ${sp.name} probe 1: ${power.toFixed(4)} (given with --plan): ${pr.holed ? "holed" : pr.rest ? `rests ${x.off.toFixed(2)} yd from the spot on attr ${pr.attr}` : "no rest in the look-ahead"}`);
    }
    const givenOk = probes.length && probes[0].rest && !probes[0].holed && probes[0].attr === 6 && probes[0].off <= tol;
    for (let k = probes.length; k < 6 && !givenOk; k++) {
      const plan = planSpot(sp.u, aim, minPass);
      if (!plan) { sp.why = `no putt from the green state's ball stops there clear of the cup in the app's roll, or resting as WSR rests a ball to ${PLAN_REST_DEG} deg (slides to 3 yd)`; break; }
      const heading = g0.toPin - (plan.p.angDeg * Math.PI) / 180, power = plan.p.power;
      const pr = await probe(heading, power);
      const x = { inj: [String(heading), String(power)], heading, power, slide: plan.slide, plan: plan.plan, target: [plan.TX, plan.TZ], appMiss: plan.p.miss, appPass: plan.p.pass, ...pr, off: pr.rest ? offOf(pr.rest) : null };
      probes.push(x);
      log(`  ${sp.name} probe ${k + 1}: ${power.toFixed(4)} at ${plan.p.angDeg.toFixed(2)} deg (slid ${plan.slide}${plan.plan !== "app" ? `, planned with ${plan.plan}` : ""}): ${pr.holed ? "holed" : pr.rest ? `rests ${x.off.toFixed(2)} yd from the spot on attr ${pr.attr}` : "no rest in the look-ahead"}`);
      if (pr.holed) { minPass += 0.25; continue; }
      if (!pr.rest) break;
      if (pr.attr === 6 && x.off <= tol) break;
      const dx = pr.rest[0] - nom[0], dz = pr.rest[2] - nom[1], d = Math.hypot(dx, dz) / YD, f = d > 2 ? 2 / d : 1;
      aim = [aim[0] - dx * f, aim[1] - dz * f];
    }
    const ok = probes.filter((x) => x.rest && !x.holed && x.attr === 6);
    const best = ok.reduce((b, x) => (!b || x.off < b.off ? x : b), null);
    if (!best || best.off > 2 * tol) {
      sp.create = { probes };
      sp.why ??= best ? `the nearest putt rests ${best.off.toFixed(2)} yd from it` : probes.length ? `no putt rests on the green near it (${probes.map((x) => (x.holed ? "holed" : x.rest ? `${x.off.toFixed(1)} yd off, attr ${x.attr}` : "no rest")).join("; ")})` : sp.why;
      return false;
    }
    chosen = best;
  }
  const [heading, power] = chosen.inj.map(Number);
  await s.load(greenFile, expect0);
  const shot = await s.shoot({ power, club: "putter", heading, wind: CALM, trace: false, untilRest: "real", timeoutMs: REAL_TIMEOUT });
  const at = shot.ball.holeFrame >= 0 ? null : await settle(sp);
  if (!at || at.lie !== 6) {
    sp.create = { probes, putt: { inj: chosen.inj, heading, power }, failed: at ? `the real putt rests on lie ${at.lie}` : "the real putt holed" };
    sp.why = sp.create.failed;
    return false;
  }
  const ref = chosen.replay ? prev.ball : chosen.rest;
  sp.create = { probes: chosen.replay ? prev.create.probes : probes, putt: { inj: chosen.inj, heading, power }, replayed: chosen.replay || undefined,
    // the real ball's rest against the probe's (or, replayed, the recorded spot's), u
    delta: Math.hypot(at.pos[0] - ref[0], at.pos[1] - ref[1], at.pos[2] - ref[2]) };
  if (sp.create.delta > 1e-3) log(`  ${sp.name}: the real putt rests ${sp.create.delta.toFixed(4)} u from the ${chosen.replay ? "recorded spot" : "look-ahead's rest"}`);
  const off = offOf(at.pos);
  Object.assign(sp, { ball: at.pos, life: at.life, lie: at.lie, off, loose: off > tol || undefined });
  log(`  ${sp.name}: ${chosen.replay ? "replayed" : "putted"} ${power.toFixed(4)}, rests ${off.toFixed(2)} yd from the spot${sp.loose ? " (loose)" : ""}`);
  await saveSpot(sp, at);
  return true;
}

// ---- the aim for a pass offset, and the speed at the cup ----
// aimAt (lib/green.mjs: aimFor where it holds, else the wide scan of the
// first approach's offset), on o's own side of the holing line; where no aim
// passes at o there (on a steep cup a slow ball aimed above the cup dies and
// rolls back down past it, so no line passes 0.3 yd on that side), the
// nearest aim on that side whose whole roll stays |o| or more from the cup
// ("clear", the closest approach's distance, which is continuous in the
// aim), or, for a ball that stops short even on its nearest line, that line
// turned by atan(|o| / D) ("short"). For o = 0 without a holing line: the
// app's nearest line ("nearest").
function nearestLine(g, v0) {
  const d = (a) => g.appRoll1(a, v0).pass.dist;
  let best = 0;
  for (let a = -60; a <= 60; a += 1) if (d(a) < d(best)) best = a;
  for (let a = best - 1; a <= best + 1 + 1e-9; a += 0.1) if (d(a) < d(best)) best = a;
  return best;
}
function aimOf(g, o, v0) {
  const r = g.aimAt(o, v0, { first: true });
  if (o === 0) return r ?? { a: nearestLine(g, v0), how: "nearest" };
  const a0 = aimOf(g, 0, v0).a, sgn = Math.sign(o);
  if (r && (r.a - a0) * sgn > 0) return r;
  const dist = (a) => g.appRoll1(a, v0).pass.dist;
  // a ball that stops |o| or more short of the cup even on its nearest line
  // (an uphill putt at a small excess): that line turned by the angle |o|
  // subtends at the cup ("short")
  if (dist(a0) >= Math.abs(o)) return { a: a0 + sgn * deg(Math.atan(Math.abs(o) / Math.max(1, g.D))), how: "short" };
  let lo = a0, hi = null;
  for (let k = 1; k <= 240 && hi == null; k++) { const a = a0 + sgn * 0.25 * k; if (dist(a) >= Math.abs(o)) hi = a; else lo = a; }
  if (hi == null) return null;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (dist(mid) >= Math.abs(o)) hi = mid; else lo = mid; }
  return { a: hi, how: "clear" };
}
// the excess whose app roll on the holing line reaches the cup at v (its first
// approach), as run-cupedge.mjs finds it (bisected over 0-8 yd, rounded to
// 4 decimals), and over the negative excess when 0 is already too fast; the
// speed there interpolated between the path's 0.1 s segments (lib/green.mjs
// passSpeed), where run-cupedge.mjs took the segment's mean, which jumps by
// 0.1-0.2 yd/s from one segment to the next (its "1 yd/s" on hole 2 was 0.92)
function excessFor(g, v) {
  const speedAt = (e) => { const v0 = P.wsrPuttV0(g.powerFor(g.D + e)); return g.appRoll1(aimOf(g, 0, v0).a, v0).first.v; };
  const eMin = P.flatStop(P.wsrPuttV0(PUTTER_MIN)) - g.D + 0.01;
  let lo = 0, hi = 8, how = "0-8";
  if (speedAt(0) > v) { lo = Math.min(0, eMin); hi = 0; how = "negative"; }
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (speedAt(mid) < v) lo = mid; else hi = mid; }
  const e = +((lo + hi) / 2).toFixed(4);
  return { e, how, speed: speedAt(e) };
}

// ---- the tests ----
async function readTest(sp, g) {
  // the read: src/putt.js solvePutt's, or one given for the spot with
  // --read-file ({ <spot>: { a (deg right of the cup), q0 (WSR putter power),
  // src, range } }, e.g. a read made by another roll model, to try it in WSR)
  const given = READS[sp.name];
  const rd = given ? { a: given.a, p: P.wsrPuttV0(given.q0) / P.vFlat(g.D), r: { holed: true }, power: given.range ?? null } : P.solvePutt(g.field, g.fBall, g.fCup);
  const vD = P.vFlat(g.D), q0 = given ? given.q0 : powerOfV0(rd.p * vD);
  const heading = g.toPin - (rd.a * Math.PI) / 180;
  sp.read = { a: rd.a, p: rd.p, q0, holes: rd.r.holed, range: rd.power ?? null, src: given ? given.src ?? "given" : undefined, putts: [] };
  log(`  read${given ? ` (given: ${given.src ?? "--read-file"})` : ""}: aim ${rd.a.toFixed(3)} deg power ${q0.toFixed(4)} (${rd.power ? `holes ${rd.power.lo.toFixed(4)}-${rd.power.hi.toFixed(4)}` : rd.r.holed ? "holes" : "a lag line"} in the ${given ? "given model" : "model"})`);
  for (const dq of DQ) {
    const r = await putt(sp, g, "read", heading, q0 + dq, { extra: { dq } });
    sp.read.putts.push(r);
    log(`    ${dq >= 0 ? "+" : ""}${dq.toFixed(2)}: ${brief(r)}`);
  }
  if (flag("--no-read-checks")) return;
  for (const [role, mode] of [["read-real", { real: true }], ["read-trace", { trace: true }]]) {
    const r = await putt(sp, g, role, heading, q0, { ...mode, extra: { dq: 0 } });
    sp.read.putts.push(r);
    const la = sp.read.putts.find((x) => x.role === "read" && x.dq === 0);
    const c = check(la, r);
    log(`    ${role}: ${brief(r)}${c ? `; the look-ahead-only run's rest ${c.restDelta == null ? "(none)" : `${c.restDelta.toFixed(4)} u`} from the real ball's, verdict ${c.sameVerdict ? "same" : "DIFFERENT"}` : ""}`);
  }
}
// the look-ahead against the real ball over two runs of one putt (la: the
// look-ahead-only run, real: a run that waited for or traced the real ball),
// kept in the spot's checks
function check(la, real) {
  if (!la?.wsr || !real?.wsr?.pos) return null;
  const sp = currentSpot;
  const c = { role: real.role, inj: real.inj, restDelta: la.wsr.rest ? Math.hypot(la.wsr.rest[0] - real.wsr.pos[0], la.wsr.rest[1] - real.wsr.pos[1], la.wsr.rest[2] - real.wsr.pos[2]) : null,
    sameVerdict: la.wsr.holed === real.wsr.holed, sameRecords: la.wsr.holeFrame === real.wsr.holeFrame && la.wsr.restFrame === real.wsr.restFrame && la.wsr.closeFrame === real.wsr.closeFrame };
  (sp.checks ??= []).push(c);
  return c;
}
async function rollTest(sp, g) {
  sp.roll = [];
  for (const [e, o] of ROLL) {
    const power = g.powerFor(g.D + e), v0 = P.wsrPuttV0(power), aim = aimOf(g, o, v0);
    const r = aim ? await putt(sp, g, "roll", g.toPin - (aim.a * Math.PI) / 180, power, { trace: traced, extra: { e, o, aimHow: aim.how } })
      : { role: "roll", e, o, power, skipped: `no aim keeps the app's roll ${Math.abs(o)} yd ${o > 0 ? "right" : "left"} of the cup` };
    sp.roll.push(r);
    log(`    e ${e} ${o > 0 ? "+" : ""}${o} (${aim?.how ?? "-"}): ${brief(r)}`);
  }
  const base = sp.roll.find((x) => x.e === 2 && x.o === 0.3 && !x.skipped) ?? sp.roll.find((x) => !x.skipped);
  if (base) {
    const r = await putt(sp, g, "roll-check", base.heading, base.power, { real: !traced, extra: { e: base.e, o: base.o, aimHow: base.aimHow } });
    sp.roll.push(r);
    const c = traced ? check(r, base) : check(base, r);
    log(`    roll-check: ${brief(r)}${c ? `; the look-ahead-only run's rest ${c.restDelta == null ? "(none)" : `${c.restDelta.toFixed(4)} u`} from the real ball's, verdict ${c.sameVerdict ? "same" : "DIFFERENT"}` : ""}`);
  }
}
async function windowTest(sp, g) {
  sp.window = [];
  for (const v of speeds) {
    const x = excessFor(g, v);
    const row = { v, e: x.e, eHow: x.how, speed: x.speed };
    sp.window.push(row);
    if (Math.abs(x.speed - v) > 0.15) { row.unreachable = true; log(`    ${v} yd/s: not reached (the app's roll gets ${x.speed.toFixed(2)} at excess ${x.e})`); continue; }
    const power = g.powerFor(g.D + x.e), v0 = P.wsrPuttV0(power);
    row.power = power;
    const p = async (role, o, extra = {}, mode = {}) => {
      const a = aimOf(g, o, v0);
      if (!a) return { role, v, o, ...extra, power, skipped: `no aim keeps the app's roll ${Math.abs(o)} yd from the cup` };
      return putt(sp, g, role, g.toPin - (a.a * Math.PI) / 180, power, { ...mode, extra: { v, o, aimHow: a.how, ...extra } });
    };
    // WSR's line from a putt passing the cup: its first approach where traced
    // (on a steep cup a slow ball runs past, dies and rolls back, and the
    // look-ahead's closest approach can be the one on the way back), else the
    // look-ahead's closest approach
    const lineOff = (r) => r.wsr.trace?.first?.offset ?? r.wsr.offset;
    row.a0 = aimOf(g, 0, v0).a;
    row.centre = await p("win-centre", 0);
    // WSR's line against the app's: the putts the app passes 0.25 yd right and
    // left (again at 0.4 when WSR holes one: its line is that far over)
    // (traced on cups of --trace-deg or more, for the first approach)
    const tr = { trace: traced };
    let dR = await p("win-shift", 0.25, {}, tr), dL = await p("win-shift", -0.25, {}, tr);
    if (dR.wsr?.holed) dR = await p("win-shift", 0.4, {}, tr);
    if (dL.wsr?.holed) dL = await p("win-shift", -0.4, {}, tr);
    row.shiftPutts = [dR, dL];
    if (!dR.skipped && !dL.skipped && !dR.wsr.holed && !dL.wsr.holed) row.shift = { right: dR.wsr.pass - dR.o, left: -dL.o - dL.wsr.pass, mean: (dR.wsr.pass - dR.o + (-dL.o - dL.wsr.pass)) / 2,
      signed: (lineOff(dR) - dR.o + (lineOff(dL) - dL.o)) / 2, k: (lineOff(dR) - lineOff(dL)) / (dR.o - dL.o) };
    // the bisection's centre: the app's line where its putt holed; else WSR's
    // line as the two putts beside it put it (unreliable on a steep cup, where
    // a slow ball's closest approach can be the one rolling back down), else
    // the first of the app's offsets 0.05 ... 0.2 either side that holes
    let c = 0, how = "app", centre = row.centre;
    if (!row.centre.wsr?.holed) {
      const tries = [];
      if (row.shift && Math.abs(row.shift.signed) <= 0.3) tries.push(+(-row.shift.signed).toFixed(4));
      const first = row.shift && row.shift.signed > 0 ? -1 : 1;
      for (const o of [0.05, 0.1, 0.15, 0.2]) tries.push(first * o, -first * o);
      centre = null;
      for (const o of tries) {
        const r = await p("win-centre2", o);
        (row.centre2s ??= []).push(r);
        if (r.wsr?.holed) { centre = r; c = o; how = tries.indexOf(o) === 0 && row.shift ? "wsr" : "scan"; break; }
      }
      row.centre2 = centre;
    }
    Object.assign(row, { c, how, sides: {} });
    log(`    ${v} yd/s (excess ${x.e}${x.how === "negative" ? ", negative" : ""}, app ${x.speed.toFixed(2)} yd/s): on the app's line ${row.centre.skipped ? "skipped" : row.centre.wsr.holed ? "HOLED" : `missed (${row.centre.wsr.pass.toFixed(3)})`}; ${row.shift ? `WSR's line ${row.shift.signed >= 0 ? "+" : ""}${row.shift.signed.toFixed(4)} off the app's (the putts 0.25 yd either side)` : "no shift putts"}${how !== "app" ? `; ${centre ? `holed on the app's ${c >= 0 ? "+" : ""}${c} (${how})` : "no line holed within 0.2 yd"}` : ""}`);
    if (!centre?.wsr?.holed) continue;
    // each edge: 5 halvings between the centre (holed) and 0.2 yd out (as
    // run-cupedge.mjs); when none of them misses, 0.35 yd out, and 5 more
    for (const [side, sgn] of [["right", 1], ["left", -1]]) {
      let lo = c, hi = +(c + 0.2 * sgn).toFixed(6), loP = centre, hiP = null, broke = null;
      const putts = [];
      const step = async (o) => {
        const r = await p("win-edge", o, { side });
        putts.push(r);
        if (r.skipped) { broke = "an edge putt had no aim"; return; }
        if (r.wsr.holed) { lo = r.o; loP = r; } else { hi = r.o; hiP = r; }
      };
      for (let k = 0; k < 5 && !broke; k++) await step((lo + hi) / 2);
      if (!broke && !hiP) {
        hi = +(c + 0.35 * sgn).toFixed(6);
        await step(hi);
        if (!hiP) broke = "holed out to 0.35 yd";
        for (let k = 0; k < 5 && !broke; k++) await step((lo + hi) / 2);
      }
      row.sides[side] = broke ? { failed: broke, putts }
        : { holedAt: lo, missedAt: hi, holedTo: Math.abs(lo - c), missedFrom: Math.abs(hi - c), holedPass: loP.wsr.pass, missedPass: hiP.wsr.pass, putts };
      log(`      ${side}: ${broke ? broke : `holed to ${Math.abs(lo - c).toFixed(3)} (WSR's pass ${loP.wsr.pass.toFixed(3)}), missed from ${Math.abs(hi - c).toFixed(3)} (${hiP.wsr.pass.toFixed(3)})`}`);
    }
  }
}

// ---- the spots ----
// a Dolphin that stops answering (a GDB halt that times out, a state that
// will not load) is stopped and a fresh one started from the green state,
// and the spot is done again from its start (re-created by its recorded
// putt), once per spot
const restartable = (e) => e instanceof GdbError || /could not load|state did not load|gdb: /.test(e?.message ?? "");
let restarts = 0, copies = 0;
async function restart() {
  copies += s.copies ?? 0;
  try { await s.stop(); } catch { /* already gone */ }
  s = new Session({ instance: inst, log });
  await s.start(greenFile);
  const st = await s.state();
  if (hdist(st.ball.pos, ball0) > 1e-4) throw new Error("the restarted green state's ball is not where it was");
}
for (const name of wanted) {
  for (let attempt = 0; ; attempt++) {
    try { await doSpot(name); break; } catch (e) {
      if (attempt >= 1 || !restartable(e)) throw e;
      restarts++;
      log(`${name}: ${e.message}; restarting Dolphin and doing the spot again`);
      await restart();
    }
  }
}
async function doSpot(name) {
  const prev = res.spots[name];
  if (prev?.done) { log(`${name}: done`); return; }
  const t0 = Date.now(), n0 = nPutts, ms0 = puttMs;
  const sp = { name };
  if (name === "approach") Object.assign(sp, { ring: null, angle: null, nominal: [ball0[0], ball0[2]], kclAttr: groundAt(m, ball0[0], ball0[2])?.attr ?? null });
  else {
    const [, R, a] = name.match(/^r(\d+)-a(\d+)$/).map(Number);
    const u = ringDir(a);
    Object.assign(sp, { ring: R, angle: a, u, nominal: [pin[0] + u[0] * R * YD, pin[2] + u[1] * R * YD] });
    sp.kclAttr = groundAt(m, sp.nominal[0], sp.nominal[1])?.attr ?? null;
  }
  res.spots[name] = sp;
  currentSpot = sp;
  log(`${name}${sp.ring ? `: ${sp.ring} yd at ${sp.angle} deg` : ": the green state's ball"}`);
  let ok;
  if (name === "approach") {
    ok = st0.player.lie === 6;
    if (!ok) sp.why = `the green state's ball lies on ${st0.player.lie}, not the green`;
    Object.assign(sp, { ball: ball0, life: life0, lie: st0.player.lie, off: 0, slot: 4, create: null });
  } else if (sp.kclAttr !== 6) {
    ok = false; sp.why = `the KCL under the spot is attr ${sp.kclAttr}, not green`;
  } else ok = await makeSpot(sp, prev);
  sp.usable = ok;
  const createS = (Date.now() - t0) / 1000;
  if (!ok) {
    log(`  ${name}: not used: ${sp.why}`);
    Object.assign(sp, { done: true, timing: { createS, putts: nPutts - n0, totalS: createS } });
    delete sp.u; delete sp.expect; delete sp.slot;
    write();
    return;
  }
  const g = greenModel(hole, sp.ball, pin);
  const fieldAt = new Float64Array(2);
  g.field.grad(g.fBall.x * g.W, g.fBall.y * g.H, fieldAt);
  const tb = groundAt(m, sp.ball[0], sp.ball[2]);
  sp.D = g.D;
  sp.model = { D: g.D, slopeDeg: deg(Math.atan(Math.hypot(fieldAt[0], fieldAt[1]))), kclSlopeDeg: tb ? slopeOf(tb.n) : null };
  log(`  ${name}: the ball ${g.D.toFixed(2)} yd from the cup${sp.off ? `, ${sp.off.toFixed(2)} yd from the spot` : ""}; slope there ${sp.model.kclSlopeDeg?.toFixed(1)} deg (KCL), ${sp.model.slopeDeg.toFixed(1)} (app)`);
  const save = () => { const { u, expect, slot, ...out } = sp; res.spots[name] = out; write(); };
  // the spot as made, so an interrupted run re-creates it by its putt
  save();
  if (tests.has("read")) { await readTest(sp, g); save(); }
  if (tests.has("roll")) { await rollTest(sp, g); save(); }
  if (tests.has("window") && windowSpots.has(name)) { await windowTest(sp, g); save(); }
  sp.done = true;
  const n = nPutts - n0;
  sp.timing = { createS, putts: n, puttS: n ? (puttMs - ms0) / n / 1000 : null, totalS: (Date.now() - t0) / 1000 };
  save();
  log(`  ${name}: ${n} putts in ${sp.timing.totalS.toFixed(0)} s (${sp.timing.puttS?.toFixed(2)} s a putt, ${createS.toFixed(0)} s to make the spot)`);
}

const spots = Object.values(res.spots);
res.done = ALL.every((n) => res.spots[n]?.done);
const used = spots.filter((x) => x.timing && x.usable);
// this run's timing, and every run's
res.timing = { putts: nPutts, puttS: nPutts ? puttMs / nPutts / 1000 : null, spotS: used.length ? used.reduce((a, x) => a + x.timing.totalS, 0) / used.length : null, totalS: (Date.now() - T0) / 1000, copies: copies + (s.copies ?? 0), restarts };
res.runs = [...(res.runs ?? []), { at: new Date().toISOString(), instance: inst, spots: wanted.filter((n) => res.spots[n]?.done), ...res.timing }];
write();
await s.stop();
// the temporary spot state and Dolphin's undo copy of the one before it
if (slot3) for (const f of [slot3, path.join(path.dirname(slot3), "lastState.sav")]) { try { fs.unlinkSync(f); } catch { /* gone */ } }
log(`wrote ${path.relative(process.cwd(), outFile)}: ${spots.filter((x) => x.usable).length} spots used of ${spots.length}, ${nPutts} putts this run (${res.timing.puttS?.toFixed(2)} s a putt)`);
