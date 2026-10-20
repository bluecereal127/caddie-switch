// Ship the course terrain to the app: per hole, the ground height and the KCL
// surface class on a grid over the 250x304 map frame, and a fine height grid
// over the green. The source rasters are the WSR collision meshes'
// (tools/mesh-heightmap.mjs, gitignored rips), so the output is committed.
//
//   node tools/build-terrain.mjs [--heightmaps captures/meshes/heightmaps-res4] [--out public/terrain]
//        [--holes 7,16] [--style tools/map-style.json]
//
// Reads per hole captures/meshes/heightmaps-res4/hole-NN.json and the RAW and
// _classes.png it names (4 KCL units per px: the height and the KCL type of
// the topmost surface), tools/mesh-registration.json (map fraction <-> mesh
// units), tools/wsr-pins.json (the WSR player start: its height is the hole's
// datum), tools/wsr-truth.json (green box, outline, yd per map px) and
// tools/map-style.json (what the minimap draws over the raster's nodata).
// Writes public/terrain/hNN.bin, gNN.bin and index.json; the app reads them
// through src/terrain.js. Rerun when the meshes or the registration change,
// like tools/wsr-truth.mjs. A --holes batch merges its entries into the
// existing index.json; every file is written only after all holes are built.
//
// hNN.bin, little-endian, 20-byte header then two arrays, row-major from the
// map's top-left (row 0 = the north edge, column 0 = the west edge):
//   0  "CTRN"   4  u16 layout version (1)   6  u16 w   8  u16 h   10 u16 hole
//   12 f32 datumY: the WSR start's height, KCL units (0.1 m)
//   16 f32 yd per height unit (0.1)
//   20 int16[w*h] ground height in 0.1 yd above the datum; -32768 = no data
//      (beyond the raster's crop)
//   20 + 2wh  uint8[w*h] KCL class (legend in index.json; 0 = beyond the raster)
// gNN.bin, 40-byte header:
//   0  "CGRN"   4  u16 version (1)   6  u16 w   8  u16 h   10 u16 hole
//   12 f32 box x0, y0, x1, y1 (map fractions; node (i, j) sits at
//      x0 + i(x1 - x0)/(w - 1), y0 + j(y1 - y0)/(h - 1), stepYd apart)
//   28 f32 stepYd (0.5)   32 f32 z0Yd: the green's mean height above the datum
//   36 f32 yd per height unit (0.001)
//   40 int16[w*h] height above z0Yd   40 + 2wh  uint8[w*h] 1 = inside the
//      WSR green outline
// The headers hold NUL bytes on purpose: git (core.autocrlf on this repo)
// takes a file with no NUL in its first 8000 bytes for text, and the height
// data of holes 2 and 13 has none there. The files are not compressed; the
// log gives their raw and gzipped sizes.
//
// The grid: one sample per GRID_PX map px, the sample's cell the map px square
// it covers, its centre at ((i + 0.5)/w, (j + 0.5)/h). Height: a bilinear read
// of the raster at the centre through mapFracToMesh (against the median of the
// raster px in the cell: under 0.04 yd at the median cell, 0.07-0.13 yd at the
// 99th percentile; a cell astride a cliff or bank reads part way down it).
// Class: the majority of the raster pixels whose centres fall in the cell
// (the part of a cell past the raster's crop votes 0; ties take the class
// under the centre). The KCL class stays wherever the KCL has a surface, also
// where WSR's own minimap model draws something else (tools/MESHES.md "Where
// the model and the KCL differ": fairway over a sand cell on H4, OB over KCL
// water and rough on H12 and over the sea plane on H3, H5, H7 and H21, beaches
// over the water plane on H3 and H19; tools/test-terrain.mjs lists them). Two
// things in the rasters are not KCL surfaces and are mended first:
//  - nodata (no surface at all): enclosed collision gaps in the ground, the
//    void past the mesh, H12's ponds and H8's strait. Each nodata region takes
//    what tools/map-style.json says the minimap draws there (sea or pond ->
//    water, outer -> outer ground; the rest, the gaps, the nearest class), as
//    tools/lib/minimap.mjs resolveRaster does for the renderer: H8's start
//    stands in an 80x80 u gap in its tee pad, which the minimap draws as tee.
//    The heights there are mesh-heightmap.mjs's own fill from the nearest
//    surface. Floor (5), zone (14) and fall (16) are KCL types and stay.
//  - cracks: max-Y rasterising leaves 1-2 px slits along shared and T-junction
//    triangle edges where what lies below shows through: 1,008 px over the 21
//    holes, 5-705 u down (627 water, 367 nodata, 8 floor, 6 sand or rough;
//    219 of them round H1's zone, one in H3's green, 16 yd under it). A 3x3
//    grey-scale closing lifts a slit at most 2 px wide to the surface around
//    it and leaves wider features and slopes alone (a concave kink rises by
//    its slope x 4 u at most); a pixel it lifts by more than CRACK_DEPTH takes
//    the closed height and the majority class of its other neighbours. The
//    lifts fall in two groups, 199 px at 2-4 u (kinks, beach alternation) and
//    1,002 px over 8 u (slits), with 14 px between them. Wider holes in the
//    ground (tools/MESHES.md "Quirks") are in the KCL and stay, the closing
//    trimming only their ragged edges: in the frame five round H3's green
//    (15-170 px, water 130-160 u down), one north of H17's green (50 px, 230 u)
//    and a shallow one on H2; so do a dozen 1-3 px pits in H15's river bed
//    that no 3x3 neighbourhood bridges.
//
// The green: heights at GREEN_STEP_YD over the WSR green box plus
// GREEN_MARGIN of it on every side (the app's green view, build-derived's
// GT_MARGIN), grown by under half a step so the grid fits it exactly, read
// bilinearly from the same mended raster, in GREEN_UNIT_YD above the green's
// mean (over the mask), mask = inside the WSR green outline (wsr-truth.json
// greenPoly). The unit is 0.001 yd, not 0.01: a step of 0.01 yd over the
// 0.5 yd spacing is a 2% slope, against 1.9 / 5.5 / 11.8% at the p10 / p50 /
// p90 of the 1,373 green cells of tools/wsr-truth.json's 9x9 grids; 0.001 yd
// is 0.2%, about what the raster itself resolves (0.001-0.004 yd: uint16 over
// each hole's height range). The box's heights stay within -25.0 yd (H17's
// box reaches that hole) and +3.2 yd (H20) of their green's mean, inside
// int16's +-32.767 yd; the greens themselves have 0.6-3.3 yd of relief.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { MAP_W, MAP_H, UNITS_PER_YD, CLS, loadHole, deadRegions, fillNearest, pointInPoly, readJson } from "./lib/minimap.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = { heightmaps: join(ROOT, "captures/meshes/heightmaps-res4"), out: join(ROOT, "public/terrain"), holes: null, style: join(ROOT, "tools/map-style.json") };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--heightmaps") opt.heightmaps = args[++i];
  else if (a === "--out") opt.out = args[++i];
  else if (a === "--holes") opt.holes = args[++i].split(",").map(Number);
  else if (a === "--style") opt.style = args[++i];
  else { console.error(`unknown argument ${a}\nusage: node tools/build-terrain.mjs [--heightmaps dir] [--out public/terrain] [--holes 7,16] [--style tools/map-style.json]`); process.exit(1); }
}
const HOLES = opt.holes ?? Array.from({ length: 21 }, (_, i) => i + 1);
// the defaults are the repo's; a path given resolves against the cwd (an
// absolute one as it is); loadHole wants the rasters relative to the repo root
const HM_DIR = resolve(opt.heightmaps), OUT = resolve(opt.out);
const STYLE = readJson(resolve(opt.style)).holes ?? {};

