// One hole with one pin, in no wind, played to its target with savestates
// (the user, 2026-10-22: "start utilizing save states until you can get an
// eagle on each par 4, hole in one on the par 3, and eagle on par five ...
// for each of the ~6 pin locations ... you can manually set the pin
// locations"; hole 14, "very easy to get an albatross with no wind": 2).
// Every stroke is a real swing through the game's own power pipeline, the club
// and the aim set by D-pad (round-play.mjs's helpers); what is new is the
// state: the cup's tee state (SAVES/pins/hHH-<id>-tee.sav, the pin forced by
// make-pinstates.mjs at the hole's start), the wind set calm, each stroke's
// start saved (Dolphin slot k for stroke k) and loaded again when the stroke
// does not lead to the target.
// - A stroke that must hole: the cells (club, power, aim) round the planner's
//   own plan that round-model.mjs (WSR's ball over the disc's KCL, trees, the
//   flagstick, the cup) predicts to hole, most robust first (the share of its
//   neighbours that hole too); each try's miss corrects the next: the game is
//   deterministic, so the rest it gave against the model's at the power the
//   game launched and the aim the D-pad reached is the model's local error,
//   and a Newton step on (power, aim) through the model's own slopes aims the
//   next try's no-cup rest at the holing cell's.
// - A setup stroke (a par 4's or par 5's drive, a par 5's second): a fan of
//   clubs, powers and lines flown by round-model, the rests in play ranked by
//   how many holing cells the next stroke has from them (two shots ahead), the
//   planner's own plan among them; a setup whose next stroke cannot hole is
//   loaded back and the next one tried.
// - A par 3's ace, once found: its edges, the furthest aims left and right
//   that still hole (the power re-solved for each aim), stepped one D-pad
//   step (0.03 deg) at a time from the tee state (the user: "redo the hole and
//   try to find the left edge and right edge that will curl in allowing you
//   to still get a hole in one").
// - The flag cloth (lib/flagcells.mjs, FLAGSTICK.md; 2026-10-22): from every
//   lie but the green's (6, 10, 11, where the flag is out), a stroke that must
//   hole also has the cells whose flight, or a hop off the ground, the flag
//   cloth catches and WSR would hole (18 of its 21 catches did): flagCells on
//   the model's per-tick path, the flag's frame from the wind the cup's tee
//   state was made with (SAVES/pins/index.json cups[hHH-<id>].wind: the frame
//   is built at the hole's start and keeps that wind; this run writes calm
//   wind), checked against the frame in RAM (pin+0xb8..0xef) at the boot and
//   again once the calm wind is written and the tee saved; a sane RAM frame
//   that differs is the one used. Both routes are one order by a common
//   score: a rolling cell's robustness, a flag cell's robustness x 18/21. The
//   flag search takes about 10 s from a par 3's tee and 15 s from a par 4's or
//   par 5's last approach (test-flagsolve.mjs over 76 of the campaign's final
//   strokes: medians 9.8 and 14.8 s, the longest 46 s, pitches under 25 yd;
//   capped here at 30 s) and no flag cell can score above 18/21, so it runs
//   when the order gets there: at once when no rolling cell scores that high,
//   else once those that do are spent (a robust rolling ace that holes never
//   waits for it). A flag cell that misses
//   is not corrected (off the stick or over the cloth, the no-cup rest the
//   Newton step aims at says nothing of the catch): the next cell is tried.
//   Flag cells have their own MAX_FLAG_CELLS, so the rolling cells keep their
//   MAX_CELLS. Each try records how ("roll" | "flag").
// Results: results/solve/hHH-<id>.json (the target, the strokes that made it,
// every try, the edges), screenshots of the holes made, a log.
//   node tools/harness/hole-solve.mjs --instance 15 --hole 11 --cup s3 [--x 0 --y 0 --w 853 --h 510] [--label "Classic A"]
//   node tools/harness/hole-solve.mjs --dry --hole 17 --cup s5 [--ball x,y,z --lie 1]
//     no Dolphin and nothing written: the cells cellsFor() gives from the cup's
//     tee state as index.json has it (the ball, the pin, lie 15, calm wind; or
//     the --ball and --lie given), in the order finalStroke would try them
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Session, SAVES } from "./lib/session.mjs";
import { shoot } from "./lib/shot.mjs";
import { waitStroke } from "./lib/play.mjs";
import { CLUBS, pointers } from "./lib/wsr.mjs";
import { sleep } from "./lib/dsu.mjs";
import * as P from "./lib/pins.mjs";
import * as RP from "./round-play.mjs";
import * as RM from "./round-model.mjs";
import * as FC from "./lib/flagcells.mjs";
import * as FS from "./lib/flagstick.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
// --dry: no Session, no window, nothing written (no log file, no result); the
// cells printed (dryRun, before the run below). The modules imported above
// only define things: Dolphin starts in Session.start, the DSU socket binds in
// DsuServer.start, the GDB connection opens in Session.start
const DRY = process.argv.includes("--dry");
const inst = Number(arg("--instance", 15)), hole = Number(arg("--hole", NaN)), cupId = arg("--cup", null);
const WX = Number(arg("--x", 0)), WY = Number(arg("--y", 0)), WW = Number(arg("--w", 853)), WH = Number(arg("--h", 510));
const LABEL = arg("--label", `H${hole}`);
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const par = PAR[hole];
const target = hole === 14 ? 2 : { 3: 1, 4: 2, 5: 3 }[par];
const YD = 9.144, DEG = Math.PI / 180, CALM = { dir: 0, speedIdx: 0 };
const OUT = path.join(HERE, "results", "solve", `h${P.hh(hole)}-${cupId}.json`);
const LOGF = path.join(HERE, "state", "solve", `h${P.hh(hole)}-${cupId}.log`);
if (!DRY) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.mkdirSync(path.dirname(LOGF), { recursive: true }); }
const log = (m) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(l); if (!DRY) fs.appendFileSync(LOGF, l + "\n"); };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const CLUB_INDEX = { driver: 0, spoon: 1, "3iron": 2, "5iron": 3, "7iron": 4, "9iron": 5, wedge: 6, putter: 7 };
const BAG = ["driver", "spoon", "3iron", "5iron", "7iron", "9iron", "wedge"];
const BUNKER_CAP = { driver: 0.25, spoon: 0.25, "3iron": 0.5, "5iron": 0.5, "7iron": 0.5, "9iron": 0.5, wedge: 0.75, putter: 1 };
const capOf = (club, lie) => (club === "putter" ? 2.5 : lie === 2 ? 0.75 : lie === 3 || lie === 16 ? BUNKER_CAP[club] : 1);
// a stroke that must hole: up to MAX_CELLS distinct cells, each with up to MAX_NEWTON - 1 corrections
// (the first runs: a cell the model got wrong was rarely rescued by them; another cell was)
const MAX_SETUPS = 6, MAX_CELLS = 8, MAX_NEWTON = 3, EDGE_STEP = 0.03 * DEG;

