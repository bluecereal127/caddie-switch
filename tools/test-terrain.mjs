// node tools/test-terrain.mjs [repoRoot]
// Acceptance for the course terrain (tools/build-terrain.mjs -> public/terrain,
// read through src/terrain.js), built from NSS's own collision by ray casts,
// and for its green truth (tools/nss-truth.mjs -> tools/nss-truth.json). Runs
// on the committed files alone; with the eden dump's collision present it
// also rebuilds both, twice for the terrain, and requires the builds
// byte-identical to each other and to the committed files, and probes the
// collision itself.
//  1. every hNN.bin / gNN.bin parses and agrees with index.json (size, sha1,
//     grid, datum, box, units); index.json says source "nss" and read the
//     same field mesh and covers as tools/nss-pins.json (its collisionSha1);
//     the datum is the registration's originMeshY (NSS y 0), within 0.12 KCL
//     units of the WSR start's height in tools/wsr-pins.json
//  2. tee above the green: the datum against the green's mean height (gNN
//     z0Yd) per hole, within 1 m of the WSR mesh numbers (MESHES.md: 51 m
//     down to the green on H21, 20 m up on H17)
//  3. heightAt = 0 within 0.05 yd and classAt = fairway at the WSR start,
//     Glf_RotateOBJ and GlfTeeOBJ (tools/nss-pins.json tees) on every hole;
//     derived.json's tee is GlfTeeOBJ (tools/nss-pins.json tees.teeObj), where
//     local play tees off (measured in Eden RAM on holes 2-18 to 0.00 yd)
//  4. classAt = green at every NSS cup (tools/nss-pins.json, 126) and at each
//     pin derived.json ships from NSS; at every on-course WSR tree trunk inside
//     the frame the tree's lie in wsr-pins.json, but for the six trunks NSS
//     puts on other ground (TRUNKS below)
//  5. the spots where the shipped map (WSR's own minimap model, rendered) and
//     WSR's KCL disagreed (KNOWN below): what NSS has there, mostly the class
//     the map draws; H3's sea, the separate water actor; and H13's sea where
//     NSS's field mesh has it, 153 yd under the tee (H13_SEA_YD below: a
//     stated choice until the user's call, INTEGRATION.md O8), with the six
//     tee-to-cup lines well above it
//  6. nss-truth.json: its scale the registration's yd per map px, every cup
//     inside its outline, its box within 1 px of tools/wsr-truth.json's (H9's
//     top edge 0.82 px off, H15's 0.40, the rest within 0.1); slopeMaxPct
//     against wsr-truth printed. The green grids against nss-truth's gridPct
//     (9x9 cells built the same way): direction within 20 deg and size within
//     20%; the terrain and the green grid agree at the green's centre
//  6b. the masks: the nodes whose ray lands on the green, against nss-truth's
//     outline (simplified to 0.25 map px): every node more than that (plus
//     0.05 yd) inside it masked and none that far outside; no masked node
//     below the surface round it (a cup the covers left open would read 0.30 m
//     down): none more than PIT_DEV_YD under its neighbours' mean, no step to
//     a neighbour steeper than PIT_STEP
//  6c. the greens against the WSR grids public/terrain shipped before the NSS
//     swap (git show WSR_TERRAIN_REV, skipped without git): at every WSR mask
//     node whose NSS read lies inside the NSS mask, within 0.03 yd
//  7. derived.json's trees: NSS's (tools/nss-trees.json, in order): x, y, z,
//     kind, size, sy, off, r, dx, dy and col as the file has them
//  8. lieOf, and the loaders through a fetch stand-in (one fetch per file,
//     null for a missing one, which is fetched again next time, and for a
//     header that reads an empty grid)
//  9. with the dump: nss-truth.mjs rebuilt identical to tools/nss-truth.json;
//     two terrain builds byte-identical to each other and to public/terrain;
//     the collision's own rays: 0.000 m fairway at the three tee points, the
//     green (a cover) over every cup
// 10. build-terrain's class vote (classVote) on synthetic vote vectors: no
//     ray on ground, a clear majority, partial hits, ties with and without the
//     centre ray's class among them
// 11. build-terrain on a synthetic one-hole dump written to a temp dir (runs
//     anywhere): a green with a cup and its closing cover builds; a cover
//     sunk under the cup (the cup left open), no cover at all, and H3 without
//     its water actor are refused (exit 1) with nothing written, and
//     --allow-missing water builds that last one with `missing` in index.json
import { readFileSync, writeFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const T = await import(pathToFileURL(join(root, "src/terrain.js")).href);
// ray casting, as tools/lib/minimap.mjs pointInPoly (inlined: that module pulls in the image codecs)
const pointInPoly = (poly, x, y) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
};
const DIR = join(root, "public/terrain");
const COLLISION = join(root, "tools/harness/state/eden/nss-golf-x/collision");
// the last commit whose public/terrain is WSR's (the KCL rasters)
const WSR_TERRAIN_REV = "9b89649";
const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const index = readJson("public/terrain/index.json");
const derived = readJson("public/derived.json").holes;
const pins = readJson("tools/wsr-pins.json").holes;
const nssPins = readJson("tools/nss-pins.json");
const nssTrees = readJson("tools/nss-trees.json").holes;
const reg = readJson("tools/nss-registration.json").holes;
const truth = readJson("tools/nss-truth.json").holes;
const wsrTruth = readJson("tools/wsr-truth.json").holes;
const UPY = 9.144, M_PER_YD = 0.9144, MAP_W = 250, MAP_H = 304;
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const nn = (n) => String(n).padStart(2, "0");
const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");
const len = (dx, dy) => Math.sqrt(dx * dx + dy * dy);