const LAYOUT = 1;
// one sample per 2 map px: 125x152, a cell 1.8-5.0 yd across (0.89-2.51 yd
// per map px), 57 KB per hole
const GRID_PX = 2, GW = MAP_W / GRID_PX, GH = MAP_H / GRID_PX;
const Z_UNIT_YD = 0.1, NODATA = -32768;
const CRACK_DEPTH = 5; // KCL units: what the closing must lift for a pixel to count as a crack
const GREEN_MARGIN = 0.12, GREEN_STEP_YD = 0.5, GREEN_UNIT_YD = 0.001;
const HEADER = 20, GREEN_HEADER = 40;
const NCLS = 17; // class ids 0-16
const CLASS_NAMES = { 0: "nodata (beyond the raster's crop)", 1: "fairway (and the tee pad)", 2: "rough", 3: "bunker (sand, beaches, river gravel)", 4: "outer ground (OB terrain)", 5: "floor plane (the dead plane under water and OB)", 6: "green", 7: "water", 9: "fringe", 14: "zone (H1)", 16: "fall boundary (H14)" };

// 3x3 grey-scale dilation (max) or erosion (min), separable, edges clamped
function pass3(src, w, h, op) {
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    let v = src[p];
    if (x > 0) v = op(v, src[p - 1]);
    if (x < w - 1) v = op(v, src[p + 1]);
    tmp[p] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    let v = tmp[p];
    if (y > 0) v = op(v, tmp[p - w]);
    if (y < h - 1) v = op(v, tmp[p + w]);
    out[p] = v;
  }
  return out;
}