const cup = P.cupById(hole, cupId);
if (!cup) { console.error(`no cup ${cupId} on hole ${hole}`); process.exit(2); }
const teeFile = P.savePath(P.teeName(cup));
if (!DRY && !fs.existsSync(teeFile)) { console.error(`no tee state ${teeFile} (make-pinstates.mjs --hole ${hole} --ids ${cupId})`); process.exit(3); }
const result = { hole, cup: cupId, label: cup.label, sets: cup.sets, par, target, started: new Date().toISOString(), tries: [], strokes: null, edges: null };
const save = () => { if (!DRY) fs.writeFileSync(OUT, JSON.stringify(result, null, 1)); };
const Planner = await import(`${pathToFileURL(path.join(HERE, "round-planner.mjs")).href}?v=${Date.now()}`);

// ---- the game ----
const s = DRY ? null : new Session({ instance: inst, log: (m) => log(`  ${m}`) });
if (!DRY) {
  process.on("uncaughtException", async (e) => { log(`FAILED: ${e.stack ?? e}`); result.error = String(e.message ?? e); save(); await s.stop().catch(() => {}); process.exit(1); });
  process.on("unhandledRejection", async (e) => { log(`FAILED: ${e?.stack ?? e}`); result.error = String(e?.message ?? e); save(); await s.stop().catch(() => {}); process.exit(1); });
}
let title = "";
function place(t) {
  title = t ?? title;
  const pid = s?.child?.pid;
  if (!pid) return;
  const ps = `Add-Type @'\nusing System; using System.Runtime.InteropServices;\npublic class HS { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h, string s); }\n'@\n$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p -and $p.MainWindowHandle -ne 0) { [HS]::SetWindowPos($p.MainWindowHandle, [IntPtr](-1), ${WX}, ${WY}, ${WW}, ${WH}, 0x0040) | Out-Null; [HS]::SetWindowText($p.MainWindowHandle, '${title.replace(/'/g, "")}') | Out-Null }`;
  try { execFileSync("powershell", ["-NoProfile", "-Command", ps], { timeout: 20000, stdio: "ignore" }); } catch { /* the title can wait */ }
}
const status = (m) => place(`${LABEL} | H${hole} ${cup.label} (${cupId}) | target ${target} | ${m}`);

async function readyState() {
  const w = await waitStroke(s, hole, { maxSteps: 200 });
  if (w.moved) throw new Error(`the game moved on to hole ${w.hole}`);
  return s.state();
}
async function strike(st, c) {
  const gdb = s.gdb, dsu = s.dsu;
  if (![6, 10, 11].includes(st.player.lie)) await RP.dpadClub(gdb, dsu, CLUB_INDEX[c.club]);
  const aim = await RP.dpadAim(gdb, dsu, c.heading, {});
  await gdb.haltSafe();
  const clubStruck = CLUBS[await RP.clubNow(gdb)];
  const shot = await shoot(gdb, { dsu, power: c.power, powerMode: "game", holdWindow: false, keepGameSpin: true, trace: false, untilRest: "real", timeoutMs: 300000 });
  await gdb.go();
  const b = shot.ball;
  const r = { club: clubStruck, power: c.power, gamePower: shot.swingAtHandoff?.power ?? c.power, heading: aim.heading, aimErrDeg: aim.err / DEG, rest: b.pos, holed: b.holeFrame >= 0, hazard: shot.hazard ?? 0, toPin: Math.hypot(b.pos[0] - st.pin[0], b.pos[2] - st.pin[2]) / YD };
  return r;
}

