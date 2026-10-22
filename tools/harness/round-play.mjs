// A natural round of WSR golf, played one hole per call inside the harness's
// interactive driver (tools/harness/driver.mjs, which keeps a single Dolphin
// for the whole round; tools/harness/round-ctl.mjs calls playHole through the
// driver's eval for each hole, re-importing this file each time).
//
// What is natural here, as the user asked: the round is the game's own
// 18-hole round, picked on its menus; the game drew the wind and the pins and
// keeps the score. Nothing writes the wind, a pin, the ball, the lie or any
// physics value; no savestate is ever loaded; every stroke is struck once and
// played out in real time. What the harness simulates is what a player does
// with the remote:
// - the club: D-pad Down / Up (the next club down / up the bag), read back
//   from the club manager;
// - the aim: D-pad Left / Right held for a counted number of frames (WSR's
//   turn accelerates, 0.00035 rad per frame of hold, capped at 0.02 rad a
//   frame; tools/research/wsr-harness-decodes.md 1), read back from
//   player+0x80 and trimmed with shorter holds; the breakpoint on the turn
//   only counts frames;
// - the swing: lib/shot.mjs shoot() with no club, heading or wind (so it writes
//   none), powerMode "game" (the raw swing value fed at its source, the game's
//   own pipeline computing the power) and keepGameSpin (no spin written), and
//   no holdWindow since hole 4 of rounds 2-4 / hole 13 of round 1: the
//   follower is not written, so the swing fires on its first frame (as one
//   whose remote stops at impact; the DSU remote rests after the trigger) at
//   the power swung.
// The user's rule on time: at most 15 seconds from the ball being ready to be
// hit (lib/play.mjs waitStroke's ready) to the swing, and the swing the moment
// the club is out and the aim set: no waiting. So each stroke is
// planned beforehand, from where the ball came to rest (or, for a tee shot,
// from the tee once the hole has loaded), while the game walks through its
// shot screens, as a player thinks on the way to the ball; at ready the club
// and aim are set and the swing struck at once (the aim trimming stops at
// 11 s). A ball the game moved meanwhile (a drop) is planned again. The
// plan comes from round-planner.mjs, re-imported for every stroke. Reading
// memory to see the game (ball, pin, wind, lie, club, heading, score) is what
// a player does with the screen; the game's look-ahead records are read only
// after the stroke has been struck.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pointers, readBall, state as readState, PTR, CLUBS } from "./lib/wsr.mjs";
import { shoot, setWind } from "./lib/shot.mjs";
import { waitStroke } from "./lib/play.mjs";
import { sleep } from "./lib/dsu.mjs";
import { STATE, HOTKEY_MAP, screenshotDir } from "./lib/dolphin.mjs";
import { kcl, groundAt, dropMesh } from "./lib/course.mjs";

const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const RESULTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "results");