// tee pad height minus the middle of the green's height range, in m, from the
// gitignored WSR sidecars (captures/meshes/heightmaps-res4/hole-NN.json:
// tee.y, green.minY / maxY), the numbers MESHES.md quotes (H21 51 m, H17
// -20 m); NSS's greens sit within 0.4 m of them
const TEE_ABOVE_GREEN_M = { 1: 20.81, 2: 16.59, 3: 7.23, 4: 4.46, 5: 10.15, 6: 25.71, 7: 26.95, 8: 14.68, 9: 20.11, 10: 5.58, 11: 3.9, 12: 6.45, 13: 5.14, 14: -3.56, 15: -9.97, 16: -10.29, 17: -19.82, 18: -0.26, 19: 3.66, 20: -14.44, 21: 51.09 };
// where WSR's own minimap model (the shipped map) drew another class than
// WSR's KCL (tools/MESHES.md "Where the model and the KCL differ"), and what
// NSS has there: [hole, what, map px x0, y0, x1, y1 (inclusive), { class: at
// least this many samples }]. NSS mostly has what the map draws (it is the
// Switch's course): H4's fairway, OB on H3, H6 and H12, H9's rough; on the
// sea edges of H3, H5, H7 and H21 it has the OB and the sea; H19's beach,
// sand on the map, is water.
const KNOWN = [
  [4, "fairway over an 80-unit sand cell of WSR's KCL, 134 yd from the tee: NSS fairway", 147, 122, 154, 129, { 1: 16 }],
  [12, "OB over WSR's 10x10 px pond beside the tee: NSS OB", 140, 267, 149, 276, { 4: 25 }],
  [12, "OB over WSR's rough strip above that pond: NSS OB, with water at its edge", 140, 257, 154, 266, { 4: 21, 7: 9 }],
  [12, "OB over a WSR rough polygon: NSS OB and rock", 109, 114, 118, 120, { 4: 11, 12: 2 }],
  [6, "OB over a WSR rough triangle: NSS OB", 84, 192, 94, 202, { 4: 25 }],
  [3, "OB over WSR's sea plane, right edge: NSS OB", 214, 0, 236, 140, { 4: 770 }],
  [3, "OB over WSR's sea plane, top-left coast: NSS OB and the sea (the water actor)", 55, 0, 93, 28, { 4: 120, 7: 130 }],
  [5, "OB over WSR's sea plane, bottom edge: NSS OB and the sea", 0, 290, 249, 303, { 4: 430, 7: 360 }],
  [7, "OB over WSR's sea plane, top edge (west): NSS OB and the sea", 20, 0, 40, 17, { 4: 34, 7: 47 }],
  [7, "OB over WSR's sea plane, top edge (east): NSS OB and the sea", 189, 0, 216, 17, { 4: 78, 7: 35 }],
  [21, "OB over WSR's sea plane, bottom-left: NSS OB and the sea", 41, 207, 72, 303, { 4: 370, 7: 330 }],
  [19, "beach sand over WSR's water plane: NSS water", 0, 266, 56, 303, { 7: 532 }],
  [17, "OB over a WSR sand sliver: NSS OB and rock", 217, 57, 225, 70, { 4: 27, 12: 4 }],
  [9, "rough over a 7x3 px WSR sand patch behind the tee: NSS rough", 99, 280, 105, 282, { 2: 4 }],
  [12, "a pond where WSR's KCL had nodata (map-style.json: pond): NSS water, rough at its edge, rock", 154, 236, 171, 266, { 7: 90, 2: 20, 12: 9 }],
];
// on-course WSR trunks (wsr-pins.json trees, by index) NSS puts on other
// ground than the lie WSR's KCL gave them: [hole, tree index, WSR lie, NSS class]
const TRUNKS = [[1, 28, "rough", 12], [4, 0, "rough", 4], [4, 4, "rough", 4], [7, 61, "rough", 4], [7, 66, "rough", 4], [20, 4, "rough", 4]];
const LIE_CLASS = { fairway: 1, rough: 2, sand: 3, outer: 4, green: 6, water: 7, fringe: 9 };