// ---- the model ----
const flags = (st) => ({ hole, ball: st.ball.pos, lie: st.player.lie, wind: CALM, pin: st.pin });
const pred = (st, club, power, heading, withCup = true) => RM.predict({ hole, ball: st.ball.pos, heading, club, power, lie: st.player.lie, wind: CALM, pin: withCup ? st.pin : null });
const restXZ = (p) => [p.rest[0], p.rest[1]];
// a model hole the game repeats: the ball rolling into the cup (its centre
// under 0.25 u above the cup's level as it crosses the window: the model's
// level test allows 2 u, and of the 16 holes it predicted on the first runs
// the game made the 10 whose ball rolled in, h -0.14..0.03 u, and 1 of the 6
// still hopping, h 0.29..1.35 u, the others resting 0.5-1.5 yd away), and no
// flagstick hit faster than 3.4 yd/s (state/flagstick: WSR bounces those out
// at 5.4-8 yd/s, which the model holes by its rim rule)
const holes = (p) => p.holed && !!p.cupPass && p.cupPass.h < 0.25 && (!p.flag || (p.flag.vn * 240) / YD <= 3.4);
// the last resort (hole-solve's "hop" cells, tried only when no rolling or flag
// cell is left): the model's own holes, the ball still hopping as it crosses the
// window included (the game made 1 of the 6 such the first runs predicted), fast
// stick hits still out. h17-s3: a driver rests 0.10 yd from the pin, no cell rolls in
const hopHoles = (p) => p.holed && (!p.flag || (p.flag.vn * 240) / YD <= 3.4);
const MAX_HOP_CELLS = 8;
// the cells round (club, q0, h0) that the model holes, each with its robustness
function holingCells(st, club, q0, h0, { dq = 0.05, sq = 0.005, da = 1.2 * DEG, sa = 0.06 * DEG, rule = holes } = {}) {
  const cap = capOf(club, st.player.lie), lo = club === "putter" ? 0.03 : 0.08, out = [];
  const nq = Math.round(dq / sq), na = Math.round(da / sa);
  const grid = new Map();
  for (let i = -nq; i <= nq; i++) for (let j = -na; j <= na; j++) {
    const q = q0 + i * sq, h = h0 + j * sa;
    if (q < lo || q > cap) continue;
    const p = pred(st, club, q, h);
    const ok = rule(p);
    grid.set(`${i},${j}`, ok);
    if (ok) out.push({ club, power: q, heading: h, i, j });
  }
  for (const c of out) {
    let n = 0, m = 0;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const v = grid.get(`${c.i + a},${c.j + b}`); if (v != null) { m++; if (v) n++; } }
    c.robust = n / Math.max(1, m);
  }
  return out.sort((x, y) => y.robust - x.robust);
}
// finer cells round the best of a coarse set
function refineCells(st, coarse) {
  if (!coarse.length) return [];
  const b = coarse[0];
  const fine = holingCells(st, b.club, b.power, b.heading, { dq: 0.006, sq: 0.0015, da: 0.12 * DEG, sa: 0.02 * DEG });
  return fine.length ? fine : coarse;
}
// every club's own nearest approach to the pin (the no-cup rest: a power scan
// on the pin line, then aim, power, aim and power again round the best) and
// the holing cells round it, most robust first over all the clubs. The
// planner's line can play safe of the pin: on h11-s0 its 7-iron goes 4 deg
// right and rests 9.8 yd off, no cell round it holes, while a 3-iron at 0.52
// rests 0.01 yd from the pin with 46 holing cells round it
// The search per club: the powers whose rest on the pin line comes within 15
// yd of the pin's distance, a grid of them by aims 6 deg either side (0.2 deg
// steps: a green that carries the ball away from the pin can curl one in
// from wide: h17-s2's back-right cup, where no club rests nearer than 4.3 yd
// along the line), the 3 nearest distinct rests refined (aim, power, aim,
// power), and the holing cells round each refined rest within 2 yd
function directCells(st, rule = holes, tag = "direct") {
  const pin = st.pin, ball = st.ball.pos;
  const D = Math.hypot(ball[0] - pin[0], ball[2] - pin[2]) / YD, h0 = Math.atan2(pin[0] - ball[0], pin[2] - ball[2]);
  const off = (p) => Math.hypot(p.rest[0] - pin[0], p.rest[1] - pin[2]) / YD;
  const clubs = st.player.lie === 6 ? ["putter"] : D < 40 ? [...BAG, "putter"] : BAG;
  const out = [];
  for (const club of clubs) {
    const cap = capOf(club, st.player.lie), lo = club === "putter" ? 0.03 : 0.08, step = club === "putter" ? 0.02 : 0.01;
    const at = (q, h) => { const p = pred(st, club, q, h, false); return { q, h, d: off(p), along: p.along ?? 0 }; };
    const line = [];
    for (let q = lo; q <= cap + 1e-9; q += step) line.push(at(q, h0));
    const qs = line.filter((t) => Math.abs(t.along - D) <= 15).map((t) => t.q);
    if (!qs.length) { log(`  direct: ${club} does not come within 15 yd of the pin's distance (${Math.max(...line.map((t) => t.along)).toFixed(0)} yd at most)`); continue; }
    const grid = [];
    for (const q of qs) for (let a = -6; a <= 6 + 1e-9; a += 0.2) grid.push(at(q, h0 + a * DEG));
    grid.sort((x, y) => x.d - y.d);
    const seeds = [];
    for (const g of grid) {
      if (seeds.length >= 3) break;
      if (seeds.some((s0) => Math.abs(s0.q - g.q) < 0.03 && Math.abs(angDiff(s0.h, g.h)) < 1 * DEG)) continue;
      seeds.push(g);
    }
    for (const seed of seeds) {
      let b = seed;
      const scanA = (span, st0) => { const base = b; for (let a = -span; a <= span + 1e-9; a += st0) { const t = at(base.q, base.h + a * DEG); if (t.d < b.d) b = t; } };
      const scanQ = (span, st0) => { const base = b; for (let x = -span; x <= span + 1e-9; x += st0) { const q = base.q + x; if (q < lo || q > cap) continue; const t = at(q, base.h); if (t.d < b.d) b = t; } };
      scanA(0.2, 0.02); scanQ(0.006, 0.0005); scanA(0.03, 0.005); scanQ(0.001, 0.0002);
      if (b.d > 2) { log(`  direct: ${club} near ${seed.q.toFixed(2)}, ${((seed.h - h0) / DEG).toFixed(1)} deg rests ${b.d.toFixed(2)} yd from the pin at best`); continue; }
      const cells = holingCells(st, club, b.q, b.h, { dq: 0.008, sq: 0.001, da: 0.3 * DEG, sa: 0.02 * DEG, rule });
      log(`  direct: ${club} rests ${b.d.toFixed(2)} yd from the pin at ${b.q.toFixed(4)}, ${((b.h - h0) / DEG).toFixed(2)} deg off the pin line: ${cells.length} holing cells${cells[0] ? `, the best ${Math.round(100 * cells[0].robust)}% robust` : ""}`);
      out.push(...cells);
    }
  }
  return out.sort((x, y) => y.robust - x.robust);
}

