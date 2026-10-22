// Rebuilds results/knowledge/strokes.jsonl, the planner's memory of earlier
// strokes, from every natural round and 3-hole course attempt the harness has
// played (results/round18.json, results/round-r*.json, results/courses/*/
// attempt-*.json): one row a stroke (round-planner.mjs knowRow), with the
// port's flight recomputed along its launch line (the aim less the lie yaw)
// at the power the game launched with. round-play.mjs appends each new
// stroke as it is played; rerun this only after the planner's model changes.
//   node --max-old-space-size=7000 tools/harness/seed-knowledge.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dropMesh } from "./lib/course.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const Pl = await import(pathToFileURL(path.join(HERE, process.argv.includes("--next") ? "round-planner.next.mjs" : "round-planner.mjs")).href);
const RES = path.join(HERE, "results");
const files = fs.readdirSync(RES).filter((f) => /^round18\.json$|^round-r\d+\.json$/.test(f)).map((f) => path.join(RES, f));
const COURSES = path.join(RES, "courses");
if (fs.existsSync(COURSES)) for (const c of fs.readdirSync(COURSES)) {
  const d = path.join(COURSES, c);
  if (fs.statSync(d).isDirectory()) for (const f of fs.readdirSync(d)) if (/^attempt-\d+\.json$/.test(f)) files.push(path.join(d, f));
}
const todo = [];
for (const f of files) {
  const src = path.relative(RES, f).replace(/\\/g, "/").replace(/\.json$/, "").replace(/^courses\//, "");
  const r = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const [hole, h] of Object.entries(r.holes ?? {})) for (const s of h.strokes ?? []) {
    if (!s.from || !s.rest || !s.club) continue;
    todo.push({ src: `${src} h${hole} k${s.k}`, hole: Number(hole), s });
  }
}
todo.sort((a, b) => a.hole - b.hole);
const rows = [];
let cur = null;
for (const { src, hole, s } of todo) {
  if (cur !== hole) { if (cur) dropMesh(cur); cur = hole; }
  const q = s.gamePower ?? s.plan?.power, aim = s.aim?.heading ?? s.plan?.heading;
  if (q == null || aim == null) continue;
  const wind = { dir: s.wind.dir, speedIdx: s.wind.speedIdx, angle: (Math.PI / 4) * s.wind.dir };
  const launch = s.club === "putter" ? aim : Pl.launchOf(aim, s.lie);
  const pred = s.club === "putter" ? null : await Pl.predictAlong(hole, s.from, s.lie, wind, s.club, q, launch);
  rows.push(Pl.knowRow({ src, at: null, hole, k: s.k, lie: s.lie, from: s.from, pin: s.pin, wind, club: s.club, q, aim, pred, rest: s.rest, hazard: s.hazard ?? 0, placed: s.placed, holed: s.holed }));
}
fs.mkdirSync(path.dirname(Pl.KNOW), { recursive: true });
fs.writeFileSync(Pl.KNOW, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
const fails = rows.filter((r) => r.fail);
console.log(`${rows.length} strokes from ${files.length} files into ${path.relative(HERE, Pl.KNOW)}; ${fails.length} failed:`);
for (const r of fails) console.log(`  ${r.src}: ${r.club} ${r.q.toFixed(2)} from lie ${r.lie}: ${r.fail}`);