// A hole-in-one or an albatross (or better): a screenshot of the moment (the
// driver's Dolphin, its screenshot hotkey) and the stroke written up in
// results/highlights.json and results/highlights.md
async function highlight({ gdb, dsu, round, hole, k, row, kind }) {
  let png = null;
  try {
    await gdb.go();
    const dir = screenshotDir(), before = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
    const key = Object.entries(HOTKEY_MAP).find(([n]) => n.endsWith("Take Screenshot"))[1];
    for (let a = 0; a < 3 && !png; a++) {
      await dsu.tap(1, key, 150);
      for (let i = 0; i < 30 && !png; i++) {
        await sleep(100);
        const fresh = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => !before.has(f)).sort();
        if (fresh.length) { await sleep(150); png = path.join(RESULTS, "highlights", `${typeof round === "number" ? `round-r${round}` : String(round).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-h${String(hole).padStart(2, "0")}.png`); fs.mkdirSync(path.dirname(png), { recursive: true }); fs.copyFileSync(path.join(dir, fresh.pop()), png); }
      }
    }
    await gdb.haltSafe();
  } catch { /* the write-up goes on without a picture */ }
  const file = path.join(RESULTS, "highlights.json");
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  all.push({ kind, round, hole, par: PAR[hole], stroke: k, at: new Date().toISOString(), screenshot: png ? path.relative(path.dirname(RESULTS), png) : null, ...row });
  fs.writeFileSync(file, JSON.stringify(all, null, 1));
  const md = ["# Hole-in-ones and albatrosses", "", "Natural rounds of Wii Sports Resort golf in Dolphin (tools/harness/round-play.mjs: 18-hole rounds, and the 3-hole courses played over and over): the game's own wind and pins, club and aim by D-pad, the swing simulated through the game's own power pipeline, no savestate loads during play.", ""];
  for (const h of all) {
    const name = h.kind === "hole-in-one" ? "Hole-in-one" : h.kind === "albatross" ? "Albatross" : "Condor";
    md.push(`## ${name}: ${typeof h.round === "number" ? `round ${h.round}` : h.round}, hole ${h.hole} (par ${h.par})`, "");
    md.push(`- When: ${h.at.replace("T", " ").slice(0, 19)} UTC, stroke ${h.stroke} of the hole.`);
    md.push(`- From: ${h.toPin} yd to the pin, lie ${h.lie}, wind ${h.wind.mph} mph (the game's direction ${h.wind.dir}).`);
    md.push(`- The swing: ${h.club} at ${(h.plan.power ?? 0).toFixed(3)} power (raw swing value ${h.raw?.toFixed(4)}, the game's launch power ${h.gamePower?.toFixed(4)}), aimed within ${Math.abs(h.aim.errDeg)} deg of the plan, struck ${h.readyToStrikeMs != null ? (h.readyToStrikeMs / 1000).toFixed(1) : "?"} s after the ball was ready.`);
    md.push(`- The plan: ${h.plan.why}`);
    if (h.screenshot) md.push("", `![round ${h.round} hole ${h.hole}](${h.screenshot.replace(/\\/g, "/").replace(/^results\//, "")})`);
    md.push("");
  }
  fs.writeFileSync(path.join(RESULTS, "highlights.md"), md.join("\n"));
  log(`hole ${hole}: ${kind.toUpperCase()}! written up in results/highlights.md`);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLANNER = path.join(HERE, "round-planner.mjs");
// the round's log (round-ctl.mjs passes one per round; round 1 used round18.log)
export let LOG = path.join(STATE, "round18.log");
const TURN = 0x803fcf28;   // the D-pad turn, called once a frame at address
const DPAD = { up: "Pad N", down: "Pad S", left: "Pad W", right: "Pad E" };
const YD = 9.144;
const BUDGET_MS = 15000, AIM_UNTIL_MS = 11000;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const log = (m) => fs.appendFileSync(LOG, `[${new Date().toISOString().slice(11, 19)}] ${m}\n`);

async function planner() { return import(`${pathToFileURL(PLANNER).href}?v=${fs.statSync(PLANNER).mtimeMs}`); }
// The savestate campaign's calm-wind solutions (playbook.mjs: the stroke a
// solved cup played from the very spot the ball is on, with that cup's pin
// and the same lie), asked before the planner when the course's wind is set
// calm (windSet speed 0: they were played calm). Re-imported when its file
// changes, as the planner is; it re-reads the solutions when they change. Its
// stroke is played exactly as a planned one (club and aim by D-pad, the swing
// through the game's pipeline): it only chooses the club, power and aim.
// Since 2026-10-22, off the solved spot too (the live rounds: tee shots rested
// 0.05-0.18 yd from the solve's rest, and the D-pad reached aims 0.008-0.035
// deg off the solve's): a ball within 3 yd of a solved stroke's start gets
// that stroke planned from the ball itself (playbook.mjs lookupNear: the
// most robust holing cell round it, or the stroke resting nearest the solve's
// rest), and once the D-pad has aimed, a playbook stroke whose aim is not the
// one planned is struck at the power for the aim reached (adjustPower), both
// by round-model.mjs's ball: computing only, between the aim and the swing.
const PLAYBOOK = path.join(HERE, "playbook.mjs");
async function playbook() { return import(`${pathToFileURL(PLAYBOOK).href}?v=${fs.statSync(PLAYBOOK).mtimeMs}`); }
const calmSet = (windSet) => !!windSet && windSet.speedIdx === 0;
// lookupNear's time: ahead (the game walking to the ball) and at ready, where
// it finds the plan made ahead for the same spot at once
const AHEAD_NEAR_MS = 6000, READY_NEAR_MS = 3000;
// the playbook's stroke from st as { pb, ms }, or null: no calm wind set, no
// solved stroke from here nor one whose start lies within 3 yd (lookupNear),
// or the playbook failed (logged; the planner plans). opts: near (false: the
// exact lookup only), nearBudgetMs
export async function playbookStroke(hole, st, windSet, { near = true, nearBudgetMs = AHEAD_NEAR_MS } = {}) {
  if (!calmSet(windSet)) return null;
  const t0 = Date.now();
  try {
    const PBm = await playbook();
    let pb = PBm.lookup(hole, st);
    if (!pb && near && typeof PBm.lookupNear === "function") {
      try { pb = await PBm.lookupNear(hole, st, { budgetMs: nearBudgetMs }); }
      catch (e) { log(`hole ${hole}: the playbook's near lookup failed (${e.message}); the planner plans`); pb = null; }
    }
    return pb ? { pb, ms: Date.now() - t0 } : null;
  } catch (e) { log(`hole ${hole}: the playbook failed (${e.message}); the planner plans`); return null; }
}
// the plan made ahead stands at ready only as the very plan the ready state
// finds: an exact one for an exact one, a near one by its id (lookupNear keeps
// its answer per spot)
const samePlaybookPlan = (a, b) => (!a.near && !b.near) || (!!a.near && !!b.near && a.near.id === b.near.id);

