// node tools/test-terrain.mjs [repoRoot]
// Acceptance for the course terrain (tools/build-terrain.mjs -> public/terrain,
// read through src/terrain.js). Runs on the committed files alone; with the
// gitignored rasters present it also rebuilds the terrain twice and requires
// both builds byte-identical to each other and to public/terrain.
//  1. every hNN.bin / gNN.bin parses and agrees with index.json (size, sha1,
//     grid, datum, box, units)
//  2. tee above the green: the datum (the WSR start) against the green's mean
//     height (gNN z0Yd) per hole, within 1 m of the mesh numbers (MESHES.md:
//     51 m down to the green on H21, 20 m up on H17)
//  3. heightAt at the WSR start = 0 within 0.2 yd; classAt there = fairway
//     (the tee pad), also on H8, whose start stands in a KCL gap
//  4. classAt at every WSR pin spot in derived.json = green; at every
//     on-course tree trunk inside the frame = the tree's lie in wsr-pins.json
//  5. the spots where WSR's minimap model (and so the shipped map and the
//     Switch) draws another class than the KCL: the terrain keeps the KCL's
//     (KNOWN below, tools/MESHES.md "Where the model and the KCL differ") -
//     known differences, not bugs; and the nodata the minimap draws as water
//  6. the green grids against tools/wsr-truth.json gridPct (9x9 cells built
//     the same way): direction within 20 deg and size within 20%
//  7. derived.json's trees: kind, size and sy as in wsr-pins.json, z = the
//     tree's meshY above the WSR start's height in yd
//  8. lieOf, and the loaders through a fetch stand-in (one fetch per file,
//     null for a missing one, which is fetched again next time)
import { readFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
const index = JSON.parse(readFileSync(join(DIR, "index.json"), "utf8"));
const derived = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
const pins = JSON.parse(readFileSync(join(root, "tools/wsr-pins.json"), "utf8")).holes;
const truth = JSON.parse(readFileSync(join(root, "tools/wsr-truth.json"), "utf8")).holes;
const UPY = 9.144, MAP_W = 250, MAP_H = 304;
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const nn = (n) => String(n).padStart(2, "0");
const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");

// tee pad height minus the middle of the green's height range, in m, from the
// gitignored sidecars (captures/meshes/heightmaps-res4/hole-NN.json: tee.y,
// green.minY / maxY), the numbers MESHES.md quotes (H21 51 m, H17 -20 m)
const TEE_ABOVE_GREEN_M = { 1: 20.81, 2: 16.59, 3: 7.23, 4: 4.46, 5: 10.15, 6: 25.71, 7: 26.95, 8: 14.68, 9: 20.11, 10: 5.58, 11: 3.9, 12: 6.45, 13: 5.14, 14: -3.56, 15: -9.97, 16: -10.29, 17: -19.82, 18: -0.26, 19: 3.66, 20: -14.44, 21: 51.09 };
// KCL class kept where the model draws another: [hole, what the map draws,
// map px x0, y0, x1, y1 (inclusive), the KCL class, at least this many
// samples of it there]; the last entry is KCL nodata the minimap draws as a
// pond, which the terrain takes from map-style.json
const KNOWN = [
  [4, "fairway over an 80-unit KCL sand cell, 134 yd from the tee", 147, 122, 154, 129, 3, 12],
  [12, "OB over the 10x10 px KCL pond beside the tee", 140, 267, 149, 276, 7, 16],
  [12, "OB over the KCL rough strip above that pond", 140, 257, 154, 266, 2, 18],
  [12, "OB over a KCL rough polygon", 109, 114, 118, 120, 2, 9],
  [6, "OB over a KCL rough triangle", 84, 192, 94, 202, 2, 14],
  [3, "OB over the KCL sea plane, right edge", 214, 0, 236, 140, 7, 110],
  [3, "OB over the KCL sea plane, top-left coast", 55, 0, 93, 28, 7, 90],
  [5, "OB over the KCL sea plane, bottom edge", 0, 290, 249, 303, 7, 25],
  [7, "OB over the KCL sea plane, top edge (west)", 20, 0, 40, 17, 7, 30],
  [7, "OB over the KCL sea plane, top edge (east)", 189, 0, 216, 17, 7, 25],
  [21, "OB over the KCL sea plane, bottom-left", 41, 207, 72, 303, 7, 230],
  [19, "beach sand over the KCL water plane", 0, 266, 56, 303, 7, 280],
  [17, "OB over a KCL sand sliver", 217, 57, 225, 70, 3, 10],
  [12, "a pond where the KCL has nodata (map-style.json: pond)", 154, 236, 171, 266, 7, 80],
];
const LIE_CLASS = { fairway: 1, rough: 2, sand: 3, outer: 4, green: 6, water: 7, fringe: 9 };

const terr = {}, green = {};
let rawBytes = 0;
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
  ok(Math.abs(e.datumY - pins[n].starts[0].mesh[1]) < 1e-6, `H${n} datum is not the WSR start's height`);
  // 2. tee above the green's mean height, m
  const drop = -g.z0Yd * UPY / 10;
  ok(Math.abs(drop - TEE_ABOVE_GREEN_M[n]) <= 1, `H${n} tee above green ${drop.toFixed(2)} m, mesh ${TEE_ABOVE_GREEN_M[n]} m`);
  const mean = (() => { let s = 0, k = 0; for (let i = 0; i < g.w * g.h; i++) if (g.mask[i]) { s += g.data[i]; k++; } return (s / k) * g.unitYd; })();
  ok(Math.abs(mean) < 0.001, `H${n} green heights are not centred on z0Yd (mean ${mean.toFixed(4)} yd)`);
  // 3. the start
  const st = pins[n].starts[0];
  ok(derived[n].tee && Math.abs(derived[n].tee.x - st.x) < 1e-4 && Math.abs(derived[n].tee.y - st.y) < 1e-4, `H${n} derived.json tee is not the WSR start`);
  const h0 = T.heightAt(t, st.x, st.y);
  ok(h0 != null && Math.abs(h0) <= 0.2, `H${n} heightAt(start) = ${h0} yd, expected 0`);
  ok(T.classAt(t, st.x, st.y) === 1, `H${n} class at the start ${T.classAt(t, st.x, st.y)}, expected 1 (fairway / tee pad)`);
  // 4. pins and trees
  const wsrPins = derived[n].pins.filter((p) => p.src === "wsr");
  ok(wsrPins.length > 0 && wsrPins.every((p) => T.classAt(t, p.x, p.y) === 6), `H${n} WSR pin off the green: ${wsrPins.filter((p) => T.classAt(t, p.x, p.y) !== 6).map((p) => `${p.label}:${T.classAt(t, p.x, p.y)}`).join(", ")}`);
  const onCourse = pins[n].trees.filter((tr) => (tr.lie === "rough" || tr.lie === "fairway") && tr.x >= 0 && tr.x < 1 && tr.y >= 0 && tr.y < 1);
  const bad = onCourse.filter((tr) => T.classAt(t, tr.x, tr.y) !== LIE_CLASS[tr.lie]);
  ok(!bad.length, `H${n} ${bad.length} on-course trunk(s) on another class than their lie: ${bad.map((tr) => `${tr.lie}->${T.classAt(t, tr.x, tr.y)}`).join(", ")}`);
}
const treesOn = Object.values(pins).reduce((s, h) => s + h.trees.filter((tr) => (tr.lie === "rough" || tr.lie === "fairway") && tr.x >= 0 && tr.x < 1 && tr.y >= 0 && tr.y < 1).length, 0);
console.log(`files: ${Object.keys(terr).length} terrain + ${Object.keys(green).length} green grids, ${(rawBytes / 1024).toFixed(0)} KB; starts, ${Object.values(derived).reduce((s, d) => s + d.pins.filter((p) => p.src === "wsr").length, 0)} WSR pin spots and ${treesOn} on-course trunks classed`);
console.log("tee above the green's mean, m (shipped / mesh): " + Array.from({ length: 21 }, (_, i) => `H${i + 1} ${(-green[i + 1].z0Yd * UPY / 10).toFixed(1)}/${TEE_ABOVE_GREEN_M[i + 1]}`).join(" "));