ok(index.source === "nss", `index.json source ${index.source}, expected "nss"`);
const terr = {}, green = {};
let rawBytes = 0, worstTee = 0, worstDatum = 0, cupsOn = 0, cupsAll = 0;
const trunkOff = [];
for (let n = 1; n <= 21; n++) {
  const e = index.holes[n];
  ok(e, `H${n} missing from index.json`);
  if (!e) continue;
  const tb = readFileSync(join(DIR, e.file)), gb = readFileSync(join(DIR, e.green.file));
  rawBytes += tb.length + gb.length;
  const t = (terr[n] = T.parseTerrain(tb)), g = (green[n] = T.parseGreenHeights(gb));
  // 1. files against the index
  ok(tb.length === e.bytes && sha1(tb) === e.sha1 && gb.length === e.green.bytes && sha1(gb) === e.green.sha1, `H${n} file size / sha1 differ from index.json`);
  ok(t.hole === n && t.w === index.w && t.h === index.h && Math.abs(t.unitYd - index.ydPerUnit) < 1e-7 && Math.abs(t.datumY - e.datumY) < 1e-3, `H${n} terrain header`);
  ok(g.hole === n && g.w === e.green.w && g.h === e.green.h && Math.abs(g.stepYd - e.green.stepYd) < 1e-7 && Math.abs(g.z0Yd - e.green.z0Yd) < 1e-4 && ["x0", "y0", "x1", "y1"].every((k) => Math.abs(g.box[k] - e.green.box[k]) < 1e-6), `H${n} green header`);
  ok(Math.abs((g.box.x1 - g.box.x0) * MAP_W * truth[n].scale - (g.w - 1) * g.stepYd) < 1e-3 && Math.abs((g.box.y1 - g.box.y0) * MAP_H * truth[n].scale - (g.h - 1) * g.stepYd) < 1e-3, `H${n} green grid is not ${g.stepYd} yd apart`);
  const cs = nssPins.source?.collisionSha1?.[n];
  ok(cs && e.collisionSha1?.field === cs.field && e.collisionSha1?.covers === cs.covers, `H${n} terrain built from another field mesh / covers than tools/nss-pins.json`);
  ok(Math.abs(e.datumY - reg[n].originMeshY) < 1e-6, `H${n} datum ${e.datumY} is not the registration's originMeshY ${reg[n].originMeshY}`);
  const dd = Math.abs(e.datumY - pins[n].starts[0].mesh[1]);
  worstDatum = Math.max(worstDatum, dd);
  ok(dd <= 0.12 + 1e-9 && e.datumWsrMeshY === pins[n].starts[0].mesh[1], `H${n} datum ${e.datumY} u, the WSR start ${pins[n].starts[0].mesh[1]} u`);
  // 2. tee above the green's mean height, m
  const drop = -g.z0Yd * M_PER_YD;
  ok(Math.abs(drop - TEE_ABOVE_GREEN_M[n]) <= 1, `H${n} tee above green ${drop.toFixed(2)} m, mesh ${TEE_ABOVE_GREEN_M[n]} m`);
  const mean = (() => { let s = 0, k = 0; for (let i = 0; i < g.w * g.h; i++) if (g.mask[i]) { s += g.data[i]; k++; } return (s / k) * g.unitYd; })();
  ok(Math.abs(mean) < 0.001, `H${n} green heights are not centred on z0Yd (mean ${mean.toFixed(4)} yd)`);
  // 3. the tee points
  const tees = nssPins.holes[n].tees;
  ok(derived[n].tee && Math.abs(derived[n].tee.x - tees.teeObj.x) < 1e-4 && Math.abs(derived[n].tee.y - tees.teeObj.y) < 1e-4, `H${n} derived.json tee is not GlfTeeOBJ (tools/nss-pins.json tees.teeObj)`);
  for (const k of ["wsrStart", "rotateObj", "teeObj"]) {
    const p = tees[k], h0 = T.heightAt(t, p.x, p.y), c0 = T.classAt(t, p.x, p.y);
    if (h0 != null) worstTee = Math.max(worstTee, Math.abs(h0));
    ok(h0 != null && Math.abs(h0) <= 0.05, `H${n} heightAt(${k}) = ${h0} yd, expected 0`);
    ok(c0 === 1, `H${n} class at ${k} ${c0}, expected 1 (fairway / tee pad)`);
  }
  // 4. cups, derived.json's NSS pins, trunks
  for (const c of nssPins.holes[n].cups) { cupsAll++; const cl = T.classAt(t, c.x, c.y); if (cl === 6) cupsOn++; else ok(false, `H${n} cup ${c.k} on class ${cl}, not green`); }
  const dPins = (derived[n].pins ?? []).filter((p) => p.src === "nss");
  ok(dPins.every((p) => T.classAt(t, p.x, p.y) === 6), `H${n} derived.json NSS pin off the green: ${dPins.filter((p) => T.classAt(t, p.x, p.y) !== 6).map((p) => p.id).join(", ")}`);
  pins[n].trees.forEach((tr, i) => {
    if (!((tr.lie === "rough" || tr.lie === "fairway") && tr.x >= 0 && tr.x < 1 && tr.y >= 0 && tr.y < 1)) return;
    const c = T.classAt(t, tr.x, tr.y);
    if (c !== LIE_CLASS[tr.lie]) trunkOff.push([n, i, tr.lie, c]);
  });
}
const trunkKey = (a) => a.join(":");
ok(trunkKey(trunkOff.map(trunkKey)) === trunkKey(TRUNKS.map(trunkKey)), `on-course trunks on another class than their WSR lie: ${trunkOff.map(([n, i, l, c]) => `H${n} #${i} ${l}->${c}`).join(", ")}, expected ${TRUNKS.map(([n, i, l, c]) => `H${n} #${i} ${l}->${c}`).join(", ")}`);
const treesOn = Object.values(pins).reduce((s, h) => s + h.trees.filter((tr) => (tr.lie === "rough" || tr.lie === "fairway") && tr.x >= 0 && tr.x < 1 && tr.y >= 0 && tr.y < 1).length, 0);
const dNss = Object.values(derived).reduce((s, d) => s + (d.pins ?? []).filter((p) => p.src === "nss").length, 0);
ok(cupsAll === 126 && cupsOn === 126, `${cupsOn} of ${cupsAll} NSS cups on the green, expected 126`);
console.log(`files: ${Object.keys(terr).length} terrain + ${Object.keys(green).length} green grids, ${(rawBytes / 1024).toFixed(0)} KB; datum within ${worstDatum.toFixed(2)} u of the WSR start; the WSR start, Glf_RotateOBJ and GlfTeeOBJ fairway at |h| <= ${worstTee.toFixed(3)} yd; ${cupsOn} of ${cupsAll} NSS cups on the green (derived.json ships ${dNss} NSS pins); ${treesOn - trunkOff.length} of ${treesOn} on-course trunks on their WSR lie, ${trunkOff.length} on other NSS ground (${trunkOff.map(([n, i, l, c]) => `H${n} #${i} ${l}->${c}`).join(", ")})`);
console.log("tee above the green's mean, m (shipped / WSR mesh): " + Array.from({ length: 21 }, (_, i) => `H${i + 1} ${(-green[i + 1].z0Yd * M_PER_YD).toFixed(1)}/${TEE_ABOVE_GREEN_M[i + 1]}`).join(" "));
console.log("no ground (class 0 / no height): " + Array.from({ length: 21 }, (_, i) => i + 1).filter((n) => index.holes[n].noHeight || index.holes[n].classes[0]).map((n) => `H${n} ${index.holes[n].classes[0] ?? 0}/${index.holes[n].noHeight}`).join(" "));

// 5. the known spots, by the samples whose centre lies in the box
for (const [n, what, x0, y0, x1, y1, want] of KNOWN) {
  const t = terr[n], got = {};
  let all = 0;
  for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) {
    const cx = ((i + 0.5) / t.w) * MAP_W, cy = ((j + 0.5) / t.h) * MAP_H;
    if (cx < x0 || cx >= x1 + 1 || cy < y0 || cy >= y1 + 1) continue;
    all++; const c = t.classes[j * t.w + i]; got[c] = (got[c] || 0) + 1;
  }
  for (const [c, min] of Object.entries(want)) ok((got[c] ?? 0) >= min, `H${n} ${what}: ${got[c] ?? 0} of ${all} samples class ${c}, expected at least ${min}`);
  console.log(`known: H${n} ${what} (x${x0}-${x1} y${y0}-${y1}): ${Object.entries(got).map(([c, k]) => `class ${c} ${k}`).join(", ")} of ${all}`);
}
// H3's sea is its own actor (Object_BGOBJ_GolfCourse03Water), not in the
// field mesh, whose sea floor is sand OB: the terrain reads the water over it
ok(index.holes[3].collisionSha1?.water && (index.holes[3].classes[7] ?? 0) >= 5000 && !index.holes[3].classes[17] && index.holes[3].missing == null, `H3: the sea (water actor ${index.holes[3].collisionSha1?.water ? "read" : "missing"}) on ${index.holes[3].classes[7] ?? 0} samples, sand OB on ${index.holes[3].classes[17] ?? 0}${index.holes[3].missing ? `, built without ${index.holes[3].missing.join(", ")}` : ""}`);
ok(Object.values(index.holes).every((e) => e.missing == null), `index.json lists actors a hole was built without (--allow-missing): ${Object.entries(index.holes).filter(([, e]) => e.missing).map(([n, e]) => `H${n} ${e.missing.join(", ")}`).join("; ")}`);
// H13's sea: NSS's field mesh carries it as one GolfWaterhazard plane at y
// -139.9 m, -153.0 yd under the tee, the foot of the cliffs round the island
// (rock down to -152.7 yd), where WSR's KCL water read -21.9 to -8.8 yd. It
// ships as NSS has it, a stated choice until the user decides (INTEGRATION.md
// O8): a clamp, if wanted, belongs in build-terrain (a per-hole water level
// recorded in index.json), and this check then changes with it. The six
// tee-to-cup lines bottom out at -16.6 to -16.2 yd, so they never read it.
{
  const H13_SEA_YD = -153.0, t = terr[13], cups = nssPins.holes[13].cups, s = nssPins.holes[13].tees.wsrStart;
  let nSea = 0, off = 0;
  for (let k = 0; k < t.w * t.h; k++) if (t.classes[k] === 7) { nSea++; if (t.heights[k] === T.TERRAIN_NODATA || Math.abs(t.heights[k] * t.unitYd - H13_SEA_YD) > 0.05) off++; }
  let lineLo = Infinity;
  for (const c of cups) for (let i = 0; i <= 1000; i++) { const h = T.heightAt(t, s.x + ((c.x - s.x) * i) / 1000, s.y + ((c.y - s.y) * i) / 1000); if (h != null) lineLo = Math.min(lineLo, h); }
  ok(nSea >= 8000 && !off, `H13: ${nSea} water samples, ${off} of them not at ${H13_SEA_YD} yd (NSS's sea plane)`);
  ok(lineLo > -20, `H13: a tee-to-cup line reads ${lineLo.toFixed(1)} yd`);
  console.log(`H13 sea: ${nSea} water samples at ${H13_SEA_YD} yd (NSS's GolfWaterhazard plane, kept unclamped: O8); the six tee-to-cup lines no lower than ${lineLo.toFixed(1)} yd`);
}

// 6. nss-truth.json, then the green slopes against its 9x9 grid (cell means
// of 12x12 points inside the outline, central differences at the cells'
// physical spacing)
{
  const det = (r) => Math.sqrt(r.a * r.a + r.b * r.b);
  const boxOff = [], slopeD = [];
  for (let n = 1; n <= 21; n++) {
    const tr = truth[n], w = wsrTruth[n];
    ok(tr.meshId === index.holes[n].meshId && tr.meshId === `Fld_GolfCourse${nn(n)}`, `H${n} nss-truth meshId ${tr.meshId}`);
    ok(Math.abs(tr.scale - 1 / (det(reg[n]) * M_PER_YD)) < 1e-6, `H${n} nss-truth scale ${tr.scale} is not the registration's yd per map px`);
    const out = nssPins.holes[n].cups.filter((c) => !pointInPoly(tr.greenPoly, c.x, c.y));
    ok(!out.length, `H${n} cup(s) ${out.map((c) => c.k).join(", ")} outside nss-truth's green outline`);
    const off = Math.max(...["x0", "x1"].map((k) => Math.abs(tr.greenBox[k] - w.greenBox[k]) * MAP_W), ...["y0", "y1"].map((k) => Math.abs(tr.greenBox[k] - w.greenBox[k]) * MAP_H));
    ok(off <= 1, `H${n} nss-truth green box ${off.toFixed(2)} px from wsr-truth's`);
    boxOff.push(`H${n} ${off.toFixed(2)}`);
    slopeD.push(`H${n} ${w.slopeMaxPct}->${tr.slopeMaxPct}`);
  }
  console.log(`nss-truth: scales from the registration, all 126 cups inside the outlines; green box against wsr-truth's, worst edge in px: ${boxOff.join(" ")}`);
  console.log(`slopeMaxPct, wsr-truth -> nss-truth: ${slopeD.join(" ")}`);
}
for (let n = 1; n <= 21; n++) {
  const g = green[n], tr = truth[n], b = tr.greenBox, N = 9, S = 12;
  const cellH = Array.from({ length: N }, () => new Array(N).fill(null));
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    let s = 0, c = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const fx = b.x0 + ((gx + (sx + 0.5) / S) / N) * (b.x1 - b.x0), fy = b.y0 + ((gy + (sy + 0.5) / S) / N) * (b.y1 - b.y0);
      if (pointInPoly(tr.greenPoly, fx, fy)) { s += T.greenHeightAt(g, fx, fy); c++; }
    }
    if (c > 0.12 * S * S) cellH[gy][gx] = s / c;
  }
  const cw = ((b.x1 - b.x0) * MAP_W / N) * tr.scale, ch = ((b.y1 - b.y0) * MAP_H / N) * tr.scale;
  const at = (gy, gx) => (gy >= 0 && gy < N && gx >= 0 && gx < N ? cellH[gy][gx] : null);
  let cmp = 0, agree = 0, worst = 0;
  const sumT = [0, 0], sumG = [0, 0];
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const c = cellH[gy][gx];
    if (c == null) continue;
    const l = at(gy, gx - 1), r = at(gy, gx + 1), u = at(gy - 1, gx), d = at(gy + 1, gx);
    const ddx = r != null && l != null ? (r - l) / (2 * cw) : r != null ? (r - c) / cw : l != null ? (c - l) / cw : 0;
    const ddy = d != null && u != null ? (d - u) / (2 * ch) : d != null ? (d - c) / ch : u != null ? (c - u) / ch : 0;
    const v = [-ddx * 100, -ddy * 100], tp = tr.gridPct[gy][gx];
    sumT[0] += tp[0]; sumT[1] += tp[1]; sumG[0] += v[0]; sumG[1] += v[1];
    if (len(...tp) < 1) continue; // under 1% the direction is noise
    cmp++;
    const a = Math.abs(((Math.atan2(v[1], v[0]) - Math.atan2(tp[1], tp[0]) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180 / Math.PI;
    const ratio = len(...v) / len(...tp);
    if (a <= 20 && Math.abs(ratio - 1) <= 0.2) agree++;
    worst = Math.max(worst, a);
  }
  const mT = len(...sumT), mG = len(...sumG);
  const mA = Math.abs(((Math.atan2(sumG[1], sumG[0]) - Math.atan2(sumT[1], sumT[0]) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180 / Math.PI;
  ok(agree >= 0.95 * cmp, `H${n} green slope cells agreeing with gridPct: ${agree} of ${cmp}`);
  ok(Math.abs(mG / mT - 1) <= 0.1 && mA <= 5, `H${n} the green's mean slope differs from gridPct's (x${(mG / mT).toFixed(2)}, ${mA.toFixed(1)} deg)`);
  if ([7, 12, 21].includes(n) || agree < cmp) console.log(`slopes: H${n} ${agree} of ${cmp} cells (>= 1%) within 20 deg and 20% of gridPct (worst ${worst.toFixed(1)} deg); the green's mean slope x${(mG / mT).toFixed(3)} at ${mA.toFixed(1)} deg`);
  // the two grids agree where both reach: the coarse grid at the green centre
  const [gcx, gcy] = tr.greenCentre, dh = T.heightAt(terr[n], gcx, gcy) - T.greenHeightAt(g, gcx, gcy);
  ok(Math.abs(dh) <= 0.3, `H${n} terrain and green grid differ by ${dh.toFixed(2)} yd at the green centre`);
}

// 6b. the masks against the outline and the surface round each node. The
// outline is simplified to 0.25 map px, so a node within that (0.22-0.61 yd
// on these holes) of it may fall either side; on the shipped grids the worst
// is 0.34 yd in (H19) and 0.50 out (H12). No masked node lies more than 0.11
// yd under its neighbours' mean (H19) or 30% steeper than its neighbour
// (H21), the WSR greens' own numbers; a cup its cover left open would read
// 0.30 m down, a 60% step.
{
  const PIT_DEV_YD = 0.25, PIT_STEP = 0.5;
  const segD = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    return len(ax + t * dx - px, ay + t * dy - py);
  };
  let dev = 0, devAt = "", step = 0, stepAt = "", inW = 0, inAt = "", outW = 0, outAt = "";
  for (let n = 1; n <= 21; n++) {
    const g = green[n], e = index.holes[n].green, poly = truth[n].greenPoly, sc = truth[n].scale, tol = 0.25 * sc + 0.05;
    const distYd = (fx, fy) => { let d = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segD(fx * MAP_W, fy * MAP_H, poly[j][0] * MAP_W, poly[j][1] * MAP_H, poly[i][0] * MAP_W, poly[i][1] * MAP_H)); return d * sc; };
    let inMask = 0;
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const k = j * g.w + i, fx = g.box.x0 + (i / (g.w - 1)) * (g.box.x1 - g.box.x0), fy = g.box.y0 + (j / (g.h - 1)) * (g.box.y1 - g.box.y0);
      const inPoly = pointInPoly(poly, fx, fy);
      if (inPoly !== !!g.mask[k]) {
        const d = distYd(fx, fy);
        ok(d <= tol, `H${n} green node (${i}, ${j}) ${inPoly ? "inside" : "outside"} the outline by ${d.toFixed(2)} yd is ${inPoly ? "not " : ""}in the mask`);
        if (inPoly && d > inW) { inW = d; inAt = `H${n}`; }
        if (!inPoly && d > outW) { outW = d; outAt = `H${n}`; }
      }
      if (!g.mask[k]) continue;
      inMask++;
      let s = 0, c = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if ((di || dj) && ii >= 0 && jj >= 0 && ii < g.w && jj < g.h && g.mask[jj * g.w + ii]) { s += g.data[jj * g.w + ii]; c++; }
      }
      const d = c ? (s / c - g.data[k]) * g.unitYd : 0;
      ok(d <= PIT_DEV_YD, `H${n} green node (${i}, ${j}) lies ${d.toFixed(3)} yd under its neighbours' mean`);
      if (d > dev) { dev = d; devAt = `H${n} (${i}, ${j})`; }
      for (const kk of [i < g.w - 1 ? k + 1 : -1, j < g.h - 1 ? k + g.w : -1]) {
        if (kk < 0 || !g.mask[kk]) continue;
        const st = (Math.abs(g.data[kk] - g.data[k]) * g.unitYd) / g.stepYd;
        ok(st <= PIT_STEP, `H${n} green node (${i}, ${j}): a ${(100 * st).toFixed(0)}% step to its neighbour`);
        if (st > step) { step = st; stepAt = `H${n} (${i}, ${j})`; }
      }
    }
    ok(inMask === e.inside && e.pits == null, `H${n} green mask: ${inMask} nodes (index.json ${e.inside}${e.pits != null ? `, pits ${e.pits}` : ""})`);
  }
  console.log(`green masks: the nodes on the green (H3 ${index.holes[3].green.inside}); against the outline at most ${inW.toFixed(2)} yd inside unmasked (${inAt}), ${outW.toFixed(2)} yd outside masked (${outAt}); deepest node under its neighbours' mean ${dev.toFixed(3)} yd (${devAt}), steepest step ${(100 * step).toFixed(1)}% (${stepAt})`);
}

