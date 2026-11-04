// The height grid's nodes read off real SR Terrain frames. Per hole 1-18: the frames srband.mjs keeps (Terrain legend up,
// overlays painted out, outline fit good, not clipped; the most zoomed first); each masked node of public/terrain/gNN.bin
// through the frame's view into the panel: the mean colour of the 3x3 px there, unless the spot lies under the legend,
// the wind dial or its label; per node the median over the frames. Writes sr-nodecol-NN.f32 (r, g, b per node, NaN where
// no frame saw it) and prints the coverage.   node srnodes.mjs [max frames per hole]
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url)).split("\\").join("/");
const imp = (p) => import(pathToFileURL(p).href);
const { loadImage } = await imp(ROOT + "tools/lib/image.mjs");
const { parseGreenHeights } = await imp(ROOT + "src/terrain.js");
const E = ROOT + "tools/harness/state/eden/";
const GZ = await imp(E + "tools-r6/greenzoom.mjs"), GF = await imp(E + "tools-r6/greenfit.mjs");
const DIR = process.env.FRAMES ?? E + "lab/live/greenzoom/";
const MAXF = Number(process.argv[2] || 14);
const byHole = {};
for (const f of fs.readdirSync(DIR)) { const m = f.match(/-h(\d+)[-.].*png$/); if (m && +m[1] >= 1 && +m[1] <= 18) (byHole[+m[1]] ??= []).push(f); }
const { x0: PX0, y0: PY0, x1: PX1, y1: PY1 } = GZ.PANE;
const covered = (X, Y) => (X < 1052 && Y < 342) || [[1057, 486.5], [1221, 486.5]].some(([cx, cy]) => (X - cx) ** 2 + (Y - cy) ** 2 < 36 * 36 || (Math.abs(X - cx) < 42 && Y > cy && Y < cy + 50));
for (let h = 1; h <= 18; h++) {
  const nn = String(h).padStart(2, "0");
  const g = parseGreenHeights(fs.readFileSync(ROOT + `public/terrain/g${nn}.bin`));
  const fits = [];
  for (const f of byHole[h] ?? []) {
    let im; try { im = loadImage(DIR + f); } catch { continue; }
    if (!GZ.terrainLegend(im)) continue;
    const clean = GZ.cleaned(im, null), fit = GF.fitGreen(clean, { hole: h });
    if (!fit.ok || fit.kind !== "heat" || fit.rmsPx > 1.6 || fit.clipped) continue;
    fits.push({ sx: fit.sx, clean, fit });
  }
  fits.sort((a, b) => b.sx - a.sx);
  const use = fits.slice(0, MAXF);
  const n = g.w * g.h, per = Array.from({ length: n }, () => []);
  for (const { clean, fit } of use) {
    const W = clean.width, D = clean.data;
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const k = j * g.w + i;
      if (!g.mask[k]) continue;
      const fx = g.box.x0 + (i / (g.w - 1)) * (g.box.x1 - g.box.x0), fy = g.box.y0 + (j / (g.h - 1)) * (g.box.y1 - g.box.y0);
      const [Xf, Yf] = fit.toPx(fx, fy), X = Math.round(Xf), Y = Math.round(Yf);
      if (X < PX0 + 2 || Y < PY0 + 2 || X >= PX1 - 2 || Y >= PY1 - 2 || covered(X, Y)) continue;
      let r = 0, gg = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = ((Y + dy) * W + X + dx) * 4; r += D[q]; gg += D[q + 1]; b += D[q + 2]; }
      per[k].push([r / 9, gg / 9, b / 9]);
    }
  }
  const out = new Float32Array(n * 3).fill(NaN);
  let got = 0, want = 0;
  for (let k = 0; k < n; k++) {
    if (g.mask[k]) want++;
    if (!per[k].length) continue;
    got++;
    for (let c = 0; c < 3; c++) { const s = per[k].map((v) => v[c]).sort((a, b) => a - b); out[k * 3 + c] = s[s.length >> 1]; }
  }
  fs.writeFileSync(`sr-nodecol-${nn}.f32`, Buffer.from(out.buffer));
  console.log(`H${h}: ${use.length} frames, ${got} of ${want} green nodes seen (${want ? ((100 * got) / want).toFixed(0) : 0} %), best zoom ${use[0]?.sx.toFixed(1) ?? "-"}`);
}