// ---- the flag cloth (lib/flagcells.mjs) ----
// WSR's flag catches that holed, 18 of 21 (state/flagstick, FLAGSTICK.md): a
// flag cell's score is its robustness times it, a rolling cell's its robustness
const FLAG_RATE = 18 / 21;
// the flag cells a stroke tries, besides the rolling cells' MAX_CELLS (a flag
// cell gets one try, no corrections); the search's budget (test-flagsolve.mjs
// at flagCells' default 60 s: par 3 tees 9.8 s median, 20.1 s at most; the last
// approaches 14.8 s median, 42.4 s p90, 46.3 s at most, the 5 of 40 over 30 s
// pitches of 11-23 yd and one 90 yd stroke, all five flagged truncated)
const MAX_FLAG_CELLS = 6, FLAG_BUDGET_MS = 30000;
const flagWindOf = (w) => {
  if (!w || !Number.isFinite(w.speedIdx)) return null;
  const angle = Number.isFinite(w.angle) ? w.angle : Number.isFinite(w.dir) ? (w.dir * Math.PI) / 4 : null;
  return angle == null ? null : { angle, speedIdx: w.speedIdx, dir: Number.isFinite(w.dir) ? w.dir : Math.round(angle / (Math.PI / 4)) };
};
// the cup's row in SAVES/pins/index.json (its tee state's facts, read from RAM when the state was made)
const CUP_ROW = (() => { try { return P.readPinIndex().cups[P.cupKey(cup)] ?? null; } catch { return null; } })();
// the flag's wind: the tee state's own, the hole's start (the frame keeps it;
// the calm wind this run writes does not turn it), the same for every stroke
// of the hole; flagFromRam replaces it by the frame WSR holds when they differ
let FLAG_WIND = flagWindOf(CUP_ROW?.wind), FLAG_SRC = FLAG_WIND ? "index.json" : null;
const flagDesc = () => {
  if (!FLAG_WIND) return "no flag wind";
  const F = FS.flagFrame([0, 0, 0], FLAG_WIND);
  return `the flag's frame: angle ${((F.t / DEG + 360) % 360).toFixed(1)} deg, speedIdx ${+FLAG_WIND.speedIdx.toFixed(3)}, s ${F.s.toFixed(3)} (${FLAG_SRC})`;
};
// the flag cells from st, most robust first: { cells (how "flag", score), stats, ms } or { cells: [], skip }
function flagSearch(st) {
  const lie = st.player.lie;
  if (FC.flagOut(lie, st.mode)) return { cells: [], skip: `the flag is out from lie ${lie}` };
  if (!FLAG_WIND) return { cells: [], skip: "no flag wind for this cup (index.json, RAM)" };
  const t0 = performance.now();
  try {
    const cells = FC.flagCells(st, { hole, flagWind: FLAG_WIND, capOf, budgetMs: FLAG_BUDGET_MS });
    for (const c of cells) c.score = c.robust * FLAG_RATE;
    return { cells, stats: cells.stats, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { cells: [], skip: `the search failed: ${e?.message ?? e}`, ms: Math.round(performance.now() - t0) };
  }
}
const signed = (x, d = 2) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}`;
function logFlag(fl) {
  if (fl.skip) { log(`  flag: no cells (${fl.skip})`); return; }
  const S = fl.stats, b = fl.cells[0];
  const near = Object.entries(S.clubs).filter(([, C]) => C.closest).sort((x, y) => x[1].closest.e - y[1].closest.e)[0];
  log(`  flag (${flagDesc()}): ${S.cells} holing cells${S.cells > fl.cells.length ? ` (the first ${fl.cells.length} kept)` : ""} in ${(fl.ms / 1000).toFixed(1)} s, ${S.flights} flights${S.truncated ? ", cut short by the budget" : ""}${b
    ? `; the best ${b.club} ${b.power.toFixed(4)} at ${(b.heading / DEG).toFixed(3)} deg (${signed(b.aimOffDeg)} off the pin line), ${Math.round(100 * b.robust)}% robust (score ${b.score.toFixed(2)}), ${b.route}, caught ${b.height} u up ${b.offset} u out at ${b.speed} yd/s, margin ${b.marginU} u${b.verified != null ? `, verified ${b.verified}` : ""}`
    : near ? `; the nearest: ${near[0]} ${near[1].closest.e} box units off at ${near[1].closest.power} ${signed(near[1].closest.aimOffDeg)} deg` : ""}`);
}

// the holing cells for the stroke from st: round the planner's plan, and the
// clubs' direct approaches when that has none or only fragile ones (`cells`,
// the rolling cells: how "roll", score = robust), and when the flag is in the
// flag cloth's (how "flag", score = robust x FLAG_RATE). order() runs through
// both by score (on a tie the rolling cell first), the flag search made when
// the order reaches FLAG_RATE, the best a flag cell can score, or runs out of
// rolling cells; list() is that whole order at once
async function cellsFor(st) {
  const pl = await Planner.plan(hole, st);
  let cells = refineCells(st, holingCells(st, pl.club, pl.power, pl.heading));
  if (!cells.length || cells[0].robust < 0.5) {
    const d = directCells(st);
    if (d.length && (!cells.length || d[0].robust > cells[0].robust)) cells = d;
  }
  for (const c of cells) { c.how = "roll"; c.score = c.robust; }
  let fl = null;
  const flag = () => { if (!fl) { fl = flagSearch(st); logFlag(fl); } return fl; };
  let hp = null;
  const hop = () => {
    if (!hp) {
      hp = directCells(st, hopHoles, "hop").map((c) => ({ ...c, how: "hop", score: c.robust / 6 }));
      log(`  hop: ${hp.length} cells the model holes with the ball still hopping (the last resort)${hp[0] ? `; the best ${hp[0].club} ${hp[0].power.toFixed(4)} at ${(hp[0].heading / DEG).toFixed(3)} deg, ${Math.round(100 * hp[0].robust)}% robust` : ""}`);
    }
    return hp;
  };
  function* order() {
    let i = 0, j = 0, F = null;
    for (;;) {
      const r = cells[i];
      if (!F && (!r || r.score < FLAG_RATE)) F = flag().cells;
      const f = F?.[j];
      if (r && (!f || r.score >= f.score)) { i++; yield r; }
      else if (f) { j++; yield f; }
      else break;
    }
    for (const hc of hop()) yield hc;
  }
  return { plan: pl, cells, flag, order, list: () => [...order()] };
}
// the cells finalStroke strikes, in order: distinct (no two of a club within
// 0.004 of power and 0.08 deg of aim), at most MAX_CELLS rolling and
// MAX_FLAG_CELLS flag cells; n = the cell's number
function* distinct(cells) {
  const used = [];
  let nRoll = 0, nFlag = 0, nHop = 0;
  for (const cell of cells) {
    const flag = cell.how === "flag", hopc = cell.how === "hop";
    if (nRoll >= MAX_CELLS && nFlag >= MAX_FLAG_CELLS && nHop >= MAX_HOP_CELLS) return;
    if (flag ? nFlag >= MAX_FLAG_CELLS : hopc ? nHop >= MAX_HOP_CELLS : nRoll >= MAX_CELLS) continue;
    if (used.some((u) => u.club === cell.club && Math.abs(u.power - cell.power) < 0.004 && Math.abs(angDiff(u.heading, cell.heading)) < 0.08 * DEG)) continue;
    used.push(cell);
    if (flag) nFlag++; else if (hopc) nHop++; else nRoll++;
    yield { cell, n: used.length };
  }
}
// the model's slopes of the no-cup rest in (power, aim) at a cell
function slopes(st, c) {
  const e = 0.002, a = 0.02 * DEG;
  const q1 = restXZ(pred(st, c.club, c.power + e, c.heading, false)), q0 = restXZ(pred(st, c.club, c.power - e, c.heading, false));
  const h1 = restXZ(pred(st, c.club, c.power, c.heading + a, false)), h0 = restXZ(pred(st, c.club, c.power, c.heading - a, false));
  return [[(q1[0] - q0[0]) / (2 * e), (h1[0] - h0[0]) / (2 * a)], [(q1[1] - q0[1]) / (2 * e), (h1[1] - h0[1]) / (2 * a)]];
}
function solve2(J, v) {
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  if (Math.abs(det) < 1e-12) return null;
  return [(J[1][1] * v[0] - J[0][1] * v[1]) / det, (-J[1][0] * v[0] + J[0][0] * v[1]) / det];
}

// ---- the search ----
let tryNo = 0;
async function loadBack(saved) { await s.loadSlot(saved.slot, saved.expect); }
async function saveHere(k) {
  const st = await s.state();
  await s.saveSlot(k);
  return { slot: k, expect: { pos: st.ball.pos, life: st.ball.life }, st };
}
function record(k, st, c, r, why) {
  tryNo++;
  const how = c.how ?? "roll";
  const row = { n: tryNo, k, why, how, from: st.ball.pos, lie: st.player.lie, club: c.club, plannedPower: c.power, ...r };
  if (how === "flag" && c.route) row.flag = { route: c.route, robust: c.robust, score: +c.score.toFixed(3), aimOffDeg: c.aimOffDeg, height: c.height, offset: c.offset, speed: c.speed, marginU: c.marginU,
    holedEst: c.holedEst, kclHoled: c.kcl?.holed ?? null, verified: c.verified ?? null, wind: FLAG_WIND, src: FLAG_SRC };
  result.tries.push(row); save();
  log(`try ${tryNo}, stroke ${k} (${why}, ${how}): ${r.club} ${r.power.toFixed(4)} (game ${r.gamePower.toFixed(4)}) aim ${(r.heading / DEG).toFixed(3)} deg: ${r.holed ? "HOLED" : `rests ${r.toPin.toFixed(2)} yd from the pin${r.hazard ? ` (hazard ${r.hazard})` : ""}`}`);
  return row;
}
// the stroke that must hole: the cells by score, a rolling cell corrected by
// what the tries from it gave, a flag cell tried once
async function finalStroke(k, saved) {
  const st = saved.st;
  const { plan, cells, order } = await cellsFor(st);
  log(`stroke ${k} must hole from ${(Math.hypot(st.ball.pos[0] - st.pin[0], st.ball.pos[2] - st.pin[2]) / YD).toFixed(1)} yd (lie ${st.player.lie}): ${cells.length} holing cells round the planner's ${plan.club} ${plan.power.toFixed(3)}${cells[0] ? `; the best ${cells[0].club} ${cells[0].power.toFixed(4)} at ${(cells[0].heading / DEG).toFixed(3)} deg, ${Math.round(100 * cells[0].robust)}% of its neighbours hole` : ""}${FC.flagOut(st.player.lie, st.mode) ? "" : `; the flag cells ${!cells.length || cells[0].score < FLAG_RATE ? "next" : `once the rolling cells of ${Math.round(100 * FLAG_RATE)}% and more are spent`}`}`);
  let first = true;
  for (const { cell, n } of distinct(order())) {
    const how = cell.how ?? "roll";
    // a flag cell's miss is not corrected: off the stick or over the cloth, its
    // no-cup rest says nothing of the catch (the next cell instead)
    const T = how !== "roll" ? null : restXZ(pred(st, cell.club, cell.power, cell.heading, false));
    let c = { ...cell };
    for (let it = 0; it < MAX_NEWTON; it++) {
      if (!first) await loadBack(saved);
      first = false;
      status(`stroke ${k} try ${tryNo + 1}`);
      const r = await strike(st, c);
      record(k, st, c, r, it === 0 ? `cell ${n}` : `cell ${n}, correction ${it}`);
      if (r.holed) return { strokes: [{ k, ...r, how }] };
      if (how !== "roll") break;   // a flag or hop cell's miss: the next cell
      // the model's error at the power the game launched and the aim reached; the step to cancel it
      const at = { club: c.club, power: r.gamePower, heading: r.heading };
      const J = slopes(st, at), R = [r.rest[0], r.rest[2]];
      const d = solve2(J, [T[0] - R[0], T[1] - R[1]]);
      if (!d) break;
      const dq = Math.max(-0.03, Math.min(0.03, d[0])), dh = Math.max(-0.5 * DEG, Math.min(0.5 * DEG, d[1]));
      c = { ...c, power: Math.min(capOf(c.club, st.player.lie), Math.max(0.03, r.gamePower + dq)), heading: r.heading + dh };
      if (Math.abs(dq) < 0.0003 && Math.abs(dh) < 0.008 * DEG) break;   // nothing left to correct with: another cell
    }
  }
  return null;
}
// how many holing cells the stroke after a setup would have from where the
// setup comes to rest (two shots ahead): per club, its own nearest no-cup
// approach to the pin (a power scan on the pin line, then power, aim, power,
// aim refined round the best; the lie's launch yaw is the model's), and the
// holing cells on the final stroke's fine grid round it (0.001 of power, 0.02
// deg). The coarse grid before (0.004 x 0.08 deg round the power whose stop
// along the line is the distance) found none from any of h15-s1's 100 rests
// once a model hole had to roll in
function holeability(rest, st) {
  const lie = rest.lie, pin = st.pin, ball = [rest[0], rest.y ?? st.ball.pos[1], rest[1]];
  const D = Math.hypot(rest[0] - pin[0], rest[1] - pin[2]) / YD;
  const h0 = Math.atan2(pin[0] - rest[0], pin[2] - rest[1]);
  const off = (p) => Math.hypot(p.rest[0] - pin[0], p.rest[1] - pin[2]) / YD;
  const clubs = lie === 6 ? ["putter"] : D < 40 ? [...BAG, "putter"] : BAG;
  let best = 0;
  for (const club of clubs) {
    const cap = capOf(club, lie), lo = club === "putter" ? 0.03 : 0.08;
    const at = (q, h) => ({ q, h, d: off(RM.predict({ hole, ball, heading: h, club, power: q, lie, wind: CALM, pin: null })) });
    let b = null;
    for (let q = lo; q <= cap + 1e-9; q += 0.02) { const t = at(q, h0); if (!b || t.d < b.d) b = t; }
    if (!b || b.d > 12) continue;
    const scanQ = (span, step) => { const base = b; for (let x = -span; x <= span + 1e-9; x += step) { const q = base.q + x; if (q < lo || q > cap) continue; const t = at(q, base.h); if (t.d < b.d) b = t; } };
    const scanA = (span, step) => { const base = b; for (let a = -span; a <= span + 1e-9; a += step) { const t = at(base.q, base.h + a * DEG); if (t.d < b.d) b = t; } };
    scanQ(0.02, 0.002); scanA(3, 0.25); scanQ(0.003, 0.0005); scanA(0.25, 0.025);
    if (b.d > 2) continue;
    let n = 0;
    for (let i = -4; i <= 4; i++) for (let j = -8; j <= 8; j++) {
      const q = b.q + i * 0.001;
      if (q < lo || q > cap) continue;
      const p = RM.predict({ hole, ball, heading: b.h + j * 0.02 * DEG, club, power: q, lie, wind: CALM, pin });
      if (holes(p)) n++;
    }
    best = Math.max(best, n);
    if (best >= 12) break;
  }
  return best;
}
const LIE_OK = { fairway: 1, green: 6, fringe: 9, rough: 2 };
async function rankSetups(st, k) {
  const pl = await Planner.plan(hole, st);
  const toPin = Math.atan2(st.pin[0] - st.ball.pos[0], st.pin[2] - st.ball.pos[2]);
  const cands = [{ club: pl.club, power: pl.power, heading: pl.heading, src: "the planner" }];
  const clubs = st.player.lie === 3 ? ["3iron", "5iron", "7iron", "9iron", "wedge"] : ["driver", "spoon", "3iron", "5iron", "7iron"];
  for (const d of [0, 2, -2, 4, -4, 6, -6, 9, -9, 12, -12, 16, -16, 20, -20, 25, -25, 30, -30]) for (const club of clubs) {
    const cap = capOf(club, st.player.lie);
    for (const q of [cap, cap - 0.04, cap - 0.08, cap - 0.14]) cands.push({ club, power: +q.toFixed(3), heading: toPin + d * DEG, src: "fan" });
  }
  const rests = [];
  for (const c of cands) {
    const p = pred(st, c.club, c.power, c.heading);
    if (holes(p)) { rests.push({ ...c, rest: Object.assign([p.rest[0], p.rest[1]], { lie: 6, y: p.restY }), restLie: "cup", toPin: 0, score: 1e6 }); continue; }
    if (p.hazard || !(p.restLie in LIE_OK)) continue;
    if (p.tree) continue;
    const rest = Object.assign([p.rest[0], p.rest[1]], { lie: LIE_OK[p.restLie], y: p.restY });
    if (rests.some((r) => Math.hypot(r.rest[0] - rest[0], r.rest[1] - rest[1]) / YD < 6)) continue;
    rests.push({ ...c, rest, restLie: p.restLie, toPin: p.toPin });
  }
  // the nearest 14 distinct rests to the pin (and the planner's) valued two shots ahead
  rests.sort((a, b) => a.toPin - b.toPin);
  const pick = rests.slice(0, 14);
  const planned = rests.find((r) => r.src === "the planner");
  if (planned && !pick.includes(planned)) pick.push(planned);
  for (const r of pick) if (r.score == null) r.score = k + 1 === target ? holeability(r.rest, st) : -r.toPin / 50;
  pick.sort((a, b) => b.score - a.score || a.toPin - b.toPin);
  log(`stroke ${k} (a setup): ${rests.length} distinct rests in play; the best: ${pick.slice(0, 5).map((r) => `${r.club} ${r.power.toFixed(2)} ${(angDiff(r.heading, toPin) / DEG).toFixed(0)} deg -> ${r.restLie} ${r.toPin.toFixed(0)} yd (${k + 1 === target ? `${r.score} holing cells` : "next a setup"})`).join("; ")}`);
  return pick;
}
// the strokes from here to the target, or null
async function solveFrom(k, saved) {
  if (k > target) return null;
  if (k === target) return finalStroke(k, saved);
  const setups = await rankSetups(saved.st, k);
  let first = true;
  for (const c of setups.slice(0, MAX_SETUPS)) {
    // no early stop when the coarse look-ahead finds no holing cell from any
    // rest (h15-s0: the rolling-in rule leaves the coarse grid none): the
    // setups go nearest the pin first and the full search runs from the rest
    if (!first) await loadBack(saved);
    first = false;
    status(`stroke ${k} (setup) try ${tryNo + 1}`);
    const r = await strike(saved.st, c);
    record(k, saved.st, c, r, `setup ${c.src}`);
    if (r.holed) return { strokes: [{ k, ...r }] };
    if (r.hazard) continue;
    const st2 = await readyState();
    if (st2.hole !== hole) continue;
    const saved2 = await saveHere(k + 1);
    const sub = await solveFrom(k + 1, saved2);
    if (sub) return { strokes: [{ k, ...r }, ...sub.strokes] };
  }
  return null;
}

