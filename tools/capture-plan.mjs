// What should I shoot next? Reads what the pipeline has actually derived and
// reports, per hole, what is missing and why.
//   node tools/capture-plan.mjs           ranked worklist
//   node tools/capture-plan.mjs --table   full per-hole table
//
// Four things drive map/green quality, and each has its own capture:
//   AIM     tee frames whose aims differ — the 3D world under the panel only
//           churns when the camera turns, and that churn is what separates
//           map art from backdrop. Same-aim frames add nothing.
//   FLAG    tee frames from a round with the pin somewhere new — the stack
//           can only show real art under a flag if some frame had its flag
//           elsewhere; otherwise that patch is inpainted.
//   PIN     green captures with the pin somewhere new — the flag hides the
//           surface it stands on, and only a different pin reveals it.
//   ZOOM    more green pairs (plain + Terrain, back to back) to fill grid
//           cells the legend or the flag occluded.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage } from "./lib/image.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const D = join(ROOT, "captures", "derived");
const rd = (p, fb) => { try { return JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, "")); } catch { return fb; } };

const maps = rd(join(D, "maps.json"), { holes: [] }).holes;
const T_VAR = 20;

const rows = [];
for (let hole = 1; hole <= 21; hole++) {
  const id = `h${String(hole).padStart(2, "0")}`;
  const m = maps.find((x) => x.hole === hole) ?? {};
  const g = rd(join(D, "greens", `${id}.json`), null);

  // aim variety = share of the panel that moved across the pooled frames
  let moving = null;
  const vp = join(D, "maps", `${id}.var.png`);
  if (existsSync(vp)) {
    const v = loadImage(vp);
    let n = 0;
    for (let p = 0; p < v.width * v.height; p++) if (v.data[p * 4] >= T_VAR) n++;
    moving = n / (v.width * v.height);
  }

  // distinct flag positions among the pooled tee frames
  const flags = (m.poolFlags ?? []).filter(Boolean);
  const spots = [];
  for (const f of flags) if (!spots.some((s) => Math.hypot(s.x - f.x, s.y - f.y) < 6)) spots.push(f);

  const cells = g ? g.grid.flat().filter((c) => c && (c[0] || c[1])).length : 0;
  rows.push({
    hole, tees: (m.teeCandidates ?? []).length, pool: (m.pool ?? []).length, moving,
    teePins: spots.length, greenPairs: g?.polyFrom ?? 0, greenPins: g?.pins?.length ?? 0, cells,
  });
}

const needs = (r) => {
  const out = [];
  if (r.moving == null) out.push(["AIM", 3, "no motion map yet"]);
  else if (r.moving < 0.15) out.push(["AIM", 3, `only ${(100 * r.moving).toFixed(0)}% of the panel moves — the tee frames share an aim`]);
  else if (r.moving < 0.28) out.push(["AIM", 2, `${(100 * r.moving).toFixed(0)}% moving — more aim spread would sharpen the cutout`]);
  if (r.tees < 4) out.push(["AIM", 2, `only ${r.tees} tee frame(s) on file`]);
  if (r.teePins < 2) out.push(["FLAG", 2, "every tee frame shares one pin — the flag patch is inpainted, not real art"]);
  if (r.greenPins < 2) out.push(["PIN", 3, `${r.greenPins} pin position seen on the green — the surface under the flag is unknown`]);
  else if (r.greenPins < 3) out.push(["PIN", 1, `${r.greenPins} pin positions — a third fills more of what the flag hides`]);
  if (r.greenPairs < 2) out.push(["ZOOM", 2, `outline and heights rest on ${r.greenPairs} pair — nothing to fuse against`]);
  if (r.cells < 62) out.push(["ZOOM", 1, `${r.cells}/81 grid cells have slope data`]);
  return out;
};

const scored = rows.map((r) => {
  const n = needs(r);
  return { ...r, needs: n, score: n.reduce((s, x) => s + x[1], 0) };
}).sort((a, b) => b.score - a.score || a.hole - b.hole);

if (process.argv.includes("--table")) {
  console.log("hole  tees pool  moving  teePins  grnPairs grnPins cells");
  for (const r of [...scored].sort((a, b) => a.hole - b.hole))
    console.log(`  H${String(r.hole).padStart(2)}  ${String(r.tees).padStart(4)} ${String(r.pool).padStart(4)}  ` +
      `${r.moving == null ? "   -  " : (100 * r.moving).toFixed(0).padStart(4) + "% "}  ${String(r.teePins).padStart(6)}  ` +
      `${String(r.greenPairs).padStart(7)} ${String(r.greenPins).padStart(7)} ${String(r.cells).padStart(5)}`);
  console.log("");
}

const tag = { AIM: "8 tee frames, aims spread wide", FLAG: "tee frames on a round with a new pin",
  PIN: "green pair at a new pin position", ZOOM: "another green pair (plain + Terrain)" };
console.log("WORKLIST — most valuable first\n");
for (const r of scored) {
  if (!r.needs.length) { continue; }
  const kinds = [...new Set(r.needs.map((n) => n[0]))];
  console.log(`H${r.hole}  [${kinds.join(" + ")}]`);
  for (const [k, , why] of r.needs) console.log(`     ${k.padEnd(5)} ${why}`);
  console.log(`     -> ${kinds.map((k) => tag[k]).join("; ")}`);
}
const done = scored.filter((r) => !r.needs.length).map((r) => `H${r.hole}`);
console.log(`\nnothing needed: ${done.length ? done.join(" ") : "(none yet)"}`);
