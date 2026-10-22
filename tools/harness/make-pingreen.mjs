// A green state per forced cup, for the putting campaign: from the cup's tee
// state (make-pinstates.mjs, SAVES/pins/hHH-<id>-tee.sav) the hole is played
// for real to the green (lib/pins.mjs playToGreen), calm, the power held, the
// real ball waited for. Each stroke aims at a point --back yd short of the
// pin: lib/pins.mjs searchPlan takes the port's flight over the KCL line
// (headings round that line and round the game's own) that stops nearest it
// on playable ground, crosses no OB or water on the roll and clears every tree
// by 2 yd in the app's tree check (lib/play.mjs flies no trees); from the
// fringe, lib/play.mjs's putt. A ball the game puts back where it was struck
// (out of bounds) is retried from the tee with that heading excluded and a
// wider tree margin; a hole-out, a rest within --min yd of the cup, WSR's
// stroke limit or no green in 8 strokes, from the tee with another back. The
// state is checked (the forced pin, prism and cup still the cup's), saved as
// SAVES/pins/hHH-<id>-green.sav and recorded in SAVES/pins/index.json with
// every stroke and attempt; the tee state is then deleted unless --keep-tee.
// make-green.mjs does the same for a round's own pin from SAVES/hNN-tee.sav.
// Resumable: a cup whose green state exists, or that has no tee state, is
// skipped.
//   node tools/harness/make-pingreen.mjs --hole 8 [--ids s4,s5 | all] [--back 4] [--min 1.5]
//        [--keep-tee] [--instance 1] [--screens s4 | all]
import fs from "node:fs";
import { Session } from "./lib/session.mjs";
import { sleep } from "./lib/dsu.mjs";
import * as P from "./lib/pins.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);
const hole = Number(arg("--hole", NaN));
if (!(hole >= 1 && hole <= 21)) {
  console.error("usage: node tools/harness/make-pingreen.mjs --hole <1-21> [--ids s3,s4 | all] [--back 4] [--min 1.5] [--keep-tee] [--instance N] [--screens <ids> | all]");
  process.exit(2);
}
const inst = Number(arg("--instance", process.env.HARNESS_INSTANCE || 0));
const idsArg = arg("--ids", "all");
const wanted = idsArg === "all" ? P.cups({ holes: [hole] }) : idsArg.split(",").map((id) => P.cupById(hole, id.trim()));
const screensArg = arg("--screens", "");
const shotIds = screensArg === "all" ? wanted.map((c) => c.id) : screensArg ? screensArg.split(",").map((x) => x.trim()) : [];
const keepTee = has("--keep-tee");
const back = Number(arg("--back", 4)), minYd = Number(arg("--min", 1.5));
const backs = [back, back + 2, Math.max(1.5, back - 1.5), back + 4, Math.max(1.5, back - 1), back + 6];
const log = (m) => console.log(m);
const exists = (name) => fs.existsSync(P.savePath(name));

const todo = [];
for (const c of wanted) {
  if (exists(P.greenName(c))) log(`${P.cupKey(c)}: its green state exists; skipped`);
  else if (!exists(P.teeName(c))) log(`${P.cupKey(c)}: no tee state (make-pinstates.mjs makes it); skipped`);
  else todo.push(c);
}
if (!todo.length) { log("nothing to do"); process.exit(0); }
P.checkDisk();

let s = null;
process.on("uncaughtException", async (e) => { console.log(`${P.stamp()} FAILED: ${e.stack ?? e}`); if (s) await s.stop().catch(() => {}); process.exit(1); });
process.on("unhandledRejection", async (e) => { console.log(`${P.stamp()} FAILED: ${e?.stack ?? e}`); if (s) await s.stop().catch(() => {}); process.exit(1); });
const timings = [], failed = [];
for (const cup of todo) {
  const key = P.cupKey(cup), teeFile = P.savePath(P.teeName(cup)), t0 = Date.now();
  const T = { cup: key };
  try {
    // the tee's ball, which a load of the state is recognised by: the
    // index's, else the boot's own reading of the state
    const e = P.readPinIndex().cups[key];
    let fresh = false;
    if (!s || !e?.tee) {
      if (s) { await s.stop().catch(() => {}); s = null; }
      s = new Session({ instance: inst, log });
      await s.start(teeFile);
      T.boot = Date.now() - t0;
      fresh = true;
    }
    const teeBall = e?.tee ? { pos: e.tee.pos, life: e.tee.life } : s.start0;
    log(`${P.stamp()} ${key} (${cup.label}, ${cup.slopeDeg} deg): from ${P.teeName(cup)}`);
    const g = await P.playToGreen(s, cup, { teeFile, teeBall, fresh, backs, minYd, log });
    T.green = g.ms;
    let screen = null;
    if (shotIds.includes(cup.id)) { await sleep(2500); screen = (await P.screenshot(s, `${key}-green.png`)).split(/[\\/]/).pop(); }
    await P.recordGreen(cup, g, { keepTee, screen });
    T.total = Date.now() - t0;
    timings.push(T);
    log(`${P.stamp()} ${key}: ${g.file}, ${g.distYd.toFixed(2)} yd from the cup after ${g.strokes.length} strokes (back ${g.back}, ${g.tries.length} tries, ${(T.total / 1000).toFixed(0)} s)${keepTee ? "" : "; tee state deleted"}`);
  } catch (err) {
    log(`${P.stamp()} ${key}: FAILED: ${err.stack ?? err}`);
    failed.push({ cup: key, error: String(err.message ?? err) });
    await P.updatePinIndex((x) => { x.cups[key] = { ...(x.cups[key] ?? { hole, id: cup.id, slot: cup.slots[0], label: cup.label }), error: String(err.message ?? err), errorAt: new Date().toISOString(), ...(err.tries ? { greenTries: err.tries.map((r) => ({ back: r.back, end: r.end, last: r.last })) } : {}) }; }).catch(() => {});
    if (s) { await s.stop().catch(() => {}); s = null; }
  }
}
if (s) await s.stop();
log(`${P.stamp()} done: ${todo.length - failed.length} of ${todo.length} green states${failed.length ? `; failed ${failed.map((f) => f.cup).join(", ")}` : ""}; ${P.freeGB().toFixed(1)} GB free`);
log(`timings (ms): ${JSON.stringify(timings)}`);
process.exit(failed.length ? 1 : 0);
