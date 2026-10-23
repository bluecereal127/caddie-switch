// Drives the natural 18-hole round (round-play.mjs) through the interactive
// driver that holds the round's Dolphin: one eval per hole, round-play.mjs
// re-imported each time, the results kept in results/round18.json. An error
// ends that call only: the next call goes on from the game's current state
// (nothing is reloaded or retried).
//   node tools/harness/round-ctl.mjs [--from 1] [--to 18] [--port 8818] [--log state/round18.log] [--out results/round18.json]
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const port = Number(arg("--port", 8818)), from = Number(arg("--from", 1)), to = Number(arg("--to", 18));
const OUT = path.resolve(HERE, arg("--out", "results/round18.json"));
const LOGF = path.resolve(HERE, arg("--log", "state/round18.log"));
const PLAY = pathToFileURL(path.join(HERE, "round-play.mjs")).href;
// a 3-hole course attempt's name (round-play.mjs: highlights) and the
// strokes' name in the planner's memory (results/... less .json and courses/)
const LABEL = arg("--label", null);
// --wind dir:speedIdx: the wind the user set for the course (round-play.mjs applyWind), e.g. 0:0 for none
// --wind-plan best: every hole's wind chosen for its drawn pin (round-play.mjs windPlan)
const WINDPLAN = arg("--wind-plan", null);
// --perfect (the user, 2026-10-23): the round ends at the first hole off a perfect score (a par 3
// not aced, a par 4 not eagled, a par 5 not albatrossed: no -42 left), exit 3
const PERFECT = process.argv.includes("--perfect");
// --beat-file f (the user, 2026-10-23): the round ends once it cannot beat the record in f ({ record }, to par,
// read after every hole): its strokes so far and a perfect score on every hole left (an ace, an eagle on a
// par 4, an albatross) no better than the record
const BEAT = arg("--beat-file", null);
const PERFECT_AT = { 3: 1, 4: 2, 5: 2 }, PAR_OF = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const WIND = arg("--wind", null), windSet = WIND ? { dir: Number(WIND.split(":")[0]), speedIdx: Number(WIND.split(":")[1]) } : null;
// --pins 1:0,2:3,3:3: the WSR slot each hole's pin is forced to (round-play.mjs
// forceNext forces the next hole's; the first hole's is round-start.mjs --pin's)
const PINS = Object.fromEntries((arg("--pins", "") || "").split(",").filter((t) => /^\d+:\d+$/.test(t)).map((t) => t.split(":").map(Number)));
const SRC = path.relative(path.join(HERE, "results"), OUT).split(path.sep).join("/").replace(/\.json$/, "").replace(/^courses\//, "");

const post = (body) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/" }, (res) => { let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => resolve({ ok: res.statusCode === 200, text: t })); });
  req.on("error", reject); req.end(JSON.stringify(body));
});
const round = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { kind: "natural-round", course: LABEL ? LABEL.replace(/ #\d+$/, "") : "Eighteen Holes", label: LABEL, wind: windSet, pins: Object.keys(PINS).length ? PINS : null, holes: {} };
const save = () => { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(round, null, 1)); };

for (let hole = from; hole <= to; hole++) {
  for (let call = 0; call < 3; call++) {
    const js = `const m = await import("${PLAY}?v=" + Date.now()); return await m.playHole({ gdb, dsu, hole: ${hole}, last: ${hole === to}, logFile: ${JSON.stringify(LOGF)}, src: ${JSON.stringify(SRC)}, label: ${JSON.stringify(LABEL)}, windSet: ${JSON.stringify(windSet)}, windPlan: ${JSON.stringify(WINDPLAN)}, forceNext: ${hole < to && PINS[hole + 1] != null ? PINS[hole + 1] : "null"} });`;
    const r = await post({ op: "eval", args: [js] });
    if (r.ok) {
      const rec = JSON.parse(r.text);
      const prev = round.holes[hole];
      round.holes[hole] = prev ? { ...rec, strokes: [...prev.strokes, ...rec.strokes], calls: (prev.calls ?? 1) + 1 } : rec;
      if (PERFECT) { const got = round.holes[hole]?.game?.strokes ?? round.holes[hole]?.strokes?.length; if (got && got > PERFECT_AT[PAR_OF[hole]]) { save(); console.log(`hole ${hole}: ${got} strokes, off a perfect round (${PERFECT_AT[PAR_OF[hole]]} on a par ${PAR_OF[hole]}): the round ends here`); process.exit(3); } }
      if (BEAT) { let rec = null; try { rec = JSON.parse(fs.readFileSync(path.resolve(HERE, BEAT), "utf8")).record; } catch { /* no record yet */ } if (Number.isFinite(rec)) { let so = 0, par = 0; for (let h = from; h <= to; h++) { par += PAR_OF[h]; if (h <= hole) so += round.holes[h]?.game?.strokes ?? round.holes[h]?.strokes?.length ?? 0; else so += PERFECT_AT[PAR_OF[h]]; } if (so - par >= rec) { save(); console.log(`hole ${hole}: the best finish left is ${so - par}, no better than the record ${rec}: the round ends here`); process.exit(3); } } }
      save();
      console.log(`hole ${hole}: ${round.holes[hole].strokes.length} strokes, the game counts ${rec.game?.strokes}`);
      if (rec.next !== hole || hole === to) break;
    } else {
      console.log(`hole ${hole}: ${r.text}`);
      round.errors = [...(round.errors ?? []), { hole, at: new Date().toISOString(), error: r.text }];
      save();
    }
  }
}
// the scorecard comes up a few seconds after the last hole's count is written
// (a holing shot's replay plays first: Resort A #7's card caught the replay)
await new Promise((r) => setTimeout(r, 4000));
await post({ op: "shot", args: [] }).then((r) => { round.finalScreenshot = r.text; save(); });
console.log("round over");
