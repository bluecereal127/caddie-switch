// How forgiving each documented perfect route is (the user, 2026-10-23: the
// chosen-wind rounds kept missing on routes that holed once at a knife edge):
// for every pin, of the playbook's solutions (playbook.mjs: the calm solves,
// the wind campaign's, natural rounds' holes) those with the pin's fewest
// strokes, the 3D model's count of holing cells round the final stroke as it
// was struck (from its spot, in its wind: 0.0005 of power x 0.01 deg, 25 x 31),
// by the rolling-in rule. Writes results/compete/route-robust.json (each
// route's count) and results/compete/pin-plan.json (each hole's most
// forgiving perfect pin: slot, wind, count), which playbook.mjs's chooseWind
// and compete.mjs --pin-plan read.
//   node tools/harness/route-robust.mjs [--holes 1-18] [--cap 40]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PB from "./playbook.mjs";
import * as RM from "./round-model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const range = (t) => t.split(",").flatMap((x) => { const [a, b] = x.split("-").map(Number); return Number.isFinite(b) ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; });
const HOLES = range(arg("--holes", "1-18")), CAP = Number(arg("--cap", 40));
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const PERFECT = { 3: 1, 4: 2, 5: 2 };
const DEG = Math.PI / 180, CALM = { dir: 0, speedIdx: 0 };
const cups = JSON.parse(fs.readFileSync(path.join(HERE, "state", "saves", "pins", "index.json"), "utf8")).cups;
const pb = PB.createPlaybook();
const sols = pb.solutions();
const OUT = path.join(HERE, "results", "compete");
fs.mkdirSync(OUT, { recursive: true });
// a run over some holes writes its own part (results/compete/robust/<holes>.json); --merge joins the parts
const RF = path.join(OUT, "route-robust.json"), PF = path.join(OUT, "pin-plan.json"), PARTS = path.join(OUT, "robust");
fs.mkdirSync(PARTS, { recursive: true });
if (process.argv.includes("--merge")) {
  const robust = {}, plan = {};
  for (const f of fs.readdirSync(PARTS).filter((x) => x.endsWith(".json"))) { const j = JSON.parse(fs.readFileSync(path.join(PARTS, f), "utf8")); Object.assign(robust, j.robust); Object.assign(plan, j.plan); }
  fs.writeFileSync(RF, JSON.stringify(robust)); fs.writeFileSync(PF, JSON.stringify(plan, null, 1));
  console.log(`merged: ${Object.keys(robust).length} routes, ${Object.keys(plan).length} holes`);
  process.exit(0);
}
const PART = path.join(PARTS, `${HOLES.join("-")}.json`);
const robust = {}, plan = {};
export const routeKey = (sol) => `${path.relative(HERE, sol.file).split(path.sep).join("/")}#${sol.cup}`;
const rank = { solve: 0, "solve-wind": 0, round: 1 };
for (const hole of HOLES) {
  const t0 = Date.now();
  const byCup = new Map();
  for (const s of sols.filter((x) => x.hole === hole)) { if (!byCup.has(s.cup)) byCup.set(s.cup, []); byCup.get(s.cup).push(s); }
  let best = null;
  for (const [cup, list] of byCup) {
    const n = Math.min(...list.map((s) => s.strokes.length));
    const pick = list.filter((s) => s.strokes.length === n).sort((a, b) => (rank[a.src] ?? 2) - (rank[b.src] ?? 2)).slice(0, CAP);
    for (const sol of pick) {
      const s = sol.strokes[sol.strokes.length - 1], wind = sol.wind ?? CALM;
      const q0 = Number.isFinite(s.gamePower) ? s.gamePower : s.power;
      let c = 0;
      for (let i = -12; i <= 12; i++) for (let j = -15; j <= 15; j++) {
        const p = RM.predict({ hole, ball: s.from, heading: s.reached + j * 0.01 * DEG, club: s.club, power: q0 + i * 0.0005, lie: s.lie, wind, pin: sol.pin });
        if (PB.holes(p)) c++;
      }
      robust[routeKey(sol)] = { hole, cup, strokes: n, src: sol.src, wind: sol.wind, cells: c };
      const perfect = n <= PERFECT[PAR[hole]];
      const key = [perfect ? 0 : 1, n, -c];
      if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) best = { key, cup, sol, c, n };
    }
  }
  if (best) plan[hole] = { cup: best.cup, slot: cups[best.cup]?.slot ?? Number(best.cup.slice(5)), strokes: best.n, perfect: best.n <= PERFECT[PAR[hole]], wind: best.sol.wind, src: best.sol.src, cells: best.c, route: routeKey(best.sol) };
  fs.writeFileSync(PART, JSON.stringify({ robust, plan }));
  console.log(`hole ${hole}: pin ${best?.cup} (slot ${plan[hole]?.slot}) in ${best?.n}, ${best?.c} holing cells (${best?.sol.src}, ${best?.sol.wind ? `${2 * best.sol.wind.speedIdx} mph d${best.sol.wind.dir}` : "calm"}); ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