// 6c. the greens against the WSR grids shipped before the NSS swap
{
  let wsrG = null;
  try { wsrG = Array.from({ length: 21 }, (_, i) => T.parseGreenHeights(execFileSync("git", ["-C", root, "show", `${WSR_TERRAIN_REV}:public/terrain/g${nn(i + 1)}.bin`], { maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] }))); } catch { wsrG = null; }
  if (!wsrG) console.log(`WSR greens: skipped (no git history with ${WSR_TERRAIN_REV} here)`);
  else {
    const row = [];
    let all = 0, worst = 0, worstAt = "";
    for (let n = 1; n <= 21; n++) {
      const og = wsrG[n - 1], ng = green[n], d = [];
      for (let j = 0; j < og.h; j++) for (let i = 0; i < og.w; i++) {
        const k = j * og.w + i;
        if (!og.mask[k]) continue;
        const fx = og.box.x0 + (i / (og.w - 1)) * (og.box.x1 - og.box.x0), fy = og.box.y0 + (j / (og.h - 1)) * (og.box.y1 - og.box.y0);
        const u = ((fx - ng.box.x0) / (ng.box.x1 - ng.box.x0)) * (ng.w - 1), v = ((fy - ng.box.y0) / (ng.box.y1 - ng.box.y0)) * (ng.h - 1);
        if (!(u >= 0 && v >= 0 && u <= ng.w - 1 && v <= ng.h - 1)) continue;
        const i0 = Math.min(ng.w - 2, Math.floor(u)), j0 = Math.min(ng.h - 2, Math.floor(v));
        if (![[i0, j0], [i0 + 1, j0], [i0, j0 + 1], [i0 + 1, j0 + 1]].every(([a, b]) => ng.mask[b * ng.w + a])) continue;
        d.push(Math.abs(T.greenHeightAt(ng, fx, fy) - (og.z0Yd + og.data[k] * og.unitYd)));
      }
      d.sort((a, b) => a - b);
      const mx = d[d.length - 1] ?? Infinity;
      ok(d.length > 1000 && mx <= 0.03, `H${n} NSS green against WSR's at ${d.length} nodes: up to ${mx.toFixed(3)} yd`);
      if (mx > worst) { worst = mx; worstAt = `H${n}`; }
      all += d.length;
      row.push(`H${n} ${d[Math.floor(d.length / 2)]?.toFixed(3)}/${mx.toFixed(3)}`);
    }
    console.log(`WSR greens (${WSR_TERRAIN_REV}): ${all} WSR mask nodes inside the NSS mask within ${worst.toFixed(3)} yd (${worstAt}); median / max per hole: ${row.join(" ")}`);
  }
}