// what lib/play.mjs waitStroke needs of a session
const sess = (gdb, dsu) => ({ gdb, dsu, log, paused: async (fn) => { await gdb.haltSafe(); try { return await fn(gdb); } finally { await gdb.go(); } } });

export async function clubNow(gdb) { const cm = await gdb.u32(PTR.clubManager); return (await gdb.readMem(cm + 0x2c, 4)).readInt32BE(0); }
async function headingNow(gdb) { const pm = await gdb.u32(PTR.playerManager); const pl = await gdb.u32(pm + 0x664); return (await gdb.readMem(pl + 0x80, 4)).readFloatBE(0); }

// the club by D-pad presses (CPU running between presses)
export async function dpadClub(gdb, dsu, want) {
  for (let i = 0; i < 16; i++) {
    await gdb.haltSafe(); const cur = await clubNow(gdb); await gdb.go();
    if (cur === want) return { presses: i };
    await dsu.tap(0, want > cur ? DPAD.down : DPAD.up, 60);
    await sleep(130);
  }
  await gdb.haltSafe(); const cur = await clubNow(gdb); await gdb.go();
  if (cur !== want) throw new Error(`the D-pad left the club at ${CLUBS[cur]}, not ${CLUBS[want]}`);
  return { presses: 16 };
}

// frames of hold that turn d rad from rest
function framesFor(d) { let n = 0, t = 0, r = 0; while (t < d && n < 2000) { r = Math.min(0.02, r + 0.00035); t += r; n++; } return n; }

// the heading by D-pad holds, counted in frames at the turn's breakpoint
// (which only observes); each pass holds for most of the remaining turn and
// lets the release reach the game before measuring again; no pass starts
// after `until` (ms since the epoch)
export async function dpadAim(gdb, dsu, target, { tol = 0.0005, until = Infinity } = {}) {
  const passes = [];
  await gdb.haltSafe();
  let h = await headingNow(gdb);
  if (Math.abs(angDiff(target, h)) <= tol) { await gdb.go(); return { heading: h, err: angDiff(target, h), passes }; }
  await gdb.addBreak(TURN);
  try {
    for (let pass = 0; pass < 12 && Date.now() < until; pass++) {
      const d = angDiff(target, h);
      if (Math.abs(d) <= tol) break;
      const btn = d > 0 ? DPAD.left : DPAD.right, sgn = Math.sign(d);
      const want = Math.max(1, framesFor(Math.abs(d) * 0.8) - 1);
      dsu.setButtons(0, btn, true);
      let moved = 0, prev = h, f = 0;
      for (; f < 900; f++) {
        await gdb.go(); await gdb.waitStop(5000);
        const hh = await headingNow(gdb);
        if (hh !== prev) moved++;
        prev = hh;
        if (moved >= want || Math.sign(angDiff(target, hh)) !== sgn) break;
      }
      dsu.setButtons(0, btn, false);
      let still = 0;
      for (let k = 0; k < 40 && still < 3; k++) { await gdb.go(); await gdb.waitStop(5000); const hh = await headingNow(gdb); if (hh === prev) still++; else { still = 0; prev = hh; } }
      passes.push({ d: +d.toFixed(5), held: f, moved, after: +angDiff(target, prev).toFixed(5) });
      h = prev;
    }
  } finally {
    await gdb.removeBreak(TURN);
  }
  await gdb.go();
  return { heading: h, err: angDiff(target, h), passes };
}