// a par 3's ace edges: from the ace's aim, one D-pad step at a time each way,
// at each aim up to EDGE_TRIES tries, the first at the model's most robust
// holing power there (else the last aim's), each miss correcting the power
// by the model's slope of the no-cup rest along the aim (a near miss), or by
// 0.004 toward the pin (a far one: the cup or the stick threw it), until an
// aim no try holes. v 2: the first edges (v 1, one retry at ±0.004) called
// an aim the edge after a single unlucky try (h04-s1, h11-s2: 0.000 deg)
const EDGE_TRIES = 3;
async function edges(tee, ace) {
  const st = tee.st, pin = st.pin, out = { v: 2 };
  for (const [side, dir] of [["left", 1], ["right", -1]]) {
    let last = { heading: ace.heading, power: ace.gamePower }, q = ace.gamePower;
    for (let n = 1; n <= 40; n++) {
      const h = ace.heading + dir * n * EDGE_STEP;
      const cells = holingCells(st, ace.club, q, h, { dq: 0.02, sq: 0.002, da: 0, sa: 1 });
      if (cells.length) q = cells[0].power;
      // the route the try's power came from: a rolling cell here, else the ace's own
      const how = cells.length ? "roll" : (ace.how ?? "roll");
      let hit = null;
      for (let t = 1; t <= EDGE_TRIES && !hit; t++) {
        await loadBack(tee);
        status(`ace edge ${side}: step ${n}${t > 1 ? ` try ${t}` : ""}`);
        const r = await strike(st, { club: ace.club, power: q, heading: h });
        record(1, st, { club: ace.club, power: q, heading: h, how }, r, `edge ${side} ${n}${t > 1 ? ` try ${t}` : ""}`);
        if (r.holed) { hit = r; break; }
        const along = (p) => (p[0] - pin[0]) * Math.sin(r.heading) + (p[1] - pin[2]) * Math.cos(r.heading);
        const e = 0.002;
        const slope = (along(restXZ(pred(st, ace.club, r.gamePower + e, r.heading, false))) - along(restXZ(pred(st, ace.club, r.gamePower - e, r.heading, false)))) / (2 * e);
        const miss = along([r.rest[0], r.rest[2]]);
        const dq = r.toPin < 3 && Math.abs(slope) > 1 ? -miss / slope : miss > 0 ? -0.004 : 0.004;
        q = Math.min(capOf(ace.club, st.player.lie), Math.max(0.03, r.gamePower + Math.max(-0.01, Math.min(0.01, dq))));
      }
      if (!hit) break;
      last = { heading: hit.heading, power: hit.gamePower };
      q = hit.gamePower;
    }
    const off = angDiff(last.heading, ace.heading) / DEG;
    const D = Math.hypot(st.ball.pos[0] - st.pin[0], st.ball.pos[2] - st.pin[2]) / YD;
    out[side] = { aimDeg: +(last.heading / DEG).toFixed(4), offDeg: +off.toFixed(3), power: +last.power.toFixed(4), acrossYd: +(Math.abs(off) * DEG * D).toFixed(2) };
    log(`ace edge ${side}: ${Math.abs(off).toFixed(3)} deg ${side} of the ace's aim (${out[side].acrossYd} yd across at the pin), power ${last.power.toFixed(4)}`);
  }
  const D = Math.hypot(st.ball.pos[0] - st.pin[0], st.ball.pos[2] - st.pin[2]) / YD;
  out.widthDeg = +(Math.abs(out.left.offDeg) + Math.abs(out.right.offDeg)).toFixed(3);
  out.widthYd = +(out.widthDeg * DEG * D).toFixed(2);
  log(`ace window: ${out.widthDeg} deg wide (${out.widthYd} yd across at the pin, ${D.toFixed(1)} yd out)`);
  return out;
}

