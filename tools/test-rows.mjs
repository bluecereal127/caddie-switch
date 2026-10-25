// node tools/test-rows.mjs [repoRoot]
// Acceptance for the shot rows public/derived.json ships (tools/assemble-shots.mjs
// -> tools/build-derived.mjs), on the committed files alone (no captures):
//  a. every importable row has pos (map fractions), bearing (deg N-up) and
//     elevFactor / flatEnded, or says why not (elevWhy); flatEnded is ended /
//     elevFactor; club ids are the app's (src/model.js DEFAULT_CLUBS)
//  b. each elevFactor flies again from public/terrain as build-derived flies
//     it (src/model.js lineProfile and elevFlight: Nintendo Switch Sports'
//     ball, src/nsssim.js, at the row's power from its lie in its wind, over
//     the line and over level fairway), to its 4 decimals
//  c. exclusions: derived.json's excludedShots is tools/shot-exclusions.json's
//     ids, none of them is a shipped row, and the three impossible hole 10
//     driver rows (strokes 14, 24, 25: 151 / 109 / 170 yd at 3-4 bars) are
//     listed
//  d. the four clean full-power driver tee shots on hole 10 (2026-08-21):
//     elevFactor within 1.03-1.08 (NSS's hole 10 runs downhill from the tee),
//     flatEnded within 5 yd of NSS's own stop on level fairway at the row's
//     wind (which is 265.6 yd in calm air), and within 5 yd of 265.6 once
//     NSS's wind is taken back out (x the calm stop over the windy one); and
//     the logged stop within 3 yd of NSS's ball flown over the hole's terrain
//     from the frame's spot in the row's wind (274 / 281 / 284 / 292 yd logged)
//  e. every flown row's logged stop against NSS's flight over the terrain,
//     and the irons' full-power rows against NSS's level-fairway stops, printed
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const { DEFAULT_CLUBS, lineProfile, elevFlight, stopAt } = await imp("src/model.js");
const { NSS_SHAPE } = await imp("src/nssShape.js");
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
// NSS's ball for a row over its line (src/model.js elevFlight, as build-derived flies it)
const flights = new Map();
const flightOf = (r) => {
  if (!flights.has(r)) {
    const t = terrainOf(r.hole), sc = derived.holes[r.hole].scale, th = (r.bearing * Math.PI) / 180;
    const at = (yd) => [r.pos.x + (Math.sin(th) * yd) / sc / W, r.pos.y - (Math.cos(th) * yd) / sc / H];
    const h0 = heightAt(t, r.pos.x, r.pos.y);
    const prof = lineProfile({ surfaceAt: (yd) => lieOf(classAt(t, ...at(yd))), heightAt: (yd) => { const h = heightAt(t, ...at(yd)); return h == null ? null : h - h0; } });
    flights.set(r, elevFlight({ club: r.club, power: r.power, lie: r.lie, windSpeed: r.windSpeed ?? 0, windDeg: r.windDeg ?? 0, prof }));
  }
  return flights.get(r);
};
// NSS's level-fairway stop at a row's power and wind
const levelStop = (r) => flightOf(r).level;
let worst = 0;
for (const r of rows.filter((x) => x.elevFactor > 0)) {
  const f = flightOf(r), ef = +(f.over / f.level).toFixed(4);
  worst = Math.max(worst, Math.abs(ef - r.elevFactor));
  ok(ef === r.elevFactor, `${tag(r)}: elevFactor ${r.elevFactor} shipped, ${ef} flown again with NSS's ball (rerun tools/build-derived.mjs)`);
}
console.log(`flights: ${flights.size} elevFactors flown again from public/terrain with NSS's ball, worst difference ${worst}`);

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
  const stopYd = NSS_SHAPE.driver.stopYd, dr = byId.driver;
  const out = [];
  for (const r of tees) {
    const lvl = levelStop(r), calm = r.flatEnded * (stopAt(dr, 4, 0, {}) / lvl), over = flightOf(r).over;
    ok(r.elevFactor >= 1.03 && r.elevFactor <= 1.08, `${tag(r)}: elevFactor ${r.elevFactor} outside 1.03-1.08`);
    ok(Math.abs(r.flatEnded - lvl) <= 5, `${tag(r)}: flatEnded ${r.flatEnded}, NSS's level stop at ${r.windSpeed} mph ${r.windDeg}° ${lvl.toFixed(1)}`);
    ok(Math.abs(calm - stopYd) <= 5, `${tag(r)}: flatEnded with NSS's wind taken out: ${calm.toFixed(1)}, NSS's calm ${stopYd}`);
    ok(Math.abs(over - r.ended) <= 3, `${tag(r)}: logged ${r.ended} yd, NSS's ball over the terrain ${over.toFixed(1)}`);
    out.push(`${r.windSpeed} mph ${r.windDeg}°: ended ${r.ended} (NSS over the terrain ${over.toFixed(1)}), elevFactor ${r.elevFactor}, flatEnded ${r.flatEnded} (NSS level at that wind ${lvl.toFixed(1)}, ${(r.flatEnded - lvl).toFixed(1)}; calm ${calm.toFixed(1)})`);
  }
  console.log(`hole 10 driver tee shots (NSS's full-power stop on level fairway ${stopYd} yd):\n  ${out.join("\n  ")}`);
}

// ---- e. every flown row against NSS's flight; the irons at full power ----
{
  const res = rows.filter((r) => r.elevFactor > 0).map((r) => ({ r, d: r.ended - flightOf(r).over }));
  const abs = res.map((x) => Math.abs(x.d)).sort((a, b) => a - b);
  console.log(`logged stop - NSS's ball over the terrain, ${res.length} rows: median |${abs[abs.length >> 1].toFixed(1)}| yd, 90th percentile ${abs[Math.floor(abs.length * 0.9)].toFixed(1)}, worst ${abs[abs.length - 1].toFixed(1)} (${res.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3).map((x) => `${tag(x.r)} ${x.d > 0 ? "+" : ""}${x.d.toFixed(1)}`).join(", ")})`);
  const out = [];
  for (const id of ["3iron", "5iron", "7iron", "9iron", "wedge"]) {
    const rs = rows.filter((r) => r.club === id && r.power === 4 && r.elevFactor > 0);
    if (!rs.length) continue;
    const d = rs.map((r) => ({ r, lvl: levelStop(r) }));
    const mean = (f) => d.reduce((s, x) => s + f(x), 0) / d.length;
    out.push(`${id} (NSS ${NSS_SHAPE[id].stopYd.toFixed(1)} calm): ${d.map(({ r, lvl }) => `H${r.hole}S${r.stroke} ${r.flatEnded} [${(r.flatEnded - lvl).toFixed(1)} on NSS at ${r.windSpeed} mph ${r.windDeg}°, logged ${(r.ended - flightOf(r).over).toFixed(1)} on NSS over the terrain]`).join(", ")}; mean ${mean((x) => x.r.flatEnded - x.lvl).toFixed(1)}`);
  }
  console.log(`irons and wedge at full power, flatEnded against NSS's level-fairway stop at the row's wind:\n  ${out.join("\n  ")}`);
}

console.log(fails ? `${fails} FAILURES` : "all shot-row checks passed");
process.exit(fails ? 1 : 0);