// the hole's rasters, mended (see the header): heights in KCL units, classes
function mendedRaster(hole) {
  const r = hole.raster, enc = hole.side.height, w = r.w, h = r.h;
  const raw = readFileSync(join(HM_DIR, enc.file));
  if (raw.length !== w * h * 2) throw new Error(`H${hole.n}: ${enc.file} holds ${raw.length} bytes, the class raster is ${w}x${h}`);
  const span = enc.encodeMaxY - enc.encodeMinY;
  const ht = new Float64Array(w * h);
  for (let p = 0; p < w * h; p++) ht[p] = enc.encodeMinY + (raw.readUInt16LE(2 * p) / 65535) * span;
  // nodata regions as the minimap draws them, keyed on the unmended raster
  // the way map-style.json designates them
  const des = STYLE[hole.n]?.regions ?? {};
  const { label, regions } = deadRegions(r);
  const cls = Uint8Array.from(r.cls), dead = { water: 0, outer: 0, nearest: 0 };
  for (let p = 0; p < w * h; p++) {
    if (r.cls[p] !== CLS.NODATA) continue;
    const d = des[regions[label[p]].key];
    cls[p] = d === "sea" || d === "pond" ? CLS.WATER : d === "outer" ? CLS.OUTER : 0;
    dead[d === "sea" || d === "pond" ? "water" : d === "outer" ? "outer" : "nearest"]++;
  }
  fillNearest(cls, w, h);
  // cracks
  const closed = pass3(pass3(ht, w, h, Math.max), w, h, Math.min);
  const crack = new Uint8Array(w * h);
  let cracks = 0;
  for (let p = 0; p < w * h; p++) if (closed[p] - ht[p] > CRACK_DEPTH) { crack[p] = 1; cracks++; }
  const n = new Int32Array(NCLS);
  for (let p = 0; p < w * h; p++) {
    if (!crack[p]) continue;
    ht[p] = closed[p];
    const x = p % w, y = (p - x) / w;
    n.fill(0);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if ((dx || dy) && xx >= 0 && yy >= 0 && xx < w && yy < h && !crack[yy * w + xx]) n[cls[yy * w + xx]]++;
    }
    let best = -1;
    for (let c = 0; c < NCLS; c++) if (n[c] && (best < 0 || n[c] > n[best])) best = c;
    if (best >= 0) cls[p] = best;
  }
  return { ht, cls, cracks, dead };
}

