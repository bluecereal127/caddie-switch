// Does the plain-only fringe detector agree with the Terrain-diff mask?
//   node tools/validate-fringe.mjs [--png]
//
// Runs surfaceMask() on the plain half of every pair the green extractor
// already trusts, and scores it against that pair's diff mask by IoU. The
// diff mask is the reference because Terrain recolours exactly the putting
// surface; if the texture detector tracks it closely, then plain-only frames
// (the 10 in the inbox with no heightmap partner) can contribute boundaries
// and pins too.
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage, savePng } from "./lib/image.mjs";
import { panelRect, cropRect } from "./lib/panel.mjs";
import { surfaceMask } from "./lib/greensurface.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "captures", "inbox");
const G = join(ROOT, "captures", "derived", "greens");
const OUT = join(ROOT, "captures", "derived", "fringe");
const PNG = process.argv.includes("--png");
if (PNG) mkdirSync(OUT, { recursive: true });

// rebuild the diff mask the same way extract-greens does, so the comparison
// is against the real reference rather than a re-derivation
const DIFF = 26;
function diffMask(plain, hmap) {
  const w = plain.width, h = plain.height, n = w * h;
  const raw = new Uint8Array(n);
  const inLegend = (x, y) => {
    const fx = x / w, fy = y / h;
    return (fx > 0.02 && fx < 0.132 && fy > 0.035 && fy < 0.34) ||
           (fx > 0.132 && fx < 0.375 && fy > 0.04 && fy < 0.135) ||
           (fx > 0.132 && fx < 0.34 && fy > 0.24 && fy < 0.325);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (inLegend(x, y)) continue;
    const j = (y * w + x) * 4;
    const d = Math.abs(plain.data[j] - hmap.data[j]) + Math.abs(plain.data[j + 1] - hmap.data[j + 1]) +
              Math.abs(plain.data[j + 2] - hmap.data[j + 2]);
    if (d > DIFF) raw[y * w + x] = 1;
  }
  // largest component
  const lab = new Int32Array(n).fill(-1);
  let best = -1, bestSize = 0, id = 0;
  for (let i = 0; i < n; i++) {
    if (!raw[i] || lab[i] >= 0) continue;
    const st = [i]; lab[i] = id;
    let size = 0;
    while (st.length) {
      const q = st.pop(); size++;
      const x = q % w, y = (q / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (raw[k] && lab[k] < 0) { lab[k] = id; st.push(k); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
    id++;
  }
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (lab[i] === best) m[i] = 1;
  return m;
}

const crop = (f) => { const i = loadImage(join(INBOX, f)); return cropRect(i, panelRect(i)); };

// --sweep: score a parameter grid against the same pairs, so the settings are
// measured rather than guessed
if (process.argv.includes("--sweep")) {
  const cases = [];
  for (const file of readdirSync(G)) {
    if (!file.endsWith(".json")) continue;
    const g = JSON.parse(readFileSync(join(G, file), "utf8"));
    for (const s of g.sessions ?? []) {
      let plain, hmap;
      try { plain = crop(s.plain); hmap = crop(s.hmap); } catch { continue; }
      const ref = diffMask(plain, hmap);
      const refPx = ref.reduce((a, b) => a + b, 0);
      if (refPx < 800 || refPx > 0.42 * plain.width * plain.height) continue;
      cases.push({ plain, ref });
    }
  }
  console.log(`sweeping over ${cases.length} pairs`);
  const results = [];
  for (const win of [2, 3])
    for (const texLo of [26, 30, 34])
      for (const texHi of [55, 70, 999])
        for (const erodeR of [2, 3, 4, 5]) {
          let sum = 0, ok = 0;
          for (const c of cases) {
            const got = surfaceMask(c.plain, { win, texLo, texHi, erodeR });
            if (!got) continue;
            let inter = 0, uni = 0;
            for (let i = 0; i < c.ref.length; i++) { const a = c.ref[i], b = got.mask[i]; if (a || b) uni++; if (a && b) inter++; }
            sum += uni ? inter / uni : 0; ok++;
          }
          results.push({ win, texLo, texHi, erodeR, mean: ok ? sum / ok : 0 });
        }
  results.sort((a, b) => b.mean - a.mean);
  for (const r of results.slice(0, 10))
    console.log(`  win=${r.win} texLo=${r.texLo} texHi=${r.texHi} erodeR=${r.erodeR}  meanIoU ${r.mean.toFixed(3)}`);
  process.exit(0);
}

const scores = [];
for (const file of readdirSync(G)) {
  if (!file.endsWith(".json")) continue;
  const g = JSON.parse(readFileSync(join(G, file), "utf8"));
  for (const s of g.sessions ?? []) {
    let plain, hmap;
    try { plain = crop(s.plain); hmap = crop(s.hmap); } catch { continue; }
    const ref = diffMask(plain, hmap);
    const refPx = ref.reduce((a, b) => a + b, 0);
    // same zoom-mismatch guard extract-greens uses — a blown-out diff is not
    // a reference worth scoring against
    if (refPx < 800 || refPx > 0.42 * plain.width * plain.height) continue;
    const got = surfaceMask(plain);
    if (!got) { console.log(`H${g.hole} ${s.plain.slice(-12)}: NO SEED (no flag found)`); scores.push({ hole: g.hole, iou: 0 }); continue; }
    let inter = 0, uni = 0;
    for (let i = 0; i < ref.length; i++) { const a = ref[i], b = got.mask[i]; if (a || b) uni++; if (a && b) inter++; }
    const iou = uni ? inter / uni : 0;
    scores.push({ hole: g.hole, iou, refPx: ref.reduce((a, b) => a + b, 0), gotPx: got.size });
    if (PNG) {
      const w = plain.width, h = plain.height;
      const dbg = { width: w, height: h, data: Buffer.from(plain.data) };
      for (let i = 0; i < w * h; i++) {
        const j = i * 4, a = ref[i], b = got.mask[i];
        if (a && b) continue;
        if (a) { dbg.data[j] = 255; dbg.data[j + 1] = 60; dbg.data[j + 2] = 60; }   // diff only
        else if (b) { dbg.data[j] = 40; dbg.data[j + 1] = 120; dbg.data[j + 2] = 255; } // fringe only
      }
      savePng(join(OUT, `h${String(g.hole).padStart(2, "0")}-${s.plain.slice(-10, -5)}.png`), dbg);
    }
  }
}
scores.sort((a, b) => a.iou - b.iou);
const mean = scores.reduce((s, x) => s + x.iou, 0) / (scores.length || 1);
const med = scores.length ? scores[scores.length >> 1].iou : 0;
console.log(`pairs scored: ${scores.length}   mean IoU ${mean.toFixed(3)}   median ${med.toFixed(3)}`);
console.log(`>=0.90: ${scores.filter((s) => s.iou >= 0.9).length}   >=0.80: ${scores.filter((s) => s.iou >= 0.8).length}   <0.60: ${scores.filter((s) => s.iou < 0.6).length}`);
console.log("worst:");
for (const s of scores.slice(0, 8)) console.log(`  H${s.hole} IoU ${s.iou.toFixed(3)} ref=${s.refPx ?? "-"}px got=${s.gotPx ?? "-"}px`);
