// The savestate campaign's summary (results/solve/SUMMARY.md) from its result
// files (results/solve/hHH-sN.json, hole-solve.mjs): per hole the target, the
// cups that made it, the tries (real swings from the cup's savestates), each
// solved cup's strokes, and for a par 3's ace its window (the aims either
// side that still hole, hole-solve.mjs edges v 2).
//   node tools/harness/solve-summary.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOLVE = path.join(HERE, "results", "solve");
const PAR = { 1: 4, 2: 3, 3: 5, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 5, 10: 4, 11: 3, 12: 5, 13: 3, 14: 5, 15: 4, 16: 4, 17: 3, 18: 5 };
const COURSE = { 1: "Resort A", 2: "Resort A", 3: "Resort A", 4: "Resort B", 5: "Resort B", 6: "Resort B", 7: "Resort C", 8: "Resort C", 9: "Resort C", 10: "Classic A", 11: "Classic A", 12: "Classic A", 13: "Classic B", 14: "Classic B", 15: "Classic B", 16: "Classic C", 17: "Classic C", 18: "Classic C" };
const TARGET = (h) => (h === 14 ? "albatross" : PAR[h] === 3 ? "ace" : "eagle");
const rows = fs.readdirSync(SOLVE).filter((f) => /^h\d\d-s\d\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(SOLVE, f), "utf8")));
const done = (r) => !!r.solved && (PAR[r.hole] !== 3 || r.strokes?.length !== 1 || r.edges?.v === 2);
const deg = (rad) => ((rad * 180) / Math.PI).toFixed(2);
const byHole = {};
for (const r of rows) (byHole[r.hole] ??= []).push(r);
const holes = Object.keys(byHole).map(Number).sort((a, b) => a - b);
const all = rows.length, ok = rows.filter(done).length, swings = rows.reduce((s, r) => s + (r.tries?.length ?? 0), 0);
let md = `# Savestate campaign: every WSR pin played to its target\n\n`;
md += `${ok} of ${all} cups made their target, in ${swings} real swings from the cups' savestates (calm wind; every swing through the game's own pipeline). Per hole: the target, the cups that made it, the tries per cup, and for each par 3 ace the window of aims that still hole it.\n\n`;
md += `| Hole | Course | Par | Target | Made | Tries per cup | Ace windows (yd across at the pin) |\n|---|---|---|---|---|---|---|\n`;
for (const h of holes) {
  const rs = byHole[h].sort((a, b) => a.cup.localeCompare(b.cup));
  md += `| ${h} | ${COURSE[h]} | ${PAR[h]} | ${TARGET(h)} | ${rs.filter(done).length} of ${rs.length} | ${rs.map((r) => r.tries?.length ?? 0).join(", ")} | ${PAR[h] === 3 ? rs.map((r) => (r.edges?.widthYd != null ? r.edges.widthYd.toFixed(2) : "-")).join(", ") : ""} |\n`;
}
md += `\n## The strokes\n\n`;
for (const h of holes) {
  md += `### Hole ${h} (${COURSE[h]}, par ${PAR[h]}, ${TARGET(h)})\n\n`;
  for (const r of byHole[h].sort((a, b) => a.cup.localeCompare(b.cup))) {
    if (!done(r)) { md += `- ${r.cup} (${r.label}): not made yet${r.error ? ` (${r.error})` : ""}, ${r.tries?.length ?? 0} tries\n`; continue; }
    const strokes = r.strokes.map((x) => `${x.club} ${x.gamePower.toFixed(4)} at ${deg(x.heading)} deg`).join(", then ");
    const e = r.edges ? `; the ace holes from ${Math.abs(r.edges.left.offDeg).toFixed(2)} deg left to ${Math.abs(r.edges.right.offDeg).toFixed(2)} deg right of that aim (${r.edges.widthYd} yd across)` : "";
    md += `- ${r.cup} (${r.label}): ${strokes} (${r.tries.length} tries)${e}\n`;
  }
  md += `\n`;
}
fs.writeFileSync(path.join(SOLVE, "SUMMARY.md"), md);
console.log(`${ok} of ${all} cups; ${swings} swings; wrote results/solve/SUMMARY.md`);
