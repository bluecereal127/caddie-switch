// What the flag search (lib/flagcells.mjs flagCells) costs on the savestate
// solver's own final strokes, offline: every par 3 cup's tee (index.json: the
// tee ball, the pin, lie 15, the flag's frame from the hole-start wind) and the
// par 4 / par 5 final strokes the campaign struck (results/solve/hHH-sN.json:
// the tries whose stroke is the target's, flag in, one per distinct ball), each
// searched as hole-solve.mjs would (calm flight, the lie's caps). Per position:
// the time, the flights, the cells, whether the budget cut it short.
//   node tools/harness/test-flagsolve.mjs [--budget 60000] [--max 40] [--only par3|final] [--json out.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as FC from "./lib/flagcells.mjs";
import * as RM from "./round-model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BUDGET = Number(arg("--budget", 60000)), MAX = Number(arg("--max", 40)), ONLY = arg("--only", null);
const YD = 9.144;
const IDX = JSON.parse(fs.readFileSync(path.join(HERE, "state/saves/pins/index.json"), "utf8"));
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const SOLVE = path.join(HERE, "results", "solve");

const cases = [];
if (ONLY !== "final")
  for (const [key, c] of Object.entries(IDX.cups)) {
    if (PAR[c.hole] !== 3 || !c.tee?.pos || !c.wind) continue;
    cases.push({ key, kind: "par3 tee", hole: c.hole, ball: c.tee.pos, pin: c.pinRam, lie: 15, mode: c.mode, wind: c.wind });
  }
if (ONLY !== "par3") {
  const finals = [];
  for (const f of fs.readdirSync(SOLVE).filter((x) => /^h\d\d-s\d\.json$/.test(x))) {
    const r = JSON.parse(fs.readFileSync(path.join(SOLVE, f), "utf8"));
    if (PAR[r.hole] === 3) continue;
    const c = IDX.cups[`h${String(r.hole).padStart(2, "0")}-${r.cup}`];
    if (!c?.wind) continue;
    const seen = [];
    for (const t of r.tries ?? []) {
      if (t.k !== r.target || FC.flagOut(t.lie, null)) continue;
      if (seen.some((p) => Math.hypot(p[0] - t.from[0], p[2] - t.from[2]) < 1)) continue;
      seen.push(t.from);
      finals.push({ key: `h${String(r.hole).padStart(2, "0")}-${r.cup}`, kind: `stroke ${t.k} (lie ${t.lie})`, hole: r.hole, ball: t.from, pin: c.pinRam, lie: t.lie, mode: c.mode, wind: c.wind });
    }
  }
  // a spread of distances: every n-th of them sorted by distance
  finals.sort((a, b) => Math.hypot(a.ball[0] - a.pin[0], a.ball[2] - a.pin[2]) - Math.hypot(b.ball[0] - b.pin[0], b.ball[2] - b.pin[2]));
  const step = Math.max(1, finals.length / MAX);
  for (let i = 0; i < finals.length && cases.filter((c) => c.kind !== "par3 tee").length < MAX; i += step) cases.push(finals[Math.floor(i)]);
}

cases.sort((a, b) => a.hole - b.hole || a.key.localeCompare(b.key));
const rows = [];
let n = 0, held = null;
for (const c of cases) {
  n++;
  // the course loaded outside the timing (hole-solve's rolling search has loaded it by then)
  if (held !== c.hole) { if (held != null) RM.dropCourse(held); RM.loadCourse(c.hole); held = c.hole; }
  const st = { hole: c.hole, mode: c.mode, ball: { pos: c.ball }, pin: c.pin, player: { lie: c.lie } };
  const D = Math.hypot(c.ball[0] - c.pin[0], c.ball[2] - c.pin[2]) / YD;
  const t0 = performance.now();
  const cells = FC.flagCells(st, { hole: c.hole, flagWind: c.wind, capOf: FC.capOf, budgetMs: BUDGET });
  const ms = performance.now() - t0, S = cells.stats;
  const b = cells[0];
  const row = { key: c.key, kind: c.kind, D: +D.toFixed(1), lie: c.lie, ms: Math.round(ms), flights: S.flights, cells: S.cells, truncated: S.truncated,
    best: b ? { club: b.club, power: b.power, aimOffDeg: b.aimOffDeg, robust: +b.robust.toFixed(2), route: b.route, marginU: b.marginU, verified: b.verified } : null };
  rows.push(row);
  console.log(`${String(n).padStart(3)}/${cases.length} ${c.key} ${c.kind.padEnd(16)} ${D.toFixed(1).padStart(6)} yd: ${(ms / 1000).toFixed(1).padStart(5)} s, ${String(S.flights).padStart(6)} flights, ${String(S.cells).padStart(6)} cells${S.truncated ? " (TRUNCATED)" : ""}${b ? `; best ${b.club} ${b.power.toFixed(4)} ${b.aimOffDeg >= 0 ? "+" : ""}${b.aimOffDeg.toFixed(2)} deg robust ${b.robust.toFixed(2)} ${b.route} margin ${b.marginU} u${b.verified != null ? ` verified ${b.verified}` : ""}` : ""}`);
}
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
for (const kind of ["par3 tee", "final"]) {
  const R = rows.filter((r) => (kind === "final" ? r.kind !== "par3 tee" : r.kind === kind));
  if (!R.length) continue;
  const ms = R.map((r) => r.ms);
  console.log(`\n${kind}: ${R.length} positions; ${(q(ms, 0.5) / 1000).toFixed(1)} s median, ${(q(ms, 0.9) / 1000).toFixed(1)} s p90, ${(Math.max(...ms) / 1000).toFixed(1)} s max; ${R.filter((r) => r.cells).length} with flag cells; ${R.filter((r) => r.truncated).length} truncated`);
}
const out = arg("--json", path.join(HERE, "state", "flagcells", "test-flagsolve.json"));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ budgetMs: BUDGET, rows }, null, 1));
console.log(`wrote ${path.relative(HERE, out)}`);
