// Flags the routes found before the sand-safe search (hole-solve.mjs, the user,
// 2026-10-22: "shots which seem to have been aimed to bounce just before a
// bunker and then right after on the next bounce will sometimes come up short
// and end up in the sand"): every stroke not at full power is flown again with
// the 3D model 0.05 and 0.1 bar (0.0125, 0.025 of power) either way, from where
// it was struck, in the wind it was played in; one whose ball then rests in sand,
// water, out of bounds or the woods is marked sandRisk. A wind entry with one
// gets its rule retagged ("<rule>-sand") so wind-campaign.mjs plays it again
// (the new search tries the safe cells first); the others are marked
// sandChecked. The calm routes of results/solve are checked the same way and
// the risky ones listed in results/solve-wind/calm-sand-risk.json (the
// campaign then plays calm again for them). Also writes results/tee-aims.json,
// each hole's tee aim from the tee states (SAVES/index.json), for the playbook.
//   node tools/harness/flag-sand-risk.mjs [--dry]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RM from "./round-model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");
const SW = path.join(HERE, "results", "solve-wind"), SOLVE = path.join(HERE, "results", "solve");
const PINS = JSON.parse(fs.readFileSync(path.join(HERE, "..", "wsr-pins.json"), "utf8"));
const POWER_ERR = [-0.025, -0.0125, 0.0125, 0.025];
const SAFE = new Set(["fairway", "rough", "green", "fringe", "cup"]);
const BUNKER = { driver: 0.25, spoon: 0.25, wedge: 0.75 };
const capOf = (club, lie) => (club === "putter" ? 2.5 : lie === 2 ? 0.75 : lie === 3 || lie === 16 ? BUNKER[club] ?? 0.5 : 1);
const pinOf = (hole, id) => PINS.holes[hole].spots.find((s) => `s${s.slots[0]}` === id)?.mesh ?? null;

// the stroke numbers whose ball a tenth of a bar either way finds trouble
function risky(hole, pin, wind, strokes) {
  const out = [];
  for (const s of strokes) {
    if (!s.from || s.club === "putter" || s.gamePower >= capOf(s.club, s.lie) - 0.0015) continue;
    for (const dq of POWER_ERR) {
      const q = s.gamePower + dq;
      if (q < 0.03 || q > capOf(s.club, s.lie) + 1e-9) continue;
      const p = RM.predict({ hole, ball: s.from, heading: s.heading, club: s.club, power: q, lie: s.lie ?? 1, wind, pin });
      if (p.hazard || !SAFE.has(p.restLie)) { out.push(s.k); break; }
    }
  }
  return out;
}

let checked = 0, flagged = 0;
for (const d of fs.readdirSync(SW).filter((x) => /^h\d\d-s\d$/.test(x))) {
  const hole = Number(d.slice(1, 3)), id = d.slice(4), pin = pinOf(hole, id);
  for (const f of fs.readdirSync(path.join(SW, d)).filter((x) => /^i\d\d\.json$/.test(x))) {
    const file = path.join(SW, d, f), sum = JSON.parse(fs.readFileSync(file, "utf8"));
    let changed = false;
    for (const e of Object.values(sum.winds ?? {})) {
      if (e.sandChecked || !/^near/.test(e.rule) || /-sand$/.test(e.rule)) continue;
      const route = e.solved ? e.strokes : e.fallback?.strokes;
      if (!route) continue;
      const wind = e.speedIdx ? { dir: e.dir, speedIdx: e.speedIdx, angle: (e.dir * Math.PI) / 4 } : null;
      const ks = risky(hole, pin, wind, route);
      checked++; changed = true;
      if (ks.length) { flagged++; for (const s of route) if (ks.includes(s.k)) s.sandRisk = true; e.sandRisk = ks; e.rule = `${e.rule}-sand`; }
      else e.sandChecked = true;
    }
    if (changed && !DRY) fs.writeFileSync(file, JSON.stringify(sum, null, 1));
  }
}
// the calm routes of the first campaign
const calmRisk = {};
for (const f of fs.readdirSync(SOLVE).filter((x) => /^h\d\d-s\d\.json$/.test(x))) {
  const r = JSON.parse(fs.readFileSync(path.join(SOLVE, f), "utf8"));
  if (!r.solved) continue;
  const hole = r.hole, id = r.cup, pin = pinOf(hole, id);
  const ss = r.strokes.map((x) => { const t = r.tries.find((y) => y.k === x.k && y.gamePower === x.gamePower && y.heading === x.heading); return { ...x, from: t?.from, lie: t?.lie }; });
  const ks = risky(hole, pin, null, ss);
  if (ks.length) calmRisk[`h${String(hole).padStart(2, "0")}-${id}`] = ks;
}
// each hole's tee aim (the game's own aim on the tee, the same for every pin)
const saves = JSON.parse(fs.readFileSync(path.join(HERE, "state", "saves", "index.json"), "utf8"));
const teeAims = {};
for (const [h, t] of Object.entries(saves)) if (Array.isArray(t?.aim) && t.aim.length === 2) teeAims[h] = { heading: Math.atan2(t.aim[0], t.aim[1]) };
if (!DRY) {
  fs.writeFileSync(path.join(SW, "calm-sand-risk.json"), JSON.stringify(calmRisk, null, 1));
  fs.writeFileSync(path.join(HERE, "results", "tee-aims.json"), JSON.stringify(teeAims, null, 1));
}
console.log(`${checked} wind routes checked, ${flagged} flagged for replay; ${Object.keys(calmRisk).length} calm routes at risk (${Object.keys(calmRisk).join(" ")}); ${Object.keys(teeAims).length} tee aims${DRY ? " (dry: nothing written)" : ""}`);
