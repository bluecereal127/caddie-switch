// Tee states with the pin forced into each of a hole's WSR cups, for the
// putting campaign (every cup on every green): the hole's start reached by
// genuine play and choosePin's draw overwritten with the cup's slot before the
// game derives the pin and the cup from it (lib/pins.mjs: the cup list, the
// force, the checks). The routes:
// - a course's first hole (1, 4, 7, 10, 13, 16, 19): per cup the course
//   picked from SAVES/menu-course.sav (19 by the Special trick), the force
//   armed before the tile's A;
// - any other hole H: once, hole H-1 played out for real from
//   SAVES/h(H-1)-tee.sav, the state before its holing stroke kept as
//   SAVES/pins/hHH-pre.sav with that stroke in SAVES/pins/index.json; per cup
//   that stroke replayed from it (the same hole-out), the force armed while
//   the ball rolls to the cup.
// Then the walk to H's tee, the checks (the pin at the cup, the cup prism,
// the slot, the tee at the WSR start), and SAVES/pins/hHH-<id>-tee.sav with an
// index entry. Resumable: a cup whose tee or green state exists is skipped. A
// cup that fails is recorded with its error, the session restarted, and the
// next cup tried; the exit code is 1 if any failed.
// --green plays each cup on to its green state in the same session
// (lib/pins.mjs playToGreen, as make-pingreen.mjs does from a saved tee) and
// deletes the tee state unless --keep-tee. --screens takes a screenshot at the
// tee (and the green) of the listed cups into state/screens/.
//   node tools/harness/make-pinstates.mjs --hole 21 [--ids s3,s4 | all] [--instance 2]
//        [--green [--back 4] [--min 1.5] [--keep-tee]] [--screens s3 | all]
import fs from "node:fs";
import path from "node:path";
import { Session, SAVES } from "./lib/session.mjs";
import { sleep } from "./lib/dsu.mjs";
import * as P from "./lib/pins.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);
const hole = Number(arg("--hole", NaN));
if (!(hole >= 1 && hole <= 21)) {
  console.error("usage: node tools/harness/make-pinstates.mjs --hole <1-21> [--ids s3,s4 | all] [--instance N] [--green [--back 4] [--min 1.5] [--keep-tee]] [--screens <ids> | all]");
  process.exit(2);
}
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const idsArg = arg("--ids", "all");
const wanted = idsArg === "all" ? P.cups({ holes: [hole] }) : idsArg.split(",").map((id) => P.cupById(hole, id.trim()));
const screensArg = arg("--screens", "");
const shotIds = screensArg === "all" ? wanted.map((c) => c.id) : screensArg ? screensArg.split(",").map((x) => x.trim()) : [];
const green = has("--green"), keepTee = has("--keep-tee");
// --tees: a tee state for every cup asked for, its green state or not (hole-solve.mjs plays from the tee)
const teesOnly = has("--tees");
const back = Number(arg("--back", 4)), minYd = Number(arg("--min", 1.5));
const backs = [back, back + 2, Math.max(1.5, back - 1.5), back + 4, Math.max(1.5, back - 1), back + 6];
const log = (m) => console.log(m);
const exists = (name) => fs.existsSync(P.savePath(name));
const first = P.COURSE_FIRST.includes(hole);

const todo = wanted.filter((c) => !exists(P.teeName(c)) && (teesOnly || !exists(P.greenName(c))));
for (const c of wanted) if (!todo.includes(c)) log(`${P.cupKey(c)}: ${exists(P.greenName(c)) ? "its green" : "its tee"} state exists; skipped`);
if (!todo.length) { log("nothing to do"); process.exit(0); }
fs.mkdirSync(P.PINS_DIR, { recursive: true });
log(`${P.stamp()} hole ${hole} (${first ? `the first hole of ${P.COURSES[hole].name}: the menu route` : `after hole ${hole - 1}: the play route`}), instance ${inst}, cups ${todo.map((c) => `${c.id} (${c.label}, ${c.slopeDeg} deg)`).join(", ")}; ${P.freeGB().toFixed(1)} GB free`);
P.checkDisk();