function buildHole(n) {
  const hole = loadHole(ROOT, n, { heightmaps: relative(ROOT, HM_DIR) });
  const r = hole.raster, w = r.w, h = r.h, A = hole.M, B = hole.reg.meshToMapFrac;
  const start = hole.pins?.starts?.[0];
  if (!start) throw new Error(`H${n}: no WSR player start in tools/wsr-pins.json, so no datum`);
  if (!hole.truth?.greenBox || !hole.truth.greenPoly || !hole.truth.scale) throw new Error(`H${n}: no green box, outline or scale in tools/wsr-truth.json`);
  const datumY = start.mesh[1];
  const { ht, cls, cracks, dead } = mendedRaster(hole);
  const toMesh = (fx, fy) => [A[0][0] * fx + A[0][1] * fy + A[0][2], A[1][0] * fx + A[1][1] * fy + A[1][2]];
  // raster coordinates with pixel centres at integers (tools/lib/minimap.mjs)
  const toPx = (X, Z) => [(X - r.originX) / r.upp - 0.5, (Z - r.originZ) / r.upp - 0.5];
  // bilinear height (KCL units) at a mesh point; null past the raster's crop
  const heightAt = (X, Z) => {
    let [c, q] = toPx(X, Z);
    if (c < -0.5 || q < -0.5 || c > w - 0.5 || q > h - 0.5) return null;
    c = Math.min(w - 1, Math.max(0, c)); q = Math.min(h - 1, Math.max(0, q));
    const c0 = Math.min(w - 2, Math.floor(c)), q0 = Math.min(h - 2, Math.floor(q)), fx = c - c0, fy = q - q0, p = q0 * w + c0;
    return (ht[p] * (1 - fx) + ht[p + 1] * fx) * (1 - fy) + (ht[p + w] * (1 - fx) + ht[p + w + 1] * fx) * fy;
  };
  const toUnits = (y, unitYd) => Math.round((y - datumY) / UNITS_PER_YD / unitYd);

  // ---- the map-frame grid ----
  const heights = new Int16Array(GW * GH), classes = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const y = heightAt(...toMesh((i + 0.5) / GW, (j + 0.5) / GH));
    heights[j * GW + i] = y == null ? NODATA : Math.max(-32767, Math.min(32767, toUnits(y, Z_UNIT_YD)));
  }
  const votes = new Int32Array(GW * GH * NCLS), count = new Int32Array(GW * GH);
  for (let q = 0; q < h; q++) for (let c = 0; c < w; c++) {
    const X = r.originX + (c + 0.5) * r.upp, Z = r.originZ + (q + 0.5) * r.upp;
    const i = Math.floor((B[0][0] * X + B[0][1] * Z + B[0][2]) * GW), j = Math.floor((B[1][0] * X + B[1][1] * Z + B[1][2]) * GH);
    if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
    votes[(j * GW + i) * NCLS + cls[q * w + c]]++; count[j * GW + i]++;
  }
  // raster px per cell, for the share of a cell past the crop
  const perCell = Math.abs(A[0][0] * A[1][1] - A[0][1] * A[1][0]) / (GW * GH) / (r.upp * r.upp);
  const pastCrop = (fx, fy) => { const [c, q] = toPx(...toMesh(fx, fy)); return c < -0.5 || q < -0.5 || c > w - 0.5 || q > h - 0.5; };
  const centreClass = (i, j) => {
    const [c, q] = toPx(...toMesh((i + 0.5) / GW, (j + 0.5) / GH)), cc = Math.round(c), qq = Math.round(q);
    return cc < 0 || qq < 0 || cc >= w || qq >= h ? 0 : cls[qq * w + cc];
  };
  let ties = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i, v = votes.subarray(k * NCLS, (k + 1) * NCLS);
    const edge = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].some(([a, b]) => pastCrop(a / GW, b / GH));
    if (edge) v[0] += Math.max(0, Math.round(perCell) - count[k]);
    let best = 0;
    for (let c = 1; c < NCLS; c++) if (v[c] > v[best]) best = c;
    if (v[best] === 0) { classes[k] = 0; continue; }
    let tie = false;
    for (let c = 0; c < NCLS; c++) if (c !== best && v[c] === v[best]) tie = true;
    if (tie) { classes[k] = centreClass(i, j); ties++; } else classes[k] = best;
  }

  // ---- the green ----
  const t = hole.truth, b = t.greenBox, sc = t.scale; // yd per map px
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  let gx0 = b.x0 - GREEN_MARGIN * bw, gx1 = b.x1 + GREEN_MARGIN * bw, gy0 = b.y0 - GREEN_MARGIN * bh, gy1 = b.y1 + GREEN_MARGIN * bh;
  const wYd = (gx1 - gx0) * MAP_W * sc, hYd = (gy1 - gy0) * MAP_H * sc;
  const gw = Math.ceil(wYd / GREEN_STEP_YD - 1e-9) + 1, gh = Math.ceil(hYd / GREEN_STEP_YD - 1e-9) + 1;
  const growX = ((gw - 1) * GREEN_STEP_YD - wYd) / 2 / (MAP_W * sc), growY = ((gh - 1) * GREEN_STEP_YD - hYd) / 2 / (MAP_H * sc);
  gx0 -= growX; gx1 += growX; gy0 -= growY; gy1 += growY;
  const gYd = new Float64Array(gw * gh), mask = new Uint8Array(gw * gh);
  let sum = 0, inside = 0;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const fx = gx0 + (i / (gw - 1)) * (gx1 - gx0), fy = gy0 + (j / (gh - 1)) * (gy1 - gy0), k = j * gw + i;
    const y = heightAt(...toMesh(fx, fy));
    if (y == null) throw new Error(`H${n}: the green grid reaches past the raster's crop at ${fx.toFixed(4)}, ${fy.toFixed(4)}`);
    gYd[k] = (y - datumY) / UNITS_PER_YD;
    if (pointInPoly(t.greenPoly, fx, fy)) { mask[k] = 1; sum += gYd[k]; inside++; }
  }
  const z0Yd = +(sum / inside).toFixed(4);
  const gData = new Int16Array(gw * gh);
  let clamped = 0, lo = Infinity, hi = -Infinity;
  for (let k = 0; k < gw * gh; k++) {
    const u = Math.round((gYd[k] - z0Yd) / GREEN_UNIT_YD);
    if (u < -32767 || u > 32767) clamped++;
    gData[k] = Math.max(-32767, Math.min(32767, u));
    lo = Math.min(lo, gYd[k] - z0Yd); hi = Math.max(hi, gYd[k] - z0Yd);
  }
  if (clamped) console.warn(`H${n}: ${clamped} green-grid samples lie more than 32.767 yd from the green's mean and were clamped`);

  // ---- files ----
  const tb = Buffer.alloc(HEADER + GW * GH * 3);
  tb.write("CTRN", 0, "latin1"); tb.writeUInt16LE(LAYOUT, 4); tb.writeUInt16LE(GW, 6); tb.writeUInt16LE(GH, 8); tb.writeUInt16LE(n, 10);
  tb.writeFloatLE(datumY, 12); tb.writeFloatLE(Z_UNIT_YD, 16);
  for (let k = 0; k < GW * GH; k++) tb.writeInt16LE(heights[k], HEADER + 2 * k);
  Buffer.from(classes.buffer).copy(tb, HEADER + 2 * GW * GH);
  const gb = Buffer.alloc(GREEN_HEADER + gw * gh * 3);
  gb.write("CGRN", 0, "latin1"); gb.writeUInt16LE(LAYOUT, 4); gb.writeUInt16LE(gw, 6); gb.writeUInt16LE(gh, 8); gb.writeUInt16LE(n, 10);
  [gx0, gy0, gx1, gy1, GREEN_STEP_YD, z0Yd, GREEN_UNIT_YD].forEach((v, k) => gb.writeFloatLE(v, 12 + 4 * k));
  for (let k = 0; k < gw * gh; k++) gb.writeInt16LE(gData[k], GREEN_HEADER + 2 * k);
  Buffer.from(mask.buffer).copy(gb, GREEN_HEADER + 2 * gw * gh);

  const nn = String(n).padStart(2, "0"), sha1 = (buf) => createHash("sha1").update(buf).digest("hex");
  const tally = {};
  for (const c of classes) tally[c] = (tally[c] || 0) + 1;
  const noHeight = heights.reduce((s, v) => s + (v === NODATA), 0);
  const entry = {
    file: `h${nn}.bin`, meshId: hole.meshId, datumY: +datumY.toFixed(2), datumYd: +(datumY / UNITS_PER_YD).toFixed(4), bytes: tb.length, sha1: sha1(tb),
    classes: tally, noHeight, cracks, deadPx: dead,
    green: { file: `g${nn}.bin`, w: gw, h: gh, box: { x0: +gx0.toFixed(6), y0: +gy0.toFixed(6), x1: +gx1.toFixed(6), y1: +gy1.toFixed(6) }, stepYd: GREEN_STEP_YD, z0Yd, unitYd: GREEN_UNIT_YD, inside, rangeYd: [+lo.toFixed(3), +hi.toFixed(3)], bytes: gb.length, sha1: sha1(gb) },
  };
  const yd = (k) => (heights[k] === NODATA ? "-" : (heights[k] * Z_UNIT_YD).toFixed(1));
  console.log(`H${n} ${hole.meshId}: datum ${datumY} u (${entry.datumYd} yd); ${GW}x${GH} samples, ${noHeight} past the raster's crop; classes ${Object.entries(tally).map(([c, k]) => `${c}:${k}`).join(" ")} (${ties} ties); ${cracks} crack px mended, nodata px ${dead.water} -> water, ${dead.outer} -> outer, ${dead.nearest} -> nearest; heights ${yd(heights.indexOf(Math.min(...heights.filter((v) => v !== NODATA))))}..${yd(heights.indexOf(Math.max(...heights)))} yd; green ${gw}x${gh} at ${GREEN_STEP_YD} yd (${inside} inside the outline), mean ${z0Yd} yd, box ${lo.toFixed(2)}..${hi.toFixed(2)} yd round it`);
  return { n, nn, entry, tb, gb };
}

