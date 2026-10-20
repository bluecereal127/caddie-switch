// node tools/test-relief.mjs [repoRoot]
// Acceptance for src/relief.js, the debug contour image over a hole's terrain
// (the Holes tab's "Contours (debug)" chip). Runs on the committed terrain.
//  1. every hole's image at the default 250x304 and H21's at the App's
//     500x608: the buffer's size, and every drawn pixel (lines, their light
//     edge, labels) on a sample with data: none where class 0 or no height
//  2. the tee's own level: a dark red (0 yd) line within 12 map px of the
//     WSR start in derived.json on every hole that has one (the datum is the
//     start's ground height)
//  3. a synthetic 20 yd ramp (1 -> 21 yd down the frame): 10 contour lines in
//     every column, each one dark pixel thick; with labels, the same count in
//     every column no label touches, and labels on the 10 and 20 yd levels
//  4. the same input gives the same bytes (twice, and from a second parse of
//     the file); no terrain gives a blank image; contourDataUrl is null
//     without a DOM
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const T = await import(pathToFileURL(join(root, "src/terrain.js")).href);
const R = await import(pathToFileURL(join(root, "src/relief.js")).href);
const derived = JSON.parse(readFileSync(join(root, "public/derived.json"), "utf8")).holes;
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL:", msg); } };
const nn = (n) => String(n).padStart(2, "0");
const read = (n) => T.parseTerrain(readFileSync(join(root, `public/terrain/h${nn(n)}.bin`)));
const sha1 = (u8) => createHash("sha1").update(u8).digest("hex");
const MAP_W = 250, MAP_H = 304;
const isZero = (d, p) => d[4 * p] === 150 && d[4 * p + 1] === 20 && d[4 * p + 2] === 20 && d[4 * p + 3] > 0;

// 1 + 2
for (let n = 1; n <= 21; n++) {
  const t = read(n);
  for (const [w, h] of n === 21 ? [[250, 304], [500, 608]] : [[250, 304]]) {
    const img = n === 21 && w === 250 ? R.contourImage(t) : R.contourImage(t, { w, h });
    ok(img.w === w && img.h === h && img.data.length === w * h * 4, `H${n} ${w}x${h}: buffer size`);
    let drawn = 0, offData = 0, onClass0 = 0, zeroD = Infinity;
    const tee = derived[n]?.tee;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const p = j * w + i;
      if (!img.data[4 * p + 3]) continue;
      drawn++;
      const c = Math.min(t.h - 1, Math.floor(((j + 0.5) / h) * t.h)) * t.w + Math.min(t.w - 1, Math.floor(((i + 0.5) / w) * t.w));
      if (t.classes[c] === 0) onClass0++;
      if (t.classes[c] === 0 || t.heights[c] === T.TERRAIN_NODATA) offData++;
      if (tee && isZero(img.data, p)) zeroD = Math.min(zeroD, Math.hypot(((i + 0.5) / w - tee.x) * MAP_W, ((j + 0.5) / h - tee.y) * MAP_H));
    }
    ok(drawn > 1000, `H${n} ${w}x${h}: only ${drawn} drawn pixels`);
    ok(offData === 0 && onClass0 === 0, `H${n} ${w}x${h}: ${offData} drawn pixels where the terrain has no data, ${onClass0} on class 0`);
    if (w === 250) {
      ok(!tee || zeroD <= 12, `H${n}: the 0 yd line is ${zeroD.toFixed(1)} map px from the tee`);
      console.log(`H${n}: ${drawn} drawn px at 250x304, the 0 yd line ${tee ? `${zeroD.toFixed(1)} map px from the tee` : "(no tee)"}`);
    } else console.log(`H${n}: ${drawn} drawn px at ${w}x${h}`);
  }
}

// 3. the ramp: 1 yd at the top row of samples to 21 yd at the bottom, class fairway
{
  const tw = 125, th = 152, unitYd = 0.1, heights = new Int16Array(tw * th), classes = new Uint8Array(tw * th).fill(1);
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) heights[j * tw + i] = Math.round((1 + (20 * j) / (th - 1)) / unitYd);
  const ramp = { hole: 0, w: tw, h: th, datumY: 0, unitYd, heights, classes };
  const runsIn = (img, i) => {
    let runs = 0, dark = 0;
    for (let j = 0; j < img.h; j++) {
      const a = img.data[4 * (j * img.w + i) + 3];
      if (a && !(j > 0 && img.data[4 * ((j - 1) * img.w + i) + 3])) runs++;
      if (a >= 170) dark++;
    }
    return { runs, dark };
  };
  for (const [w, h] of [[250, 304], [500, 608]]) {
    const bare = R.contourImage(ramp, { w, h, labels: false });
    const bad = [];
    for (let i = 0; i < w; i++) { const r = runsIn(bare, i); if (r.runs !== 10 || r.dark !== 10) bad.push(`${i}: ${r.runs} lines, ${r.dark} dark px`); }
    ok(!bad.length, `ramp ${w}x${h} without labels, columns ${bad.slice(0, 4).join("; ")}`);
    const lab = R.contourImage(ramp, { w, h });
    const halo = (i) => { for (let j = 0; j < h; j++) { const p = 4 * (j * w + i); if (lab.data[p] === 255 && lab.data[p + 3] === 200) return true; } return false; };
    const free = [...Array(w).keys()].filter((i) => !halo(i));
    const badL = free.filter((i) => runsIn(lab, i).runs !== 10);
    // the labels' rows: the 10 and 20 yd lines (bands 5 and 10) sit at the rows where the ramp crosses them
    const labelRows = new Set();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const p = 4 * (j * w + i); if (lab.data[p] === 255 && lab.data[p + 3] === 200) labelRows.add(j); }
    const rowYd = (j) => 1 + 20 * Math.min(1, Math.max(0, (((j + 0.5) / h) * th - 0.5) / (th - 1)));
    const levels = [...new Set([...labelRows].map((j) => Math.round(rowYd(j) / 10) * 10))];
    ok(free.length > w / 2 && !badL.length, `ramp ${w}x${h} with labels: ${free.length} columns clear of labels, ${badL.length} of them without 10 lines`);
    ok(levels.length === 2 && levels.includes(10) && levels.includes(20), `ramp ${w}x${h}: labels at ${levels.join(", ")} yd, expected 10 and 20`);
    console.log(`ramp ${w}x${h}: 10 lines in all ${w} columns (each 1 dark px), labels at ${levels.sort((a, b) => a - b).join(" and ")} yd, ${w - free.length} columns under a label`);
  }
}

// 4. determinism and the edges
{
  const a = R.contourImage(read(21), { w: 500, h: 608 }), b = R.contourImage(read(21), { w: 500, h: 608 });
  const t = read(17), c = R.contourImage(t), d = R.contourImage(t);
  ok(sha1(a.data) === sha1(b.data) && sha1(c.data) === sha1(d.data), "the same terrain gives other bytes");
  console.log(`determinism: H21 500x608 ${sha1(a.data).slice(0, 12)} twice from two parses, H17 ${sha1(c.data).slice(0, 12)} twice`);
  const blank = R.contourImage(null, { w: 20, h: 30 });
  ok(blank.w === 20 && blank.h === 30 && blank.data.length === 2400 && blank.data.every((v) => v === 0), "no terrain: a blank image");
  ok(R.contourDataUrl(t) === null && R.contourDataUrl(null) === null, "contourDataUrl without a DOM");
}

console.log(fails ? `${fails} FAILURES` : "all relief checks passed");
process.exit(fails ? 1 : 0);