// the game's own record of a hole: StaticMem var 7 + k (k = hole - 1): wind
// direction bits 0-2, speed index 3-6, player 1's strokes 7-10
export async function holeRecord(gdb, hole) {
  const sm = await gdb.u32(PTR.staticMem);
  const v = (await gdb.readMem(sm + 0xc0 + 4 * (7 + hole - 1), 4)).readUInt32BE(0);
  return { windDir: v & 7, windIdx: (v >> 3) & 15, strokes: (v >> 7) & 15 };
}

// the lie the game will give a ball resting at pos: the KCL surface under it
// (player+0xb0 is the attribute under the ball once the stroke is ready)
const LIE = { 10: 6, 11: 6 };
async function lieAt(hole, pos) { const g = groundAt(await kcl(hole), pos[0], pos[2]); return g ? LIE[g.attr] ?? g.attr : 1; }

// the state to plan from before the stroke is ready: the game's own state
// with the ball where it rests and its lie from the ground under it
function aheadOf(st, pos, lie) {
  const toPin = Math.atan2(st.pin[0] - pos[0], st.pin[2] - pos[2]);
  return { ...st, ball: { ...st.ball, pos, moving: 0 }, player: { ...st.player, lie, aim: [Math.sin(toPin), Math.cos(toPin)], heading: toPin } };
}

// The wind the user set for a course (2026-10-22: "you can now manually set
// the wind for each set of three holes ... start out with no wind whatsoever"):
// the game's wind object written as the game writes it (lib/shot.mjs setWind:
// +4..+0x10, the angle twice and the speed index as a float and an int, which
// the flight reads) and the hole's record bits with it (StaticMem, the wind
// direction and speed index the game keeps per hole).
export async function applyWind(gdb, hole, windSet) {
  const p = await pointers(gdb);
  await setWind(gdb, p, windSet);
  const sm = await gdb.u32(PTR.staticMem), at = sm + 0xc0 + 4 * (7 + hole - 1);
  const v = (await gdb.readMem(at, 4)).readUInt32BE(0);
  const b = Buffer.alloc(4);
  b.writeUInt32BE((((v & ~0x7f) | (windSet.dir & 7) | ((windSet.speedIdx & 15) << 3)) >>> 0));
  await gdb.writeMem(at, b);
}
const windOff = (st, windSet) => windSet && (st.wind.speedIdx !== windSet.speedIdx || (windSet.speedIdx > 0 && st.wind.dir !== windSet.dir));

async function planFrom(hole, st, windSet = null) {
  const Pl = await planner();
  const t0 = Date.now();
  // a calm course: the playbook first
  const got = await playbookStroke(hole, st, windSet);
  if (got) return { Pl, pl: got.pb, ms: Date.now() - t0, from: st.ball.pos, lie: st.player.lie, playbook: got.pb };
  const pl = await Pl.plan(hole, st);
  return { Pl, pl, ms: Date.now() - t0, from: st.ball.pos, lie: st.player.lie };
}