// 7. derived.json trees against tools/nss-trees.json (NSS's trees, in order)
{
  let n0 = 0; const dz = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (let n = 1; n <= 21; n++) {
    const src = nssTrees[n]?.trees ?? [], d = derived[n].trees ?? [];
    ok(src.length === d.length, `H${n} derived.json has ${d.length} trees, tools/nss-trees.json ${src.length}`);
    d.forEach((t, k) => {
      const s = src[k];
      if (!s) { ok(false, `H${n} derived.json tree ${k} has no tools/nss-trees.json counterpart`); return; }
      ok(t.x === s.x && t.y === s.y && t.z === s.z && t.kind === s.kind && t.size === s.size && t.sy === s.sy && !!t.off === !!s.off && t.r === s.r && t.dx === s.dx && t.dy === s.dy,
        `H${n} tree ${k} x / y / z / kind / size / sy / off / r / dx / dy differ from tools/nss-trees.json ${s.id}`);
      ok(same(t.col, s.col), `H${n} tree ${k} col differs from tools/nss-trees.json ${s.id}`);
      if (!t.off) { const g = T.heightAt(terr[n], t.x, t.y); if (g != null) dz.push(t.z - g); }
      n0++;
    });
  }
  dz.sort((a, b) => a - b);
  const q = (p) => dz[Math.min(dz.length - 1, Math.floor(p * dz.length))].toFixed(2);
  console.log(`trees: ${n0} in derived.json as tools/nss-trees.json has them; on-course z - heightAt: p5 ${q(0.05)} p50 ${q(0.5)} p95 ${q(0.95)} yd, min ${dz[0].toFixed(2)} max ${dz[dz.length - 1].toFixed(2)} (NSS's tree base vs the terrain's coarse grid)`);
}