const built = HOLES.map(buildHole);
mkdirSync(OUT, { recursive: true });
let prev = {};
if (opt.holes) try { prev = JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")).holes ?? {}; } catch {}
const holes = { ...prev };
let raw = 0, gz = 0, rawG = 0, gzG = 0;
for (const { n, entry, tb, gb } of built) {
  writeFileSync(join(OUT, entry.file), tb); writeFileSync(join(OUT, entry.green.file), gb);
  holes[n] = entry;
  raw += tb.length; gz += gzipSync(tb, { level: 9 }).length; rawG += gb.length; gzG += gzipSync(gb, { level: 9 }).length;
}
const index = {
  _note: "Course terrain for the app, written by tools/build-terrain.mjs from the WSR collision-mesh rasters (tools/mesh-heightmap.mjs) through tools/mesh-registration.json; read by src/terrain.js. hNN.bin: the ground height and KCL class on a w x h grid over the 250x304 map frame (sample (i, j) = the map px square [2i, 2i+2) x [2j, 2j+2), its centre at ((i+0.5)/w, (j+0.5)/h)), heights in ydPerUnit above the hole's datum (datumY, KCL units = 0.1 m: the WSR player start's height; datumYd the same in yd), nodata past the raster's crop; the classes are the KCL's, except that the raster's nodata takes what tools/map-style.json says the minimap draws there and its 1-2 px rasterising cracks are closed (the tool's header). gNN.bin: heights over the WSR green box + margin at stepYd, in unitYd above z0Yd (the green's mean height above the datum), with a mask of the WSR green outline. Byte layouts in the tool's header; both files repeat their own sizes, datum, box and units in a header. classes: per-hole sample counts by class; noHeight: samples past the raster's crop; cracks: raster px mended; deadPx: nodata raster px by what they became.",
  version: LAYOUT, w: GW, h: GH, mapPxPerSample: GRID_PX, ydPerUnit: Z_UNIT_YD, nodata: NODATA, headerBytes: HEADER,
  classNames: CLASS_NAMES,
  green: { stepYd: GREEN_STEP_YD, margin: GREEN_MARGIN, unitYd: GREEN_UNIT_YD, headerBytes: GREEN_HEADER },
  holes,
};
writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1) + "\n");
const kb = (v) => `${(v / 1024).toFixed(0)} KB`;
console.log(`wrote ${relative(ROOT, OUT).startsWith("..") ? OUT : relative(ROOT, OUT)}: ${built.length} hole(s)${opt.holes ? ` (${Object.keys(holes).length} in index.json)` : ""}; terrain ${kb(raw)} raw / ${kb(gz)} gzip, greens ${kb(rawG)} raw / ${kb(gzG)} gzip`);
