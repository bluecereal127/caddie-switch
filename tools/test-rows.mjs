// node tools/test-rows.mjs [repoRoot]
// Acceptance for the shot rows public/derived.json ships (tools/assemble-shots.mjs
// -> tools/build-derived.mjs), on the committed files alone (no captures):
//  a. every importable row has pos (map fractions), bearing (deg N-up) and
//     elevFactor / flatEnded, or says why not (elevWhy); flatEnded is ended /
//     elevFactor; club ids are the app's (src/model.js DEFAULT_CLUBS)
//  b. each elevFactor flies again from public/terrain as build-derived flies
//     it (src/model.js lineProfile / simProfile at k = 1, src/wsrsim.js at
//     the row's power and wind), to its 4 decimals
//  c. exclusions: derived.json's excludedShots is tools/shot-exclusions.json's
//     ids, none of them is a shipped row, and the three impossible hole 10
//     driver rows (strokes 14, 24, 25: 151 / 109 / 170 yd at 3-4 bars) are
//     listed
//  d. the four clean full-power driver tee shots on hole 10 (2026-08-21):
//     elevFactor within 0.98-1.04, and flatEnded within 5 yd of WSR's own
//     stop on level fairway at the row's wind, which is 278.8 yd in calm air
//     (flatEnded keeps the row's wind: a 4 mph headwind takes WSR's ball to
//     270.0 yd, so the literal "within 5 yd of 278.8" cannot hold for that
//     row), and within 5 yd of 278.8 once WSR's h takes the wind back out
//  e. the irons' full-power rows against WSR's level-fairway stops, printed
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const { DEFAULT_CLUBS, lineProfile, simProfile } = await imp("src/model.js");
const { run } = await imp("tools/lib/wsrsim.mjs");
const { WSR_SHAPE } = await imp("src/wsrShape.js");
const { parseTerrain, heightAt, classAt, lieOf } = await imp("src/terrain.js");
const derived = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8"));
const exclusions = JSON.parse(readFileSync(join(root, "tools/shot-exclusions.json"), "utf8"));
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const IDS = new Set(DEFAULT_CLUBS.map((c) => c.id));
const byId = Object.fromEntries(DEFAULT_CLUBS.map((c) => [c.id, c]));
const W = derived.mapW, H = derived.mapH;
const rows = derived.shots ?? [];
const tag = (r) => `H${r.hole} S${r.stroke} ${r.club} ${r.power} bars (${r.id})`;

// ---- a. fields ----
let flown = 0;
const why = [];
for (const r of rows) {
  ok(IDS.has(r.club), `${tag(r)}: club id ${r.club} is not one of the app's`);
  const has = r.pos && r.bearing != null && r.elevFactor > 0;
  if (!has) { ok(typeof r.elevWhy === "string" && r.elevWhy.length > 0, `${tag(r)}: no pos / bearing / elevFactor and no elevWhy`); why.push(`${tag(r)}: ${r.elevWhy}`); continue; }
  flown++;
  ok(r.pos.x >= 0 && r.pos.x <= 1 && r.pos.y >= 0 && r.pos.y <= 1, `${tag(r)}: pos ${JSON.stringify(r.pos)} outside the map`);
  ok(r.bearing >= 0 && r.bearing < 360, `${tag(r)}: bearing ${r.bearing}`);
  ok(["aim", "cup", "pin"].includes(r.bearingFrom), `${tag(r)}: bearingFrom ${r.bearingFrom}`);
  ok(Math.abs(r.flatEnded - +(r.ended / r.elevFactor).toFixed(1)) < 1e-9, `${tag(r)}: flatEnded ${r.flatEnded}, ended / elevFactor ${(r.ended / r.elevFactor).toFixed(2)}`);
}
console.log(`fields: ${rows.length} importable rows, ${flown} with pos, bearing and elevFactor${why.length ? `; without: ${why.join("; ")}` : ""}`);

// ---- b. the flights again ----
const terr = new Map();
const terrainOf = (n) => { if (!terr.has(n)) terr.set(n, parseTerrain(readFileSync(join(root, `public/terrain/h${String(n).padStart(2, "0")}.bin`)))); return terr.get(n); };
const levelStop = (r) => run({ club: r.club, q: r.power / 4, wind: { mph: r.windSpeed, deg: r.windDeg }, trace: false }).stop;
let worst = 0;
for (const r of rows.filter((x) => x.elevFactor > 0)) {
  const t = terrainOf(r.hole), sc = derived.holes[r.hole].scale, th = (r.bearing * Math.PI) / 180;
  const at = (yd) => [r.pos.x + (Math.sin(th) * yd) / sc / W, r.pos.y - (Math.cos(th) * yd) / sc / H];
  const h0 = heightAt(t, r.pos.x, r.pos.y);
  const prof = lineProfile({ surfaceAt: (yd) => lieOf(classAt(t, ...at(yd))), heightAt: (yd) => { const h = heightAt(t, ...at(yd)); return h == null ? null : h - h0; } });
  const over = run({ club: r.club, q: r.power / 4, profile: simProfile(prof, 1), wind: { mph: r.windSpeed, deg: r.windDeg }, trace: false }).stop;
  const ef = +(over / levelStop(r)).toFixed(4);
  worst = Math.max(worst, Math.abs(ef - r.elevFactor));
  ok(ef === r.elevFactor, `${tag(r)}: elevFactor ${r.elevFactor} shipped, ${ef} flown again (rerun tools/build-derived.mjs)`);
}
console.log(`flights: ${flown} elevFactors flown again from public/terrain, worst difference ${worst}`);

