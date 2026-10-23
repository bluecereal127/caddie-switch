// Which winds make a hole-in-one possible from the tee, by the 3D model alone
// (no Dolphin; the user, 2026-10-23, of the par 4 16th): for each pin and each
// wind, the driver and the spoon from the tee state's ball (lie 15) on a coarse
// grid of power x aim, then fine grids round the three nearest finishes (0.0005
// of power, 0.01 deg of aim), counting the cells the model holes by the
// savestate solver's rule (rolled in, hole-solve.mjs holes()) and, apart, those
// that drop still hopping. A cell count is how wide the window is: the more,
// the more forgiving. Writes results/ace-search/hHH-<pin>.json.
//   node tools/harness/ace-search.mjs --hole 16 --pin s0 [--speeds 3,6,9,12,15] [--clubs driver,spoon]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RM from "./round-model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hole = Number(arg("--hole", 16)), pinId = arg("--pin", "s0");
const SPEEDS = arg("--speeds", "3,6,9,12,15").split(",").map(Number);
const CLUBS = arg("--clubs", "driver,spoon").split(",");
const YD = 9.144, DEG = Math.PI / 180;
const cup = JSON.parse(fs.readFileSync(path.join(HERE, "state", "saves", "pins", "index.json"), "utf8")).cups[`h${String(hole).padStart(2, "0")}-${pinId}`];
if (!cup?.tee?.pos || !cup?.pinRam) { console.error(`no tee state facts for h${hole}-${pinId}`); process.exit(2); }
const ball = cup.tee.pos, pin = cup.pinRam, lie = 15;
const h0 = Math.atan2(pin[0] - ball[0], pin[2] - ball[2]);
const D = Math.hypot(pin[0] - ball[0], pin[2] - ball[2]) / YD;
// hole-solve.mjs: a model hole the game repeats (rolled in, no fast stick hit), and nearness
const holes = (p) => p.holed && !!p.cupPass && p.cupPass.h < 0.25 && (!p.flag || (p.flag.vn * 240) / YD <= 3.4);
const near = (p) => { if (holes(p)) return 0; const r = Math.hypot(p.rest[0] - pin[0], p.rest[1] - pin[2]) / YD; const c = p.cupPass && p.cupPass.h < 1 && p.cupPass.v < 4.45 ? p.cupPass.d : Infinity; return Math.min(r, c); };
const winds = [{ dir: 0, speedIdx: 0 }, ...SPEEDS.flatMap((i) => Array.from({ length: 8 }, (_, d) => ({ dir: d, speedIdx: i })))];
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const toward = (d) => COMPASS[Math.round((((180 - 45 * d) % 360) + 360) % 360 / 45) % 8];
const out = { hole, pin: pinId, label: cup.label, yd: +D.toFixed(1), winds: [] };
const t0 = Date.now();
for (const w of winds) {
  const wind = w.speedIdx ? { dir: w.dir, speedIdx: w.speedIdx, angle: (w.dir * Math.PI) / 4 } : null;
  const row = { mph: 2 * w.speedIdx, dir: w.dir, toward: w.speedIdx ? toward(w.dir) : null, clubs: {} };
  for (const club of CLUBS) {
    const at = (q, h) => { const p = RM.predict({ hole, ball, heading: h, club, power: q, lie, wind, pin }); return { q, h, p, d: near(p) }; };
    const coarse = [];
    for (let q = 0.7; q <= 1.0 + 1e-9; q += 0.01) for (let a = -4; a <= 4 + 1e-9; a += 0.25) coarse.push(at(Math.min(1, q), h0 + a * DEG));
    coarse.sort((x, y) => x.d - y.d);
    const seeds = [];
    for (const c of coarse) { if (seeds.length >= 3) break; if (seeds.some((s) => Math.abs(s.q - c.q) < 0.02 && Math.abs(s.h - c.h) < 0.5 * DEG)) continue; seeds.push(c); }
    let roll = 0, hop = 0, best = null;
    for (const s of seeds) {
      if (s.d > 6) continue;   // no seed comes within 6 yd: no window there
      for (let i = -12; i <= 12; i++) for (let j = -15; j <= 15; j++) {
        const q = s.q + i * 0.0005;
        if (q < 0.05 || q > 1) continue;
        const t = at(q, s.h + j * 0.01 * DEG);
        if (holes(t.p)) { roll++; if (!best) best = t; } else if (t.p.holed) hop++;
        if (!best && (!row.clubs[club]?.nearest || t.d < row.clubs[club].nearest)) row.clubs[club] = { nearest: t.d };
      }
    }
    row.clubs[club] = { roll, hop, nearest: +(coarse[0]?.d ?? Infinity).toFixed(2), ...(best ? { bars: +(4 * best.q).toFixed(3), aimDeg: +(-(Math.atan2(Math.sin(best.h - h0), Math.cos(best.h - h0))) / DEG).toFixed(2) } : {}) };
  }
  out.winds.push(row);
  const any = Object.entries(row.clubs).filter(([, c]) => c.roll || c.hop);
  console.log(`h${hole}-${pinId} ${row.mph ? `${row.mph} mph toward ${row.toward}` : "calm"}: ${any.length ? any.map(([k, c]) => `${k} ${c.roll} rolling + ${c.hop} hopping cells${c.bars ? ` (e.g. ${c.bars} bars, ${c.aimDeg} deg off the pin line)` : ""}`).join("; ") : `no ace (nearest ${Math.min(...Object.values(row.clubs).map((c) => c.nearest)).toFixed(1)} yd)`}`);
}
out.ms = Date.now() - t0;
fs.mkdirSync(path.join(HERE, "results", "ace-search"), { recursive: true });
fs.writeFileSync(path.join(HERE, "results", "ace-search", `h${String(hole).padStart(2, "0")}-${pinId}.json`), JSON.stringify(out, null, 1));
console.log(`done in ${(out.ms / 60000).toFixed(1)} min`);