let s = null;
// a failure outside the per-cup loop (the pre state's play-out) still stops
// the Dolphin this run started
process.on("uncaughtException", async (e) => { console.log(`${P.stamp()} FAILED: ${e.stack ?? e}`); if (s) await s.stop().catch(() => {}); process.exit(1); });
process.on("unhandledRejection", async (e) => { console.log(`${P.stamp()} FAILED: ${e?.stack ?? e}`); if (s) await s.stop().catch(() => {}); process.exit(1); });
async function boot(file, opts) {
  if (s) { await s.stop().catch(() => {}); s = null; }
  const t0 = Date.now();
  s = new Session({ instance: inst, log });
  try { await s.start(file, opts); } catch (e) { await s.stop().catch(() => {}); s = null; throw e; }
  return Date.now() - t0;
}

const timings = [], failed = [];
let pre = null;
if (!first) {
  pre = P.readPinIndex().pre[hole];
  if (!pre || !exists(pre.file)) {
    const t0 = Date.now();
    const bootMs = await boot(path.join(SAVES, `h${P.hh(hole - 1)}-tee.sav`));
    log(`${P.stamp()} the pre state: hole ${hole - 1} played out from h${P.hh(hole - 1)}-tee.sav (booted in ${(bootMs / 1000).toFixed(1)} s)`);
    pre = await P.makePre(s, hole, { log });
    pre.bootMs = bootMs;
    pre.totalMs = Date.now() - t0;
    await P.updatePinIndex((x) => { x.pre[hole] = pre; });
    log(`${P.stamp()} saved ${pre.file}: the holing stroke ${pre.stroke.club} ${pre.stroke.power.toFixed(4)} at heading ${pre.stroke.heading.toFixed(5)} (stroke ${pre.strokes.length}); ${(pre.totalMs / 1000).toFixed(0)} s`);
    timings.push({ step: "pre", hole, bootMs, playMs: pre.ms, totalMs: pre.totalMs });
  } else log(`${P.stamp()} the pre state ${pre.file} exists: its stroke ${pre.stroke.club} ${pre.stroke.power.toFixed(4)} replayed per cup`);
}