// ---- the flag's frame in RAM ----
// pin+0xb8..0xef as 14 floats (state/flagstick/mlib.mjs readPinFrame): +0xb8
// speedIdx / 15, +0xc0 across, +0xcc up, +0xd8 along, +0xe4 the cloth's
// centre; with the pin's position: { raw, pin, sane } or null. Never throws
async function readFlagFrame() {
  try {
    const got = await s.paused(async (gdb) => {
      const p = await pointers(gdb);
      const b = await gdb.readMem(p.pin, 0x100), q = await gdb.readMem(p.pinPos, 12);
      const raw = [];
      for (let o = 0xb8; o < 0xf0; o += 4) raw.push(b.readFloatBE(o));
      return { raw, pin: [q.readFloatBE(0), q.readFloatBE(4), q.readFloatBE(8)] };
    });
    const { raw, pin } = got, G = FS.FLAG.flag;
    const sane = raw.length === 14 && raw.every(Number.isFinite) && pin.every(Number.isFinite) && raw[0] >= -1e-6 && raw[0] <= 1 + 1e-6
      && Math.abs(Math.hypot(raw[2], raw[3], raw[4]) - 1) < 1e-3 && Math.abs(raw[3]) < 1e-3 && Math.abs(raw[6] - 1) < 1e-3
      && Math.abs(raw[9] + G.droop) < 1e-3 && Math.abs(raw[12] - (pin[1] + G.up - G.droop * G.out)) < 0.5;
    return { raw, pin, sane };
  } catch (e) {
    log(`flag: the frame in RAM could not be read (${e?.message ?? e})`);
    return null;
  }
}
// how far the frame in RAM is from flagFrame(its pin, w): the largest
// difference over its axes and centre (u)
function frameDiff(fr, w) {
  const F = FS.flagFrame(fr.pin, w);
  const want = [...F.ax, ...F.az, ...F.origin], have = [...fr.raw.slice(2, 5), ...fr.raw.slice(8, 11), ...fr.raw.slice(11, 14)];
  return Math.max(...want.map((v, i) => Math.abs(v - have[i])));
}
// the frames read at the boot and once the calm wind was written and the tee
// saved (the one the strokes meet), against the flag wind from index.json:
// logged and kept in the result; a sane frame that differs (the later one
// first), or the only flag wind there is, becomes FLAG_WIND. Never throws
function flagFromRam(before, after) {
  try {
    const idx = FLAG_WIND;
    const brief = (fr) => (fr ? { sane: fr.sane, wind: fr.sane ? FC.flagWindFromFrame(fr.raw) : null, diffU: fr.sane && idx ? +frameDiff(fr, idx).toExponential(2) : null, raw: fr.raw.map((x) => +x.toFixed(5)) } : null);
    result.flagFrame = { index: CUP_ROW?.wind ?? null, boot: brief(before), tee: brief(after) };
    const use = after?.sane ? after : before?.sane ? before : null;
    const say = (fr) => { const w = FC.flagWindFromFrame(fr.raw); return `angle ${((w.angle / DEG + 360) % 360).toFixed(1)} deg, speedIdx ${+w.speedIdx.toFixed(3)}`; };
    for (const [name, fr] of [["at the boot", before], ["after the calm wind and the tee save", after]]) {
      if (!fr) continue;
      if (!fr.sane) { log(`flag: the frame in RAM ${name} does not read as a flag frame ([${fr.raw.map((x) => +x.toFixed(3)).join(", ")}])`); continue; }
      if (idx) { const d = frameDiff(fr, idx); log(`flag: the frame in RAM ${name} ${d < 0.01 ? "matches" : "DIFFERS from"} flagFrame(pin, index.json's wind: angle ${((idx.angle / DEG + 360) % 360).toFixed(1)} deg, speedIdx ${idx.speedIdx}) ${d < 0.01 ? `to ${d.toExponential(1)} u` : `by ${d.toFixed(3)} u (RAM: ${say(fr)})`}`); }
      else log(`flag: the frame in RAM ${name}: ${say(fr)} (index.json has no wind for ${P.cupKey(cup)})`);
    }
    if (use && (!idx || frameDiff(use, idx) >= 0.01)) {
      FLAG_WIND = flagWindOf(FC.flagWindFromFrame(use.raw));
      FLAG_SRC = use === after ? "RAM, after the calm wind" : "RAM, at the boot";
      log(`flag: the flag cells use the frame in RAM (${flagDesc()})`);
    }
    result.flagFrame.used = { wind: FLAG_WIND, src: FLAG_SRC };
    save();
  } catch (e) { log(`flag: the frame check failed (${e?.message ?? e}); ${flagDesc()}`); }
}