// 5. known differences, by the samples whose centre lies in the box
for (const [n, what, x0, y0, x1, y1, cls, min] of KNOWN) {
  const t = terr[n];
  let k = 0, all = 0;
  for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) {
    const cx = ((i + 0.5) / t.w) * MAP_W, cy = ((j + 0.5) / t.h) * MAP_H;
    if (cx < x0 || cx >= x1 + 1 || cy < y0 || cy >= y1 + 1) continue;
    all++; if (t.classes[j * t.w + i] === cls) k++;
  }
  ok(k >= min, `H${n} ${what}: ${k} of ${all} samples class ${cls}, expected at least ${min}`);
  console.log(`known: H${n} ${what} (x${x0}-${x1} y${y0}-${y1}): terrain class ${cls} on ${k} of ${all} samples`);
}

// 6. green slopes against wsr-truth's 9x9 grid (cell means of 12x12 points
// inside the WSR outline, central differences at the cells' physical spacing)
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
    if (Math.hypot(...tp) < 1) continue; // under 1% the direction is noise
    cmp++;
    const a = Math.abs(((Math.atan2(v[1], v[0]) - Math.atan2(tp[1], tp[0]) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180 / Math.PI;
    const ratio = Math.hypot(...v) / Math.hypot(...tp);
    if (a <= 20 && Math.abs(ratio - 1) <= 0.2) agree++;
    worst = Math.max(worst, a);
  }
  const mT = Math.hypot(...sumT), mG = Math.hypot(...sumG);
  const mA = Math.abs(((Math.atan2(sumG[1], sumG[0]) - Math.atan2(sumT[1], sumT[0]) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180 / Math.PI;
  ok(agree >= 0.95 * cmp, `H${n} green slope cells agreeing with gridPct: ${agree} of ${cmp}`);
  ok(Math.abs(mG / mT - 1) <= 0.1 && mA <= 5, `H${n} the green's mean slope differs from gridPct's (x${(mG / mT).toFixed(2)}, ${mA.toFixed(1)} deg)`);
  if ([7, 12, 21].includes(n) || agree < cmp) console.log(`slopes: H${n} ${agree} of ${cmp} cells (>= 1%) within 20 deg and 20% of gridPct (worst ${worst.toFixed(1)} deg); the green's mean slope x${(mG / mT).toFixed(3)} at ${mA.toFixed(1)} deg`);
  // the two grids agree where both reach: the coarse grid at the green centre
  const [gcx, gcy] = tr.greenCentre, dh = T.heightAt(terr[n], gcx, gcy) - T.greenHeightAt(g, gcx, gcy);
  ok(Math.abs(dh) <= 0.3, `H${n} terrain and green grid differ by ${dh.toFixed(2)} yd at the green centre`);
}

// 7. derived.json trees against wsr-pins.json (the on-map subset, in order)
{
  let n0 = 0; const dz = [];
  for (let n = 1; n <= 21; n++) {
    const src = pins[n].trees.filter((tr) => tr.x >= -0.02 && tr.x <= 1.02 && tr.y >= -0.02 && tr.y <= 1.02), d = derived[n].trees, y0 = pins[n].starts[0].mesh[1];
    ok(src.length === d.length, `H${n} derived.json has ${d.length} trees, wsr-pins.json ${src.length} on the map`);
    d.forEach((t, k) => {
      const s = src[k];
      ok(t.x === s.x && t.y === s.y && t.kind === s.kind && t.size === s.size && t.sy === s.sy && t.z === +((s.meshY - y0) / UPY).toFixed(2), `H${n} tree ${k} kind / size / sy / z`);
      if (!t.off) { const g = T.heightAt(terr[n], t.x, t.y); if (g != null) dz.push(t.z - g); }
      n0++;
    });
  }
  dz.sort((a, b) => a - b);
  const q = (p) => dz[Math.min(dz.length - 1, Math.floor(p * dz.length))].toFixed(2);
  console.log(`trees: ${n0} in derived.json with kind, size, sy, z; on-course z - heightAt: p5 ${q(0.05)} p50 ${q(0.5)} p95 ${q(0.95)} yd, min ${dz[0].toFixed(2)} max ${dz[dz.length - 1].toFixed(2)} (the PMP base vs the ground on the coarse grid)`);
}

// 8. lieOf and the loaders
ok(T.lieOf(1) === "fairway" && T.lieOf(2) === "rough" && T.lieOf(3) === "bunker" && T.lieOf(4) === "outer" && T.lieOf(5) === "outer" && T.lieOf(6) === "green" && T.lieOf(7) === "water" && T.lieOf(9) === "fringe" && T.lieOf(12) === "wall" && T.lieOf(0) === null && T.lieOf(14) === null && T.lieOf(16) === null, "lieOf");
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
  ok(T.heightAt(a, -0.1, 0.5) === null && T.classAt(a, 1.2, 0.5) === 0 && T.heightAt(null, 0.5, 0.5) === null, "outside the frame");
}

// with the rasters: two builds, byte-identical to each other and to the committed files
if (existsSync(join(root, "captures/meshes/heightmaps-res4"))) {
  const dirs = [0, 1].map(() => mkdtempSync(join(tmpdir(), "terrain-")));
  try {
    for (const d of dirs) execFileSync(process.execPath, [join(root, "tools/build-terrain.mjs"), "--out", d], { cwd: root, stdio: "pipe" });
    const files = readdirSync(DIR).sort();
    ok(eqList(files, readdirSync(dirs[0]).sort()) && eqList(files, readdirSync(dirs[1]).sort()), "the builds write other files than public/terrain holds");
    // index.json is text: a checkout under core.autocrlf may have given it CRLF
    const read = (d, f) => (f.endsWith(".json") ? Buffer.from(readFileSync(join(d, f), "utf8").replace(/\r\n/g, "\n")) : readFileSync(join(d, f)));
    const diff = files.filter((f) => !read(dirs[0], f).equals(read(dirs[1], f)) || !read(dirs[0], f).equals(read(DIR, f)));
    ok(!diff.length, `rebuilt files differ: ${diff.join(", ")}`);
    console.log(`determinism: two builds from the rasters, ${files.length} files, ${diff.length ? `${diff.length} differ` : "byte-identical to each other and to public/terrain"}`);
  } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
} else console.log("determinism: skipped (no captures/meshes/heightmaps-res4 here)");
function eqList(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

console.log(fails ? `${fails} FAILURES` : "all terrain checks passed");
process.exit(fails ? 1 : 0);