let atPre = false;   // the session sits in the pre state, untouched (booted into it)
for (const cup of todo) {
  const key = P.cupKey(cup), slot = cup.slots[0];
  const T = { cup: key };
  const t0 = Date.now();
  let t = t0;
  const lap = (k) => { const n = Date.now(); T[k] = n - t; t = n; };
  try {
    P.checkDisk();
    let forced, replay = null;
    if (first) {
      if (!s) { T.boot = await boot(path.join(SAVES, "menu-course.sav"), { waitBall: false }); t = Date.now(); }
      else { await P.loadMenu(s); lap("load"); }
      const c = await P.pickCourse(s, hole);
      forced = await P.forceAtStart(s, { hole, slot, special: !!c.special, menu: true, log });
      lap("force");
    } else {
      if (!s) { T.boot = await boot(P.savePath(pre.file)); t = Date.now(); atPre = true; }
      replay = await P.replayPre(s, pre, { fresh: atPre, log });
      atPre = false;
      T.load = replay.loadMs; T.replay = replay.ms - replay.loadMs; t = Date.now();
      await P.armForce(s);
      forced = await P.forceAtStart(s, { hole, slot, log });
      lap("force");
    }
    if (!(await P.walkToTee(s, hole))) throw new Error(`did not reach hole ${hole}'s tee`);
    lap("walk");
    const facts = await P.pinFacts(s);
    const verified = P.verifyFacts(facts, cup, slot);
    log(`${P.stamp()} ${key} at the tee: pin ${facts.pinRam.map((v) => v.toFixed(2)).join(", ")} (cup ${cup.mesh.join(", ")}, off ${verified.pinOffset.join(" / ")} u), prism ${facts.cupRam.prism}, cup centre ${facts.cupRam.centre.map((v) => v.toFixed(2)).join(", ")}, slot ${facts.slot}, ball ${facts.ball.pos.map((v) => v.toFixed(2)).join(", ")} (start off ${verified.teeOffset.join(" / ")} u), wind dir ${facts.wind.dir} idx ${facts.wind.speedIdx}: ${verified.all ? "all checks pass" : `CHECKS FAIL ${JSON.stringify(verified)}`}`);
    const entry = {
      hole, id: cup.id, slot, label: cup.label, sets: cup.sets, slopeDeg: cup.slopeDeg, slopeMax1yd: cup.slopeMax1yd, mesh: cup.mesh,
      route: first ? "menu" : pre.file, drawn: forced.drawn, set: forced.set, ordinal: forced.ordinal, mode: facts.mode,
      replaySame: replay ? replay.same : null,
      pinRam: facts.pinRam, cupRam: facts.cupRam, wind: facts.wind, tee: facts.ball, start: P.startOf(hole), verified,
    };
    if (!verified.all) {
      await P.updatePinIndex((x) => { x.cups[key] = { ...(x.cups[key] ?? {}), ...entry, error: "checks failed", errorAt: new Date().toISOString() }; });
      throw new Error("the tee checks failed; no state saved");
    }
    P.checkDisk();
    await s.saveState(P.teeName(cup));
    lap("save");
    const screens = [];
    if (shotIds.includes(cup.id)) { await sleep(2500); screens.push(path.basename(await P.screenshot(s, `${key}-tee.png`))); lap("screen"); }
    await P.updatePinIndex((x) => {
      x.cups[key] = P.settleErrors({ ...(x.cups[key] ?? {}), ...entry, teeFile: P.teeName(cup), screens, teeMs: { ...T, total: Date.now() - t0 }, made: new Date().toISOString() });
    });
    log(`${P.stamp()} ${key}: saved ${P.teeName(cup)} (${((Date.now() - t0) / 1000).toFixed(0)} s: ${Object.entries(T).filter(([k]) => k !== "cup").map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`).join(", ")})`);
    if (green) {
      const tg = Date.now();
      const g = await P.playToGreen(s, cup, { teeFile: P.savePath(P.teeName(cup)), teeBall: { pos: facts.ball.pos, life: facts.ball.life }, fresh: true, backs, minYd, log });
      T.green = Date.now() - tg; t = Date.now();
      let screen = null;
      if (shotIds.includes(cup.id)) { await sleep(2500); screen = path.basename(await P.screenshot(s, `${key}-green.png`)); lap("greenScreen"); }
      await P.recordGreen(cup, g, { keepTee, screen });
      log(`${P.stamp()} ${key}: green state ${g.file}, ${g.distYd.toFixed(2)} yd from the cup after ${g.strokes.length} strokes (back ${g.back}, ${g.tries.length} tries, ${(T.green / 1000).toFixed(0)} s)${keepTee ? "" : "; tee state deleted"}`);
    }
    T.total = Date.now() - t0;
    timings.push(T);
  } catch (e) {
    log(`${P.stamp()} ${key}: FAILED: ${e.stack ?? e}`);
    failed.push({ cup: key, error: String(e.message ?? e) });
    await P.updatePinIndex((x) => { x.cups[key] = { ...(x.cups[key] ?? { hole, id: cup.id, slot, label: cup.label }), error: String(e.message ?? e), errorAt: new Date().toISOString(), ...(e.tries ? { greenTries: e.tries.map((r) => ({ back: r.back, end: r.end, last: r.last })) } : {}) }; }).catch(() => {});
    if (s) { await s.stop().catch(() => {}); s = null; }
    atPre = false;
  }
}
if (s) await s.stop();
log(`${P.stamp()} done: ${todo.length - failed.length} of ${todo.length} cups${failed.length ? `; failed ${failed.map((f) => f.cup).join(", ")}` : ""}; ${P.freeGB().toFixed(1)} GB free`);
log(`timings (ms): ${JSON.stringify(timings)}`);
process.exit(failed.length ? 1 : 0);