// ---- --dry: the cells from the cup's tee state, no Dolphin ----
async function dryRun() {
  const row = CUP_ROW;
  if (!row?.tee?.pos || !row?.pinRam) throw new Error(`index.json has no tee state for ${P.cupKey(cup)} (make-pinstates.mjs --hole ${hole} --ids ${cupId})`);
  const xyz = (v) => { const a = String(v).split(",").map(Number); if (a.length !== 3 || !a.every(Number.isFinite)) throw new Error(`--ball takes x,y,z in u, not ${v}`); return a; };
  const ballArg = arg("--ball", null), lieArg = arg("--lie", null);
  const ball = ballArg ? xyz(ballArg) : row.tee.pos, lie = lieArg != null ? Number(lieArg) : 15, pin = row.pinRam;
  if (!Number.isInteger(lie)) throw new Error(`--lie takes the game's lie number, not ${lieArg}`);
  const toPin = Math.atan2(pin[0] - ball[0], pin[2] - ball[2]);
  // the game's own aim at address (player+0x84, which the planner reads) is not in
  // index.json: at the tee the hole's own tee state's (SAVES/index.json, a fixed
  // yaw per hole: 160.000 deg on 11, 169.000 on 17), else the pin line
  let aim = null, aimFrom = "the pin line";
  if (!ballArg) try { const t = JSON.parse(fs.readFileSync(path.join(SAVES, "index.json"), "utf8"))[hole]; if (Array.isArray(t?.aim) && t.aim.length === 2 && t.aim.every(Number.isFinite)) { aim = t.aim; aimFrom = "the hole's tee state (SAVES/index.json)"; } } catch { /* the pin line */ }
  aim ??= [Math.sin(toPin), Math.cos(toPin)];
  const st = { hole, mode: row.mode ?? null, pin, wind: { angle: 0, speedIdx: 0, dir: 0 }, player: { lie, aim, heading: Math.atan2(aim[0], aim[1]) }, ball: { pos: ball, life: 0, moving: 0 } };
  const D = Math.hypot(ball[0] - pin[0], ball[2] - pin[2]) / YD;
  log(`--dry: hole ${hole} (par ${par}) cup ${cupId} (${cup.label}): ${D.toFixed(1)} yd to the pin, ${Math.abs((pin[1] - ball[1]) / YD).toFixed(1)} yd ${pin[1] >= ball[1] ? "above" : "below"} the ball (${ballArg ? "--ball" : "index.json's tee"} [${ball.map((v) => v.toFixed(1)).join(", ")}], lie ${lie}), calm wind; the game's aim from ${aimFrom}, ${(Math.atan2(aim[0], aim[1]) / DEG).toFixed(3)} deg; ${flagDesc()}`);
  const t0 = performance.now();
  const c = await cellsFor(st);
  const tRoll = performance.now() - t0;
  const live = FC.flagOut(lie, st.mode) ? "" : `; a live run searches the flag ${!c.cells.length || c.cells[0].score < FLAG_RATE ? "before its first try" : `only once the rolling cells of ${Math.round(100 * FLAG_RATE)}% and more are spent`}`;
  const all = c.list(), fl = c.flag();
  log(`--dry: ${c.cells.length} rolling cells round the planner's ${c.plan.club} ${c.plan.power.toFixed(3)} at ${(c.plan.heading / DEG).toFixed(3)} deg (${(tRoll / 1000).toFixed(1)} s); ${fl.skip ? `no flag cells (${fl.skip})` : `${fl.cells.length} flag cells (${(fl.ms / 1000).toFixed(1)} s)`}${live}; ${all.length} cells in the order`);
  const line = (x, i) => `  ${String(i).padStart(2)}  ${x.how.padEnd(4)}  ${x.club.padEnd(6)}  ${x.power.toFixed(4)}  ${(x.heading / DEG).toFixed(3).padStart(13)}  ${x.robust.toFixed(2).padStart(6)}  ${x.score.toFixed(2).padStart(5)}${x.how === "flag"
    ? `  ${x.route}, ${signed(x.aimOffDeg)} deg off the pin line, caught ${x.height} u up ${x.offset} u out at ${x.speed} yd/s, margin ${x.marginU} u, flat ${x.flat.how}, KCL ${x.kcl.holed ? "holed" : `${x.kcl.restYd} yd`}${x.verified != null ? `, verified ${x.verified}` : ""}` : ""}`;
  console.log(`the order, the first 10 (of ${all.length}):\n   #  how   club     power  heading (deg)  robust  score`);
  all.slice(0, 10).forEach((x, i) => console.log(line(x, i + 1)));
  const tries = [...distinct(all)];
  console.log(`the distinct cells finalStroke would strike, in order (${tries.length}: at most ${MAX_CELLS} rolling, ${MAX_FLAG_CELLS} flag):`);
  for (const { cell, n } of tries) console.log(line(cell, n));
}
if (DRY) {
  try { await dryRun(); } catch (e) { console.error(`--dry failed: ${e?.stack ?? e}`); process.exit(1); }
  process.exit(0);
}