// ---- c. exclusions ----
const listed = Object.keys(exclusions.rows ?? {}).sort();
ok(JSON.stringify(derived.excludedShots ?? []) === JSON.stringify(listed), `derived.json excludedShots ${JSON.stringify(derived.excludedShots)} is not tools/shot-exclusions.json's ${JSON.stringify(listed)}`);
for (const id of listed) ok(!rows.some((r) => r.id === id), `excluded row ${id} is shipped`);
for (const id of ["01M0HA2XKZSYD3CFQEYFSWSA6V", "01M0HAZMS6FGBBFQ4CN3KWQC7J", "01M0HB1B9QK7BSZQJ4J6T1Z464"])
  ok(typeof exclusions.rows?.[id] === "string" && exclusions.rows[id].length > 0, `hole 10's impossible driver row ${id} is not in tools/shot-exclusions.json`);
console.log(`exclusions: ${listed.length} ids in tools/shot-exclusions.json and excludedShots, none shipped`);

// ---- d. hole 10's driver tee shots ----
{
  const tees = rows.filter((r) => r.hole === 10 && r.lie === "tee" && r.club === "driver" && r.power === 4);
  ok(tees.length === 4, `hole 10: ${tees.length} full-power driver tee rows, expected 4`);
  const stopYd = WSR_SHAPE.driver.stopYd, flat = run({ club: "driver", q: 1, trace: false }).stop, h = byId.driver.h;
  const out = [];
  for (const r of tees) {
    const lvl = levelStop(r), wAlong = r.windSpeed * Math.cos((r.windDeg * Math.PI) / 180), calm = r.flatEnded / (1 + h * wAlong);
    ok(r.elevFactor >= 0.98 && r.elevFactor <= 1.04, `${tag(r)}: elevFactor ${r.elevFactor} outside 0.98-1.04`);
    ok(Math.abs(r.flatEnded - lvl) <= 5, `${tag(r)}: flatEnded ${r.flatEnded}, WSR's level stop at ${r.windSpeed} mph ${r.windDeg}° ${lvl.toFixed(1)}`);
    ok(Math.abs(calm - flat) <= 5, `${tag(r)}: flatEnded with the wind taken out by h ${h}: ${calm.toFixed(1)}, WSR's calm ${flat.toFixed(1)}`);
    out.push(`${r.windSpeed} mph ${r.windDeg}°: ended ${r.ended}, elevFactor ${r.elevFactor}, flatEnded ${r.flatEnded} (${(r.flatEnded - flat).toFixed(1)} on ${flat.toFixed(1)}; WSR level at that wind ${lvl.toFixed(1)}, ${(r.flatEnded - lvl).toFixed(1)}; calm ${calm.toFixed(1)})`);
  }
  console.log(`hole 10 driver tee shots (WSR's full-power stop on level fairway ${stopYd} yd):\n  ${out.join("\n  ")}`);
}

// ---- e. the irons at full power ----
{
  const out = [];
  for (const id of ["3iron", "5iron", "7iron", "9iron", "wedge"]) {
    const rs = rows.filter((r) => r.club === id && r.power === 4 && r.elevFactor > 0);
    if (!rs.length) continue;
    const flat = run({ club: id, q: 1, trace: false }).stop;
    const d = rs.map((r) => ({ r, lvl: levelStop(r) }));
    const mean = (f) => d.reduce((s, x) => s + f(x), 0) / d.length;
    out.push(`${id} (WSR ${flat.toFixed(1)} calm): ${d.map(({ r, lvl }) => `H${r.hole}S${r.stroke} ${r.flatEnded} [${(r.flatEnded - lvl).toFixed(1)} on WSR at ${r.windSpeed} mph ${r.windDeg}°, logged ${(r.ended - lvl).toFixed(1)}]`).join(", ")}; mean ${mean((x) => x.r.flatEnded - x.lvl).toFixed(1)} after the terrain, ${mean((x) => x.r.ended - x.lvl).toFixed(1)} before`);
  }
  console.log(`irons and wedge at full power, flatEnded against WSR's level-fairway stop at the row's wind:\n  ${out.join("\n  ")}`);
}

console.log(fails ? `${fails} FAILURES` : "all shot-row checks passed");
process.exit(fails ? 1 : 0);
