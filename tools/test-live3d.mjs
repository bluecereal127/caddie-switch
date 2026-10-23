// Acceptance for the live solver (src/live3d-core.js, public/course3d): the
// course rebuilt from the shipped files gives the harness's predictions to the
// bit (the same strokes through the disc's course, round-model.mjs); the ground
// under the WSR start is the tee states' ball less its radius; and a solve from
// a tee and from an approach returns a rec per club, sorted, in its time.
//   node tools/test-live3d.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as L from "../src/live3d-core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RM = await import(pathToFileURL(path.join(ROOT, "tools/harness/round-model.mjs")).href);
const DIR = path.join(ROOT, "public/course3d");
const idx = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
const palm = idx.palm ? { meta: idx.palm, buf: fs.readFileSync(path.join(DIR, idx.palm.bin)).buffer.slice(0) } : null;
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log(`FAIL ${m}`); } };
const DERIVED = JSON.parse(fs.readFileSync(path.join(ROOT, "public/derived.json"), "utf8"));
const strip = (o) => { const x = { ...o }; delete x.ms; return JSON.stringify(x); };
for (const hole of [2, 10, 12, 17]) {
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, `h${String(hole).padStart(2, "0")}.json`), "utf8"));
  // the browser's course first (registered), then the disc's through round-model for the same strokes
  const C = L.buildCourse(meta, ab(path.join(DIR, meta.bin ?? `h${String(hole).padStart(2, "0")}.bin`)), palm);
  const tee = DERIVED.holes[hole].tee, b = L.ballAt(C, tee.x, tee.y);
  ok(b && [1, 15].includes(b.attr), `h${hole}: a tee or fairway under the WSR start (${b?.attr})`);
  const pin = Object.values(meta.pins)[0], h = Math.atan2(pin[0] - b.pos[0], pin[2] - b.pos[2]);
  const shots = [["driver", 1, h], ["7iron", 0.83, h + 0.03], ["wedge", 0.6, h - 0.05]].map(([club, power, heading]) => ({ hole, ball: b.pos, heading, club, power, lie: b.lie, wind: { speedIdx: 5.5, angle: 1.1 }, pin }));
  const mine = shots.map((s) => strip(RM.predict(s)));
  RM.dropCourse(hole);
  const disc = shots.map((s) => strip(RM.predict(s)));   // round-model loads the disc's course now
  ok(mine.every((m, i) => m === disc[i]), `h${hole}: the shipped course predicts as the disc's (${mine.filter((m, i) => m === disc[i]).length} of 3)`);
  RM.dropCourse(hole);
  L.buildCourse(meta, ab(path.join(DIR, `h${String(hole).padStart(2, "0")}.bin`)), palm);
  // a solve from the tee to the pin, and from 100 yd out (a spot on the line)
  const t0 = performance.now();
  const r = L.solveFrom(C, { ball: tee, pinKey: Object.keys(meta.pins)[0], windMph: 11, windDeg: 45, onTee: true });
  const ms = performance.now() - t0;
  ok(r.recs.length >= 7 && r.recs.every((x, i) => i === 0 || r.recs[i - 1].holed >= x.holed && (r.recs[i - 1].holed > x.holed || r.recs[i - 1].score <= x.score + 1e-9)), `h${hole}: a sorted rec per club`);
  ok(r.recs.every((x) => x.bars > 0 && x.bars <= 4 + 1e-9 && Number.isFinite(x.miss) && x.rest.every(Number.isFinite)), `h${hole}: the recs' numbers`);
  console.log(`h${hole} from the tee (${r.D.toFixed(0)} yd, lie ${r.lie}): best ${r.recs[0].club} ${r.recs[0].bars.toFixed(2)} bars, ${r.recs[0].aimOffFlag.toFixed(2)} deg off the flag, ${r.recs[0].holed ? "HOLED" : `${r.recs[0].miss.toFixed(1)} yd from the pin`} (${r.recs[0].restLie}${r.recs[0].safe ? "" : ", sand risk"}); ${(ms / 1000).toFixed(1)} s`);
}
console.log(fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks pass`);
process.exit(fails ? 1 : 0);