// ---- run ----
const t0 = Date.now();
log(`hole ${hole} (par ${par}) cup ${cupId} (${cup.label}, set ${cup.sets.join("/")}): target ${target}; instance ${inst}; booting ${path.basename(teeFile)}`);
await s.start(teeFile);
result.dolphinPid = s.child?.pid ?? null;   // solve-course.mjs stops it if this run hangs
save();
status("booted");
const flagBoot = await readFlagFrame();   // the flag's frame as the hole began, before the calm wind
await s.paused(async (gdb) => RP.applyWind(gdb, hole, CALM));
const stTee = await s.state();
log(`at the tee: ${(Math.hypot(stTee.ball.pos[0] - stTee.pin[0], stTee.ball.pos[2] - stTee.pin[2]) / YD).toFixed(1)} yd to the pin, wind set calm (dir ${stTee.wind.dir} idx ${stTee.wind.speedIdx})`);
const tee = await saveHere(1);
flagFromRam(flagBoot, await readFlagFrame());
const sol = await solveFrom(1, tee);
result.solved = !!sol;
result.strokes = sol?.strokes ?? null;
result.ms = Date.now() - t0;
save();
if (sol) {
  log(`SOLVED: hole ${hole} cup ${cupId} in ${sol.strokes.length} (target ${target}) after ${tryNo} tries, ${(result.ms / 60000).toFixed(1)} min: ${sol.strokes.map((x) => `${x.club} ${x.gamePower.toFixed(4)} at ${(x.heading / DEG).toFixed(3)} deg${x.how === "flag" ? " (through the flag)" : ""}`).join(", ")}`);
  try { await sleep(2500); result.screenshot = path.relative(HERE, await P.screenshot(s, `solve-h${P.hh(hole)}-${cupId}.png`)); save(); } catch { /* no picture */ }
  if (par === 3 && sol.strokes.length === 1) { result.edges = await edges(tee, sol.strokes[0]); save(); }
} else log(`not solved: hole ${hole} cup ${cupId} after ${tryNo} tries, ${(result.ms / 60000).toFixed(1)} min`);
status(sol ? `SOLVED in ${sol.strokes.length}` : "not solved");
await s.stop().catch(() => {});
process.exit(sol ? 0 : 4);