// 8. lieOf and the loaders
ok(T.lieOf(1) === "fairway" && T.lieOf(2) === "rough" && T.lieOf(3) === "bunker" && T.lieOf(4) === "outer" && T.lieOf(5) === "outer" && T.lieOf(6) === "green" && T.lieOf(7) === "water" && T.lieOf(9) === "fringe" && T.lieOf(12) === "wall" && T.lieOf(17) === "outer" && T.lieOf(0) === null && T.lieOf(14) === null && T.lieOf(16) === null, "lieOf");
{
  const calls = [];
  const fetchFs = async (url) => { calls.push(url); const p = join(DIR, url.replace(/^\/test\//, "")); if (!existsSync(p)) return { ok: false }; const b = readFileSync(p); return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
  const opt = { base: "/test/", fetch: fetchFs };
  const [a, b] = await Promise.all([T.loadTerrain(7, opt), T.loadTerrain(7, opt)]);
  const c = await T.loadTerrain(7, opt);
  ok(a && a === b && b === c && calls.filter((u) => u === "/test/h07.bin").length === 1, "loadTerrain fetches a hole once and shares it");
  ok(a && a.classes.length === index.w * index.h && T.heightAt(a, 0.5, 0.5) === T.heightAt(terr[7], 0.5, 0.5), "loadTerrain parses what parseTerrain does");
  const g = await T.loadGreenHeights(7, opt);
  ok(g && g.w === green[7].w && g.data[100] === green[7].data[100] && g.mask.length === g.w * g.h, "loadGreenHeights");
  ok((await T.loadTerrain(99, opt)) === null && (await T.loadTerrain(99, opt)) === null && calls.filter((u) => u === "/test/h99.bin").length === 2, "a missing file gives null and is fetched again");
  ok((await T.loadGreenHeights(5, { base: "/test/", fetch: async () => { throw new Error("offline"); } })) === null, "a failed fetch gives null");
  // a header that reads an empty grid is malformed too (heightAt on it would be NaN, not null)
  const emptyHdr = (magic, len) => { const b = new Uint8Array(len); b.set([...magic].map((c) => c.charCodeAt(0))); b[4] = 1; return b.buffer; };
  const serve = (buf) => ({ base: "/test/", fetch: async () => ({ ok: true, arrayBuffer: async () => buf }) });
  ok((await T.loadTerrain(98, serve(emptyHdr("CTRN", 20)))) === null && (await T.loadGreenHeights(98, serve(emptyHdr("CGRN", 40)))) === null, "a file whose header reads a 0x0 grid gives null");
  ok(T.heightAt(a, -0.1, 0.5) === null && T.classAt(a, 1.2, 0.5) === 0 && T.heightAt(null, 0.5, 0.5) === null, "outside the frame");
}

// 9. with the dump's collision: the rebuilds and the collision's own rays
if (existsSync(join(COLLISION, "h01.json"))) {
  const dirs = [0, 1].map(() => mkdtempSync(join(tmpdir(), "terrain-")));
  try {
    // index.json and nss-truth.json are text: a checkout under core.autocrlf may have given them CRLF
    const text = (p) => Buffer.from(readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
    execFileSync(process.execPath, [join(root, "tools/nss-truth.mjs"), "--out", join(dirs[0], "nss-truth.json")], { cwd: root, stdio: "pipe" });
    const truthSame = text(join(dirs[0], "nss-truth.json")).equals(text(join(root, "tools/nss-truth.json")));
    ok(truthSame, "tools/nss-truth.mjs rebuilt differs from tools/nss-truth.json");
    rmSync(join(dirs[0], "nss-truth.json"));
    for (const d of dirs) execFileSync(process.execPath, [join(root, "tools/build-terrain.mjs"), "--out", d], { cwd: d === dirs[1] ? tmpdir() : root, stdio: "pipe" });
    const files = readdirSync(DIR).sort();
    ok(eqList(files, readdirSync(dirs[0]).sort()) && eqList(files, readdirSync(dirs[1]).sort()), "the builds write other files than public/terrain holds");
    const read = (d, f) => (f.endsWith(".json") ? text(join(d, f)) : readFileSync(join(d, f)));
    const diff = files.filter((f) => !read(dirs[0], f).equals(read(dirs[1], f)) || !read(dirs[0], f).equals(read(DIR, f)));
    ok(!diff.length, `rebuilt files differ: ${diff.join(", ")}`);
    console.log(`determinism: nss-truth.json rebuilt ${truthSame ? "identical" : "DIFFERENT"}; two terrain builds from the collision (one from another cwd), ${files.length} files, ${diff.length ? `${diff.length} differ` : "byte-identical to each other and to public/terrain"}`);
  } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
  const { loadCollision, gridIndex, topGround } = await import(pathToFileURL(join(root, "tools/lib/nsscol.mjs")).href);
  const { mapToNss } = await import(pathToFileURL(join(root, "tools/lib/nssreg.mjs")).href);
  let worstY = 0, coverHits = 0;
  for (let n = 1; n <= 21; n++) {
    const mesh = loadCollision(COLLISION, n, { covers: true, extras: n === 3 ? ["water"] : [] });
    const idx = gridIndex(mesh, 4);
    for (const k of ["wsrStart", "rotateObj", "teeObj"]) {
      const w = nssPins.holes[n].tees[k].world, hit = topGround(idx, w[0], w[2]);
      ok(hit && hit.code === 5 && Math.abs(hit.y) < 1e-6, `H${n} the collision under ${k}: ${hit ? `code ${hit.code} at ${hit.y.toFixed(4)} m` : "nothing"}`);
      if (hit) worstY = Math.max(worstY, Math.abs(hit.y));
    }
    const covers = new Map(mesh.covers.map((c) => [c.k, c]));
    for (const c of nssPins.holes[n].cups) {
      const [x, z] = mapToNss(reg[n], c.x, c.y), hit = topGround(idx, x, z), cv = covers.get(c.k);
      const onCover = hit && cv && hit.tri >= cv.tri0 && hit.tri < cv.tri1;
      ok(onCover && hit.code === 18, `H${n} cup ${c.k}: the ray over it lands on ${hit ? `code ${hit.code}, tri ${hit.tri}` : "nothing"}, not its cover`);
      if (onCover) coverHits++;
    }
  }
  console.log(`collision: the WSR start, Glf_RotateOBJ and GlfTeeOBJ on GolfFairway within ${worstY.toExponential(1)} m of y 0 on all 21 holes; ${coverHits} of 126 cups under their own cover`);
} else console.log(`determinism and collision: skipped (no ${COLLISION} here)`);
function eqList(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

// 10. the class vote (importing build-terrain builds nothing)
{
  const { classVote } = await import(pathToFileURL(join(root, "tools/build-terrain.mjs")).href);
  const V = (m) => { const v = new Int32Array(18); for (const [c, k] of Object.entries(m)) v[c] = k; return v; };
  const cases = [
    ["no ray finds ground", {}, -1, 0, false],
    ["no ray finds ground, a centre class given", {}, 6, 0, false],
    ["one class", { 2: 16 }, 2, 2, false],
    ["a majority against the centre ray", { 1: 9, 2: 7 }, 2, 1, false],
    ["partial hits (13 rays find nothing)", { 7: 3 }, -1, 7, false],
    ["partial hits, a majority of the hits", { 4: 5, 12: 2 }, 12, 4, false],
    ["a 2-way tie, the centre's class among them", { 2: 8, 6: 8 }, 6, 6, true],
    ["a 2-way tie, the centre's the lower", { 2: 8, 6: 8 }, 2, 2, true],
    ["a 2-way tie, the centre outside it", { 2: 5, 6: 5, 9: 3 }, 9, 2, true],
    ["a 2-way tie, the centre found no ground", { 6: 6, 17: 6 }, -1, 6, true],
    ["a 3-way tie, the centre the highest id", { 4: 4, 12: 4, 17: 4 }, 17, 17, true],
    ["a 3-way tie, the centre on none of them", { 4: 4, 12: 4, 17: 4 }, 1, 4, true],
    ["a tie below the majority is no tie", { 1: 6, 2: 3, 3: 3 }, 3, 1, false],
  ];
  for (const [what, m, centre, cls, tied] of cases) {
    const r = classVote(V(m), centre);
    ok(r.cls === cls && r.tied === tied, `classVote, ${what}: ${JSON.stringify(r)}, expected class ${cls}${tied ? " (tied)" : ""}`);
  }
  console.log(`classVote: ${cases.length} synthetic vote vectors`);
}

// 11. build-terrain on a synthetic dump: one hole (3, the hole with a
// separate water actor), 1 map px = 1 m (x = px - 125, z = py - 152), a flat
// green ring at y 0 over x, z in [-50, 50] round a cup opening 1.2 m square
// at the origin, the cup's bottom (GolfCup 31) 0.30 m down, fairway south of
// the green, the water actor a pond at y -2 m east of it
{
  const dir = mkdtempSync(join(tmpdir(), "terrain-synth-"));
  try {
    const R = 0.6, W = (f, v) => writeFileSync(join(dir, f), typeof v === "string" ? v : Buffer.isBuffer(v) ? v : JSON.stringify(v));
    const part = (V, Tr, S) => {
      const nv = V.length / 3, nt = Tr.length / 3, vb = nv * 12, tb = nt * 12;
      const buf = Buffer.alloc(vb + tb + 2 * nt);
      Buffer.from(new Float32Array(V).buffer).copy(buf, 0);
      Buffer.from(new Uint32Array(Tr).buffer).copy(buf, vb);
      Buffer.from(Uint8Array.from(S)).copy(buf, vb + tb);
      const layout = { verts: { offset: 0, bytes: vb, dtype: "float32", shape: [nv, 3] }, tris: { offset: vb, bytes: tb, dtype: "uint32", shape: [nt, 3] }, surface: { offset: vb + tb, bytes: nt, dtype: "uint8", shape: [nt] }, material: { offset: vb + tb + nt, bytes: nt, dtype: "uint8", shape: [nt] } };
      return { buf, layout, binBytes: buf.length, binSha1: sha1(buf) };
    };
    const quad = (m, x0, z0, x1, z1, y, code) => {
      const v0 = m.V.length / 3;
      m.V.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      m.T.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      m.S.push(code, code);
    };
    const field = { V: [], T: [], S: [] };
    const O = [[-50, -50], [50, -50], [50, 50], [-50, 50]], I = [[-R, -R], [R, -R], [R, R], [-R, R]];
    for (const [x, z] of [...O, ...I]) field.V.push(x, 0, z);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; field.T.push(i, j, 4 + j, i, 4 + j, 4 + i); field.S.push(18, 18); }
    quad(field, -R, -R, R, R, -0.3, 31);
    quad(field, -50, 50, 50, 120, 0, 5);
    const fieldPart = part(field.V, field.T, field.S);
    const water = { V: [], T: [], S: [] };
    quad(water, 60, -20, 90, 20, -2, 8);
    const waterPart = part(water.V, water.T, water.S);
    W("truth.json", { holes: { 3: { greenBox: { x0: 0.44, y0: 0.45, x1: 0.56, y1: 0.55 }, scale: 1 / M_PER_YD } } });
    W("reg.json", { holes: { 3: { a: 1, b: 0, tx: 125, ty: 152, unitsPerM: 10, originMesh: [0, 0], originMeshY: 150 } } });
    W("pins.json", { holes: { 3: { tees: { wsrStart: { mesh: [0, 150, 0] } } } } });
    const dump = ({ cover, water: withWater }) => {
      for (const f of readdirSync(dir)) if (/^h03/.test(f) || f === "out") rmSync(join(dir, f), { recursive: true, force: true });
      const cv = { V: [], T: [], S: [] };
      if (cover != null) quad(cv, -R, -R, R, R, cover, 18);
      const coverPart = part(cv.V, cv.T, cv.S);
      W("h03.bin", fieldPart.buf); W("h03-covers.bin", coverPart.buf);
      W("h03.json", { shape: "Fld_Synthetic03", hole: 3, layout: fieldPart.layout, binBytes: fieldPart.binBytes, binSha1: fieldPart.binSha1, covers: { bin: "h03-covers.bin", layout: coverPart.layout, binBytes: coverPart.binBytes, binSha1: coverPart.binSha1, items: cover != null ? [{ k: 0, vertexRange: [0, 4], triRange: [0, 2] }] : [] } });
      if (withWater) { W("h03-water.bin", waterPart.buf); W("h03-water.json", { layout: waterPart.layout, binBytes: waterPart.binBytes, binSha1: waterPart.binSha1 }); }
    };
    const out = join(dir, "out");
    const build = (...extra) => spawnSync(process.execPath, [join(root, "tools/build-terrain.mjs"), "--collision", dir, "--truth", join(dir, "truth.json"), "--registration", join(dir, "reg.json"), "--pins", join(dir, "pins.json"), "--holes", "3", "--out", out, ...extra], { encoding: "utf8" });
    const runs = [];
    // the cup closed by its cover, the water present: builds
    dump({ cover: 0, water: true });
    let r = build();
    ok(r.status === 0, `synthetic: the closed cup did not build (exit ${r.status}): ${r.stderr.trim()}`);
    if (r.status === 0) {
      const ix = JSON.parse(readFileSync(join(out, "index.json"), "utf8")).holes[3];
      const t = T.parseTerrain(readFileSync(join(out, "h03.bin"))), g = T.parseGreenHeights(readFileSync(join(out, "g03.bin")));
      ok(eqList(readdirSync(out).sort(), ["g03.bin", "h03.bin", "index.json"]), `synthetic: wrote ${readdirSync(out).join(", ")}`);
      ok(ix.missing == null && ix.collisionSha1?.water === waterPart.binSha1 && ix.collisionSha1?.field === fieldPart.binSha1, `synthetic: index entry ${JSON.stringify({ missing: ix.missing, collisionSha1: ix.collisionSha1 })}`);
      ok((ix.classes[6] ?? 0) >= 2400 && (ix.classes[7] ?? 0) >= 280 && (ix.classes[1] ?? 0) >= 1700 && (ix.classes[0] ?? 0) > 10000 && ix.noHeight === ix.classes[0], `synthetic: classes ${JSON.stringify(ix.classes)}, ${ix.noHeight} with no height`);
      ok(T.classAt(t, 0.5, 0.5) === 6 && T.heightAt(t, 0.5, 0.5) === 0, `synthetic: the cup reads class ${T.classAt(t, 0.5, 0.5)} at ${T.heightAt(t, 0.5, 0.5)} yd, not the green (its cover) at 0`);
      ok(T.classAt(t, 0.8, 0.5) === 7 && Math.abs(T.heightAt(t, 0.8, 0.5) + 2.2) < 0.051 && T.classAt(t, 0.5, 0.78) === 1 && T.heightAt(t, 0.05, 0.5) === null && T.classAt(t, 0.05, 0.5) === 0, "synthetic: the pond (class 7 at -2.2 yd), the fairway, no ground past the mesh");
      ok(ix.green.inside === g.w * g.h && g.mask.every((m) => m === 1) && g.data.every((d) => d === 0) && g.z0Yd === 0 && T.greenHeightAt(g, 0.5, 0.5) === 0, `synthetic: the green grid (${ix.green.inside} of ${g.w * g.h} nodes on the green) is not the flat green with the cup closed`);
      runs.push("closed cup: built");
    }
    // the refusals: exit 1, nothing written
    for (const [what, d, extra, msg] of [
      ["a cover sunk 100 m under its cup (the cup left open)", { cover: -100, water: true }, [], "a cup its cover does not close"],
      ["no cover at all (an empty covers bin)", { cover: null, water: true }, [], "no ground under the green grid"],
      ["H3 without its water actor", { cover: 0, water: false }, [], "--allow-missing water"],
    ]) {
      dump(d);
      r = build(...extra);
      ok(r.status === 1 && r.stderr.includes("REFUSED") && r.stderr.includes(msg) && !existsSync(out), `synthetic: ${what}: exit ${r.status}, ${existsSync(out) ? "files written" : "nothing written"}, stderr ${JSON.stringify(r.stderr.trim().slice(0, 200))}`);
      runs.push(`${what}: ${r.status === 1 ? "refused" : `exit ${r.status}`}`);
    }
    // ...unless the missing actor is allowed on purpose
    dump({ cover: 0, water: false });
    r = build("--allow-missing", "water");
    const ix = r.status === 0 ? JSON.parse(readFileSync(join(out, "index.json"), "utf8")).holes[3] : null;
    ok(ix && eqList(ix.missing ?? [], ["water"]) && !ix.classes[7] && ix.collisionSha1?.water == null, `synthetic: --allow-missing water: exit ${r.status}${ix ? `, missing ${JSON.stringify(ix.missing)}, classes ${JSON.stringify(ix.classes)}` : ""}`);
    runs.push(`--allow-missing water: ${ix ? `built, missing ${JSON.stringify(ix.missing)}` : `exit ${r.status}`}`);
    rmSync(out, { recursive: true, force: true });
    r = spawnSync(process.execPath, [join(root, "tools/build-terrain.mjs"), "--allow-missing", "sea", "--out", out], { encoding: "utf8" });
    ok(r.status === 1 && !existsSync(out), `synthetic: --allow-missing sea (no such actor): exit ${r.status}`);
    console.log(`synthetic dump: ${runs.join("; ")}; --allow-missing with an unknown actor refused`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log(fails ? `${fails} FAILURES` : "all terrain checks passed");
process.exit(fails ? 1 : 0);