export async function playHole({ gdb, dsu, hole, last = false, maxStrokes = 15, logFile = null, src = null, label = null, windSet = null }) {
  if (logFile) LOG = logFile;
  // the stroke's name in the planner's memory (results/knowledge/strokes.jsonl)
  src ??= path.basename(LOG, ".log");
  // only this hole's KCL mesh is kept: the driver lives for the whole round,
  // and every hole's mesh in lib/course.mjs's cache came to 3.4 GB of heap by
  // hole 11 (Node stops at 4.1)
  for (let h = 1; h <= 21; h++) if (h !== hole) dropMesh(h);
  const s = sess(gdb, dsu);
  const rec = { hole, strokes: [], started: new Date().toISOString() };
  log(`hole ${hole}: start`);
  // the tee shot is planned once the hole has loaded: the ball on the tee, at
  // rest, the hole's pin and wind in place
  // (a call made mid-hole, after an error ended the last one, finds a ball
  // already played, lifetime > 0: it goes straight to the stroke loop, which
  // plans at ready; waiting here for lifetime 0 held round 1's hole 16 putt
  // about 67 s, unclocked, the fair-play audit of 2026-10-22 found)
  let ahead = null, lastKnow = null, played = 0;
  for (let i = 0; i < 120 && !ahead; i++) {
    await gdb.haltSafe();
    let st = null;
    try { st = await readState(gdb, { records: false }); } catch { st = null; }
    // the course's set wind, in place before the tee shot is planned
    if (st && st.hole === hole && !st.ball.moving && st.ball.life === 0 && windOff(st, windSet)) {
      const drawn = `${2 * st.wind.speedIdx} mph (dir ${st.wind.dir})`;
      try { await applyWind(gdb, hole, windSet); st = await readState(gdb, { records: false }); log(`hole ${hole}: wind set to ${2 * windSet.speedIdx} mph${windSet.speedIdx ? ` (dir ${windSet.dir})` : ""} for this course (the game drew ${drawn})`); } catch (e) { log(`hole ${hole}: setting the wind failed: ${e.message}`); }
    }
    await gdb.go();
    if (st && st.hole === hole && !st.ball.moving && st.ball.life === 0) ahead = await planFrom(hole, st, windSet);
    // six reads running (3 s) of a ball already played: mid-hole, not a hole
    // still loading (its number can change before its ball is reset)
    else if (st && st.hole === hole && st.ball.life > 0 && ++played >= 6) { log(`hole ${hole}: resumed mid-hole (the ball already played); planning at ready`); break; }
    else if (st && st.hole !== hole && rec.strokes.length === 0 && i > 0) { /* still on the previous hole's screens */ }
    if (!ahead) await sleep(500);
  }
  for (let k = 1; k <= maxStrokes; k++) {
    const w = await waitStroke(s, hole, { maxSteps: 160 });
    if (w.moved) { rec.next = w.hole; break; }
    const tReady = Date.now();
    await gdb.haltSafe();
    // the ball's own state only: its look-ahead records (the last stroke's)
    // are not read before a stroke
    let st = await readState(gdb, { records: false });
    // the course's set wind, kept: written again if the game has changed it
    if (windOff(st, windSet)) {
      try { await applyWind(gdb, hole, windSet); st = await readState(gdb, { records: false }); log(`hole ${hole} stroke ${k}: the wind was set again to ${2 * windSet.speedIdx} mph`); } catch (e) { log(`hole ${hole} stroke ${k}: setting the wind failed: ${e.message}`); }
    }
    await gdb.go();
    if (st.hole !== hole) { rec.next = st.hole; break; }
    // the game put the ball back where the last stroke was hit from (out of
    // bounds: stroke and distance, which the hazard poll does not see): that
    // stroke failed, wherever it rested, and its memory row says so before
    // this stroke is planned, so the planner leaves that line alone from here
    // (Classic B #3's hole 14 played one line five times running so)
    const prev = rec.strokes[rec.strokes.length - 1];
    if (prev && !prev.holed && prev.club !== "putter" && Math.hypot(prev.rest[0] - prev.from[0], prev.rest[2] - prev.from[2]) > 3 * YD && Math.hypot(st.ball.pos[0] - prev.from[0], st.ball.pos[2] - prev.from[2]) < 1 * YD) {
      prev.putBack = true;
      log(`hole ${hole} stroke ${k}: the game put the ball back where stroke ${prev.k} was hit (out of bounds); its line is marked failed in the planner's memory`);
      try { if (lastKnow) (await planner()).appendKnow({ ...lastKnow, fail: "the game put the ball back where it was hit (out of bounds)", at: new Date().toISOString() }); } catch (e) { log(`hole ${hole} stroke ${k}: the memory row failed: ${e.message}`); }
    }
    // the plan made beforehand, unless the ball or its lie is not what it was planned from
    let same = ahead && Math.hypot(st.ball.pos[0] - ahead.from[0], st.ball.pos[2] - ahead.from[2]) < 1 && st.player.lie === ahead.lie;
    // a calm course asks the playbook again, on the ready state itself: the
    // stroke a solved cup played from this very spot is played (the one
    // planned beforehand when it is that stroke), and a playbook stroke
    // planned beforehand stands only on its own spot
    let P = null;
    if (calmSet(windSet)) {
      const got = await playbookStroke(hole, st, windSet, { nearBudgetMs: READY_NEAR_MS });
      if (got && same && ahead.playbook && ahead.playbook.cup === got.pb.cup && ahead.playbook.k === got.pb.k && samePlaybookPlan(ahead.playbook, got.pb)) P = ahead;
      else if (got) { same = false; P = { Pl: await planner(), pl: got.pb, ms: got.ms, from: st.ball.pos, lie: st.player.lie, playbook: got.pb }; }
      else if (same && ahead.playbook) same = false;
    }
    P ??= same ? ahead : await planFrom(hole, st, windSet);
    const { Pl, pl } = P;
    const [bx, , bz] = st.ball.pos, [px, , pz] = st.pin;
    const toPin = Math.hypot(px - bx, pz - bz) / YD;
    log(`hole ${hole} stroke ${k}: lie ${st.player.lie}, ${toPin.toFixed(1)} yd to the pin, wind dir ${st.wind.dir} idx ${st.wind.speedIdx}; plan (${P.ms} ms${same ? ", made before the ball was ready" : ", made at ready"}): ${pl.why}`);
    const club = [6, 10, 11].includes(st.player.lie) ? null : await dpadClub(gdb, dsu, Pl.CLUB_INDEX[pl.club]);
    const aim = await dpadAim(gdb, dsu, pl.heading, { until: tReady + AIM_UNTIL_MS });
    await gdb.haltSafe();
    const clubStruck = CLUBS[await clubNow(gdb)];
    // a playbook stroke whose aim the D-pad did not reach as planned (the
    // solve's reached heading; a near plan's requested one): the power for the
    // aim it did reach (playbook.mjs adjustPower, round-model.mjs's ball; the
    // CPU halted meanwhile, nothing waited for); the plan's power if it fails
    let power = pl.power, adjust = null;
    if (P.playbook && Number.isFinite(P.playbook.reached)) {
      let reached = aim.heading;
      try { const hh = await headingNow(gdb); if (Number.isFinite(hh)) reached = hh; } catch { /* the D-pad's own reading */ }
      const planReach = P.playbook.reached, R2D = 180 / Math.PI;
      if (reached !== planReach) {
        try {
          const PBm = await playbook();
          if (typeof PBm.adjustPower === "function") {
            const a = await PBm.adjustPower(hole, st, P.playbook, reached);
            if (a && Number.isFinite(a.power) && a.power > 0) { adjust = { planned: pl.power, power: a.power, launch: a.launch ?? null, kept: !!a.kept, heading: reached, ms: a.ms, why: a.why }; power = a.power; }
          }
        } catch (e) { log(`hole ${hole} stroke ${k}: adjusting the power for the aim reached failed (${e.message}); the plan's power stands`); }
        if (adjust) log(`hole ${hole} stroke ${k}: [${P.playbook.near ? "playbook-near" : "playbook"} ${P.playbook.cup} ${P.playbook.k}] the D-pad reached ${(reached * R2D).toFixed(4)} deg${reached !== aim.heading ? ` (it read ${(aim.heading * R2D).toFixed(4)})` : ""}, ${(angDiff(reached, planReach) * R2D).toFixed(4)} deg off the plan's ${(planReach * R2D).toFixed(4)}: power ${pl.power.toFixed(4)} -> ${power.toFixed(4)}${adjust.kept ? " (kept)" : ""} (${adjust.ms} ms): ${adjust.why}`);
      }
    }
    let tStrike = null;
    const shot = await shoot(gdb, { dsu, power, powerMode: "game", holdWindow: false, keepGameSpin: true, trace: false, untilRest: "real", timeoutMs: 300000, onHandoff: async () => { tStrike = Date.now(); } });
    const b = shot.ball, holed = b.holeFrame >= 0;
    const after = holed ? 0 : Math.hypot(px - b.pos[0], pz - b.pos[2]) / YD;
    const readyToStrike = tStrike ? tStrike - tReady : null;
    const row = {
      k, lie: st.player.lie, from: st.ball.pos, toPin: +toPin.toFixed(2), wind: { dir: st.wind.dir, speedIdx: st.wind.speedIdx, mph: 2 * st.wind.speedIdx },
      pin: st.pin, plan: { club: pl.club, power, heading: pl.heading, expect: pl.expect, why: pl.why, ms: P.ms, ahead: !!same, ...(adjust ? { planned: pl.power, adjust } : {}) },
      club: clubStruck, aim: { heading: aim.heading, errDeg: +((aim.err * 180) / Math.PI).toFixed(3), passes: aim.passes.length },
      readyToStrikeMs: readyToStrike, raw: shot.raw, gamePower: shot.swingAtHandoff?.power, curveC: shot.swingAtHandoff?.curveC, rest: b.pos, holed, hazard: shot.hazard ?? 0, placed: shot.placed ?? null, after: +after.toFixed(2),
    };
    rec.strokes.push(row);
    // into the planner's memory: this stroke and the port's flight of it along
    // its launch line at the power the game launched with (round-planner.mjs
    // avoids lines that failed and corrects repeats by what they did)
    try {
      if (Pl.knowRow && row.club && row.gamePower != null) {
        const launch = row.club === "putter" ? aim.heading : Pl.launchOf(aim.heading, st.player.lie);
        const pred = row.club === "putter" ? null : await Pl.predictAlong(hole, st.ball.pos, st.player.lie, st.wind, row.club, row.gamePower, launch);
        lastKnow = Pl.knowRow({ src: `${src} h${hole} k${k}`, at: new Date().toISOString(), hole, k, lie: st.player.lie, from: st.ball.pos, pin: st.pin, wind: st.wind, club: row.club, q: row.gamePower, aim: aim.heading, pred, rest: b.pos, hazard: row.hazard, placed: row.placed, holed });
        Pl.appendKnow(lastKnow);
      }
    } catch (e) { log(`hole ${hole} stroke ${k}: the memory row failed: ${e.message}`); }
    log(`hole ${hole} stroke ${k}: ${row.club} raw ${shot.raw?.toFixed(4)} -> game power ${row.gamePower?.toFixed(4)}, aim off ${row.aim.errDeg} deg, ready to strike ${readyToStrike != null ? (readyToStrike / 1000).toFixed(1) : "?"} s${readyToStrike > BUDGET_MS ? " (OVER 15 s)" : ""}: ${holed ? "HOLED" : `rests ${after.toFixed(1)} yd from the pin`}${row.hazard ? ` (hazard ${row.hazard})` : ""}`);
    // a playbook stroke: was it the solve's stroke again? The aim the D-pad
    // reached and the game's launch power against the solve's decide it (the
    // game is deterministic); the default aim the game set is kept with them
    if (P.playbook) {
      const pb = P.playbook, R2D = 180 / Math.PI, near = pb.near ?? null;
      const aimSame = aim.heading === pb.reached, powerSame = row.gamePower === pb.gamePower;
      const restOff = pb.rest && !holed && !pb.holed ? Math.hypot(b.pos[0] - pb.rest[0], b.pos[2] - pb.rest[2]) : null;
      row.playbook = { cup: pb.cup, k: pb.k, of: pb.of, startHeading: st.player.heading, aimSame, aimOffDeg: +(angDiff(aim.heading, pb.reached) * R2D).toFixed(4), gamePower: pb.gamePower, powerSame, holed: pb.holed, restOffU: restOff != null ? +restOff.toFixed(3) : null,
        ...(near ? { near: { yd: +near.yd.toFixed(3), kind: near.kind, launch: near.launch, solveGamePower: pb.solve?.gamePower ?? null, solveReached: pb.solve?.reached ?? null } } : {}),
        ...(adjust ? { adjusted: { power: adjust.power, launch: adjust.launch, kept: adjust.kept, ms: adjust.ms } } : {}) };
      const adj = adjust && !adjust.kept ? ` (adjusted for the aim reached: ${adjust.planned.toFixed(4)} -> ${adjust.power.toFixed(4)} swung)` : "";
      const what = near
        ? `the near plan, the ball ${near.yd.toFixed(2)} yd from the solve's start: ${aimSame ? "the aim planned" : `aim ${row.playbook.aimOffDeg} deg off the planned ${(pb.reached * R2D).toFixed(4)}`}, launch power ${row.gamePower?.toFixed(4)} against the planned ${pb.gamePower?.toFixed(4)}${adj}`
        : aimSame && powerSame ? "the solve's stroke again (the same aim and launch power)"
        : `not the solve's stroke: ${aimSame ? "the same aim" : `aim ${row.playbook.aimOffDeg} deg off the solve's ${(pb.reached * R2D).toFixed(4)}`}, ${powerSame ? "the same launch power" : `launch power ${row.gamePower?.toFixed(4)} against the solve's ${pb.gamePower?.toFixed(4)}${adj || (Math.abs((row.gamePower ?? 0) - (pb.gamePower ?? 0)) > 0.001 ? " (the pin-power assist on a partial swing?)" : "")}`}`;
      const end = holed === pb.holed ? (holed ? (near ? "holed, as the model planned" : "holed, as there") : `rests ${restOff != null ? (restOff / YD).toFixed(3) : "?"} yd from the solve's rest`) : holed ? "holed, where the solve's was not" : near ? "NOT holed, where the model's plan was" : "NOT holed, where the solve's was";
      log(`hole ${hole} stroke ${k}: [${near ? "playbook-near" : "playbook"} ${pb.cup} ${pb.k}] ${what}; ${end} (the game's default aim ${(st.player.heading * R2D).toFixed(4)} deg)`);
    }
    if (holed) {
      const under = PAR[hole] - k;
      if (k === 1 || under >= 3) {
        const round = label ?? Number(/round-r(\d+)\.log$/.exec(LOG)?.[1] ?? 1);
        await highlight({ gdb, dsu, round, hole, k, row, kind: k === 1 ? "hole-in-one" : under === 3 ? "albatross" : "condor" });
      }
      await gdb.go();
      break;
    }
    // plan the next stroke now, from where the ball rests, while the game
    // walks to it (the CPU runs meanwhile)
    const lie = await lieAt(hole, b.pos);
    const nextSt = aheadOf(st, b.pos, lie);
    await gdb.go();
    ahead = await planFrom(hole, nextSt, windSet);
  }
  if (!last) {
    const w = await waitStroke(s, hole, { maxSteps: 160 }).catch((e) => ({ error: e.message }));
    rec.next = w.hole ?? rec.next;
  } else await sleep(6000);
  // left stopped: the driver's eval wrapper clears the breakpoints and resumes
  await gdb.haltSafe();
  rec.game = await holeRecord(gdb, hole);
  // a round's last hole: the game writes the hole's count during its closing
  // screens, at times later than the 6 s (Resort A #7's eagle on hole 3 read
  // 0); it is read again every second for up to 30 s, and if it still reads
  // 0 the hole is counted as the game counts it: the strokes struck plus a
  // penalty for each ball into water, out of bounds or put back
  for (let i = 0; last && !rec.game.strokes && i < 30; i++) {
    await gdb.go();
    await sleep(1000);
    await gdb.haltSafe();
    rec.game = await holeRecord(gdb, hole);
  }
  if (!rec.game.strokes && rec.strokes.some((x) => x.holed)) rec.game = { ...rec.game, strokes: rec.strokes.length + rec.strokes.filter((x) => x.hazard || x.putBack).length, byHarness: true };
  rec.ended = new Date().toISOString();
  log(`hole ${hole}: ${rec.strokes.length} strokes struck, the game counts ${rec.game.strokes}${rec.game.byHarness ? " (the harness's count: the game's own record still read 0 after 30 s)" : ""}`);
  return rec;
}
