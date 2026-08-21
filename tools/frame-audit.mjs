// Who consumes each capture? Read-only audit that joins every stage's own
// record of what it used, so no frame's fate is a guess.
//   node tools/frame-audit.mjs            summary + per-hole table
//   node tools/frame-audit.mjs --list     also list every inert frame
//   node tools/frame-audit.mjs --json     write captures/derived/frame-audit.json
//
// Roles a frame can hold (a frame may hold several):
//   mapPool      in the <=16-frame diversity pool -> the map image + motion map
//   mapDetect    in the median stack that measures pin / tee / scale
//   teeBench     passed the tee filter but lost the diversity cut (a reserve:
//                it competes again whenever new frames land)
//   greenPair    the plain or heightmap half of a green extraction pair
//   shotAddress  supplied club/wind/bearing for a shot row
//   shotPopup    supplied the result distance for a shot row
//   labelled     hand-labelled ground truth in captures/labels.json
// Anything with no role is INERT: nothing downstream reads it today.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const D = join(ROOT, "captures", "derived");
const rd = (p, fb) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };

const manifest = rd(join(ROOT, "captures", "classification.json"), { frames: [] });
const maps = rd(join(D, "maps.json"), { holes: [] }).holes;
const shots = rd(join(D, "shots.json"), { rows: [] });
const labels = rd(join(ROOT, "captures", "labels.json"), { popups: [], address: [] });

const role = new Map();   // file -> Set(role)
const add = (f, r) => { if (!f) return; if (!role.has(f)) role.set(f, new Set()); role.get(f).add(r); };

for (const m of maps) {
  for (const f of m.pool ?? []) add(f, "mapPool");
  for (const f of m.frames ?? []) add(f, "mapDetect");
  for (const f of m.teeCandidates ?? []) if (!(m.pool ?? []).includes(f)) add(f, "teeBench");
}
for (const file of existsSync(join(D, "greens")) ? readdirSync(join(D, "greens")) : []) {
  if (!file.endsWith(".json")) continue;
  const g = rd(join(D, "greens", file), {});
  for (const s of g.sessions ?? []) { add(s.plain, "greenPair"); add(s.hmap, "greenPair"); }
  for (const f of g.fringeFrames ?? []) add(f, "greenFringe");
  add(g.sources?.plain, "greenPair"); add(g.sources?.heightmap, "greenPair");
}
for (const r of shots.rows ?? []) { add(r.addrFile, "shotAddress"); add(r.popupFile, "shotPopup"); }
for (const l of [...(labels.popups ?? []), ...(labels.address ?? [])]) add(l.file, "labelled");

const rows = manifest.frames.map((f) => ({
  file: f.file, hole: f.hole ?? null, frameType: f.frameType, badge: f.badge ?? null,
  roles: [...(role.get(f.file) ?? [])].sort(),
}));
const inert = rows.filter((r) => !r.roles.length);

const tally = {};
for (const r of rows) for (const k of (r.roles.length ? r.roles : ["INERT"])) tally[k] = (tally[k] ?? 0) + 1;
console.log(`frames in manifest: ${rows.length}`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${v}`);

console.log(`\nper hole  map(pool/tee/seen)  green  shots  inert`);
for (let h = 1; h <= 21; h++) {
  const hr = rows.filter((r) => r.hole === h);
  if (!hr.length) continue;
  const m = maps.find((x) => x.hole === h) ?? {};
  const n = (k) => hr.filter((r) => r.roles.includes(k)).length;
  console.log(`  H${String(h).padStart(2)}  ${String((m.pool ?? []).length).padStart(2)}/${String((m.teeCandidates ?? []).length).padStart(2)}/${String((m.mapFramesSeen ?? []).length).padStart(2)}` +
    `        ${String(n("greenPair")).padStart(2)}     ${String(n("shotAddress") + n("shotPopup")).padStart(3)}    ${String(hr.filter((r) => !r.roles.length).length).padStart(3)}`);
}

const why = (r) => {
  if (r.frameType === "other") return "pop-up that produced no row (no gauge / no distance / putt / unpaired)";
  if (!r.hole) return "hole never identified by the classifier";
  if (r.frameType === "map") return "mid-round map frame: the minimap re-frames as you advance, so it cannot join a tee stack, and no pop-up followed it";
  return `${r.frameType} with no counterpart frame`;
};
console.log(`\nINERT: ${inert.length} frame(s)`);
const grouped = {};
for (const r of inert) { const k = why(r); (grouped[k] ??= []).push(r); }
for (const [k, v] of Object.entries(grouped)) {
  console.log(`  ${v.length}x  ${k}`);
  if (process.argv.includes("--list")) for (const r of v) console.log(`        H${r.hole ?? "?"} ${r.file} ${r.badge ?? ""}`);
}

if (process.argv.includes("--json")) {
  writeFileSync(join(D, "frame-audit.json"), JSON.stringify({ rows, inert: inert.map((r) => r.file) }, null, 2));
  console.log(`\nwrote captures/derived/frame-audit.json`);
}
